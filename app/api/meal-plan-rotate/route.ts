import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const HEADER_CRON_SECRET = "x-cron-secret";

const PREF_ROTATION_DAY = "meal_plan_rotation_day";
const PREF_NEEDS_ROTATION = "meal_plan_needs_rotation";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function utcDayNameMatchesPref(prefDay: string, now: Date): boolean {
  const want = prefDay.trim().toLowerCase();
  if (!want) return false;
  const idx = DAY_NAMES.findIndex((d) => d.toLowerCase() === want);
  if (idx < 0) return false;
  return now.getUTCDay() === idx;
}

async function upsertPref(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  userId: string,
  key: string,
  value: string
) {
  const { error } = await admin.from("user_preferences").upsert(
    {
      user_id: userId,
      key,
      value,
      updated_by: "user",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,key" }
  );
  if (error) throw new Error(error.message);
}

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on the server." },
      { status: 503 }
    );
  }
  const provided =
    req.headers.get(HEADER_CRON_SECRET)?.trim() ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let flagged = 0;

  try {
    const admin = createAdminSupabaseClient();
    const { data: rows, error } = await admin
      .from("user_preferences")
      .select("user_id, value")
      .eq("key", PREF_ROTATION_DAY);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const seen = new Set<string>();
    for (const row of rows ?? []) {
      const uid = String((row as { user_id?: string }).user_id ?? "");
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const dayPref = String((row as { value?: string }).value ?? "");
      if (!utcDayNameMatchesPref(dayPref, now)) continue;
      await upsertPref(admin, uid, PREF_NEEDS_ROTATION, "true");
      flagged += 1;
    }

    return NextResponse.json({
      ok: true,
      flaggedUsers: flagged,
      checkedAt: now.toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cron failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
