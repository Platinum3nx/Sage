"use client";

import { useEffect, useState } from "react";
import { RepoCard } from "@/components/RepoCard";

interface Repo {
  id: string;
  full_name: string;
  is_enabled: boolean;
  last_wiki_generated_at: string | null;
  wiki_page_count: number;
}

export default function DashboardPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;

    const params = new URLSearchParams(window.location.search);
    return params.get("token") ?? localStorage.getItem("gh_token");
  });
  const [loading, setLoading] = useState(() => token !== null);

  useEffect(() => {
    if (!token || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("token") === token) {
      localStorage.setItem("gh_token", token);
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    let isActive = true;

    fetch(`/api/repos?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (isActive) setRepos(data.repos || []);
      })
      .catch(console.error)
      .finally(() => {
        if (isActive) setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [token]);

  function handleToggle(id: string, enabled: boolean) {
    fetch("/api/repos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_enabled: enabled, token }),
    })
      .then((r) => r.json())
      .then(() => {
        setRepos((prev) =>
          prev.map((r) => (r.id === id ? { ...r, is_enabled: enabled } : r))
        );
      });
  }

  function handleRegenerate(id: string) {
    fetch("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "regenerate", token }),
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (!token) {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || "";
    const redirectUri = `${window.location.origin}/api/auth`;
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}`;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Sign in to Sage</h1>
        <a
          href={authUrl}
          className="px-6 py-3 bg-white text-zinc-950 rounded-lg font-semibold hover:bg-zinc-200 transition-colors"
        >
          Sign in with GitHub
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Your Repositories</h1>
        <button
          onClick={() => {
            localStorage.removeItem("gh_token");
            setToken(null);
          }}
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          Sign out
        </button>
      </div>

      {repos.length === 0 ? (
        <p className="text-zinc-400">
          No repositories found. Install Sage on a repo to get started.
        </p>
      ) : (
        <div className="space-y-4">
          {repos.map((repo) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              onToggle={handleToggle}
              onRegenerate={handleRegenerate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
