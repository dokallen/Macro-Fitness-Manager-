/**
 * Server side of the weekly check-in (Phase 2.6): gathers the user's data,
 * runs the calculation, and builds the check-in record. Runs with the user's
 * own Supabase session, so row-level security applies.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateTargets, type CalcResult, type LoggingAnswer, type WeighIn } from "@/lib/coaching/calc";
import { CALC_WINDOW_DAYS } from "@/lib/coaching/constants";
import { readGoalPace } from "@/lib/coaching/goal-pace";
import { identifyMacroRoles, HOLD_REASON_TEXT } from "@/lib/coaching/calc";
import {
  SCHEDULE_KEYS,
  checkInRecordDates,
  checkInStatus,
  readSchedule,
  type CheckInStatus,
} from "@/lib/coaching/schedule";
import { addDays, ymdInZone } from "@/lib/coaching/ymd";
import { extractMacroTargets, type MacroTargetRow } from "@/lib/dashboard/preferences";
import { trackedMetrics } from "@/lib/metrics/tracked";
import { readProfile } from "@/lib/profile/profile";
import { convertWeight, isWeightMetricName, normalizeWeightUnit } from "@/lib/metrics/weight";
import type { Database } from "@/lib/types";

type Client = SupabaseClient<Database>;
type Pref = { key: string; value: string };

/** How many days of weigh-ins to read: enough for the trend to settle. */
const WEIGH_IN_LOOKBACK_DAYS = 60;

export function validTimeZone(tz: unknown): string | null {
  if (typeof tz !== "string" || !tz.trim()) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return tz.trim();
  } catch {
    return null;
  }
}

export type CheckInData = {
  prefs: Pref[];
  timeZone: string | null;
  today: string;
  status: CheckInStatus;
  lastCheckIn: string | null;
  targets: MacroTargetRow[];
  weighIns: WeighIn[];
  /** The user's weight unit: from their weigh-ins, else their goal weight; null if unknown. */
  weightUnit: "lbs" | "kg" | null;
  lastWeighInAt: string | null;
  /** When the last check-in was completed (instant), if recorded. */
  lastCheckInAt: string | null;
  dailyCalories: Record<string, number>;
  loggedDays: string[];
};

/** "Weight (kg)" → "kg". */
function unitFromName(name: string): "lbs" | "kg" | null {
  const m = /\(([^)]+)\)\s*$/.exec(name);
  return m ? normalizeWeightUnit(m[1]!) : null;
}

/**
 * Weigh-ins from every weight-named metric, in one unit.
 * An entry's unit comes from the entry, else its metric, else the metric's
 * name ("Weight (kg)"), else `fallbackUnit` (the user's own weight unit). Entries
 * in a unit other than lbs or kg (e.g. stone) are left out of the calculation but
 * still count as a weigh-in. The result's unit is the latest usable entry's.
 */
export function weighInsInOneUnit(
  rows: readonly { value: number; unit: string | null; logged_at: string; metric_key: string }[],
  metricUnits: ReadonlyMap<string, string>,
  timeZone: string | null,
  fallbackUnit: "lbs" | "kg" | null = null
): { weighIns: WeighIn[]; unit: "lbs" | "kg" | null; lastAt: string | null } {
  const sorted = [...rows].filter((r) => Number.isFinite(r.value)).sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  const lastAt = sorted.at(-1)?.logged_at ?? null;
  const withUnit = sorted
    .map((r) => {
      const raw = r.unit?.trim() || metricUnits.get(r.metric_key)?.trim() || "";
      const u = raw ? normalizeWeightUnit(raw) : unitFromName(r.metric_key) ?? fallbackUnit;
      return { ...r, u };
    })
    .filter((r): r is typeof r & { u: "lbs" | "kg" } => r.u !== null);
  const unit = withUnit.at(-1)?.u ?? fallbackUnit;
  return {
    unit,
    lastAt,
    weighIns: unit
      ? withUnit.map((r) => ({ date: ymdInZone(new Date(r.logged_at), timeZone), value: convertWeight(r.value, r.u, unit) }))
      : [],
  };
}

export async function loadCheckInData(
  supabase: Client,
  userId: string,
  now: Date,
  clientTimeZone?: string | null,
  /** The user's preference rows, if the caller already loaded them. */
  preloadedPrefs?: readonly { key: string; value: string | null }[]
): Promise<CheckInData> {
  let prefRows = preloadedPrefs;
  if (!prefRows) {
    const { data, error: prefErr } = await supabase
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", userId);
    if (prefErr) throw new Error(prefErr.message);
    prefRows = data ?? [];
  }
  const prefs = prefRows.map((p) => ({ key: p.key, value: p.value ?? "" }));
  const timeZone =
    validTimeZone(clientTimeZone) ?? validTimeZone(prefs.find((p) => p.key === "notification_timezone")?.value);
  const today = ymdInZone(now, timeZone);
  const lastCheckIn = checkInRecordDates(prefs).at(-1) ?? null;
  const status = checkInStatus(readSchedule(prefs), timeZone, lastCheckIn, now);
  const targets = extractMacroTargets(prefs);

  // Weigh-ins: every weight-named metric the user tracks.
  const metrics = trackedMetrics(prefs).filter((m) => isWeightMetricName(m.name));
  const metricUnits = new Map(metrics.map((m) => [m.name, m.unit]));
  const goalUnit = readProfile(prefs).goalWeightUnit ?? null;
  let weighIns: WeighIn[] = [];
  let weightUnit: "lbs" | "kg" | null = goalUnit;
  let lastWeighInAt: string | null = null;
  if (metrics.length) {
    const since = new Date(now.getTime() - WEIGH_IN_LOOKBACK_DAYS * 86_400_000).toISOString();
    const { data: entries, error } = await supabase
      .from("progress_entries")
      .select("metric_key, value, unit, logged_at")
      .eq("user_id", userId)
      .in("metric_key", metrics.map((m) => m.name))
      .gte("logged_at", since);
    if (error) throw new Error(error.message);
    const r = weighInsInOneUnit(
      (entries ?? []).map((e) => ({ ...e, value: Number(e.value) })),
      metricUnits,
      timeZone,
      goalUnit
    );
    weighIns = r.weighIns;
    weightUnit = r.unit;
    lastWeighInAt = r.lastAt;
  }

  // Calories per local day for the calculation window.
  const roles = identifyMacroRoles(
    targets,
    prefs.find((p) => p.key === SCHEDULE_KEYS.caloriesKey)?.value
  );
  const dailyCalories: Record<string, number> = {};
  const windowStart = addDays(today, -(CALC_WINDOW_DAYS - 1));
  // A day before the window start in UTC covers every time zone's local midnight.
  const fetchFrom = new Date(Date.parse(`${addDays(windowStart, -1)}T00:00:00Z`)).toISOString();
  const { data: logs, error: logErr } = await supabase
    .from("food_logs")
    .select("id, logged_at")
    .eq("user_id", userId)
    .gte("logged_at", fetchFrom);
  if (logErr) throw new Error(logErr.message);
  const dayOfLog = new Map<string, string>();
  for (const l of logs ?? []) {
    const d = ymdInZone(new Date(l.logged_at), timeZone);
    if (d < windowStart || d > today) continue;
    dayOfLog.set(l.id, d);
  }
  const loggedDays = Array.from(new Set(dayOfLog.values())).sort();
  if (roles.calories && dayOfLog.size) {
    // Only the calorie entries, so the row limit isn't spent on other macros.
    // Food log macros are saved under the target's exact key.
    const { data: macros, error: mErr } = await supabase
      .from("food_log_macros")
      .select("food_log_id, key, value")
      .eq("key", roles.calories)
      .in("food_log_id", Array.from(dayOfLog.keys()));
    if (mErr) throw new Error(mErr.message);
    for (const m of macros ?? []) {
      const d = dayOfLog.get(m.food_log_id);
      if (d) dailyCalories[d] = (dailyCalories[d] ?? 0) + Number(m.value);
    }
  }

  const lastCheckInAt = lastCheckIn
    ? parseCheckInRecord(prefs.find((p) => p.key === `check_in_${lastCheckIn}`)?.value)?.completedAt ?? null
    : null;

  return {
    prefs,
    timeZone,
    today,
    status,
    lastCheckIn,
    lastCheckInAt,
    targets,
    weighIns,
    weightUnit,
    lastWeighInAt,
    dailyCalories,
    loggedDays,
  };
}

/** Has the user weighed in since the last check-in was completed? */
export function weighedSinceLastCheckIn(data: Pick<CheckInData, "lastWeighInAt" | "lastCheckIn" | "lastCheckInAt" | "timeZone">): boolean {
  if (!data.lastWeighInAt) return false;
  if (!data.lastCheckIn) return true;
  if (data.lastCheckInAt) return Date.parse(data.lastWeighInAt) > Date.parse(data.lastCheckInAt);
  // Older records without a time: compare dates.
  return ymdInZone(new Date(data.lastWeighInAt), data.timeZone) > data.lastCheckIn;
}

export function runCalculation(data: CheckInData, loggingAnswer: LoggingAnswer | null): CalcResult {
  return calculateTargets({
    today: data.today,
    weighIns: data.weighIns,
    weightUnit: data.weightUnit ?? "lbs", // only reached with weigh-ins, which set the unit
    dailyCalories: data.dailyCalories,
    loggedDays: data.loggedDays,
    loggingAnswer,
    missed: data.status.state === "missed",
    pace: readGoalPace(data.prefs),
    targets: data.targets,
    rememberedCaloriesKey: data.prefs.find((p) => p.key === SCHEDULE_KEYS.caloriesKey)?.value,
  });
}

export type CheckInRecord = {
  date: string;
  completedAt: string;
  dueDate: string | null;
  status: CheckInStatus["state"];
  loggingAnswer: LoggingAnswer;
  weightUnit: "lbs" | "kg";
  trendWeight: number | null;
  trendChangePerWeek: number | null;
  averageIntake: number | null;
  daysLogged: number;
  estimatedBurn: number | null;
  decision: "change" | "hold";
  reasons: string[];
  reason: string;
  changes: { key: string; from: number; to: number; unit: string }[];
  proposalId?: string;
};

const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

/** The JSON summary saved as `check_in_<date>`. */
export function buildCheckInRecord(
  data: Pick<CheckInData, "today" | "status">,
  r: CalcResult,
  loggingAnswer: LoggingAnswer,
  completedAt: Date,
  proposalId?: string
): CheckInRecord {
  return {
    date: data.today,
    completedAt: completedAt.toISOString(),
    dueDate: "dueDate" in data.status ? data.status.dueDate : null,
    status: data.status.state,
    loggingAnswer,
    weightUnit: r.weightUnit,
    trendWeight: round1(r.trendWeight),
    trendChangePerWeek:
      r.trendChange !== null && r.trendDays ? Math.round((r.trendChange / r.trendDays) * 7 * 100) / 100 : null,
    averageIntake: r.averageIntake === null ? null : Math.round(r.averageIntake),
    daysLogged: r.daysLogged,
    estimatedBurn: r.estimatedBurn === null ? null : Math.round(r.estimatedBurn),
    decision: r.decision,
    reasons: r.holdReasons,
    reason:
      r.decision === "change"
        ? "Enough data: targets recalculated from your trend weight and intake."
        : r.holdReasons.length
          ? r.holdReasons.map((h) => HOLD_REASON_TEXT[h]).join(" ")
          : "The calculated targets match your current ones.",
    changes: r.changes,
    ...(proposalId ? { proposalId } : {}),
  };
}

/** Reads a saved record; null if it isn't one. */
export function parseCheckInRecord(raw: string | null | undefined): CheckInRecord | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<CheckInRecord>;
    if (typeof o.date !== "string" || (o.decision !== "change" && o.decision !== "hold")) return null;
    return o as CheckInRecord;
  } catch {
    return null;
  }
}
