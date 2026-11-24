import { z } from "zod";

import { CoachActionError, type CoachActionDef } from "@/lib/coach-actions/types";
import {
  ACTIVITY_LEVEL_OPTIONS,
  BIOLOGICAL_SEX_OPTIONS,
  WEIGHT_UNITS,
  calendarDateIn,
  changedProfileWrites,
  profileError,
  readProfile,
  type Profile,
} from "@/lib/profile/profile";

/**
 * Coach proposal to change profile fields (Phase 2.5). null clears a field.
 * The merged result (stored profile + these changes) must still be valid.
 */
export const updateProfileSchema = z
  .object({
    birth_year: z.number().int().nullable().optional(),
    birth_month: z.number().int().min(1).max(12).nullable().optional(),
    birth_day: z.number().int().min(1).max(31).nullable().optional(),
    height: z.string().trim().max(40).nullable().optional(),
    biological_sex: z.enum(BIOLOGICAL_SEX_OPTIONS).nullable().optional(),
    activity_level: z.enum(ACTIVITY_LEVEL_OPTIONS).nullable().optional(),
    goal_weight: z.number().positive().nullable().optional(),
    goal_weight_unit: z.enum(WEIGHT_UNITS).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Change at least one field",
  });

type Input = z.infer<typeof updateProfileSchema>;

const LABELS: Record<keyof Input, string> = {
  birth_year: "birth year",
  birth_month: "birth month",
  birth_day: "birth day",
  height: "height",
  biological_sex: "biological sex",
  activity_level: "activity level",
  goal_weight: "goal weight",
  goal_weight_unit: "goal weight unit",
};

/** Applies the changes onto the stored profile. */
export function mergeProfile(stored: Profile, input: Input): Profile {
  const pick = <T,>(change: T | null | undefined, current: T | undefined): T | undefined =>
    change === undefined ? current : change === null ? undefined : change;
  return {
    dob: {
      year: pick(input.birth_year, stored.dob.year),
      month: pick(input.birth_month, stored.dob.month),
      day: pick(input.birth_day, stored.dob.day),
    },
    height: pick(input.height === "" ? null : input.height, stored.height),
    biologicalSex: pick(input.biological_sex, stored.biologicalSex),
    activityLevel: pick(input.activity_level, stored.activityLevel),
    goalWeight: pick(input.goal_weight, stored.goalWeight),
    goalWeightUnit: pick(input.goal_weight_unit, stored.goalWeightUnit),
  };
}

export const updateProfile: CoachActionDef<typeof updateProfileSchema> = {
  name: "update_profile",
  description:
    "Propose changing the user's saved profile: date of birth (birth_year, birth_month 1-12, birth_day; each optional, a day needs a month and a month needs a year), height (text with its unit, as the user says it), biological_sex, activity_level, goal_weight and goal_weight_unit. Send only fields that change; send null to clear one. To clear the date of birth, send null for birth_year, birth_month and birth_day together. goal_weight and goal_weight_unit always go together. Never set any date-of-birth field unless the user stated it in this conversation. Current weight is not a profile field: use log_progress_entry. The user must tap Apply before anything changes.",
  schema: updateProfileSchema,
  summarize: (input) => {
    const parts = (Object.keys(LABELS) as (keyof Input)[])
      .filter((k) => input[k] !== undefined)
      .map((k) => (input[k] === null ? `clear ${LABELS[k]}` : `${LABELS[k]} ${String(input[k])}`));
    return `Update profile: ${parts.join(", ")}`;
  },
  async execute({ supabase, userId, now }, input) {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", userId);
    if (error) throw new CoachActionError(error.message);
    const prefs = data ?? [];
    const tz = prefs.find((p) => p.key === "notification_timezone")?.value ?? null;
    const stored = readProfile(prefs);
    const merged = mergeProfile(stored, input);
    const problem = profileError(merged, calendarDateIn(now, tz));
    if (problem) throw new CoachActionError(problem);

    // Only write what this proposal changes; leave other fields as stored.
    const { upserts: toUpsert, deletes: toDelete } = changedProfileWrites(stored, merged);
    if (toUpsert.length) {
      const { error: upErr } = await supabase.from("user_preferences").upsert(
        toUpsert.map((u) => ({
          user_id: userId,
          key: u.key,
          value: u.value,
          updated_by: "coach" as const,
          updated_at: now.toISOString(),
        })),
        { onConflict: "user_id,key" }
      );
      if (upErr) throw new CoachActionError(upErr.message);
    }
    if (toDelete.length) {
      const { error: delErr } = await supabase
        .from("user_preferences")
        .delete()
        .eq("user_id", userId)
        .in("key", toDelete);
      if (delErr) throw new CoachActionError(delErr.message);
    }
    return { message: "Profile updated." };
  },
};
