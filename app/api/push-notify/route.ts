import { NextResponse } from "next/server";
import webpush from "web-push";

import { getCoachPersonaForPrompt } from "@/lib/coach-chat-context";
import { extractMacroTargets } from "@/lib/dashboard/preferences";
import { parseTrainingDaysPerWeek } from "@/lib/dashboard/workout-schedule";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const HEADER_CRON_SECRET = "x-cron-secret";

const PREF_PUSH_SUBSCRIPTION = "push_subscription";
const PREF_CHOSEN_COACH = "chosen_coach_id";
const PREF_GOAL = "goal";
const PREF_TIMEZONE = "notification_timezone";
const PREF_MORNING_TIME = "notification_morning_time";
const PREF_MORNING_ENABLED = "notification_morning_enabled";
const PREF_WORKOUT_REMINDER = "notification_workout_reminder";
const PREF_MIDDAY_TIME = "notification_midday_time";
const PREF_MIDDAY_ENABLED = "notification_midday_enabled";
const PREF_EVENING_TIME = "notification_evening_time";
const PREF_EVENING_ENABLED = "notification_evening_enabled";
const PREF_STREAKS = "notification_streaks";
const PREF_MEAL_ROTATION = "notification_meal_rotation";
const PREF_MEAL_NEEDS_ROTATION = "meal_plan_needs_rotation";
const PREF_WORKOUT_FREQ = "recommended_workout_frequency";

const DEFAULT_MORNING = "07:00";
const DEFAULT_MIDDAY = "12:00";
const DEFAULT_EVENING = "20:00";
const DEFAULT_WORKOUT_HOUR = "08:00";

const NOTIFICATION_URLS = {
  morning_motivation: "/",
  workout_reminder: "/workout",
  midday_checkin: "/meals",
  evening_recap: "/meals",
  streak_celebration: "/",
  meal_plan_rotation: "/meals",
} as const;

type NotificationType = keyof typeof NOTIFICATION_URLS;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function verifyCronSecret(req: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  const provided =
    req.headers.get(HEADER_CRON_SECRET)?.trim() ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    "";
  return provided === expected;
}

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const email = process.env.VAPID_EMAIL?.trim();
  if (!publicKey || !privateKey || !email) {
    throw new Error(
      "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_EMAIL must be set."
    );
  }
  webpush.setVapidDetails(email, publicKey, privateKey);
}

function localHHMM(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(now);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

function localYmd(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(now);
}

function matchesHHMM(now: Date, timeZone: string, hhmm: string): boolean {
  const [ph, pm] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(ph)) return false;
  const prefMin = Number.isFinite(pm) ? pm : 0;
  const cur = localHHMM(now, timeZone);
  const [ch, cm] = cur.split(":").map((x) => parseInt(x, 10));
  return ch === ph && cm === prefMin;
}

function isTruthyPref(v: string | undefined, defaultOn = false): boolean {
  if (v === undefined || v.trim() === "") return defaultOn;
  return v.trim().toLowerCase() === "true";
}

function isEnabledPref(v: string | undefined): boolean {
  if (v === undefined || v.trim() === "") return true;
  return v.trim().toLowerCase() !== "false";
}

function mondayWeekKeyLocal(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + offset);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computeWorkoutWeekStreak(
  loggedAtIsoStrings: string[],
  minSessionsPerWeek: number
): number {
  const weekCounts = new Map<string, number>();
  for (const iso of loggedAtIsoStrings) {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) continue;
    const k = mondayWeekKeyLocal(d);
    weekCounts.set(k, (weekCounts.get(k) ?? 0) + 1);
  }
  let streak = 0;
  for (let w = 0; w < 104; w++) {
    const probe = new Date();
    probe.setHours(0, 0, 0, 0);
    const dow = probe.getDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    probe.setDate(probe.getDate() + offset - 7 * w);
    const key = mondayWeekKeyLocal(probe);
    const c = weekCounts.get(key) ?? 0;
    if (w === 0 && c < minSessionsPerWeek) continue;
    if (c >= minSessionsPerWeek) streak += 1;
    else break;
  }
  return streak;
}

async function generateCoachLine(system: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return "";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 60,
      temperature: 0.65,
      system,
      messages: [
        {
          role: "user",
          content: "Write the push notification text only. No quotes.",
        },
      ],
    }),
  });
  if (!res.ok) return "";
  const raw = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return raw.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
}

function buildSystemPrompt(
  type: NotificationType,
  coachId: string,
  ctx: {
    userName: string;
    goal: string;
    workoutType: string;
    macroPct: number;
    streakWeeks: number;
  }
): string {
  const coach = getCoachPersonaForPrompt(coachId);
  const base = `You are ${coach.name}, a ${coach.style} fitness coach. ${coach.personality}`;
  const name = ctx.userName || "the user";
  const goal = ctx.goal || "their fitness goals";

  switch (type) {
    case "morning_motivation":
      return `${base}
Write a short motivational morning message for ${name} who is working toward ${goal}. Under 15 words.
Stay in character. No hashtags. No emojis unless they fit your personality.`;
    case "workout_reminder":
      return `${base}
Write a short workout reminder for ${name}. Their workout today is ${ctx.workoutType}. Under 15 words. Stay in character.`;
    case "midday_checkin":
      return `${base}
${name} hasn't logged any food yet today. Write a short nudge to log their meals. Under 15 words. Stay in character.`;
    case "evening_recap":
      return `${base}
Write a short evening recap message for ${name} who hit ${ctx.macroPct}% of their macro targets today. Under 20 words. Stay in character. Be honest.`;
    case "streak_celebration":
      return `${base}
Celebrate ${name}'s ${ctx.streakWeeks} week workout streak. Under 15 words. Stay in character. Make it feel earned.`;
    case "meal_plan_rotation":
      return `${base}
Remind ${name} it's time to rotate their meal plan. Under 15 words. Stay in character.`;
    default:
      return base;
  }
}

async function upsertLastSent(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  userId: string,
  type: NotificationType,
  ymd: string
) {
  await admin.from("user_preferences").upsert(
    {
      user_id: userId,
      key: `notification_last_sent_${type}`,
      value: ymd,
      updated_by: "user",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,key" }
  );
}

async function handleNotify(req: Request, notificationType: NotificationType) {
  if (!verifyCronSecret(req)) {
    return jsonError("Unauthorized", 401);
  }

  try {
    configureWebPush();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "VAPID not configured";
    return jsonError(msg, 503);
  }

  const now = new Date();
  const admin = createAdminSupabaseClient();

  const { data: subRows, error: subErr } = await admin
    .from("user_preferences")
    .select("user_id, value")
    .eq("key", PREF_PUSH_SUBSCRIPTION);

  if (subErr) return jsonError(subErr.message, 500);

    const userIds = Array.from(
      new Set(
        (subRows ?? [])
          .map((r) => String((r as { user_id?: string }).user_id ?? ""))
          .filter(Boolean)
      )
    );

  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, type: notificationType });
  }

  const { data: allPrefs, error: prefErr } = await admin
    .from("user_preferences")
    .select("user_id, key, value")
    .in("user_id", userIds);

  if (prefErr) return jsonError(prefErr.message, 500);

  const prefsByUser = new Map<string, Record<string, string>>();
  for (const row of allPrefs ?? []) {
    const uid = String((row as { user_id?: string }).user_id ?? "");
    if (!uid) continue;
    const map = prefsByUser.get(uid) ?? {};
    map[(row as { key: string }).key] = String(
      (row as { value?: string }).value ?? ""
    );
    prefsByUser.set(uid, map);
  }

  const { data: users, error: userErr } = await admin
    .from("users")
    .select("id, display_name")
    .in("id", userIds);

  if (userErr) return jsonError(userErr.message, 500);

  const namesById = Object.fromEntries(
    (users ?? []).map((u) => [
      String((u as { id: string }).id),
      String((u as { display_name?: string }).display_name ?? "").trim(),
    ])
  );

  const subByUser = Object.fromEntries(
    (subRows ?? []).map((r) => [
      String((r as { user_id?: string }).user_id ?? ""),
      String((r as { value?: string }).value ?? ""),
    ])
  );

  let sent = 0;

  for (const userId of userIds) {
    const prefs = prefsByUser.get(userId) ?? {};
    const subRaw = subByUser[userId];
    if (!subRaw) continue;

    let subscription: webpush.PushSubscription;
    try {
      subscription = JSON.parse(subRaw) as webpush.PushSubscription;
    } catch {
      continue;
    }

    const tz = prefs[PREF_TIMEZONE]?.trim() || "UTC";
    const todayYmd = localYmd(now, tz);
    const lastKey = `notification_last_sent_${notificationType}`;
    if (prefs[lastKey] === todayYmd) continue;

    let shouldSend = false;

    switch (notificationType) {
      case "morning_motivation":
        shouldSend =
          isEnabledPref(prefs[PREF_MORNING_ENABLED]) &&
          matchesHHMM(
            now,
            tz,
            prefs[PREF_MORNING_TIME]?.trim() || DEFAULT_MORNING
          );
        break;
      case "workout_reminder":
        shouldSend =
          isTruthyPref(prefs[PREF_WORKOUT_REMINDER], true) &&
          matchesHHMM(now, tz, DEFAULT_WORKOUT_HOUR);
        break;
      case "midday_checkin":
        shouldSend =
          isEnabledPref(prefs[PREF_MIDDAY_ENABLED]) &&
          matchesHHMM(
            now,
            tz,
            prefs[PREF_MIDDAY_TIME]?.trim() || DEFAULT_MIDDAY
          );
        break;
      case "evening_recap":
        shouldSend =
          isEnabledPref(prefs[PREF_EVENING_ENABLED]) &&
          matchesHHMM(
            now,
            tz,
            prefs[PREF_EVENING_TIME]?.trim() || DEFAULT_EVENING
          );
        break;
      case "streak_celebration":
        shouldSend = isTruthyPref(prefs[PREF_STREAKS], true);
        break;
      case "meal_plan_rotation":
        shouldSend =
          isTruthyPref(prefs[PREF_MEAL_ROTATION], true) &&
          isTruthyPref(prefs[PREF_MEAL_NEEDS_ROTATION]);
        break;
      default:
        break;
    }

    if (!shouldSend) continue;

    if (notificationType === "midday_checkin") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const { count } = await admin
        .from("food_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("logged_at", start.toISOString());
      if ((count ?? 0) > 0) continue;
    }

    let macroPct = 0;
    if (notificationType === "evening_recap") {
      const prefRows = Object.entries(prefs).map(([key, value]) => ({
        key,
        value,
      }));
      const targets = extractMacroTargets(prefRows);
      if (targets.length > 0) {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);
        const { data: logs } = await admin
          .from("food_logs")
          .select("food_log_macros(key, value)")
          .eq("user_id", userId)
          .gte("logged_at", start.toISOString());
        const totals: Record<string, number> = {};
        for (const row of logs ?? []) {
          const macros =
            (
              row as {
                food_log_macros?: { key: string; value: number }[] | null;
              }
            ).food_log_macros ?? [];
          for (const m of macros) {
            const k = m.key.trim().toLowerCase();
            totals[k] = (totals[k] ?? 0) + Number(m.value);
          }
        }
        let sumPct = 0;
        let n = 0;
        for (const t of targets) {
          const k = t.key.trim().toLowerCase();
          const target = t.targetNumber;
          if (target <= 0) continue;
          const cur = totals[k] ?? 0;
          sumPct += Math.min(100, (cur / target) * 100);
          n += 1;
        }
        macroPct = n > 0 ? Math.round(sumPct / n) : 0;
      }
    }

    let streakWeeks = 0;
    if (notificationType === "streak_celebration") {
      const { data: ws } = await admin
        .from("workout_sessions")
        .select("logged_at")
        .eq("user_id", userId);
      const freqRaw = prefs[PREF_WORKOUT_FREQ]?.trim() ?? "";
      const minPerWeek = freqRaw
        ? parseTrainingDaysPerWeek(freqRaw)
        : 1;
      streakWeeks = computeWorkoutWeekStreak(
        (ws ?? []).map((r) => String((r as { logged_at: string }).logged_at)),
        minPerWeek
      );
      if (streakWeeks < 2) continue;
    }

    const coachId = prefs[PREF_CHOSEN_COACH]?.trim() || "drdata";
    const userName = namesById[userId] || "there";
    const goal = prefs[PREF_GOAL]?.trim() || "";
    const workoutType = prefs["weekly_plan_suggestion"]?.trim() || "training";

    const system = buildSystemPrompt(notificationType, coachId, {
      userName,
      goal,
      workoutType,
      macroPct,
      streakWeeks,
    });

    const body = await generateCoachLine(system);
    if (!body) continue;

    const coach = getCoachPersonaForPrompt(coachId);
    const title = coach.name;
    const url = NOTIFICATION_URLS[notificationType] ?? "/";

    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({ title, body, url })
      );
      await upsertLastSent(admin, userId, notificationType, todayYmd);
      sent += 1;
    } catch (err) {
      console.error("[push-notify]", userId, err);
    }
  }

  return NextResponse.json({ ok: true, sent, type: notificationType });
}

function parseNotificationType(raw: string | null): NotificationType | null {
  if (!raw?.trim()) return null;
  const t = raw.trim() as NotificationType;
  return t in NOTIFICATION_URLS ? t : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = parseNotificationType(url.searchParams.get("type"));
  if (!type) {
    return jsonError("Valid type query parameter is required.", 400);
  }
  return handleNotify(req, type);
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
  const type = parseNotificationType(
    typeof o?.notificationType === "string" ? o.notificationType : null
  );
  if (!type) {
    return jsonError("notificationType is required.", 400);
  }
  return handleNotify(req, type);
}
