import { goalPaceError, goalPaceWrites, type GoalPace } from "@/lib/coaching/goal-pace";
import { SCHEDULE_KEYS } from "@/lib/coaching/schedule";

export type CheckInSettingsForm = {
  frequency: string;
  day: string;
  reminder: boolean;
  direction: string;
  percent: string;
};

/** Writes and clears for the schedule and goal pace (pure, for tests). */
export function checkInSettingsWrites(form: CheckInSettingsForm): {
  upserts: { key: string; value: string }[];
  deletes: string[];
  error: string | null;
} {
  const upserts: { key: string; value: string }[] = [];
  const deletes: string[] = [];
  if (form.frequency) upserts.push({ key: SCHEDULE_KEYS.weighInFrequency, value: form.frequency });
  else deletes.push(SCHEDULE_KEYS.weighInFrequency);
  if (form.day) upserts.push({ key: SCHEDULE_KEYS.checkInDay, value: form.day });
  else deletes.push(SCHEDULE_KEYS.checkInDay);
  upserts.push({ key: SCHEDULE_KEYS.checkInReminder, value: form.reminder ? "true" : "false" });

  let pace: GoalPace | null = null;
  if (form.direction === "maintain") pace = { direction: "maintain" };
  else if (form.direction === "loss" || form.direction === "gain") {
    pace = { direction: form.direction, percentPerWeek: Number(form.percent) };
    const err = goalPaceError(pace);
    if (err) return { upserts: [], deletes: [], error: err };
  }
  const p = goalPaceWrites(pace);
  return { upserts: [...upserts, ...p.upserts], deletes: [...deletes, ...p.deletes], error: null };
}

