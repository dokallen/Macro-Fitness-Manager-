import type { CalcResult } from "@/lib/coaching/calc";
import { MAINTAIN_TOLERANCE_PERCENT_PER_WEEK } from "@/lib/coaching/constants";
import type { GoalPace } from "@/lib/coaching/goal-pace";

/**
 * "Your own numbers" marker (Phase 2.9). Targets normally come from the
 * calculation. When the user chooses their own numbers (through the Coach,
 * with a reason), this preference records it, until calculated targets are
 * applied again. Uses the check_in_ prefix so it is never read as a target.
 */
export const OWN_TARGETS_KEY = "check_in_own_targets";

export type OwnTargets = { reason: string; setAt: string };

export function readOwnTargets(prefs: readonly { key: string; value: string | null }[]): OwnTargets | null {
  const raw = prefs.find((p) => p.key === OWN_TARGETS_KEY)?.value;
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<OwnTargets>;
    return typeof o.reason === "string" && typeof o.setAt === "string" ? { reason: o.reason, setAt: o.setAt } : null;
  } catch {
    return null;
  }
}

/**
 * At a check-in, are the user's own targets working? "on_track" when the
 * trend moves the way the goal pace asks (or stays steady for maintain);
 * "off_track" otherwise; "unknown" without enough data or a pace.
 */
export function ownTargetsProgress(r: CalcResult, pace: GoalPace | null): "on_track" | "off_track" | "unknown" {
  if (!pace || r.trendChange === null || !r.trendDays || r.trendWeight === null) return "unknown";
  const perWeek = (r.trendChange / r.trendDays) * 7;
  if (pace.direction === "loss") return perWeek < 0 ? "on_track" : "off_track";
  if (pace.direction === "gain") return perWeek > 0 ? "on_track" : "off_track";
  const tolerance = (MAINTAIN_TOLERANCE_PERCENT_PER_WEEK / 100) * r.trendWeight;
  return Math.abs(perWeek) <= tolerance ? "on_track" : "off_track";
}
