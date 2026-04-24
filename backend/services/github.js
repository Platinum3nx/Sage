/**
 * GitHub Service — creates authenticated Octokit clients for GitHub App installations.
 */

import { App } from '@octokit/app';

let _app;

function getApp() {
  if (!_app) {
    _app = new App({
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'),
      webhooks: { secret: process.env.GITHUB_WEBHOOK_SECRET },
    });
  }
  return _app;
}

/**
 * Get an authenticated Octokit client for a specific installation.
 * @param {number} installationId
 * @returns {Promise<import('@octokit/rest').Octokit>}
 */
export async function getInstallationClient(installationId) {
  const app = getApp();
  return app.getInstallationOctokit(installationId);
}

/**
 * Get the App instance (for webhook verification etc.)
 */
export function getGitHubApp() {
  return getApp();
}
