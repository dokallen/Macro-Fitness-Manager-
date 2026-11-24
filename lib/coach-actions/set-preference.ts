import { z } from "zod";

import { WEIGH_IN_FREQUENCIES } from "@/lib/coaching/schedule";
import { extractMacroTargets } from "@/lib/dashboard/preferences";
import { CoachActionError, type CoachActionDef } from "@/lib/coach-actions/types";

/**
 * The only settings the Coach may change, and the value each one accepts.
 * Values are stored exactly as the app's own screens store them:
 * - text: the goal (OnboardingWizard)
 * - weekday: "Sunday".."Saturday" (MealPlanRotationClient)
 * - time: "HH:MM", 24-hour (Settings time inputs)
 * - boolean: "true" / "false" (Settings toggles)
 * Never allowed: push_subscription, notification_last_sent_*, notification_timezone,
 * body_metric_keys, progress_metric_keys, meal_plan_needs_rotation, macro targets.
 */
type Kind = "text" | "weekday" | "time" | "boolean" | "frequency";

export const COACH_SETTABLE_PREFERENCES: Record<string, { label: string; kind: Kind }> = {
  goal: { label: "goal", kind: "text" },
  meal_plan_rotation_day: { label: "meal plan rotation day", kind: "weekday" },
  notification_morning_enabled: { label: "morning reminder", kind: "boolean" },
  notification_morning_time: { label: "morning reminder time", kind: "time" },
  notification_workout_reminder: { label: "workout reminder", kind: "boolean" },
  notification_midday_enabled: { label: "midday check-in reminder", kind: "boolean" },
  notification_midday_time: { label: "midday check-in time", kind: "time" },
  notification_evening_enabled: { label: "evening recap reminder", kind: "boolean" },
  notification_evening_time: { label: "evening recap time", kind: "time" },
  notification_streaks: { label: "streak notifications", kind: "boolean" },
  notification_meal_rotation: { label: "meal plan rotation reminder", kind: "boolean" },
  weigh_in_frequency: { label: "weigh-in frequency", kind: "frequency" },
  check_in_day: { label: "check-in day", kind: "weekday" },
  check_in_reminder: { label: "check-in push reminder", kind: "boolean" },
  check_in_calories_key: { label: "target used as calories in check-ins", kind: "text" },
};

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Returns the stored form of a value, or an error message. */
export function normalizePreferenceValue(
  key: string,
  value: string | boolean
): { value: string } | { error: string } {
  const rule = COACH_SETTABLE_PREFERENCES[key];
  if (!rule) return { error: "That setting can't be changed by the Coach" };
  const text = typeof value === "boolean" ? String(value) : value.trim();
  switch (rule.kind) {
    case "text":
      if (!text) return { error: "Value is required" };
      if (text.length > 300) return { error: "Value is too long" };
      return { value: text };
    case "weekday": {
      // Empty clears it, like the "Not set" option on the rotation screen.
      if (!text) return { value: "" };
      const day = WEEKDAYS.find((d) => d.toLowerCase() === text.toLowerCase());
      return day ? { value: day } : { error: "Use a day of the week, like Monday" };
    }
    case "time": {
      const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(text);
      return m ? { value: `${m[1]!.padStart(2, "0")}:${m[2]}` } : { error: "Use a 24-hour time like 07:30" };
    }
    case "frequency": {
      if (!text) return { value: "" };
      const f = WEIGH_IN_FREQUENCIES.find((x) => x === text.toLowerCase());
      return f ? { value: f } : { error: "Use daily, weekly or biweekly" };
    }
    case "boolean": {
      const t = text.toLowerCase();
      if (t === "true" || t === "false") return { value: t };
      return { error: "Use true or false" };
    }
  }
}

export const setPreferenceSchema = z
  .object({
    key: z.enum(Object.keys(COACH_SETTABLE_PREFERENCES) as [string, ...string[]]),
    value: z.union([z.string(), z.boolean()]),
  })
  .superRefine((v, ctx) => {
    const r = normalizePreferenceValue(v.key, v.value);
    if ("error" in r) ctx.addIssue({ code: "custom", message: r.error, path: ["value"] });
  });

function describe(key: string, stored: string): string {
  const rule = COACH_SETTABLE_PREFERENCES[key]!;
  if (rule.kind === "boolean") return `Turn ${stored === "true" ? "on" : "off"} the ${rule.label}`;
  if (stored === "") return `Clear the ${rule.label}`;
  return `Set ${rule.label} to ${stored}`;
}

export const setPreference: CoachActionDef<typeof setPreferenceSchema> = {
  name: "set_preference",
  description: `Propose changing one of the user's settings. Allowed keys: ${Object.entries(
    COACH_SETTABLE_PREFERENCES
  )
    .map(([k, r]) => `${k} (${r.kind === "time" ? "HH:MM" : r.kind === "weekday" ? "weekday name, or empty to clear" : r.kind === "frequency" ? "daily, weekly or biweekly, or empty to clear" : r.kind === "boolean" ? "true/false" : "text"})`)
    .join(", ")}. The user must tap Apply before anything changes.`,
  schema: setPreferenceSchema,
  summarize: ({ key, value }) => {
    const r = normalizePreferenceValue(key, value);
    return "value" in r ? describe(key, r.value) : `Change ${key}`;
  },
  async execute({ supabase, userId, now }, { key, value }) {
    const r = normalizePreferenceValue(key, value);
    if ("error" in r) throw new CoachActionError(r.error);
    if (key === "check_in_calories_key") {
      const { data: prefs, error: pErr } = await supabase
        .from("user_preferences")
        .select("key, value")
        .eq("user_id", userId);
      if (pErr) throw new CoachActionError(pErr.message);
      if (!extractMacroTargets(prefs ?? []).some((t) => t.key === r.value)) {
        throw new CoachActionError(`${r.value} is not one of your targets.`);
      }
    }
    if (COACH_SETTABLE_PREFERENCES[key]!.kind === "time") {
      // Reminder times are read in the user's time zone, which only the app
      // (from the device) saves. Without it the time would be read as UTC.
      const { data: tz, error: tzErr } = await supabase
        .from("user_preferences")
        .select("value")
        .eq("user_id", userId)
        .eq("key", "notification_timezone")
        .maybeSingle();
      if (tzErr) throw new CoachActionError(tzErr.message);
      if (!tz?.value?.trim()) {
        throw new CoachActionError(
          "Set any reminder time once in Settings first, so the app knows your time zone."
        );
      }
    }
    const { error } = await supabase.from("user_preferences").upsert(
      { user_id: userId, key, value: r.value, updated_by: "coach", updated_at: now.toISOString() },
      { onConflict: "user_id,key" }
    );
    if (error) throw new CoachActionError(error.message);
    return { message: `${describe(key, r.value)}: done.` };
  },
};
