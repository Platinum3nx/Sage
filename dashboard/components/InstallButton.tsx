"use client";

export function InstallButton({
  appSlug,
  size = "lg",
}: {
  appSlug: string;
  size?: "sm" | "lg";
}) {
  const url = `https://github.com/apps/${appSlug}/installations/new`;

  const classes =
    size === "lg"
      ? "px-8 py-3 text-lg font-semibold rounded-lg"
      : "px-4 py-2 text-sm font-medium rounded-md";

  return (
    <a
      href={url}
      className={`${classes} bg-white text-zinc-950 hover:bg-zinc-200 transition-colors inline-block`}
    >
      Install on GitHub
    </a>
  );
}
