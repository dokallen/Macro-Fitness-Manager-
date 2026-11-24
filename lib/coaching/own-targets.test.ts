import { describe, expect, it } from "vitest";

import type { CalcResult } from "@/lib/coaching/calc";
import { ownTargetsProgress, readOwnTargets } from "@/lib/coaching/own-targets";

const r = (trendChange: number | null, trendDays = 14, trendWeight = 200) => ({ trendChange, trendDays, trendWeight }) as CalcResult;

describe("own targets", () => {
  it("reads the marker", () => {
    expect(readOwnTargets([{ key: "check_in_own_targets", value: '{"reason":"New job","setAt":"2026-11-20T00:00:00Z"}' }])).toEqual({
      reason: "New job",
      setAt: "2026-11-20T00:00:00Z",
    });
    expect(readOwnTargets([{ key: "check_in_own_targets", value: "junk" }])).toBeNull();
    expect(readOwnTargets([])).toBeNull();
  });

  it("is on track when the trend moves the way the goal asks", () => {
    expect(ownTargetsProgress(r(-1), { direction: "loss", percentPerWeek: 0.5 })).toBe("on_track");
    expect(ownTargetsProgress(r(0.2), { direction: "loss", percentPerWeek: 0.5 })).toBe("off_track");
    expect(ownTargetsProgress(r(0.5), { direction: "gain", percentPerWeek: 0.25 })).toBe("on_track");
    expect(ownTargetsProgress(r(-0.1), { direction: "gain", percentPerWeek: 0.25 })).toBe("off_track");
  });

  it("maintain: within 0.25% of body weight per week", () => {
    // 200 lb → 0.5 lb/week tolerance. 0.9 lb over 14 days = 0.45 lb/week.
    expect(ownTargetsProgress(r(0.9), { direction: "maintain" })).toBe("on_track");
    expect(ownTargetsProgress(r(1.2), { direction: "maintain" })).toBe("off_track");
  });

  it("unknown without data or a pace", () => {
    expect(ownTargetsProgress(r(null), { direction: "maintain" })).toBe("unknown");
    expect(ownTargetsProgress(r(-1), null)).toBe("unknown");
  });
});
