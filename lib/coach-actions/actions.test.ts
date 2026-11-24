import { describe, expect, it } from "vitest";

import { logFood, logProgressEntry } from "@/lib/coach-actions/logging";
import { removeMacroTarget, setMacroTargets } from "@/lib/coach-actions/macro-targets";
import { COACH_ACTIONS, coachTools } from "@/lib/coach-actions/registry";
import { setPreference } from "@/lib/coach-actions/set-preference";
import { updateProfile } from "@/lib/coach-actions/update-profile";
import { CoachActionError, type CoachActionContext, type CoachActionDef } from "@/lib/coach-actions/types";
import { extractMacroTargets } from "@/lib/dashboard/preferences";
import { createFakeSupabase, type FakeSupabase } from "@/lib/test-utils/fake-supabase";

const NOW = new Date("2026-11-24T15:00:00.000Z");
const PREFS = [
  { user_id: "user-1", key: "Protein", value: "150 g" },
  { user_id: "user-1", key: "calories", value: "2000 kcal" },
  { user_id: "user-1", key: "goal", value: "Lose fat" },
  { user_id: "user-1", key: "body_metric_keys", value: JSON.stringify([{ name: "Weight", unit: "lbs", better: "lower" }]) },
  { user_id: "user-1", key: "progress_metric_keys", value: JSON.stringify(["Waist"]) },
  { user_id: "user-1", key: "notification_timezone", value: "America/New_York" },
  { user_id: "user-2", key: "protein", value: "999 g" },
];

function setup(prefs = PREFS): { fake: FakeSupabase; ctx: CoachActionContext } {
  const fake = createFakeSupabase({ user_preferences: prefs, food_logs: [], food_log_macros: [], progress_entries: [] });
  return { fake, ctx: { supabase: fake.client as CoachActionContext["supabase"], userId: "user-1", now: NOW } };
}

async function run<S>(def: CoachActionDef, ctx: CoachActionContext, input: S) {
  const parsed = def.schema.parse(input);
  return def.execute(ctx, parsed);
}

const userPrefs = (fake: FakeSupabase) =>
  fake.tables.user_preferences!.filter((r) => r.user_id === "user-1");

describe("set_macro_targets", () => {
  it("writes targets in onboarding's format and keeps the user's spelling", async () => {
    const { fake, ctx } = setup();
    await run(setMacroTargets as unknown as CoachActionDef, ctx, {
      targets: [
        { key: "protein", value: 180, unit: "g" },
        { key: "fat", value: 60, unit: "g" },
      ],
    });
    const rows = userPrefs(fake);
    expect(rows.find((r) => r.key === "Protein")).toMatchObject({ value: "180 g", updated_by: "coach" });
    expect(rows.find((r) => r.key === "protein")).toBeUndefined();
    expect(rows.find((r) => r.key === "fat")).toMatchObject({ value: "60 g", updated_by: "coach" });
    // The app reads the written values back as the intended numbers.
    const targets = extractMacroTargets(rows as { key: string; value: string }[]);
    expect(targets.find((t) => t.key === "Protein")?.targetNumber).toBe(180);
    expect(targets.find((t) => t.key === "fat")?.targetNumber).toBe(60);
    // Another user's data is untouched.
    expect(fake.tables.user_preferences!.find((r) => r.user_id === "user-2")!.value).toBe("999 g");
  });

  it("rejects reserved keys, non-positive values and duplicates", () => {
    const bad = [
      { targets: [{ key: "notification_last_sent_x", value: 5 }] },
      { targets: [{ key: "push_subscription", value: 5 }] },
      { targets: [{ key: "protein", value: 0 }] },
      { targets: [{ key: "protein", value: 1 }, { key: "Protein", value: 2 }] },
      { targets: [] },
    ];
    for (const b of bad) expect(setMacroTargets.schema.safeParse(b).success, JSON.stringify(b)).toBe(false);
  });
});

describe("remove_macro_target", () => {
  it("deletes only that target, matched without case", async () => {
    const { fake, ctx } = setup();
    await run(removeMacroTarget as unknown as CoachActionDef, ctx, { key: "protein" });
    expect(userPrefs(fake).map((r) => r.key)).not.toContain("Protein");
    expect(userPrefs(fake).map((r) => r.key)).toContain("calories");
    expect(fake.tables.user_preferences!.some((r) => r.user_id === "user-2")).toBe(true);
  });

  it("refuses a key that is not a current target", async () => {
    const { ctx } = setup();
    await expect(run(removeMacroTarget as unknown as CoachActionDef, ctx, { key: "fiber" })).rejects.toThrow(CoachActionError);
    // "goal" is a setting, not a target, and is rejected before running.
    expect(removeMacroTarget.schema.safeParse({ key: "goal" }).success).toBe(false);
  });
});

describe("set_preference", () => {
  it("stores values the way the app's screens do", async () => {
    const { fake, ctx } = setup();
    await run(setPreference as unknown as CoachActionDef, ctx, { key: "meal_plan_rotation_day", value: "monday" });
    await run(setPreference as unknown as CoachActionDef, ctx, { key: "notification_morning_time", value: "7:05" });
    await run(setPreference as unknown as CoachActionDef, ctx, { key: "notification_streaks", value: false });
    const get = (k: string) => userPrefs(fake).find((r) => r.key === k);
    expect(get("meal_plan_rotation_day")).toMatchObject({ value: "Monday", updated_by: "coach" });
    expect(get("notification_morning_time")).toMatchObject({ value: "07:05" });
    expect(get("notification_streaks")).toMatchObject({ value: "false" });
  });

  it("clears the rotation day like the Not set option", async () => {
    const { fake, ctx } = setup();
    await run(setPreference as unknown as CoachActionDef, ctx, { key: "meal_plan_rotation_day", value: "" });
    expect(userPrefs(fake).find((r) => r.key === "meal_plan_rotation_day")).toMatchObject({ value: "" });
    expect(setPreference.summarize({ key: "meal_plan_rotation_day", value: "" })).toBe("Clear the meal plan rotation day");
  });

  it("refuses reminder times until the app knows the user's time zone", async () => {
    const { fake, ctx } = setup(PREFS.filter((p) => p.key !== "notification_timezone"));
    await expect(
      run(setPreference as unknown as CoachActionDef, ctx, { key: "notification_evening_time", value: "20:00" })
    ).rejects.toThrow("Settings");
    expect(userPrefs(fake).find((r) => r.key === "notification_evening_time")).toBeUndefined();
  });

  it("sets the weigh-in and check-in schedule", async () => {
    const { fake, ctx } = setup();
    await run(setPreference as unknown as CoachActionDef, ctx, { key: "weigh_in_frequency", value: "Weekly" });
    await run(setPreference as unknown as CoachActionDef, ctx, { key: "check_in_day", value: "monday" });
    await run(setPreference as unknown as CoachActionDef, ctx, { key: "check_in_reminder", value: true });
    const get = (k: string) => userPrefs(fake).find((r) => r.key === k)?.value;
    expect([get("weigh_in_frequency"), get("check_in_day"), get("check_in_reminder")]).toEqual(["weekly", "Monday", "true"]);
    expect(setPreference.schema.safeParse({ key: "weigh_in_frequency", value: "monthly" }).success).toBe(false);
  });

  it("lists the allowed keys in the schema Claude sees", () => {
    const tool = coachTools().find((t) => t.name === "set_preference")!;
    const keyProp = (tool.input_schema.properties as Record<string, { enum?: string[] }>).key;
    expect(keyProp.enum).toContain("goal");
    expect(keyProp.enum).not.toContain("push_subscription");
  });

  it("never allows protected keys or malformed values", () => {
    for (const key of [
      "push_subscription",
      "notification_timezone",
      "notification_last_sent_morning_motivation",
      "body_metric_keys",
      "progress_metric_keys",
      "meal_plan_needs_rotation",
      "protein",
    ]) {
      expect(setPreference.schema.safeParse({ key, value: "x" }).success, key).toBe(false);
    }
    expect(setPreference.schema.safeParse({ key: "notification_morning_time", value: "25:00" }).success).toBe(false);
    expect(setPreference.schema.safeParse({ key: "meal_plan_rotation_day", value: "Funday" }).success).toBe(false);
    expect(setPreference.schema.safeParse({ key: "notification_streaks", value: "yes" }).success).toBe(false);
  });

  it("summarizes in plain words", () => {
    expect(setPreference.summarize({ key: "notification_streaks", value: true })).toBe("Turn on the streak notifications");
    expect(setPreference.summarize({ key: "meal_plan_rotation_day", value: "friday" })).toBe("Set meal plan rotation day to Friday");
  });
});

describe("log_food", () => {
  it("logs the food with macros for the user's own targets only", async () => {
    const { fake, ctx } = setup();
    const res = await run(logFood as unknown as CoachActionDef, ctx, {
      food_name: "Greek yogurt",
      quantity: 1,
      unit: "cup",
      macros: { protein: 23, Calories: 130, sugar: 9 },
    });
    expect(fake.tables.food_logs).toEqual([
      expect.objectContaining({ user_id: "user-1", food_name: "Greek yogurt", meal_number: 1, quantity: 1, unit: "cup" }),
    ]);
    const logId = fake.tables.food_logs![0]!.id;
    expect(fake.tables.food_log_macros).toEqual([
      expect.objectContaining({ food_log_id: logId, key: "Protein", value: 23 }),
      expect.objectContaining({ food_log_id: logId, key: "calories", value: 130 }),
    ]);
    expect(res.message).toContain("Skipped Sugar");
  });

  it("removes the food entry if its macros could not be saved", async () => {
    const { fake, ctx } = setup();
    fake.failNextWrite("food_log_macros", "boom");
    await expect(
      run(logFood as unknown as CoachActionDef, ctx, { food_name: "Toast", macros: { protein: 4 } })
    ).rejects.toThrow("boom");
    expect(fake.tables.food_logs).toEqual([]);
  });

  it("saves no unit without a quantity, like quick-log", async () => {
    const { fake, ctx } = setup();
    await run(logFood as unknown as CoachActionDef, ctx, { food_name: "Apple", unit: "cup" });
    expect(fake.tables.food_logs![0]).toMatchObject({ quantity: null, unit: "" });
  });

  it("tells the user on the card that only tracked macros are saved", () => {
    expect(logFood.summarize({ food_name: "Egg", macros: { protein: 6 } })).toContain("only your tracked macros are saved");
  });

  it("rejects empty names and negative macros", () => {
    expect(logFood.schema.safeParse({ food_name: " ", macros: {} }).success).toBe(false);
    expect(logFood.schema.safeParse({ food_name: "Egg", macros: { protein: -1 } }).success).toBe(false);
    expect(logFood.schema.safeParse({ food_name: "Egg", meal_number: 0 }).success).toBe(false);
  });
});

describe("log_progress_entry", () => {
  it("logs a tracked metric with its canonical name and unit", async () => {
    const { fake, ctx } = setup();
    await run(logProgressEntry as unknown as CoachActionDef, ctx, { metric_key: "weight", value: 228.4 });
    expect(fake.tables.progress_entries).toEqual([
      expect.objectContaining({
        user_id: "user-1",
        metric_key: "Weight",
        value: 228.4,
        unit: "lbs",
        logged_at: NOW.toISOString(),
      }),
    ]);
  });

  it("accepts metrics from the Progress page list too", async () => {
    const { fake, ctx } = setup();
    await run(logProgressEntry as unknown as CoachActionDef, ctx, { metric_key: "Waist", value: 36, unit: "in" });
    expect(fake.tables.progress_entries![0]).toMatchObject({ metric_key: "Waist", unit: "in" });
  });

  it("refuses untracked metrics, a different unit, and future dates", async () => {
    const { fake, ctx } = setup();
    const go = (input: object) => run(logProgressEntry as unknown as CoachActionDef, ctx, input);
    await expect(go({ metric_key: "Biceps", value: 15 })).rejects.toThrow("not a metric you track");
    await expect(go({ metric_key: "Weight", value: 103, unit: "kg" })).rejects.toThrow("tracked in lbs");
    // NOW is 10:00 on 2026-11-24 in New York.
    await expect(go({ metric_key: "Weight", value: 228, date: "2026-11-25" })).rejects.toThrow("future");
    expect(fake.tables.progress_entries).toEqual([]);
  });

  it("stores an earlier day at local noon, like the app's forms", async () => {
    const { fake, ctx } = setup();
    await run(logProgressEntry as unknown as CoachActionDef, ctx, { metric_key: "Weight", value: 229, date: "2026-11-23" });
    // Noon in New York (UTC-5 in November).
    expect(fake.tables.progress_entries![0]).toMatchObject({ logged_at: "2026-11-23T17:00:00.000Z" });
  });

  it("logs today's date as right now", async () => {
    const { fake, ctx } = setup();
    await run(logProgressEntry as unknown as CoachActionDef, ctx, { metric_key: "Weight", value: 229, date: "2026-11-24" });
    expect(fake.tables.progress_entries![0]).toMatchObject({ logged_at: NOW.toISOString() });
  });
});

describe("update_profile", () => {
  const withProfile = [
    ...PREFS,
    { user_id: "user-1", key: "profile_birth_year", value: "1990" },
    { user_id: "user-1", key: "profile_height", value: "6'0\"" },
  ];

  it("writes only the fields it changes, labelled as the Coach", async () => {
    const { fake, ctx } = setup(withProfile);
    await run(updateProfile as unknown as CoachActionDef, ctx, { birth_month: 3, goal_weight: 195, goal_weight_unit: "lbs" });
    const get = (k: string) => userPrefs(fake).find((r) => r.key === k);
    expect(get("profile_birth_month")).toMatchObject({ value: "3", updated_by: "coach" });
    expect(get("profile_goal_weight")).toMatchObject({ value: "195" });
    expect(get("profile_birth_year")!.value).toBe("1990");
    expect(get("profile_height")!.updated_by).toBeUndefined(); // untouched
  });

  it("clears a field with null", async () => {
    const { fake, ctx } = setup(withProfile);
    await run(updateProfile as unknown as CoachActionDef, ctx, { height: null });
    expect(userPrefs(fake).find((r) => r.key === "profile_height")).toBeUndefined();
  });

  it("refuses a date of birth that is incomplete once merged", async () => {
    const { fake, ctx } = setup(PREFS);
    await expect(
      run(updateProfile as unknown as CoachActionDef, ctx, { birth_month: 3 })
    ).rejects.toThrow("year");
    expect(userPrefs(fake).some((r) => String(r.key).startsWith("profile_"))).toBe(false);
  });

  it("keeps goal weight with its unit", async () => {
    const { ctx } = setup(withProfile);
    await expect(
      run(updateProfile as unknown as CoachActionDef, ctx, { goal_weight: 195 })
    ).rejects.toThrow("unit");
  });

  it("rejects bad values and empty proposals before running", () => {
    expect(updateProfile.schema.safeParse({}).success).toBe(false);
    expect(updateProfile.schema.safeParse({ biological_sex: "robot" }).success).toBe(false);
    expect(updateProfile.schema.safeParse({ birth_month: 13 }).success).toBe(false);
    expect(updateProfile.schema.safeParse({ goal_weight: -1 }).success).toBe(false);
  });

  it("sets the goal pace, validated", async () => {
    const { fake, ctx } = setup(withProfile);
    await run(updateProfile as unknown as CoachActionDef, ctx, { goal_pace_direction: "loss", goal_pace_percent: 0.75 });
    const get = (k: string) => userPrefs(fake).find((r) => r.key === k)?.value;
    expect([get("profile_goal_pace_direction"), get("profile_goal_pace_percent")]).toEqual(["loss", "0.75"]);
    await run(updateProfile as unknown as CoachActionDef, ctx, { goal_pace_direction: "maintain" });
    expect(get("profile_goal_pace_percent")).toBeUndefined();
    await expect(
      run(updateProfile as unknown as CoachActionDef, ctx, { goal_pace_direction: "loss", goal_pace_percent: 3 })
    ).rejects.toThrow("1.5");
  });

  it("summarizes the change", () => {
    expect(updateProfile.summarize({ birth_year: 1990, height: null })).toBe("Update profile: birth year 1990, clear height");
  });
});

describe("registry", () => {
  it("offers every action to Claude with a valid object schema", () => {
    expect(Object.keys(COACH_ACTIONS).sort()).toEqual(
      ["log_food", "log_progress_entry", "remove_macro_target", "set_macro_targets", "set_preference", "update_profile"].sort()
    );
    for (const t of coachTools()) expect(t.input_schema.type).toBe("object");
  });
});
