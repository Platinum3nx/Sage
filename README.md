# Sage

Documentation that writes itself.

## Install

[Install Sage on GitHub](https://github.com/apps/sage-wiki/installations/new)

### How to install Sage on a repo

1. Enable the repo's GitHub Wiki.
2. Create the first wiki page in the repo's `Wiki` tab to initialize the wiki repo.
3. Open [Install Sage on GitHub](https://github.com/apps/sage-wiki/installations/new).
4. Choose your GitHub account or organization.
5. Select the repo you want Sage to manage.
6. Wait a few minutes for Sage to index the repo and generate wiki pages.

If the wiki is enabled but still completely blank, Sage may not be able to write the initial pages until the wiki repo has been created by GitHub.

## What it does

Sage reads your codebase using Nia and generates a living wiki in your repo's GitHub Wiki tab. Every push keeps it current. No writing. No maintenance. No going stale.

## How it works

When installed, Sage indexes your codebase via Nia and generates wiki pages covering architecture, getting started, key services, configuration, API reference, and more. When code changes, the relevant pages update automatically.

## Tech stack

- **GitHub App** — receives push/PR webhooks, posts wiki updates
- **Backend** — Node.js + Express, deployed on Railway
- **Context layer** — Nia API for codebase indexing and semantic search
- **AI** — Claude via Anthropic API for wiki page generation
- **Wiki storage** — GitHub Wiki (built into every repo)
- **Database** — Supabase for installation state and generation history
- **Dashboard** — Next.js on Vercel for landing page and repo management

## Self-hosting

1. Clone this repo
2. Create a GitHub App (see `prd.md` for exact settings)
3. Copy `.env.example` to `.env` and fill in your credentials
4. `cd backend && npm install && node server.js`
5. `cd dashboard && npm install && npm run dev`
6. Deploy backend to Railway, dashboard to Vercel
7. Update GitHub App URLs with your Railway and Vercel URLs
