import { describe, expect, it } from "vitest";

import {
  extractMacroTargets,
  formatMacroLabel,
  isNonMacroPreferenceKey,
  NON_MACRO_PREFERENCE_KEYS,
  parseLeadingNumber,
} from "@/lib/dashboard/preferences";

describe("parseLeadingNumber", () => {
  it("reads the leading number from values with or without units", () => {
    expect(parseLeadingNumber("2200 kcal")).toBe(2200);
    expect(parseLeadingNumber("12.5 g")).toBe(12.5);
    expect(parseLeadingNumber("165")).toBe(165);
  });

  it("ignores surrounding whitespace", () => {
    expect(parseLeadingNumber("  180 g  ")).toBe(180);
  });

  it("returns null when the value does not start with a number", () => {
    expect(parseLeadingNumber("")).toBeNull();
    expect(parseLeadingNumber("about 200 g")).toBeNull();
    expect(parseLeadingNumber("-20 g")).toBeNull();
  });

  it("returns null for malformed numbers instead of NaN", () => {
    expect(parseLeadingNumber("1.2.3 g")).toBeNull();
    expect(parseLeadingNumber(". g")).toBeNull();
  });
});

describe("extractMacroTargets", () => {
  it("returns every numeric user-defined target with its raw display value", () => {
    expect(
      extractMacroTargets([
        { key: "calories", value: "2200 kcal" },
        { key: "protein", value: "180 g" },
        { key: "sodium_mg", value: "2300" },
      ])
    ).toEqual([
      { key: "calories", displayValue: "2200 kcal", targetNumber: 2200 },
      { key: "protein", displayValue: "180 g", targetNumber: 180 },
      { key: "sodium_mg", displayValue: "2300", targetNumber: 2300 },
    ]);
  });

  it("skips non-macro preference keys even when their values start with a number", () => {
    expect(
      extractMacroTargets([
        { key: "program_start", value: "2026-01-05" },
        { key: "water_goal_oz", value: "100" },
        { key: "meal_plan_rotation_day", value: "0" },
        { key: "fiber", value: "30 g" },
      ])
    ).toEqual([{ key: "fiber", displayValue: "30 g", targetNumber: 30 }]);
  });

  it("never treats any NON_MACRO_PREFERENCE_KEYS entry as a macro target", () => {
    const rows = Array.from(NON_MACRO_PREFERENCE_KEYS, (key) => ({
      key,
      value: "1",
    }));
    expect(extractMacroTargets(rows)).toEqual([]);
  });

  it("skips blank keys and values without a leading number", () => {
    expect(
      extractMacroTargets([
        { key: "   ", value: "50 g" },
        { key: "carbs", value: "as needed" },
      ])
    ).toEqual([]);
  });

  it("trims keys and display values", () => {
    expect(extractMacroTargets([{ key: "  fat  ", value: "  70 g " }])).toEqual(
      [{ key: "fat", displayValue: "70 g", targetNumber: 70 }]
    );
  });
});

describe("formatMacroLabel", () => {
  it("turns snake_case keys into title-cased labels", () => {
    expect(formatMacroLabel("protein")).toBe("Protein");
    expect(formatMacroLabel("net_carbs")).toBe("Net Carbs");
    expect(formatMacroLabel("sodium_mg")).toBe("Sodium Mg");
  });
});

// Every user_preferences key the app writes that is not a macro target, found by
// grepping the user_preferences writes in app/, components/ and lib/ (Phase 1.2).
// Macro targets themselves are the free-form keys the user defines in onboarding.
const APP_WRITTEN_NON_MACRO_KEYS: Record<string, string> = {
  // components/onboarding/OnboardingWizard.tsx
  goal: "Lose fat while keeping strength",
  recommended_goal_timeframe: "12 weeks",
  recommended_workout_frequency: "4 days per week",
  weekly_plan_suggestion: "3 strength days and 2 cardio days",
  progress_metric_keys: '["Weight","Waist"]',
  // components/meals/MealsClient.tsx
  meal_plan_favorites: '["oatmeal"]',
  meal_plan_dislikes: '["tuna"]',
  meal_plan_rotation_day: "sunday",
  // components/meals/MealsClient.tsx and app/api/meal-plan-rotate/route.ts
  meal_plan_needs_rotation: "true",
  // components/settings/SettingsClient.tsx and app/api/push-subscribe/route.ts
  push_subscription: '{"endpoint":"https://push.example/abc"}',
  notification_timezone: "America/New_York",
  notification_morning_time: "07:00",
  notification_morning_enabled: "true",
  notification_workout_reminder: "true",
  notification_midday_time: "12:00",
  notification_midday_enabled: "false",
  notification_evening_time: "20:00",
  notification_evening_enabled: "true",
  notification_streaks: "true",
  notification_meal_rotation: "true",
  // components/progress/BodyCompositionClient.tsx and MetricSetupClient.tsx
  body_weighin_notes: "2026-11-22: felt good",
  body_metric_keys: '[{"name":"Weight","unit":"lbs"}]',
  // app/api/push-notify/route.ts, one per notification type in vercel.json
  notification_last_sent_morning_motivation: "2026-11-22",
  notification_last_sent_workout_reminder: "2026-11-22",
  notification_last_sent_midday_checkin: "2026-11-22",
  notification_last_sent_evening_recap: "2026-11-22",
  notification_last_sent_streak_celebration: "2026-11-22",
  notification_last_sent_meal_plan_rotation: "2026-11-22",
  // Phase 2.5 saved profile (components/onboarding, components/settings/ProfileSection.tsx)
  profile_birth_year: "1990",
  profile_birth_month: "3",
  profile_birth_day: "14",
  profile_height: "6'0\"",
  profile_biological_sex: "male",
  profile_activity_level: "very active",
  profile_goal_weight: "200",
  profile_goal_weight_unit: "lbs",
  // Phase 2.6 schedule and check-in records use these prefixes
  profile_goal_pace_direction: "loss",
  profile_goal_pace_percent: "0.5",
  weigh_in_frequency: "weekly",
  weigh_in_snoozed_date: "2026-11-23",
  check_in_day: "Monday",
  check_in_reminder: "true",
  check_in_calories_key: "calories",
  notification_last_sent_check_in_reminder: "2026-11-23",
  check_in_2026_11_23: '{"weight":228}',
};

describe("non-macro preference keys (Phase 1.2)", () => {
  it("does not read a push-notify date as a macro target of 2026", () => {
    expect(
      extractMacroTargets([
        { key: "notification_last_sent_morning_motivation", value: "2026-11-22" },
      ])
    ).toEqual([]);
  });

  it("recognises every non-macro key the app writes", () => {
    for (const key of Object.keys(APP_WRITTEN_NON_MACRO_KEYS)) {
      expect(isNonMacroPreferenceKey(key), key).toBe(true);
    }
  });

  it("returns only the user's macro targets from a full set of saved preferences", () => {
    const rows = [
      ...Object.entries(APP_WRITTEN_NON_MACRO_KEYS).map(([key, value]) => ({
        key,
        value,
      })),
      { key: "calories", value: "2200 kcal" },
      { key: "protein", value: "180 g" },
    ];
    expect(extractMacroTargets(rows).map((r) => r.key)).toEqual([
      "calories",
      "protein",
    ]);
  });

  it("only excludes the notification_last_sent_ prefix, not lookalike macro keys", () => {
    expect(isNonMacroPreferenceKey("notification_last_sent_")).toBe(true);
    expect(isNonMacroPreferenceKey("notification_last")).toBe(false);
    expect(isNonMacroPreferenceKey("protein")).toBe(false);
    expect(isNonMacroPreferenceKey("sent_protein")).toBe(false);
  });
});
