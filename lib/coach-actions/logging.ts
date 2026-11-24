import { z } from "zod";

import { localDateString, localNoon, userTimeZone } from "@/lib/coach-actions/dates";
import { formatTargetValue } from "@/lib/coach-actions/macro-targets";
import { CoachActionError, type CoachActionDef } from "@/lib/coach-actions/types";
import { extractMacroTargets, formatMacroLabel } from "@/lib/dashboard/preferences";
import { findTrackedMetric, trackedMetrics } from "@/lib/metrics/tracked";

async function loadPrefs(
  supabase: Parameters<CoachActionDef["execute"]>[0]["supabase"],
  userId: string
) {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("key, value")
    .eq("user_id", userId);
  if (error) throw new CoachActionError(error.message);
  return data ?? [];
}

// ---------------------------------------------------------------- log_food

export const logFoodSchema = z.object({
  food_name: z.string().trim().min(1, "Food name is required").max(120),
  meal_number: z.number().int().min(1).max(10).optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().trim().max(20).optional(),
  macros: z.record(z.string().trim().min(1).max(40), z.number().min(0)).default({}),
});

export const logFood: CoachActionDef<typeof logFoodSchema> = {
  name: "log_food",
  description:
    "Propose logging a food the user ate today, with its macros. Use the user's own macro target names as the macros keys (for example their calories and protein targets); other macros are not saved. meal_number is the meal of the day, starting at 1. The user must tap Apply before anything is logged.",
  schema: logFoodSchema,
  summarize: ({ food_name, quantity, unit, macros }) => {
    const amount = quantity ? `${quantity}${unit ? ` ${unit}` : ""} ` : "";
    const m = Object.entries(macros)
      .map(([k, v]) => `${formatMacroLabel(k)} ${v}`)
      .join(" · ");
    // Only macros matching the user's targets are saved; the card says so.
    return `Log ${amount}${food_name}${m ? ` (${m}; only your tracked macros are saved)` : ""}`;
  },
  async execute({ supabase, userId }, input) {
    const targets = extractMacroTargets(await loadPrefs(supabase, userId));
    const byLower = new Map(targets.map((t) => [t.key.toLowerCase(), t.key]));
    const kept: { key: string; value: number }[] = [];
    const dropped: string[] = [];
    for (const [k, v] of Object.entries(input.macros)) {
      const target = byLower.get(k.trim().toLowerCase());
      if (target) kept.push({ key: target, value: v });
      else dropped.push(k);
    }

    const { data: log, error: logErr } = await supabase
      .from("food_logs")
      .insert({
        user_id: userId,
        meal_number: input.meal_number ?? 1,
        food_name: input.food_name,
        quantity: input.quantity ?? null,
        // Like quick-log: a unit is only meaningful with a quantity.
        unit: input.quantity != null ? (input.unit ?? "") : "",
      })
      .select("id")
      .single();
    if (logErr || !log) throw new CoachActionError(logErr?.message ?? "Could not save the food log.");

    if (kept.length) {
      const { error: mErr } = await supabase
        .from("food_log_macros")
        .insert(kept.map((m) => ({ food_log_id: log.id, key: m.key, value: m.value })));
      if (mErr) {
        // Don't leave a food entry without its macros.
        await supabase.from("food_logs").delete().eq("id", log.id).eq("user_id", userId);
        throw new CoachActionError(mErr.message);
      }
    }

    const note = dropped.length
      ? ` Skipped ${dropped.map(formatMacroLabel).join(", ")} (not one of your targets).`
      : "";
    return { message: `Logged ${input.food_name}.${note}` };
  },
};

// ------------------------------------------------------- log_progress_entry

export const logProgressEntrySchema = z.object({
  metric_key: z.string().trim().min(1, "Metric name is required").max(60),
  value: z.number().finite(),
  unit: z.string().trim().max(20).optional(),
  date: z.iso.date().optional(),
});

export const logProgressEntry: CoachActionDef<typeof logProgressEntrySchema> = {
  name: "log_progress_entry",
  description:
    "Propose logging a value for a body metric the user already tracks (for example their weight or body fat). Use the metric's exact name and the metric's own unit. Leave out date to log it for right now; only give date (YYYY-MM-DD) when the user says it was for an earlier day. The user must tap Apply before anything is logged.",
  schema: logProgressEntrySchema,
  summarize: ({ metric_key, value, unit, date }) =>
    `Log ${metric_key} ${formatTargetValue(value, unit)}${date ? ` for ${date}` : ""}`,
  async execute({ supabase, userId, now }, input) {
    const prefs = await loadPrefs(supabase, userId);
    const metric = findTrackedMetric(trackedMetrics(prefs), input.metric_key);
    if (!metric) {
      throw new CoachActionError(`${input.metric_key} is not a metric you track yet.`);
    }
    // The metric's own unit wins: the app shows the stored value in that unit.
    const given = input.unit?.trim();
    if (metric.unit && given && given.toLowerCase() !== metric.unit.toLowerCase()) {
      throw new CoachActionError(`${metric.name} is tracked in ${metric.unit}, not ${given}.`);
    }
    let loggedAt = now;
    if (input.date) {
      const tz = userTimeZone(prefs);
      const today = localDateString(now, tz);
      if (input.date > today) throw new CoachActionError("That date is in the future.");
      // Same as the app's own forms: earlier days are stored at local noon.
      if (input.date !== today) loggedAt = localNoon(input.date, tz);
    }
    const { error } = await supabase.from("progress_entries").insert({
      user_id: userId,
      metric_key: metric.name,
      value: input.value,
      unit: metric.unit || given || "",
      logged_at: loggedAt.toISOString(),
    });
    if (error) throw new CoachActionError(error.message);
    return { message: `Logged ${metric.name}.` };
  },
};
