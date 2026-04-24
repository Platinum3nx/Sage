/**
 * Wiki Generator — uses Nia context + Claude to generate and update wiki pages.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getRepoOverview, searchRepo, getFileContext } from './nia.js';
import { FULL_WIKI_SYSTEM_PROMPT, INCREMENTAL_UPDATE_SYSTEM_PROMPT } from '../lib/prompts.js';

// Use SAGE_MODEL env var to override model (default: claude-sonnet-4-6)
// Set SAGE_MODEL=claude-haiku-4-5-20251001 for cheaper testing
const MODEL = process.env.SAGE_MODEL || 'claude-sonnet-4-6';

let _anthropic;
function getAnthropicClient() {
  if (!_anthropic) _anthropic = new Anthropic({ timeout: 5 * 60 * 1000 });
  return _anthropic;
}

// ---------------------------------------------------------------------------
// generateFullWiki
// ---------------------------------------------------------------------------

/**
 * Generate a complete wiki for a repository on initial installation.
 * @param {string} sourceId      Nia source ID for the repo
 * @param {string} repoFullName  e.g. "owner/repo"
 * @returns {Promise<Array<{title: string, content: string, category: string}>>}
 */
export async function generateFullWiki(sourceId, repoFullName) {
  const overview = await getRepoOverview(sourceId);

  const contextBlock = overview
    .map((o) => `## ${o.topic}\n\nFiles: ${o.file_path}\n\n${o.content}`)
    .join('\n\n---\n\n');

  const userPrompt = `Here is the context retrieved from the codebase "${repoFullName}":\n\n${contextBlock}\n\n---\n\nBased on this context, generate 5-8 wiki pages covering:\n- Architecture (how the system is structured)\n- Getting Started (how to run the project locally)\n- Key Services (important business logic)\n- Configuration (environment variables and config)\n- API Reference (main endpoints, if applicable)\n- Testing (how tests work, if applicable)\n\nOnly generate pages for topics that have actual information in the context. Skip topics without relevant context.\nKeep each page focused and concise — aim for 200-400 words per page. Be specific but brief.`;

  const response = await getAnthropicClient().messages.create({
    model: MODEL,
    max_tokens: 32000,
    system: FULL_WIKI_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content[0].text;

  if (response.stop_reason === 'max_tokens') {
    console.warn('Warning: Claude response was truncated (max_tokens). Attempting to fix JSON...');
    // Try to close any unclosed JSON array
    const fixed = text.trim() + (text.trim().endsWith(']') ? '' : ']}]');
    try { return parseWikiPages(fixed); } catch { /* fall through to normal parse */ }
  }

  return parseWikiPages(text);
}

// ---------------------------------------------------------------------------
// updateWikiPages
// ---------------------------------------------------------------------------

/**
 * Update wiki pages based on files changed in a push.
 * @param {string} sourceId         Nia source ID
 * @param {string[]} changedFiles   List of changed file paths
 * @param {Array<{title: string, content: string}>} existingPages  Current wiki pages
 * @returns {Promise<Array<{title: string, content: string}>>}  Only pages that changed
 */
export async function updateWikiPages(sourceId, changedFiles, existingPages) {
  // Gather context for all changed files
  const contextChunks = [];
  for (const file of changedFiles.slice(0, 10)) {
    const ctx = await getFileContext(sourceId, file);
    if (ctx.length > 0) {
      contextChunks.push({ file, context: ctx[0].content });
    }
  }

  if (contextChunks.length === 0) return [];

  const changedContext = contextChunks
    .map((c) => `### ${c.file}\n${c.context}`)
    .join('\n\n');

  // Determine which pages are affected and update them
  const updatedPages = [];

  for (const page of existingPages) {
    const userPrompt = `Changed files:\n${changedFiles.join('\n')}\n\nNew code context:\n${changedContext}\n\nCurrent wiki page "${page.title}":\n${page.content}`;

    const response = await getAnthropicClient().messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: INCREMENTAL_UPDATE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const updatedContent = response.content[0].text;

    // Only include if content actually changed
    if (updatedContent.trim() !== page.content.trim()) {
      updatedPages.push({ title: page.title, content: updatedContent });
    }
  }

  return updatedPages;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseWikiPages(text) {
  // Strip any markdown code fences (handles ```json, ```, etc.)
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?[\s\n]*/i, '');
  cleaned = cleaned.replace(/[\s\n]*```\s*$/i, '');
  cleaned = cleaned.trim();

  // Try to parse as JSON directly
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Try to find JSON array in the response
  }

  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through
    }
  }

  console.error('Failed to parse wiki pages. First 500 chars:', cleaned.slice(0, 500));
  throw new Error('Failed to parse wiki pages from Claude response');
}
