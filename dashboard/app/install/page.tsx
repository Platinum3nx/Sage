import Link from "next/link";

export default function InstallPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="text-4xl mb-4">&#128214;</div>
        <h1 className="text-2xl font-bold mb-4">
          Sage is generating your wiki
        </h1>
        <p className="text-zinc-400 mb-2">
          This takes 2-5 minutes for the first generation.
        </p>
        <p className="text-zinc-400 mb-8">
          Check your repo&apos;s Wiki tab when it&apos;s done.
        </p>
        <Link
          href="/dashboard"
          className="px-6 py-3 bg-white text-zinc-950 rounded-lg font-semibold hover:bg-zinc-200 transition-colors inline-block"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
