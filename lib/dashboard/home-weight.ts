import { weighInsInOneUnit } from "@/lib/coaching/check-in";
import { trackedMetrics } from "@/lib/metrics/tracked";
import { convertWeight, isWeightMetricName } from "@/lib/metrics/weight";
import { readProfile } from "@/lib/profile/profile";

type Pref = { key: string; value: string | null };
type Entry = { metric_key: string; value: number; unit: string | null; logged_at: string };

/** Names of every weight metric the user tracks (both metric lists). */
export function weightMetricNames(prefs: readonly Pref[]): string[] {
  return trackedMetrics(prefs.map((p) => ({ key: p.key, value: p.value ?? "" })))
    .filter((m) => isWeightMetricName(m.name))
    .map((m) => m.name);
}

export type HomeWeight = {
  unit: "lbs" | "kg" | null;
  current: number | null;
  start: number | null;
  goal: number | null;
  toGoal: number | null;
  log: { date: string; weight: number }[];
};

/**
 * Home's weight numbers: current = latest weigh-in, start = first weigh-in,
 * goal = profile goal weight, all in one unit (the user's latest weigh-in unit,
 * else their goal weight unit).
 */
export function homeWeight(prefs: readonly Pref[], entries: readonly Entry[], timeZone: string | null): HomeWeight {
  const p = prefs.map((x) => ({ key: x.key, value: x.value ?? "" }));
  const profile = readProfile(p);
  const metricUnits = new Map(trackedMetrics(p).map((m) => [m.name, m.unit]));
  const r = weighInsInOneUnit(entries, metricUnits, timeZone, profile.goalWeightUnit ?? null);
  const unit = r.unit;
  const current = r.weighIns.at(-1)?.value ?? null;
  const start = r.weighIns[0]?.value ?? null;
  const goal =
    profile.goalWeight !== undefined && profile.goalWeightUnit && unit
      ? convertWeight(profile.goalWeight, profile.goalWeightUnit, unit)
      : null;
  const toGoal = current !== null && goal !== null ? Math.round(Math.abs(current - goal) * 10) / 10 : null;
  return { unit, current, start, goal, toGoal, log: r.weighIns.map((w) => ({ date: w.date, weight: w.value })) };
}
