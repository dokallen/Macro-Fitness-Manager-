import { GOAL_PACE_MAX } from "@/lib/coaching/constants";

/**
 * Goal pace (profile, Phase 2.6): percent of body weight per week to lose or
 * gain, or maintain. Stored as two profile_ preferences. No default.
 */
export const GOAL_PACE_KEYS = {
  direction: "profile_goal_pace_direction",
  percent: "profile_goal_pace_percent",
} as const;

export type GoalPace =
  | { direction: "maintain" }
  | { direction: "loss" | "gain"; percentPerWeek: number };

export function goalPaceError(pace: GoalPace): string | null {
  if (pace.direction === "maintain") return null;
  const max = GOAL_PACE_MAX[pace.direction];
  if (!Number.isFinite(pace.percentPerWeek) || pace.percentPerWeek <= 0) return "Enter a pace above 0%.";
  if (pace.percentPerWeek > max) return `Keep the pace at or below ${max}% per week.`;
  return null;
}

export function readGoalPace(prefs: readonly { key: string; value: string | null }[]): GoalPace | null {
  const get = (k: string) => prefs.find((p) => p.key === k)?.value?.trim().toLowerCase() ?? "";
  const dir = get(GOAL_PACE_KEYS.direction);
  if (dir === "maintain") return { direction: "maintain" };
  if (dir !== "loss" && dir !== "gain") return null;
  const pace: GoalPace = { direction: dir, percentPerWeek: Number(get(GOAL_PACE_KEYS.percent)) };
  return goalPaceError(pace) ? null : pace;
}

export function goalPaceWrites(pace: GoalPace | null): { upserts: { key: string; value: string }[]; deletes: string[] } {
  if (!pace) return { upserts: [], deletes: [GOAL_PACE_KEYS.direction, GOAL_PACE_KEYS.percent] };
  if (pace.direction === "maintain") {
    return { upserts: [{ key: GOAL_PACE_KEYS.direction, value: "maintain" }], deletes: [GOAL_PACE_KEYS.percent] };
  }
  return {
    upserts: [
      { key: GOAL_PACE_KEYS.direction, value: pace.direction },
      { key: GOAL_PACE_KEYS.percent, value: String(pace.percentPerWeek) },
    ],
    deletes: [],
  };
}

export function describeGoalPace(pace: GoalPace | null): string {
  if (!pace) return "not set";
  if (pace.direction === "maintain") return "maintain weight";
  return `${pace.direction === "loss" ? "lose" : "gain"} ${pace.percentPerWeek}% of body weight per week`;
}
