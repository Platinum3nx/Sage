import { InstallButton } from "@/components/InstallButton";

export default function Home() {
  const appSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "sage-wiki";

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">Sage</span>
          <InstallButton appSlug={appSlug} size="sm" />
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-24">
        <h1 className="text-5xl sm:text-6xl font-bold text-center max-w-3xl leading-tight">
          Documentation that writes itself
        </h1>
        <p className="mt-6 text-lg text-zinc-400 text-center max-w-2xl">
          Sage reads your codebase and generates a living wiki. Every push keeps
          it current. Install in 30 seconds.
        </p>
        <div className="mt-10">
          <InstallButton appSlug={appSlug} size="lg" />
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-zinc-800 px-6 py-20">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8">
          <FeatureCard
            title="Always accurate"
            description="Generated from your actual code, not someone's memory. References real file paths, functions, and patterns."
          />
          <FeatureCard
            title="Always current"
            description="Updates automatically on every push. No stale docs, no manual maintenance, no forgotten pages."
          />
          <FeatureCard
            title="Zero effort"
            description="No writing, no maintenance, no discipline required. Install and forget — your wiki stays fresh."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-8">
        <div className="max-w-5xl mx-auto text-center text-sm text-zinc-500">
          Sage &mdash; Powered by Nia and Claude
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
    </div>
  );
}
