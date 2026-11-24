import Link from "next/link";
import { cookies } from "next/headers";

import { HomeDashboardClient } from "@/components/home/HomeDashboardClient";
import type { HomeDashboardStats } from "@/components/home/HomeDashboardClient";
import { homeWeight, weightMetricNames, type HomeWeight } from "@/lib/dashboard/home-weight";
import { extractMacroTargets } from "@/lib/dashboard/preferences";
import { parseTrainingDaysPerWeek } from "@/lib/dashboard/workout-schedule";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function getIsoWeek(d: Date): number {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((+utc - +y0) / 86400000 + 1) / 7);
}

/** Local-calendar Monday 00:00 week bucket key (YYYY-MM-DD). */
function mondayWeekKeyLocal(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  const offsetFromMonday = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + offsetFromMonday);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Consecutive Monday–Sunday weeks (local) with at least `minSessionsPerWeek`
 * workouts. Current week can be incomplete and is skipped if under target.
 */
function computeConsecutiveWorkoutWeekStreak(
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

function buildHomeStats(
  prefMap: Record<string, string>,
  workoutLoggedAtList: string[],
  weight: HomeWeight
): HomeDashboardStats {
  const programStart = prefMap.program_start?.trim() || null;
  const fmt = (n: number | null) => (n === null ? "—" : n % 1 === 0 ? String(n) : n.toFixed(1));
  const freqRaw = prefMap.recommended_workout_frequency?.trim() ?? "";
  const minSessionsPerWeek = freqRaw
    ? parseTrainingDaysPerWeek(freqRaw)
    : 1;
  const wkStreak = computeConsecutiveWorkoutWeekStreak(
    workoutLoggedAtList,
    minSessionsPerWeek
  );
  const workoutStreak =
    wkStreak >= 2 ? `${wkStreak} 🔥` : String(wkStreak);
  return {
    weekNumber: getIsoWeek(new Date()),
    programStart,
    currentWeight: weight.current === null ? "—" : `${fmt(weight.current)}${weight.unit ? ` ${weight.unit}` : ""}`,
    currentWeightLbs: weight.current,
    goalWeight: weight.goal,
    startWeight: weight.start,
    weightLog: weight.log,
    weightUnit: weight.unit,
    lbsToGoal: fmt(weight.toGoal),
    workoutStreak,
    macroStreak: "—",
  };
}

export default async function HomePage() {
  const isGuest = cookies().get("macrofit_guest")?.value === "1";
  if (isGuest) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--bg)] p-6">
        <div className="text-center">
          <h1
            className="text-[var(--text)]"
            style={{ fontFamily: "var(--fd)", fontSize: 42, letterSpacing: "2px" }}
          >
            MACRO FIT
          </h1>
          <p
            className="mt-2 max-w-md font-body text-sm text-[var(--text2)]"
          >
            You are in guest mode. This dashboard starts empty and stores data
            only on this device.
          </p>
        </div>
        <ButtonAsLink href="/signup">Create Account</ButtonAsLink>
      </div>
    );
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: prefRows } = await supabase
    .from("user_preferences")
    .select("key, value")
    .eq("user_id", user.id);

  const { data: workoutRows } = await supabase
    .from("workout_sessions")
    .select("logged_at")
    .eq("user_id", user.id);

  const prefMap = Object.fromEntries(
    (prefRows ?? []).map((p) => [p.key, p.value] as const)
  );

  const macroTargets = extractMacroTargets(prefRows ?? []);
  const workoutLoggedAtList = (workoutRows ?? [])
    .map((r) => String((r as { logged_at?: string }).logged_at ?? ""))
    .filter(Boolean);
  // Weight comes from weigh-ins and the profile goal weight (Phase 2).
  const names = weightMetricNames(prefRows ?? []);
  // The first weigh-in (start) plus the most recent ones, so the row limit can
  // never drop the newest entries.
  const weightQuery = () =>
    supabase.from("progress_entries").select("metric_key, value, unit, logged_at").eq("user_id", user.id).in("metric_key", names);
  const [firstRes, recentRes] = names.length
    ? await Promise.all([
        weightQuery().order("logged_at", { ascending: true }).limit(1),
        weightQuery().order("logged_at", { ascending: false }).limit(365),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (firstRes.error || recentRes.error) {
    console.error("[home] weigh-ins", firstRes.error?.message ?? recentRes.error?.message);
  }
  const seen = new Set<string>();
  const weightRows = [...(firstRes.data ?? []), ...(recentRes.data ?? [])].filter((r) => {
    const k = `${r.metric_key}|${r.logged_at}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const weight = homeWeight(
    prefRows ?? [],
    weightRows.map((r) => ({ ...r, value: Number(r.value) })),
    prefMap.notification_timezone?.trim() || null
  );
  const stats = buildHomeStats(prefMap, workoutLoggedAtList, weight);

  return (
    <div className="mx-auto h-[100dvh] max-h-[100dvh] w-full max-w-lg overflow-hidden sm:max-w-md">
      <HomeDashboardClient
        stats={stats}
        macroTargets={macroTargets}
        userId={user.id}
      />
    </div>
  );
}

function ButtonAsLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center rounded-xl px-6 font-display text-sm uppercase tracking-wider text-white"
      style={{ background: "var(--accent)" }}
    >
      {children}
    </Link>
  );
}
