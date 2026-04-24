/**
 * Webhook Router — handles GitHub App webhook events.
 * Verifies signatures, processes installation, push, and PR events.
 */

import { Router } from 'express';
import crypto from 'crypto';
import { getInstallationClient } from '../services/github.js';
import { indexRepo } from '../services/nia.js';
import { generateFullWiki, updateWikiPages } from '../services/wiki-generator.js';
import { initializeWiki, writeAllPages, writePage, getExistingPages } from '../services/wiki-writer.js';
import {
  upsertInstallation,
  upsertRepo,
  getRepoByGithubId,
  deleteRepoByGithubId,
  updateRepo,
  createWikiGeneration,
  updateWikiGeneration,
} from '../services/db.js';

export const webhookRouter = Router();

// ---------------------------------------------------------------------------
// Deduplication — smee.io can replay events
// ---------------------------------------------------------------------------

const processedDeliveries = new Set();
const MAX_DELIVERIES = 1000;

function isDuplicate(deliveryId) {
  if (!deliveryId) return false;
  if (processedDeliveries.has(deliveryId)) return true;
  processedDeliveries.add(deliveryId);
  if (processedDeliveries.size > MAX_DELIVERIES) {
    const first = processedDeliveries.values().next().value;
    processedDeliveries.delete(first);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

function verifySignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)
    .update(req.body)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ---------------------------------------------------------------------------
// Main webhook handler
// ---------------------------------------------------------------------------

webhookRouter.post('/', async (req, res) => {
  if (!verifySignature(req)) {
    console.warn('Webhook signature verification failed');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const deliveryId = req.headers['x-github-delivery'];
  if (isDuplicate(deliveryId)) {
    console.log(`Duplicate webhook ${deliveryId}, skipping`);
    return res.status(200).json({ ok: true, duplicate: true });
  }

  const event = req.headers['x-github-event'];
  const payload = JSON.parse(req.body.toString());

  console.log(`Webhook received: ${event}.${payload.action || ''} (${deliveryId})`);

  // Respond immediately — process in background
  res.status(200).json({ ok: true });

  try {
    switch (event) {
      case 'installation':
        await handleInstallation(payload);
        break;
      case 'installation_repositories':
        await handleInstallationRepositories(payload);
        break;
      case 'push':
        await handlePush(payload);
        break;
      case 'pull_request':
        await handlePullRequest(payload);
        break;
      default:
        console.log(`Unhandled event: ${event}`);
    }
  } catch (err) {
    console.error(`Error handling ${event}:`, err);
  }
});

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleInstallation(payload) {
  if (payload.action === 'created') {
    const { installation, repositories } = payload;

    const installRow = await upsertInstallation({
      githubInstallationId: installation.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
    });

    console.log(`Installation created: ${installation.account.login} (${installation.id})`);

    // Process repos sequentially to avoid rate limits
    for (const repo of repositories || []) {
      const repoRow = await upsertRepo({
        installationId: installRow.id,
        githubRepoId: repo.id,
        fullName: repo.full_name,
      });

      generateWikiForRepo(installation.id, repoRow, 'install').catch((err) =>
        console.error(`Wiki generation failed for ${repo.full_name}:`, err.message),
      );
    }
  } else if (payload.action === 'deleted') {
    console.log(`Installation deleted: ${payload.installation.id}`);
  }
}

async function handleInstallationRepositories(payload) {
  const { installation } = payload;
  const installRow = await upsertInstallation({
    githubInstallationId: installation.id,
    accountLogin: installation.account.login,
    accountType: installation.account.type,
  });

  for (const repo of payload.repositories_added || []) {
    const repoRow = await upsertRepo({
      installationId: installRow.id,
      githubRepoId: repo.id,
      fullName: repo.full_name,
    });

    generateWikiForRepo(installation.id, repoRow, 'install').catch((err) =>
      console.error(`Wiki generation failed for ${repo.full_name}:`, err.message),
    );
  }

  for (const repo of payload.repositories_removed || []) {
    await deleteRepoByGithubId(repo.id);
    console.log(`Repo removed: ${repo.full_name}`);
  }
}

async function handlePush(payload) {
  const repoRow = await getRepoByGithubId(payload.repository.id);
  if (!repoRow || !repoRow.is_enabled) {
    console.log(`Push ignored for ${payload.repository.full_name} (not tracked or disabled)`);
    return;
  }

  const changedFiles = new Set();
  for (const commit of payload.commits || []) {
    for (const f of commit.added || []) changedFiles.add(f);
    for (const f of commit.modified || []) changedFiles.add(f);
    for (const f of commit.removed || []) changedFiles.add(f);
  }

  if (changedFiles.size === 0) return;

  const generation = await createWikiGeneration({
    repoId: repoRow.id,
    trigger: 'push',
    commitSha: payload.after,
  });

  try {
    await updateWikiGeneration(generation.id, { status: 'running' });

    const octokit = await getInstallationClient(payload.installation.id);
    const [owner, repo] = payload.repository.full_name.split('/');

    const existingPages = await getExistingPages(octokit, owner, repo);
    if (existingPages.length === 0) {
      console.log(`No existing wiki pages for ${payload.repository.full_name}, skipping incremental update`);
      return;
    }

    const sourceId = repoRow.nia_source_id;
    if (!sourceId) {
      console.log(`No Nia source ID for ${payload.repository.full_name}, skipping`);
      return;
    }

    const updatedPages = await updateWikiPages(sourceId, [...changedFiles], existingPages);

    let pagesUpdated = 0;
    for (const page of updatedPages) {
      await writePage(octokit, owner, repo, page.title, page.content);
      pagesUpdated++;
      console.log(`  Updated: ${page.title}`);
    }

    await updateWikiGeneration(generation.id, {
      status: 'complete',
      pages_updated: pagesUpdated,
    });

    await updateRepo(repoRow.id, { last_wiki_generated_at: new Date().toISOString() });

    console.log(`Push wiki update complete: ${pagesUpdated} pages updated for ${payload.repository.full_name}`);
  } catch (err) {
    await updateWikiGeneration(generation.id, { status: 'error' });
    throw err;
  }
}

async function handlePullRequest(payload) {
  const { action, pull_request: pr } = payload;

  if (action === 'opened') {
    try {
      const octokit = await getInstallationClient(payload.installation.id);
      const [owner, repo] = payload.repository.full_name.split('/');
      await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner,
        repo,
        issue_number: pr.number,
        body: '📖 **Sage** will update the wiki when this PR is merged.',
      });
    } catch (err) {
      console.error('Failed to post PR comment:', err.message);
    }
  } else if (action === 'closed' && pr.merged) {
    const repoRow = await getRepoByGithubId(payload.repository.id);
    if (!repoRow || !repoRow.is_enabled) return;

    try {
      const octokit = await getInstallationClient(payload.installation.id);
      const [owner, repo] = payload.repository.full_name.split('/');
      const { data: files } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
        owner,
        repo,
        pull_number: pr.number,
        per_page: 100,
      });

      const changedFiles = files.map((f) => f.filename);
      if (changedFiles.length === 0) return;

      await handlePush({
        repository: payload.repository,
        installation: payload.installation,
        commits: [{ added: changedFiles, modified: [], removed: [] }],
        after: pr.merge_commit_sha,
      });
    } catch (err) {
      console.error('Failed to handle merged PR:', err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Full wiki generation helper
// ---------------------------------------------------------------------------

async function generateWikiForRepo(installationId, repoRow, trigger) {
  const generation = await createWikiGeneration({
    repoId: repoRow.id,
    trigger,
  });

  try {
    await updateWikiGeneration(generation.id, { status: 'running' });

    console.log(`Indexing ${repoRow.full_name} in Nia...`);
    const sourceId = await indexRepo(repoRow.full_name);
    await updateRepo(repoRow.id, { nia_source_id: sourceId, last_indexed_at: new Date().toISOString() });

    console.log(`Generating wiki for ${repoRow.full_name}...`);
    const pages = await generateFullWiki(sourceId, repoRow.full_name);

    const octokit = await getInstallationClient(installationId);
    const [owner, repo] = repoRow.full_name.split('/');

    console.log(`Initializing wiki for ${repoRow.full_name}...`);
    const wikiReady = await initializeWiki(octokit, owner, repo);
    if (!wikiReady) {
      console.warn(`Wiki not available for ${repoRow.full_name}, skipping write`);
      await updateWikiGeneration(generation.id, { status: 'error' });
      return;
    }

    console.log(`Writing ${pages.length} pages to ${repoRow.full_name} wiki...`);
    await writeAllPages(octokit, owner, repo, pages);

    await updateWikiGeneration(generation.id, {
      status: 'complete',
      pages_generated: pages.length,
    });

    await updateRepo(repoRow.id, {
      last_wiki_generated_at: new Date().toISOString(),
      wiki_page_count: pages.length,
    });

    console.log(`Wiki generation complete for ${repoRow.full_name}: ${pages.length} pages`);
  } catch (err) {
    await updateWikiGeneration(generation.id, { status: 'error' });
    throw err;
  }
}
