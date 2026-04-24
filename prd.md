# Sage — Living Engineering Wiki
### A wiki that reads your codebase and writes itself

---

## What This Is

Sage is a GitHub App that automatically generates and maintains a living wiki for any codebase. When installed on a repo, it reads the entire codebase using Nia, generates structured wiki pages explaining how everything works, and keeps those pages updated every time code changes.

A new engineer joins and instead of spending months asking questions, they open Sage and instantly understand the architecture, the patterns, the decisions, and who owns what — all pulled directly from the actual code.

**The bold claim:** "Documentation that writes itself."

**The install experience:** Go to sage.niargus.dev (or sagewiki.dev), click Install on GitHub, select repos. Done. Sage starts generating your wiki immediately.

---

## Why This Exists

Every engineering team has the same problem. The most valuable knowledge — why this was built this way, what this confusing file does, how authentication actually works — lives in people's heads. When someone leaves, that knowledge leaves with them. New engineers spend months asking questions that have been answered a hundred times.

Teams try to fix this with Notion or Confluence. It never works because writing documentation takes discipline nobody has, and docs go stale within weeks.

Sage fixes this by removing humans from the loop entirely. Nia reads the code. The agent writes the docs. Every PR triggers an update. The wiki is always current because it's derived from the code itself, not from someone's memory.

---

## Tech Stack

- **GitHub App:** Receives push and PR webhooks, posts wiki updates
- **Backend:** Node.js + Express, deployed on Railway
- **Context layer:** Nia API — indexes repos and retrieves relevant code sections
- **AI:** Claude Sonnet via Anthropic API — generates wiki pages
- **Wiki storage:** GitHub Wiki (built into every repo — no new tool required)
- **Database:** Supabase — stores installation state, repo configs, generation history
- **Dashboard:** Next.js deployed on Vercel — teams browse the wiki and configure settings
- **Auth:** GitHub OAuth

---

## The Wiki GitHub App vs GitHub Wiki

GitHub has a built-in Wiki tab on every repo. Sage writes directly to that wiki using the GitHub API. This means teams don't need to learn a new tool — the wiki lives exactly where they already work, inside GitHub, and looks native. When Sage generates a page it shows up in the repo's existing Wiki tab.

---

## Environment Variables

```
# GitHub App
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_WEBHOOK_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Nia
NIA_API_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Set after Railway and Vercel deploy
NEXT_PUBLIC_APP_URL=     # Your Vercel URL
BACKEND_URL=             # Your Railway URL
```

---

## Repository Structure

```
sage/
├── PRD_Sage.md
├── .env.example
├── .env
├── .gitignore
│
├── backend/
│   ├── package.json
│   ├── server.js
│   ├── routes/
│   │   ├── webhook.js        # GitHub push/PR webhooks
│   │   └── oauth.js          # GitHub OAuth flow
│   ├── services/
│   │   ├── github.js         # GitHub API client (Octokit)
│   │   ├── nia.js            # Nia API — index and search
│   │   ├── wiki-generator.js # Calls Claude, generates wiki pages
│   │   ├── wiki-writer.js    # Writes pages to GitHub Wiki
│   │   └── db.js             # Supabase writes
│   └── lib/
│       └── prompts.js        # Wiki generation prompt templates
│
└── dashboard/
    ├── package.json
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx           # Landing page
    │   ├── dashboard/
    │   │   └── page.tsx       # Team dashboard
    │   ├── install/
    │   │   └── page.tsx       # Post-install page
    │   └── api/
    │       ├── auth/
    │       │   └── route.ts
    │       └── repos/
    │           └── route.ts
    └── components/
        ├── InstallButton.tsx
        └── RepoCard.tsx
```

---

## Phase 1 — Database Setup

**Agent does this entirely.**

### Step 1.1 — Create Supabase project

Create a new Supabase project called "sage" at supabase.com. Get the URL, anon key, and service role key.

### Step 1.2 — Create tables

```sql
-- Installations
create table installations (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  github_installation_id bigint unique not null,
  github_account_login text not null,
  github_account_type text not null,
  access_token text,
  token_expires_at timestamptz
);

-- Repos
create table repos (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  installation_id uuid references installations(id),
  github_repo_id bigint unique not null,
  full_name text not null,
  nia_source_id text,
  is_enabled boolean default true,
  last_indexed_at timestamptz,
  last_wiki_generated_at timestamptz,
  wiki_page_count int default 0
);

-- Wiki generations: tracks every time Sage generates or updates a page
create table wiki_generations (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  repo_id uuid references repos(id),
  trigger text not null,        -- 'install', 'push', 'manual'
  pages_generated int,
  pages_updated int,
  commit_sha text,
  status text default 'pending' -- 'pending', 'running', 'complete', 'error'
);

create index on installations (github_installation_id);
create index on repos (github_repo_id);
create index on wiki_generations (repo_id, created_at desc);
```

Save as `supabase/migrations/001_initial_schema.sql` and run:

```bash
supabase db push
```

### Step 1.3 — Verify

```bash
supabase db diff
```

---

## Phase 2 — GitHub App Setup

**Agent creates config. Human creates the app on GitHub.**

### Step 2.1 — GitHub App settings

```
Name: Sage Wiki
Homepage URL: YOUR_VERCEL_URL (placeholder for now)
Webhook URL: YOUR_RAILWAY_URL/webhook (use smee.io URL for local testing)
Webhook secret: generate with: openssl rand -hex 20

Permissions:
- Repository → Contents: Read & Write (needed to write to GitHub Wiki)
- Repository → Pull requests: Read
- Repository → Metadata: Read-only

Events to subscribe:
- Push
- Pull request
- Installation

Where can this be installed: Any account
```

### Step 2.2 — Human creates the app

Go to github.com/settings/apps/new, fill in the above, create it, download the private key, copy all credentials to `.env`.

Convert the private key:
```bash
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' ~/Downloads/*.pem
```

---

## Phase 3 — Nia Service

**Agent builds this entirely.**

### Step 3.1 — backend/services/nia.js

Same pattern as NiArgus. Export:

**`indexRepo(repoFullName)`**
- Check if repo already indexed
- If not: POST to Nia to index it, poll until complete
- Return source_id

**`searchRepo(sourceId, query, maxChunks = 10)`**
- POST to Nia search endpoint
- Return array of `{ content, file_path, score }`

**`getRepoOverview(sourceId)`**
- Run several broad searches to understand the codebase structure:
  - "main entry point and application setup"
  - "authentication and authorization"
  - "database models and data layer"
  - "API routes and endpoints"
  - "configuration and environment setup"
  - "key services and business logic"
- Return a combined overview of all results, organized by topic
- This is used for the initial full wiki generation

**`getFileContext(sourceId, filePath)`**
- Search specifically for content related to a file path
- Used when updating pages after a specific file changes in a push

---

## Phase 4 — Wiki Generator Service

**Agent builds this entirely.**

### Step 4.1 — backend/lib/prompts.js

**System prompt for full wiki generation:**
```
You are Sage, an expert technical writer with deep engineering knowledge.
You have been given context from a real codebase retrieved via Nia.
Your job is to write clear, accurate wiki pages that explain how this 
codebase works to a new engineer joining the team.

Rules:
- Write for a smart engineer who is new to THIS codebase specifically
- Reference actual file paths, function names, and patterns you see in the context
- Explain WHY things work the way they do, not just WHAT they do
- Be specific. "Authentication is handled in src/middleware/auth.ts using JWT tokens 
  with a 24-hour expiry" is good. "Authentication is implemented" is not.
- Each page should be self-contained and understandable on its own
- Use clear headings and short paragraphs
- Never invent information that isn't in the provided context
- Format output as clean markdown suitable for GitHub Wiki

You will generate multiple wiki pages. Return a JSON array where each item has:
- "title": the page title (will become the wiki page name)
- "content": the full markdown content of the page
- "category": one of: "architecture", "features", "setup", "patterns", "ownership"

Generate ONLY JSON. No preamble, no explanation, no markdown code fences.
```

**System prompt for incremental update (after a push):**
```
You are Sage, maintaining an engineering wiki for a codebase.
A push just happened that changed specific files. 
You have the current wiki page content and the new code context.
Update the wiki page to reflect what changed. 

Rules:
- Only change what actually changed — preserve accurate existing information
- Be specific about what is new or different
- Keep the same format and style as the existing page
- If the changes don't affect this page's content, return the page unchanged

Return only the updated markdown content. No JSON wrapper, no explanation.
```

### Step 4.2 — backend/services/wiki-generator.js

**`generateFullWiki(sourceId, repoFullName)`**

This runs on initial installation and generates the complete wiki:

1. Call `nia.getRepoOverview(sourceId)` to get broad context
2. Build a user prompt with all the context and instructions to generate 8-12 wiki pages covering:
   - Home (overview of the whole codebase)
   - Architecture (how the system is structured)
   - Getting Started (how to run the project locally)
   - Authentication (how auth works)
   - Database (data models and storage)
   - API Reference (main endpoints and how to use them)
   - Key Services (important business logic)
   - Configuration (environment variables and config)
   - Testing (how tests are structured and run)
   - Contributing (patterns and conventions to follow)
3. Call Claude with the system prompt and user prompt
4. Parse the JSON response into an array of page objects
5. Return the array

**`updateWikiPages(sourceId, changedFiles, existingPages)`**

This runs on every push:

1. For each changed file, search Nia for relevant context
2. Determine which wiki pages are affected by these changes
3. For each affected page, call Claude with the incremental update prompt
4. Return only the pages that need updating

```javascript
// wiki-generator.js exports:
// generateFullWiki(sourceId, repoFullName) → Promise<Array<{title, content, category}>>
// updateWikiPages(sourceId, changedFiles, existingPages) → Promise<Array<{title, content}>>
```

### Step 4.3 — Verify generator works

```bash
node -e "
import('./backend/services/wiki-generator.js').then(async m => {
  const pages = await m.generateFullWiki('YOUR_NIA_SOURCE_ID', 'Platinum3nx/NiaBench');
  console.log('Pages generated:', pages.length);
  pages.forEach(p => console.log('-', p.title, '|', p.category));
});
"
```

Should print 8-12 page titles.

---

## Phase 5 — Wiki Writer Service

**Agent builds this entirely.**

### Step 5.1 — backend/services/wiki-writer.js

This writes pages to the GitHub Wiki using the GitHub API.

GitHub Wiki is actually a separate git repo at `https://github.com/{owner}/{repo}.wiki.git`. You write to it via the GitHub API's contents endpoint for the wiki repo.

Implementation requirements:

**`initializeWiki(octokit, owner, repo)`**
- Check if wiki is enabled on the repo (GET /repos/{owner}/{repo})
- If not enabled, it can't be written to — log a warning and return false
- Create a Home.md page if wiki is empty (GitHub requires at least one page)
- Return true if wiki is ready

**`writePage(octokit, owner, repo, title, content)`**
- Convert title to wiki page filename: replace spaces with hyphens, lowercase
- Check if page already exists: GET /repos/{owner}/{repo}/contents/{filename}.md in the wiki
- If exists: update via PUT with the existing file's SHA
- If not exists: create via POST
- Return the page URL

**`writeAllPages(octokit, owner, repo, pages)`**
- Call `writePage` for each page in sequence (not parallel — avoid rate limits)
- Build a Home.md that links to all generated pages as a table of contents
- Return array of page URLs

**`getExistingPages(octokit, owner, repo)`**
- List all files in the wiki repo
- Return array of `{ title, filename, sha, content }`

```javascript
// wiki-writer.js exports:
// initializeWiki(octokit, owner, repo) → Promise<boolean>
// writePage(octokit, owner, repo, title, content) → Promise<string>  
// writeAllPages(octokit, owner, repo, pages) → Promise<string[]>
// getExistingPages(octokit, owner, repo) → Promise<Array>
```

### Step 5.2 — Verify writer works

```bash
node -e "
import('./backend/services/github.js').then(async gh => {
  import('./backend/services/wiki-writer.js').then(async ww => {
    const octokit = await gh.getInstallationClient(YOUR_INSTALLATION_ID);
    const url = await ww.writePage(octokit, 'Platinum3nx', 'NiaBench', 
      'Test Page', '# Test\nThis is a test page from Sage.');
    console.log('Written to:', url);
  });
});
"
```

Check the NiaBench repo wiki tab to verify the page appeared.

---

## Phase 6 — Webhook Handler

**Agent builds this entirely.**

### Step 6.1 — Install dependencies

```bash
cd backend
npm install express @octokit/app @octokit/rest @octokit/webhooks dotenv
```

### Step 6.2 — backend/routes/webhook.js

Verify webhook signature on every request. Reject unsigned requests.

**Handle `installation.created`:**
1. Insert installation row into Supabase
2. Insert repo rows for each repo
3. For each repo, start indexing via Nia (background, non-blocking)
4. After indexing completes, generate full wiki and write to GitHub Wiki
5. Update `last_wiki_generated_at` and `wiki_page_count` in Supabase

**Handle `push`:**
1. Look up repo in Supabase — skip if not found or not enabled
2. Extract list of changed files from the push payload
3. Get existing wiki pages
4. Run `updateWikiPages` to generate updated pages
5. Write updated pages to GitHub Wiki
6. Log generation to `wiki_generations` table

**Handle `pull_request` (opened or merged):**
1. When a PR is merged, treat it like a push — update wiki based on changed files
2. When a PR is opened, optionally post a comment: "Sage will update the wiki when this PR is merged"

**Handle `installation_repositories`:**
- Add/remove repo rows as repos are added/removed from the installation

### Step 6.3 — backend/server.js

```javascript
import express from 'express';
import { webhookRouter } from './routes/webhook.js';
import { oauthRouter } from './routes/oauth.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use('/webhook', webhookRouter);
app.use('/auth', oauthRouter);
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'sage' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Sage backend running on port ${PORT}`));
```

### Step 6.4 — Test locally with smee

```bash
npm install -g smee-client
smee --url https://smee.io/YOUR_CHANNEL --target http://localhost:3001/webhook
```

Install Sage on a test repo. Watch the backend logs. Wiki pages should appear in the repo's Wiki tab within a few minutes.

---

## Phase 7 — Dashboard

**Agent builds this entirely.**

### Step 7.1 — Landing page (dashboard/app/page.tsx)

Dark background, clean, serious. Hero section:

- Large headline: **"Documentation that writes itself"**
- Subheading: "Sage reads your codebase and generates a living wiki. Every push keeps it current. Install in 30 seconds."
- Big Install on GitHub button
- Three feature cards:
  - **"Always accurate"** — generated from your actual code, not someone's memory
  - **"Always current"** — updates automatically on every push
  - **"Zero effort"** — no writing, no maintenance, no discipline required
- Example wiki screenshot showing a clean generated page

### Step 7.2 — Dashboard (dashboard/app/dashboard/page.tsx)

Requires GitHub OAuth. Shows:

- List of enabled repos with:
  - Repo name
  - Last wiki generated timestamp
  - Number of wiki pages
  - Link to the GitHub Wiki
  - Toggle to enable/disable Sage for this repo
  - "Regenerate wiki" button that triggers a full regeneration

### Step 7.3 — Post-install page (dashboard/app/install/page.tsx)

- "Sage is generating your wiki"
- "This takes 2-5 minutes for the first generation"
- "Check your repo's Wiki tab when it's done"
- Link to dashboard

---

## Phase 8 — Railway Deployment (Backend)

**Agent does this via CLI.**

### Step 8.1 — railway.json

```json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "node server.js",
    "healthcheckPath": "/health"
  }
}
```

### Step 8.2 — Deploy

```bash
cd backend
railway login
railway link
railway up
```

Set all env vars:
```bash
railway variables set GITHUB_APP_ID=...
railway variables set GITHUB_APP_PRIVATE_KEY=...
railway variables set GITHUB_WEBHOOK_SECRET=...
railway variables set NIA_API_KEY=...
railway variables set ANTHROPIC_API_KEY=...
railway variables set SUPABASE_SERVICE_ROLE_KEY=...
railway variables set NEXT_PUBLIC_SUPABASE_URL=...
```

### Step 8.3 — Verify

```bash
curl YOUR_RAILWAY_URL/health
# Should return: {"status":"ok","service":"sage"}
```

---

## Phase 9 — Vercel Deployment (Dashboard)

**Agent does this via CLI.**

```bash
cd dashboard
vercel --prod
```

Set env vars:
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add GITHUB_CLIENT_ID
vercel env add GITHUB_CLIENT_SECRET
vercel env add NEXT_PUBLIC_APP_URL
vercel env add BACKEND_URL
```

Redeploy:
```bash
vercel --prod
```

Update GitHub App settings:
- Homepage URL → YOUR_VERCEL_URL
- Webhook URL → YOUR_RAILWAY_URL/webhook
- OAuth Callback URL → YOUR_RAILWAY_URL/auth/callback

---

## Phase 10 — End-to-End Test

**Human does this.**

1. Go to YOUR_VERCEL_URL
2. Click "Install on GitHub"
3. Install on a test repo (NiaBench is a good choice — already indexed in Nia)
4. Wait 3-5 minutes
5. Go to the repo on GitHub, click the Wiki tab
6. Wiki pages should be there — Home, Architecture, Getting Started, etc.
7. Make a small commit to the repo
8. Wait 2 minutes — the relevant wiki page should update

If this works, Sage is live.

---

## Phase 11 — README

**Agent writes this.**

```markdown
# Sage

Documentation that writes itself.

## Install

[Install Sage on GitHub →](YOUR_GITHUB_APP_URL)

## What it does

Sage reads your codebase using Nia and generates a living wiki 
in your repo's GitHub Wiki tab. Every push keeps it current.
No writing. No maintenance. No going stale.

## How it works

When installed, Sage indexes your codebase via Nia and generates 
wiki pages covering architecture, authentication, database design, 
API routes, key services, and more. When code changes, the relevant 
pages update automatically.

## Self-hosting

1. Clone this repo
2. Create a GitHub App (see PRD_Sage.md for exact settings)
3. Fill in .env with your credentials
4. Deploy backend to Railway, dashboard to Vercel
5. Update GitHub App URLs with your Railway and Vercel URLs
```

---

## Build Order

```
Phase 1:  Database         → supabase db diff shows no pending migrations
Phase 2:  GitHub App       → human creates app, credentials in .env
Phase 3:  Nia service      → indexRepo and searchRepo verified working
Phase 4:  Wiki generator   → generateFullWiki returns 8-12 pages for a test repo
Phase 5:  Wiki writer      → test page appears in GitHub Wiki tab
Phase 6:  Webhook          → install on test repo, wiki generates automatically
Phase 7:  Dashboard        → landing page live at localhost:3000
Phase 8:  Railway          → health check passes at Railway URL
Phase 9:  Vercel           → landing page live at Vercel URL
Phase 10: E2E test         → human installs, wiki appears, push updates a page
Phase 11: README           → repo looks presentable
```

---

## What the Human Needs to Do

1. **Phase 1:** Create a new Supabase project called "sage" and get the credentials
2. **Phase 2:** Create the GitHub App at github.com/settings/apps/new using the settings above — takes 5 minutes
3. **Phase 6:** Provide smee.io channel URL for local webhook testing
4. **Phase 8/9:** Approve Railway and Vercel deploys
5. **Phase 10:** Install on a test repo and verify wiki pages appear

Everything else is owned by the coding agent.

---

## Success Criteria

- [ ] Installing Sage on a repo generates 8+ wiki pages in the GitHub Wiki tab within 5 minutes
- [ ] Making a commit updates the relevant wiki pages automatically
- [ ] The landing page at the Vercel URL has a working Install on GitHub button
- [ ] The GitHub App is publicly installable by anyone
- [ ] A developer who has never seen the repo can read the wiki and understand the architecture
- [ ] Railway backend health check passes
- [ ] README is clean and the repo looks presentable