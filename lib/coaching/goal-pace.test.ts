import { describe, expect, it } from "vitest";

import { describeGoalPace, goalPaceError, goalPaceWrites, readGoalPace } from "@/lib/coaching/goal-pace";
import { checkInSettingsWrites, onlyChanged } from "@/lib/coaching/settings";

describe("goal pace", () => {
  it("has no default", () => expect(readGoalPace([])).toBeNull());
  it("round-trips loss, gain and maintain", () => {
    for (const pace of [{ direction: "loss" as const, percentPerWeek: 0.5 }, { direction: "gain" as const, percentPerWeek: 0.25 }, { direction: "maintain" as const }]) {
      expect(readGoalPace(goalPaceWrites(pace).upserts)).toEqual(pace);
    }
  });
  it("enforces the limits", () => {
    expect(goalPaceError({ direction: "loss", percentPerWeek: 1.6 })).toMatch(/1.5/);
    expect(goalPaceError({ direction: "gain", percentPerWeek: 1.1 })).toMatch(/1/);
    expect(goalPaceError({ direction: "loss", percentPerWeek: 0 })).toBeTruthy();
    expect(readGoalPace([{ key: "profile_goal_pace_direction", value: "loss" }])).toBeNull();
  });
  it("describes itself", () => {
    expect(describeGoalPace({ direction: "loss", percentPerWeek: 0.5 })).toBe("lose 0.5% of body weight per week");
    expect(describeGoalPace(null)).toBe("not set");
  });
});

describe("check-in settings writes", () => {
  it("saves what is set and clears what is not", () => {
    expect(checkInSettingsWrites({ frequency: "weekly", day: "", reminder: false, direction: "", percent: "" })).toEqual({
      upserts: [
        { key: "weigh_in_frequency", value: "weekly" },
        { key: "check_in_reminder", value: "false" },
      ],
      deletes: ["check_in_day", "profile_goal_pace_direction", "profile_goal_pace_percent"],
      error: null,
    });
  });
  it("rejects an invalid pace", () => {
    expect(checkInSettingsWrites({ frequency: "", day: "", reminder: false, direction: "loss", percent: "5" }).error).toBeTruthy();
  });
});

describe("onlyChanged", () => {
  it("drops writes that match what is stored, and deletes of keys that aren't there", () => {
    const stored = new Map([["weigh_in_frequency", "weekly"], ["check_in_day", "Monday"]]);
    expect(
      onlyChanged(
        { upserts: [{ key: "weigh_in_frequency", value: "weekly" }, { key: "check_in_reminder", value: "true" }], deletes: ["check_in_day", "profile_goal_pace_percent"] },
        stored
      )
    ).toEqual({ upserts: [{ key: "check_in_reminder", value: "true" }], deletes: ["check_in_day"] });
  });
});
