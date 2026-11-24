import { z } from "zod";

import { identifyMacroRoles } from "@/lib/coaching/calc";
import { OWN_TARGETS_KEY } from "@/lib/coaching/own-targets";
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

export const setMacroTargetsSchema = z
  .object({
    targets: z
      .array(targetSchema)
      .min(1, "At least one target is required")
      .max(12)
      .refine(
        (ts) => new Set(ts.map((t) => t.key.toLowerCase())).size === ts.length,
        "Each target may appear only once"
      ),
    /**
     * "calculated": from the app's calculation (set by the server, never by the model).
     * "user": numbers the user chose themselves; needs their reason.
     */
    source: z.enum(["calculated", "user"]).default("user"),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.source === "calculated" || (v.reason?.length ?? 0) >= 3, {
    message: "Own numbers need the user's reason (what changed)",
    path: ["reason"],
  });

export const setMacroTargets: CoachActionDef<typeof setMacroTargetsSchema> = {
  name: "set_macro_targets",
  description:
    "Propose the user's OWN numbers for one or more daily macro targets, only when the user states the exact values themselves. Before using this, compare their numbers with get_calculated_targets, explain plainly what they mean for the goal, and ask what changed; put their answer in reason. Use the user's existing target names exactly. Never use this for numbers you chose: use propose_calculated_targets. The user must tap Apply before anything changes.",
  schema: setMacroTargetsSchema,
  summarize: ({ targets, source, reason }) =>
    `Set ${targets
      .map((t) => `${formatMacroLabel(t.key)} ${formatTargetValue(t.value, t.unit)}`)
      .join(" · ")}${source === "user" ? ` (your own numbers: ${reason})` : ""}`,
  async execute({ supabase, userId, now }, { targets, source, reason }) {
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

    // Record whether these are the user's own numbers or the calculated ones.
    if (source === "user") {
      const { error: ownErr } = await supabase.from("user_preferences").upsert(
        {
          user_id: userId,
          key: OWN_TARGETS_KEY,
          value: JSON.stringify({ reason, setAt: now.toISOString() }),
          updated_by: "coach" as const,
          updated_at: now.toISOString(),
        },
        { onConflict: "user_id,key" }
      );
      if (ownErr) throw new CoachActionError(ownErr.message);
    } else {
      const { error: clearErr } = await supabase
        .from("user_preferences")
        .delete()
        .eq("user_id", userId)
        .eq("key", OWN_TARGETS_KEY);
      if (clearErr) throw new CoachActionError(clearErr.message);
    }
    return { message: `Updated ${targets.length === 1 ? "1 target" : `${targets.length} targets`}.` };
  },
};

export const removeMacroTargetSchema = z.object({
  key: targetKey,
  /** Removing a target is the user's own change, so it needs their reason. */
  reason: z.string().trim().min(3, "Removing a target needs the user's reason (what changed)").max(300),
});

export const removeMacroTarget: CoachActionDef<typeof removeMacroTargetSchema> = {
  name: "remove_macro_target",
  description:
    "Propose removing one of the user's existing daily macro targets, only when the user asks. Explain what it means for their goal and ask what changed first; put their answer in reason. The calorie target can't be removed (check-ins need it). Use the exact target name. The user must tap Apply before anything changes.",
  schema: removeMacroTargetSchema,
  summarize: ({ key, reason }) => `Remove the ${formatMacroLabel(key)} target (your own change: ${reason})`,
  async execute({ supabase, userId, now }, { key, reason }) {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", userId);
    if (error) throw new CoachActionError(error.message);
    const current = extractMacroTargets(data ?? []).find(
      (t) => t.key.toLowerCase() === key.toLowerCase()
    );
    if (!current) throw new CoachActionError(`${formatMacroLabel(key)} is not one of your targets.`);
    const targets = extractMacroTargets(data ?? []);
    const roles = identifyMacroRoles(targets, (data ?? []).find((p) => p.key === "check_in_calories_key")?.value);
    if (roles.calories === current.key) {
      throw new CoachActionError("The calorie target can't be removed; check-ins need it. It can be changed instead.");
    }
    const { error: delErr } = await supabase
      .from("user_preferences")
      .delete()
      .eq("user_id", userId)
      .eq("key", current.key);
    if (delErr) throw new CoachActionError(delErr.message);
    // Removing a target makes the set the user's own numbers.
    const { error: ownErr } = await supabase.from("user_preferences").upsert(
      {
        user_id: userId,
        key: OWN_TARGETS_KEY,
        value: JSON.stringify({ reason, setAt: now.toISOString() }),
        updated_by: "coach" as const,
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id,key" }
    );
    if (ownErr) throw new CoachActionError(ownErr.message);
    return { message: `Removed the ${formatMacroLabel(current.key)} target.` };
  },
};
