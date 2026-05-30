import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PREF_PUSH_SUBSCRIPTION = "push_subscription";

type PrefUpsert = { key: string; value: string };

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) {
    return jsonError(
      "VAPID_PUBLIC_KEY is not configured on the server.",
      503
    );
  }
  return NextResponse.json({ publicKey });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const o =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  if (!o) return jsonError("Invalid body", 400);

  const userId =
    typeof o.userId === "string" ? o.userId.trim() : "";
  if (!userId) return jsonError("userId is required.", 400);

  const subscription = o.subscription;
  if (!subscription || typeof subscription !== "object") {
    return jsonError("subscription is required.", 400);
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== userId) {
    return jsonError("Unauthorized", 401);
  }

  const upserts: PrefUpsert[] = [
    {
      key: PREF_PUSH_SUBSCRIPTION,
      value: JSON.stringify(subscription),
    },
  ];

  const prefs = o.preferences;
  if (prefs && typeof prefs === "object" && !Array.isArray(prefs)) {
    for (const [key, value] of Object.entries(
      prefs as Record<string, unknown>
    )) {
      const k = key.trim();
      if (!k) continue;
      upserts.push({ key: k, value: String(value ?? "") });
    }
  }

  const now = new Date().toISOString();
  const rows = upserts.map((p) => ({
    user_id: userId,
    key: p.key,
    value: p.value,
    updated_by: "user" as const,
    updated_at: now,
  }));

  const { error } = await supabase
    .from("user_preferences")
    .upsert(rows, { onConflict: "user_id,key" });

  if (error) {
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ ok: true });
}
