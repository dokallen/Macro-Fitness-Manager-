import Link from "next/link";
import { cookies } from "next/headers";

import { HomeDashboardClient } from "@/components/home/HomeDashboardClient";
import type { HomeDashboardStats } from "@/components/home/HomeDashboardClient";
import { extractMacroTargets } from "@/lib/dashboard/preferences";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function getIsoWeek(d: Date): number {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil(((+utc - +y0) / 86400000 + 1) / 7);
}

function computeLbsToGoal(prefMap: Record<string, string>): string {
  const curKeys = [
    "current_weight_lbs",
    "current_weight",
    "weight_lbs",
    "weight",
    "body_weight",
  ];
  const goalKeys = [
    "goal_weight_lbs",
    "goal_weight",
    "target_weight_lbs",
    "target_weight",
  ];
  let cur: number | null = null;
  let goal: number | null = null;
  for (const k of curKeys) {
    const n = parseFloat(prefMap[k] ?? "");
    if (Number.isFinite(n)) {
      cur = n;
      break;
    }
  }
  for (const k of goalKeys) {
    const n = parseFloat(prefMap[k] ?? "");
    if (Number.isFinite(n)) {
      goal = n;
      break;
    }
  }
  if (cur == null || goal == null) return "—";
  const d = Math.abs(goal - cur);
  return d % 1 === 0 ? String(d) : d.toFixed(1);
}

function pickWeightDisplay(prefMap: Record<string, string>): string {
  const keys = [
    "current_weight_lbs",
    "current_weight",
    "weight_lbs",
    "weight",
    "body_weight",
  ];
  for (const k of keys) {
    const v = prefMap[k]?.trim();
    if (v) return v;
  }
  return "—";
}

const GOAL_LBS_KEYS = [
  "goal_weight_lbs",
  "goal_weight",
  "target_weight_lbs",
  "target_weight",
] as const;

const START_LBS_KEYS = [
  "starting_weight_lbs",
  "start_weight_lbs",
  "start_weight",
  "starting_weight",
  "baseline_weight_lbs",
  "program_start_weight_lbs",
] as const;

const CURRENT_LBS_KEYS = [
  "current_weight_lbs",
  "current_weight",
  "weight_lbs",
  "weight",
  "body_weight",
] as const;

function firstFiniteFromKeys(
  prefMap: Record<string, string>,
  keys: readonly string[]
): number | null {
  for (const k of keys) {
    const n = parseFloat(prefMap[k] ?? "");
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function buildHomeStats(prefMap: Record<string, string>): HomeDashboardStats {
  const programStart = prefMap.program_start?.trim() || null;
  const currentWeightLbs = firstFiniteFromKeys(prefMap, CURRENT_LBS_KEYS);
  const goalWeight = firstFiniteFromKeys(prefMap, GOAL_LBS_KEYS);
  const startWeight = firstFiniteFromKeys(prefMap, START_LBS_KEYS);
  return {
    weekNumber: getIsoWeek(new Date()),
    programStart,
    currentWeight: pickWeightDisplay(prefMap),
    currentWeightLbs,
    goalWeight,
    startWeight,
    weightLog: [],
    lbsToGoal: computeLbsToGoal(prefMap),
    workoutStreak: "—",
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

  const prefMap = Object.fromEntries(
    (prefRows ?? []).map((p) => [p.key, p.value] as const)
  );

  const macroTargets = extractMacroTargets(prefRows ?? []);
  const stats = buildHomeStats(prefMap);

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
