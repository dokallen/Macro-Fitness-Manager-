/**
 * The target calculation (Phase 2.6/2.7). A formula sets the numbers; the Coach
 * only explains them. Every step is a pure function.
 */
import {
  CALC_WINDOW_DAYS,
  CHECK_IN_LATE_MAX_DAYS,
  CALORIE_ROUNDING,
  MAX_CALORIE_DECREASE_FRACTION,
  HOLD_LOGGED_DAYS_WINDOW,
  HOLD_MIN_LOGGED_DAYS,
  HOLD_MIN_WEIGH_IN_SPAN_DAYS,
  HOLD_MIN_WEIGH_INS,
  KCAL_PER_G_CARB,
  KCAL_PER_G_FAT,
  KCAL_PER_G_PROTEIN,
  KCAL_PER_KG,
  KCAL_PER_LB,
  TREND_ALPHA_PER_DAY,
} from "@/lib/coaching/constants";
import type { GoalPace } from "@/lib/coaching/goal-pace";
import { addDays, daysBetween } from "@/lib/coaching/ymd";
import { formatMacroLabel } from "@/lib/dashboard/preferences";

export type WeighIn = { date: string; value: number };
export type TrendPoint = { date: string; value: number; trend: number };

// ------------------------------------------------------------ 1. trend weight

/**
 * Time-aware exponential smoothing. For a gap of g days the trend moves
 * 1 − (1 − α)^g of the way to the new weigh-in, so a weigh-in after a long gap
 * counts for more than one the next day. Several weigh-ins on one day are
 * averaged first.
 */
export function trendSeries(weighIns: readonly WeighIn[], alpha = TREND_ALPHA_PER_DAY): TrendPoint[] {
  const byDay = new Map<string, number[]>();
  for (const w of weighIns) {
    if (!Number.isFinite(w.value)) continue;
    byDay.set(w.date, [...(byDay.get(w.date) ?? []), w.value]);
  }
  const days = Array.from(byDay.keys()).sort();
  const out: TrendPoint[] = [];
  let trend = 0;
  let prev: string | null = null;
  for (const date of days) {
    const vals = byDay.get(date)!;
    const value = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (prev === null) trend = value;
    else {
      const k = 1 - Math.pow(1 - alpha, daysBetween(prev, date));
      trend += k * (value - trend);
    }
    out.push({ date, value, trend });
    prev = date;
  }
  return out;
}

/** The trend as of a date: the last point on or before it, or null. */
export function trendAt(series: readonly TrendPoint[], date: string): TrendPoint | null {
  let found: TrendPoint | null = null;
  for (const p of series) {
    if (p.date <= date) found = p;
    else break;
  }
  return found;
}

// ---------------------------------------------------------- 2. daily intake

/** Average of the days that have food logged, inside [from, to]. */
export function averageIntake(
  dailyCalories: Readonly<Record<string, number>>,
  from: string,
  to: string
): { average: number | null; daysLogged: number } {
  const vals = Object.entries(dailyCalories)
    .filter(([d]) => d >= from && d <= to)
    .map(([, v]) => v);
  if (!vals.length) return { average: null, daysLogged: 0 };
  return { average: vals.reduce((a, b) => a + b, 0) / vals.length, daysLogged: vals.length };
}

// -------------------------------------------------- 3. estimated calorie burn

/**
 * Average intake minus the energy in the trend change, per day.
 * burn = intake − (Δtrend × kcal per unit) / days.
 * Losing weight (Δtrend < 0) means burn is above intake.
 */
export function estimateBurn(
  averageIntakeKcal: number,
  trendChange: number,
  days: number,
  unit: "lbs" | "kg"
): number {
  const perUnit = unit === "kg" ? KCAL_PER_KG : KCAL_PER_LB;
  return averageIntakeKcal - (trendChange * perUnit) / days;
}

// --------------------------------------------------- 4. new calorie target

/** Burn adjusted for the goal pace, rounded. */
export function calorieTargetFor(
  burnKcal: number,
  pace: GoalPace,
  trendWeight: number,
  unit: "lbs" | "kg"
): number {
  let daily = 0;
  if (pace.direction !== "maintain") {
    const perUnit = unit === "kg" ? KCAL_PER_KG : KCAL_PER_LB;
    const weeklyChange = (pace.percentPerWeek / 100) * trendWeight;
    daily = (weeklyChange * perUnit) / 7;
    if (pace.direction === "loss") daily = -daily;
  }
  return Math.round((burnKcal + daily) / CALORIE_ROUNDING) * CALORIE_ROUNDING;
}

// -------------------------------------------------- 5. hold-steady rules

export type LoggingAnswer = "yes" | "mostly" | "no";

export type HoldReason =
  | "not_enough_weigh_ins"
  | "logging_incomplete"
  | "not_enough_logged_days"
  | "check_in_missed"
  | "no_goal_pace"
  | "calories_unknown"
  | "macros_unknown"
  | "target_not_positive"
  | "own_targets_on_track";

export const HOLD_REASON_TEXT: Record<HoldReason, string> = {
  not_enough_weigh_ins: `Need at least ${HOLD_MIN_WEIGH_INS} weigh-ins at least ${HOLD_MIN_WEIGH_IN_SPAN_DAYS} days apart in the last ${CALC_WINDOW_DAYS} days.`,
  logging_incomplete: "You said you didn't log everything this week, so the numbers can't be trusted yet.",
  not_enough_logged_days: `Need food logged on at least ${HOLD_MIN_LOGGED_DAYS} of the last ${HOLD_LOGGED_DAYS_WINDOW} days.`,
  check_in_missed: `This check-in is more than ${CHECK_IN_LATE_MAX_DAYS} days late, so the data is too old to act on.`,
  no_goal_pace: "Set a goal pace first (Settings → Weekly check-in).",
  calories_unknown: "Can't tell which target is calories.",
  macros_unknown: "Can't tell which targets are protein, carbs and fat, or can't fit them to the new calories.",
  target_not_positive: "The calculation came out at or below zero, so it is not used. Check your recent weigh-ins and food logs.",
  own_targets_on_track: "You're on your own targets and your trend is moving toward your goal, so they stay.",
};

/** Data-quality rules, in a fixed order. Empty means the data is good enough. */
export function holdReasons(input: {
  weighInsInWindow: readonly WeighIn[];
  loggingAnswer: LoggingAnswer | null;
  daysLoggedLastWeek: number;
  missed: boolean;
}): HoldReason[] {
  const out: HoldReason[] = [];
  const dates = input.weighInsInWindow.map((w) => w.date).sort();
  const distinct = new Set(dates).size;
  const span = dates.length ? daysBetween(dates[0]!, dates[dates.length - 1]!) : 0;
  if (distinct < HOLD_MIN_WEIGH_INS || span < HOLD_MIN_WEIGH_IN_SPAN_DAYS) out.push("not_enough_weigh_ins");
  if (input.loggingAnswer === "no") out.push("logging_incomplete");
  if (input.daysLoggedLastWeek < HOLD_MIN_LOGGED_DAYS) out.push("not_enough_logged_days");
  if (input.missed) out.push("check_in_missed");
  return out;
}

// ------------------------------------------------------------- 6. macros

export type TargetLike = { key: string; displayValue: string; targetNumber: number };
export type MacroRoles = {
  calories?: string;
  protein?: string;
  carbs?: string;
  fat?: string;
  /** Roles where several targets look alike and none is clearly the one. */
  ambiguous: ("calories" | "protein" | "carbs" | "fat")[];
};

function unitOf(t: TargetLike): string {
  return t.displayValue.replace(/^[^a-zA-Z]*/, "").trim().toLowerCase();
}

/** "fat_g", "Fat (g)", "fats" → "fat"; "net_carbs" → "net carbs". */
function baseName(key: string): string {
  return key
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[_\s-]+/g, " ")
    .replace(/\s(g|grams?|kcal|cal)$/, "")
    .trim();
}

const ROLE_RULES = {
  calories: { exact: /^(calories|calorie|kcal|cals?|energy)$/, loose: /calor|kcal|\bcals?\b|energy/, unit: /^(k?cal|kcals?|calories)$/ },
  protein: { exact: /^(protein|proteins|pro)$/, loose: /protein/ },
  carbs: { exact: /^(carbs?|carbohydrates?)$/, loose: /carb/ },
  fat: { exact: /^(fats?|total fats?)$/, loose: /(^|\s)fats?($|\s)/ },
} as const;

/**
 * Finds the calorie, protein, carb and fat targets by key name or unit. An
 * exact name wins ("fat" over "saturated fat"), except for calories, which must
 * be the only calorie-like target; otherwise a role is set only
 * when exactly one target matches it, and several matches mark it ambiguous.
 * `rememberedCaloriesKey` is the user's answer to "which target is calories?".
 */
export function identifyMacroRoles(targets: readonly TargetLike[], rememberedCaloriesKey?: string | null): MacroRoles {
  const out: MacroRoles = { ambiguous: [] };
  for (const role of ["calories", "protein", "carbs", "fat"] as const) {
    if (role === "calories" && rememberedCaloriesKey) {
      const r = targets.find((t) => t.key === rememberedCaloriesKey);
      if (r) {
        out.calories = r.key;
        continue;
      }
    }
    const rule = ROLE_RULES[role];
    const exact = targets.filter((t) => rule.exact.test(baseName(t.key)));
    const loose = targets.filter(
      (t) => rule.loose.test(baseName(t.key)) || ("unit" in rule && rule.unit.test(unitOf(t)))
    );
    // Calories must be certain (spec): two calorie-like targets means ask the user.
    if (role === "calories" && loose.length > 1) out.ambiguous.push(role);
    else if (exact.length === 1) out[role] = exact[0]!.key;
    else if (exact.length === 0 && loose.length === 1) out[role] = loose[0]!.key;
    else if (exact.length > 1 || loose.length > 1) out.ambiguous.push(role);
  }
  return out;
}

export type TargetChange = { key: string; from: number; to: number; unit: string };

/**
 * New targets for a calorie goal: protein stays as set; carbs and fat are
 * scaled in their current proportion to fill the remaining calories; every
 * other target is untouched. Null when it can't be done.
 */
export function scaleMacros(
  targets: readonly TargetLike[],
  roles: MacroRoles,
  newCalories: number
): TargetChange[] | null {
  if (!roles.calories) return null;
  const get = (k?: string) => (k ? targets.find((t) => t.key === k) : undefined);
  const cal = get(roles.calories)!;
  const protein = get(roles.protein);
  const carbs = get(roles.carbs);
  const fat = get(roles.fat);
  const changes: TargetChange[] = [
    { key: cal.key, from: cal.targetNumber, to: newCalories, unit: unitOf(cal) },
  ];
  if (newCalories <= 0) return null;
  if (roles.ambiguous.some((r) => r !== "calories")) return null;
  if (!carbs && !fat) return changes;
  const proteinKcal = (protein?.targetNumber ?? 0) * KCAL_PER_G_PROTEIN;
  const carbKcal = (carbs?.targetNumber ?? 0) * KCAL_PER_G_CARB;
  const fatKcal = (fat?.targetNumber ?? 0) * KCAL_PER_G_FAT;
  const remaining = newCalories - proteinKcal;
  if (carbKcal + fatKcal <= 0 || remaining <= 0) return null;
  const s = remaining / (carbKcal + fatKcal);
  if (carbs) changes.push({ key: carbs.key, from: carbs.targetNumber, to: Math.round(carbs.targetNumber * s), unit: unitOf(carbs) });
  if (fat) changes.push({ key: fat.key, from: fat.targetNumber, to: Math.round(fat.targetNumber * s), unit: unitOf(fat) });
  if (changes.some((c) => c.to <= 0)) return null;
  return changes;
}

// ------------------------------------------------------------ the decision

export type CalcInput = {
  today: string;
  weighIns: readonly WeighIn[];
  /** Null when no weigh-in has a usable unit; the calculation then holds. */
  weightUnit: "lbs" | "kg" | null;
  /** Calories per local day, only for days that have a calorie entry. */
  dailyCalories: Readonly<Record<string, number>>;
  /** Local days with any food logged (for the hold rule). Defaults to dailyCalories' days. */
  loggedDays?: readonly string[];
  loggingAnswer: LoggingAnswer | null;
  missed: boolean;
  pace: GoalPace | null;
  targets: readonly TargetLike[];
  rememberedCaloriesKey?: string | null;
};

export type CalcResult = {
  windowStart: string;
  today: string;
  weightUnit: "lbs" | "kg" | null;
  trendWeight: number | null;
  trendChange: number | null;
  trendDays: number | null;
  averageIntake: number | null;
  daysLogged: number;
  daysLoggedLastWeek: number;
  estimatedBurn: number | null;
  newCalories: number | null;
  /** The calculation came out lower than the floor, so the floor was used. */
  limitedByFloor: boolean;
  /** The calculated value before the floor, when the floor applied. */
  calculatedCalories: number | null;
  decision: "change" | "hold";
  holdReasons: HoldReason[];
  changes: TargetChange[];
};

export function calculateTargets(input: CalcInput): CalcResult {
  const windowStart = addDays(input.today, -(CALC_WINDOW_DAYS - 1));
  const series = trendSeries(input.weighIns);
  const inWindow = input.weighIns.filter((w) => w.date >= windowStart && w.date <= input.today);
  const end = trendAt(series, input.today);
  // Trend at the start of the window, or at the first weigh-in inside it.
  // The rate is measured between weigh-ins inside the window (matching the
  // intake window): from the trend on the window's first day, or else at the
  // first weigh-in inside it.
  const atStart = trendAt(series, windowStart);
  const start =
    atStart && atStart.date === windowStart
      ? atStart
      : series.find((p) => p.date >= windowStart && p.date <= input.today) ?? null;
  const trendDays = end && start ? daysBetween(start.date, end.date) : null;
  const trendChange = end && start && trendDays ? end.trend - start.trend : null;

  const intake = averageIntake(input.dailyCalories, windowStart, input.today);
  const lastWeekStart = addDays(input.today, -(HOLD_LOGGED_DAYS_WINDOW - 1));
  const loggedDays = input.loggedDays ?? Object.keys(input.dailyCalories);
  const lastWeek = { daysLogged: new Set(loggedDays.filter((d) => d >= lastWeekStart && d <= input.today)).size };

  const reasons = holdReasons({
    weighInsInWindow: inWindow,
    loggingAnswer: input.loggingAnswer,
    daysLoggedLastWeek: lastWeek.daysLogged,
    missed: input.missed,
  });

  const burn =
    intake.average !== null && trendChange !== null && trendDays && input.weightUnit
      ? estimateBurn(intake.average, trendChange, trendDays, input.weightUnit)
      : null;

  const base: CalcResult = {
    windowStart,
    today: input.today,
    weightUnit: input.weightUnit,
    trendWeight: end?.trend ?? null,
    trendChange,
    trendDays,
    averageIntake: intake.average,
    daysLogged: intake.daysLogged,
    daysLoggedLastWeek: lastWeek.daysLogged,
    estimatedBurn: burn,
    newCalories: null,
    limitedByFloor: false,
    calculatedCalories: null,
    decision: "hold",
    holdReasons: reasons,
    changes: [],
  };
  if (!input.pace) reasons.push("no_goal_pace");
  const roles = identifyMacroRoles(input.targets, input.rememberedCaloriesKey);
  if (!roles.calories) reasons.push("calories_unknown");
  if (reasons.length || burn === null || !end || !input.pace || !input.weightUnit) return base;

  const calculated = calorieTargetFor(burn, input.pace, end.trend, input.weightUnit);
  if (calculated <= 0) return { ...base, newCalories: calculated, holdReasons: ["target_not_positive"] };
  // Floor based on the current target: never more than a 10% cut in one check-in.
  const currentCalories = input.targets.find((t) => t.key === roles.calories)?.targetNumber;
  const floor =
    currentCalories && currentCalories > 0
      ? Math.ceil((currentCalories * (1 - MAX_CALORIE_DECREASE_FRACTION)) / CALORIE_ROUNDING) * CALORIE_ROUNDING
      : null;
  const limitedByFloor = floor !== null && calculated < floor;
  const newCalories = limitedByFloor ? floor! : calculated;
  Object.assign(base, { limitedByFloor, calculatedCalories: limitedByFloor ? calculated : null });
  // Same calories: nothing to change (rescaling would only add rounding noise).
  if (currentCalories === newCalories) return { ...base, newCalories };
  const changes = scaleMacros(input.targets, roles, newCalories);
  if (!changes) return { ...base, newCalories, holdReasons: ["macros_unknown"] };
  const real = changes.filter((c) => c.to !== c.from);
  if (!real.length) return { ...base, newCalories };
  return { ...base, newCalories, decision: "change", changes };
}

/** Plain-words summary of a result, using only the calculated numbers. */
export function describeResult(r: CalcResult): string {
  const u = r.weightUnit ?? "";
  const parts: string[] = [];
  if (r.trendWeight !== null) parts.push(`Trend weight ${r.trendWeight.toFixed(1)} ${u}`);
  if (r.trendChange !== null && r.trendDays) {
    const perWeek = (r.trendChange / r.trendDays) * 7;
    parts.push(`${perWeek >= 0 ? "+" : ""}${perWeek.toFixed(2)} ${u}/week`);
  }
  if (r.averageIntake !== null) parts.push(`average intake ${Math.round(r.averageIntake)} kcal over ${r.daysLogged} logged days`);
  if (r.estimatedBurn !== null) parts.push(`estimated burn ${Math.round(r.estimatedBurn)} kcal/day`);
  const facts = parts.join(", ");
  if (r.decision === "change") {
    const list = r.changes.map((c) => `${formatMacroLabel(c.key)} ${c.from} → ${c.to}${c.unit ? ` ${c.unit}` : ""}`).join(", ");
    const floorNote = r.limitedByFloor
      ? ` The calculation gave ${r.calculatedCalories} kcal; calories are cut by at most ${Math.round(MAX_CALORIE_DECREASE_FRACTION * 100)}% per check-in, so this is the limit.`
      : "";
    return `${facts}. Proposed: ${list}.${floorNote}`;
  }
  const why = r.holdReasons.length
    ? r.holdReasons.map((h) => HOLD_REASON_TEXT[h]).join(" ")
    : "The calculated targets match your current ones.";
  return `${facts ? `${facts}. ` : ""}Holding targets steady: ${why}`;
}
