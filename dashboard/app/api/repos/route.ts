import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
    /\/rest\/v1\/?$/,
    ""
  );
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY || "");
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  // Get the user's GitHub account
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  const user = await userRes.json();

  // Get repos for this user's installations
  const supabase = getSupabase();
  const { data: installations } = await supabase
    .from("installations")
    .select("id")
    .eq("github_account_login", user.login);

  if (!installations || installations.length === 0) {
    return NextResponse.json({ repos: [] });
  }

  const installIds = installations.map((i: { id: string }) => i.id);
  const { data: repos } = await supabase
    .from("repos")
    .select("id, full_name, is_enabled, last_wiki_generated_at, wiki_page_count")
    .in("installation_id", installIds);

  return NextResponse.json({ repos: repos || [] });
}

export async function PATCH(request: NextRequest) {
  const { id, is_enabled } = await request.json();

  const supabase = getSupabase();
  await supabase.from("repos").update({ is_enabled }).eq("id", id);

  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const { id, action } = await request.json();

  if (action === "regenerate") {
    // Trigger regeneration via backend (future endpoint)
    console.log(`Regeneration requested for repo ${id}`);
  }

  return NextResponse.json({ ok: true });
}
