"use client";

interface Repo {
  id: string;
  full_name: string;
  is_enabled: boolean;
  last_wiki_generated_at: string | null;
  wiki_page_count: number;
}

export function RepoCard({
  repo,
  onToggle,
  onRegenerate,
}: {
  repo: Repo;
  onToggle: (id: string, enabled: boolean) => void;
  onRegenerate: (id: string) => void;
}) {
  const [owner, name] = repo.full_name.split("/");

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 flex items-center justify-between">
      <div>
        <h3 className="font-semibold">
          <span className="text-zinc-500">{owner}/</span>
          {name}
        </h3>
        <div className="mt-1 flex items-center gap-4 text-sm text-zinc-400">
          <span>{repo.wiki_page_count} pages</span>
          {repo.last_wiki_generated_at && (
            <span>
              Updated{" "}
              {new Date(repo.last_wiki_generated_at).toLocaleDateString()}
            </span>
          )}
          <a
            href={`https://github.com/${repo.full_name}/wiki`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            View Wiki
          </a>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => onRegenerate(repo.id)}
          className="px-3 py-1.5 text-sm rounded-md border border-zinc-700 hover:bg-zinc-800 transition-colors"
        >
          Regenerate
        </button>
        <button
          onClick={() => onToggle(repo.id, !repo.is_enabled)}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
            repo.is_enabled
              ? "bg-green-900/50 text-green-400 border border-green-800"
              : "bg-zinc-800 text-zinc-500 border border-zinc-700"
          }`}
        >
          {repo.is_enabled ? "Enabled" : "Disabled"}
        </button>
      </div>
    </div>
  );
}
