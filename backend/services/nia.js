/**
 * Nia Service — indexes GitHub repositories and performs semantic code search
 * via the Nia API. Used to gather codebase context for wiki generation.
 */

const BASE_URL = 'https://apigcp.trynia.ai/v2';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headers() {
  const key = process.env.NIA_API_KEY;
  if (!key) throw new Error('NIA_API_KEY is not set in the environment');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function niaFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...headers(), ...options.headers },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Nia API ${options.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }

  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// indexRepo
// ---------------------------------------------------------------------------

/**
 * Ensure a GitHub repository is indexed in Nia and return its source_id.
 * @param {string} repoFullName  e.g. "owner/repo"
 * @returns {Promise<string>} source_id
 */
export async function indexRepo(repoFullName) {
  const existing = await findExistingSource(repoFullName);
  if (existing) {
    if (existing.status === 'indexed' || existing.status === 'ready') {
      return existing.id;
    }
    return pollUntilIndexed(existing.id);
  }

  const created = await niaFetch('/sources', {
    method: 'POST',
    body: JSON.stringify({
      type: 'repository',
      repository: repoFullName,
    }),
  });

  return pollUntilIndexed(created.id);
}

async function findExistingSource(repoFullName) {
  try {
    const resolved = await niaFetch(
      `/sources/resolve?identifier=${encodeURIComponent(repoFullName)}&type=repository`,
    );
    if (resolved?.id) {
      return niaFetch(`/sources/${resolved.id}`);
    }
  } catch {
    // resolve returns 404 when unknown — fall through
  }

  try {
    const list = await niaFetch(
      `/sources?query=${encodeURIComponent(repoFullName)}&type=repository&limit=5`,
    );
    const match = list.items?.find(
      (s) => s.identifier === repoFullName || s.identifier === `https://github.com/${repoFullName}`,
    );
    return match ?? null;
  } catch {
    return null;
  }
}

async function pollUntilIndexed(sourceId) {
  const POLL_INTERVAL_MS = 30_000;
  const MAX_WAIT_MS = 10 * 60 * 1000;
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const source = await niaFetch(`/sources/${sourceId}`);

    if (source.status === 'indexed' || source.status === 'ready') {
      return sourceId;
    }
    if (source.status === 'failed' || source.status === 'error') {
      throw new Error(`Nia source ${sourceId} indexing failed (status: ${source.status})`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Nia source ${sourceId} indexing timed out after 10 minutes`);
}

// ---------------------------------------------------------------------------
// searchRepo
// ---------------------------------------------------------------------------

/**
 * Perform a semantic search against an indexed repository.
 * @param {string} sourceId  The Nia source id
 * @param {string} query     Natural-language search query
 * @param {number} maxChunks Maximum number of result chunks (default 10)
 * @returns {Promise<Array<{content: string, file_path: string, score: number}>>}
 */
export async function searchRepo(sourceId, query, maxChunks = 10) {
  const source = await niaFetch(`/sources/${sourceId}`);
  const repoIdentifier = source.identifier ?? source.display_name ?? sourceId;

  const result = await niaFetch('/search', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'query',
      messages: [{ role: 'user', content: query }],
      repositories: [repoIdentifier],
    }),
  });

  const chunks = [];

  if (result.content) {
    const filePaths = Array.isArray(result.sources) ? result.sources : [];
    chunks.push({
      content: result.content,
      file_path: filePaths.slice(0, maxChunks).join(', '),
      score: 1,
    });
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// getRepoOverview
// ---------------------------------------------------------------------------

/**
 * Run broad searches to understand the codebase structure for initial
 * full wiki generation.
 * @param {string} sourceId  The Nia source id
 * @returns {Promise<Array<{topic: string, content: string, file_path: string}>>}
 */
export async function getRepoOverview(sourceId) {
  const topics = [
    'main entry point and application setup',
    'authentication and authorization',
    'database models and data layer',
    'API routes and endpoints',
    'configuration and environment setup',
    'key services and business logic',
  ];

  const results = [];
  // Run in batches of 3 to avoid rate limits
  for (let i = 0; i < topics.length; i += 3) {
    const batch = topics.slice(i, i + 3);
    const batchResults = await Promise.allSettled(
      batch.map((topic) => searchRepo(sourceId, topic, 10)),
    );

    for (let j = 0; j < batch.length; j++) {
      const result = batchResults[j];
      if (result.status === 'fulfilled' && result.value.length > 0) {
        results.push({
          topic: batch[j],
          content: result.value[0].content,
          file_path: result.value[0].file_path,
        });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// getFileContext
// ---------------------------------------------------------------------------

/**
 * Search for content related to a specific file path. Used when updating
 * wiki pages after a push changes specific files.
 * @param {string} sourceId  The Nia source id
 * @param {string} filePath  Path of the changed file
 * @returns {Promise<Array<{content: string, file_path: string, score: number}>>}
 */
export async function getFileContext(sourceId, filePath) {
  return searchRepo(sourceId, `Implementation and purpose of ${filePath}`, 10);
}
