import { describe, expect, it } from "vitest";

import { homeWeight, weightMetricNames } from "@/lib/dashboard/home-weight";

const prefs = [
  { key: "body_metric_keys", value: JSON.stringify([{ name: "Weight", unit: "lbs" }, { name: "Waist", unit: "in" }]) },
  { key: "profile_goal_weight", value: "90" },
  { key: "profile_goal_weight_unit", value: "kg" },
];

describe("home weight", () => {
  it("finds the weight metrics", () => expect(weightMetricNames(prefs)).toEqual(["Weight"]));

  it("uses weigh-ins for current and start, and the profile goal in the same unit", () => {
    const w = homeWeight(
      prefs,
      [
        { metric_key: "Weight", value: 230, unit: "lbs", logged_at: "2026-11-01T12:00:00Z" },
        { metric_key: "Weight", value: 226.4, unit: "lbs", logged_at: "2026-11-20T12:00:00Z" },
      ],
      "UTC"
    );
    // 90 kg = 198.4 lbs; 226.4 − 198.4 = 28.
    expect(w).toMatchObject({ unit: "lbs", current: 226.4, start: 230, goal: 198.4, toGoal: 28 });
    expect(w.log).toHaveLength(2);
  });

  it("shows nothing it doesn't know", () => {
    expect(homeWeight([], [], "UTC")).toMatchObject({ unit: null, current: null, goal: null, toGoal: null });
  });
});
