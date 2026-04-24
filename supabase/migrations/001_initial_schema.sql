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
