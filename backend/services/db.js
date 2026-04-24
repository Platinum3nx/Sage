/**
 * Database Service — Supabase client and helper functions.
 */

import { createClient } from '@supabase/supabase-js';

let _supabase;

function getClient() {
  if (!_supabase) {
    // Strip any trailing path (e.g. /rest/v1/) — client appends it automatically
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/rest\/v1\/?$/, '');
    _supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return _supabase;
}

// ---------------------------------------------------------------------------
// Installations
// ---------------------------------------------------------------------------

export async function upsertInstallation({ githubInstallationId, accountLogin, accountType }) {
  const { data, error } = await getClient()
    .from('installations')
    .upsert(
      {
        github_installation_id: githubInstallationId,
        github_account_login: accountLogin,
        github_account_type: accountType,
      },
      { onConflict: 'github_installation_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getInstallationByGithubId(githubInstallationId) {
  const { data, error } = await getClient()
    .from('installations')
    .select()
    .eq('github_installation_id', githubInstallationId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Repos
// ---------------------------------------------------------------------------

export async function upsertRepo({ installationId, githubRepoId, fullName }) {
  const { data, error } = await getClient()
    .from('repos')
    .upsert(
      {
        installation_id: installationId,
        github_repo_id: githubRepoId,
        full_name: fullName,
      },
      { onConflict: 'github_repo_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getRepoByGithubId(githubRepoId) {
  const { data, error } = await getClient()
    .from('repos')
    .select()
    .eq('github_repo_id', githubRepoId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function getRepoByFullName(fullName) {
  const { data, error } = await getClient()
    .from('repos')
    .select()
    .eq('full_name', fullName)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function updateRepo(repoId, updates) {
  const { data, error } = await getClient()
    .from('repos')
    .update(updates)
    .eq('id', repoId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRepoByGithubId(githubRepoId) {
  const { error } = await getClient()
    .from('repos')
    .delete()
    .eq('github_repo_id', githubRepoId);
  if (error) throw error;
}

export async function getReposByInstallationId(installationId) {
  const { data, error } = await getClient()
    .from('repos')
    .select()
    .eq('installation_id', installationId);
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Wiki Generations
// ---------------------------------------------------------------------------

export async function createWikiGeneration({ repoId, trigger, commitSha }) {
  const { data, error } = await getClient()
    .from('wiki_generations')
    .insert({
      repo_id: repoId,
      trigger,
      commit_sha: commitSha,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateWikiGeneration(generationId, updates) {
  const { error } = await getClient()
    .from('wiki_generations')
    .update(updates)
    .eq('id', generationId);
  if (error) throw error;
}
