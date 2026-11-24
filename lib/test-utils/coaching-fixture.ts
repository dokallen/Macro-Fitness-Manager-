import { addDays } from "@/lib/coaching/ymd";

/** A user with a check-in schedule, goal pace, targets, weigh-ins and food logs (tests only). */
export const FIXTURE_TODAY = "2026-11-23"; // a Monday
export const FIXTURE_NOW = new Date("2026-11-23T17:00:00.000Z"); // noon in New York
export const FIXTURE_TZ = "America/New_York";

const noon = (ymd: string) => `${ymd}T17:00:00.000Z`;

export function coachingFixture(overrides: { prefs?: { key: string; value: string }[] } = {}) {
  const prefs = (
    overrides.prefs ?? [
      { key: "notification_timezone", value: FIXTURE_TZ },
      { key: "check_in_day", value: "Monday" },
      { key: "weigh_in_frequency", value: "weekly" },
      { key: "profile_goal_pace_direction", value: "loss" },
      { key: "profile_goal_pace_percent", value: "1" },
      { key: "profile_birth_year", value: "1990" },
      { key: "profile_birth_month", value: "3" },
      { key: "profile_birth_day", value: "14" },
      { key: "body_metric_keys", value: JSON.stringify([{ name: "Weight", unit: "lbs", better: "lower" }]) },
      { key: "progress_metric_keys", value: JSON.stringify(["Waist"]) },
      { key: "calories", value: "2200 kcal" },
      { key: "protein", value: "180 g" },
      { key: "carbs", value: "200 g" },
      { key: "fat", value: "60 g" },
    ]
  ).map((p) => ({ user_id: "user-1", ...p }));
  const weighIns = Array.from({ length: 11 }, (_, i) => ({
    id: `w${i}`,
    user_id: "user-1",
    metric_key: "Weight",
    value: 203 - (i * 2) / 7,
    unit: "lbs",
    logged_at: noon(addDays(FIXTURE_TODAY, -20 + i * 2)),
  }));
  const waist = Array.from({ length: 10 }, (_, i) => ({
    id: `x${i}`,
    user_id: "user-1",
    metric_key: "Waist",
    value: 40 - i * 0.1,
    unit: "in",
    logged_at: noon(addDays(FIXTURE_TODAY, -9 + i)),
  }));
  const food_logs = Array.from({ length: 14 }, (_, i) => ({ id: `f${i}`, user_id: "user-1", logged_at: noon(addDays(FIXTURE_TODAY, -i)) }));
  return {
    user_preferences: prefs,
    progress_entries: [...weighIns, ...waist],
    food_logs,
    food_log_macros: food_logs.map((f) => ({ food_log_id: f.id, key: "calories", value: 2400 })),
  };
}
