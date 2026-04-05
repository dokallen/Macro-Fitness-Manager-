/** Keys stored in user_preferences that are not macro targets from onboarding. */
export const NON_MACRO_PREFERENCE_KEYS = new Set([
  "goal",
  "recommended_goal_timeframe",
  "recommended_workout_frequency",
  "weekly_plan_suggestion",
  "progress_metric_keys",
  "body_metric_keys",
  "body_weighin_notes",
  "chosen_coach_id",
  "program_start",
  "mf_coach_rules",
  "water_goal_oz",
]);

export type MacroTargetRow = {
  key: string;
  /** Raw value from DB, e.g. "2200 kcal" */
  displayValue: string;
  /** Numeric target for progress (first number in displayValue). */
  targetNumber: number;
};

/**
 * First numeric token in a preference value (handles "2200 kcal", "165", "12.5 g").
 */
export function parseLeadingNumber(value: string): number | null {
  const m = value.trim().match(/^([\d.]+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function extractMacroTargets(
  rows: { key: string; value: string }[]
): MacroTargetRow[] {
  const out: MacroTargetRow[] = [];
  for (const row of rows) {
    const k = row.key.trim();
    if (!k || NON_MACRO_PREFERENCE_KEYS.has(k)) continue;
    const n = parseLeadingNumber(row.value);
    if (n === null) continue;
    out.push({
      key: k,
      displayValue: row.value.trim(),
      targetNumber: n,
    });
  }
  return out;
}

export function formatMacroLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
