import { z } from "zod";

import { CoachActionError, type CoachActionDef } from "@/lib/coach-actions/types";
import {
  extractMacroTargets,
  formatMacroLabel,
  isNonMacroPreferenceKey,
} from "@/lib/dashboard/preferences";

/** Same value format onboarding writes: "<number>" or "<number> <unit>". */
export function formatTargetValue(value: number, unit?: string): string {
  const u = unit?.trim();
  return u ? `${value} ${u}` : `${value}`;
}

const targetKey = z
  .string()
  .trim()
  .min(1, "Target name is required")
  .max(40, "Target name is too long")
  .refine((k) => !isNonMacroPreferenceKey(k), "That name is reserved for a setting, not a macro target");

const targetSchema = z.object({
  key: targetKey,
  value: z.number().positive("Target value must be a positive number"),
  unit: z.string().trim().max(12).optional(),
});

export const setMacroTargetsSchema = z.object({
  targets: z
    .array(targetSchema)
    .min(1, "At least one target is required")
    .max(12)
    .refine(
      (ts) => new Set(ts.map((t) => t.key.toLowerCase())).size === ts.length,
      "Each target may appear only once"
    ),
});

export const setMacroTargets: CoachActionDef<typeof setMacroTargetsSchema> = {
  name: "set_macro_targets",
  description:
    "Propose setting one or more of the user's daily macro targets in one change (for example calories, protein, carbs, fat). Use the user's existing target names exactly when changing an existing target. The user must tap Apply before anything changes.",
  schema: setMacroTargetsSchema,
  summarize: ({ targets }) =>
    `Set ${targets
      .map((t) => `${formatMacroLabel(t.key)} ${formatTargetValue(t.value, t.unit)}`)
      .join(" · ")}`,
  async execute({ supabase, userId, now }, { targets }) {
    // Reuse the user's existing spelling of a target ("Protein" vs "protein"),
    // so a change updates it instead of adding a second one.
    const { data: prefs, error: readErr } = await supabase
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", userId);
    if (readErr) throw new CoachActionError(readErr.message);
    const existing = new Map(
      extractMacroTargets(prefs ?? []).map((t) => [t.key.toLowerCase(), t.key])
    );
    const { error } = await supabase.from("user_preferences").upsert(
      targets.map((t) => ({
        user_id: userId,
        key: existing.get(t.key.toLowerCase()) ?? t.key,
        value: formatTargetValue(t.value, t.unit),
        updated_by: "coach" as const,
        updated_at: now.toISOString(),
      })),
      { onConflict: "user_id,key" }
    );
    if (error) throw new CoachActionError(error.message);
    return { message: `Updated ${targets.length === 1 ? "1 target" : `${targets.length} targets`}.` };
  },
};

export const removeMacroTargetSchema = z.object({ key: targetKey });

export const removeMacroTarget: CoachActionDef<typeof removeMacroTargetSchema> = {
  name: "remove_macro_target",
  description:
    "Propose removing one of the user's existing daily macro targets. Use the exact target name. The user must tap Apply before anything changes.",
  schema: removeMacroTargetSchema,
  summarize: ({ key }) => `Remove the ${formatMacroLabel(key)} target`,
  async execute({ supabase, userId }, { key }) {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", userId);
    if (error) throw new CoachActionError(error.message);
    const current = extractMacroTargets(data ?? []).find(
      (t) => t.key.toLowerCase() === key.toLowerCase()
    );
    if (!current) throw new CoachActionError(`${formatMacroLabel(key)} is not one of your targets.`);
    const { error: delErr } = await supabase
      .from("user_preferences")
      .delete()
      .eq("user_id", userId)
      .eq("key", current.key);
    if (delErr) throw new CoachActionError(delErr.message);
    return { message: `Removed the ${formatMacroLabel(current.key)} target.` };
  },
};
