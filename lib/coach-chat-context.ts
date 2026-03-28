import "server-only";

import {
  NON_MACRO_PREFERENCE_KEYS,
  extractMacroTargets,
} from "@/lib/dashboard/preferences";

/**
 * Builds a system prompt segment from raw user_preferences rows.
 * All values come from the database; keys are emitted as stored (no invented goals).
 */
export function buildCoachSystemPromptFromPreferences(
  rows: { key: string; value: string }[]
): string {
  const lines: string[] = [
    "You are Macro Fit, the user's personal fitness coach. Respond conversationally, like a real coach texting their athlete: short, direct, and encouraging—not like a wiki article or handout.",
    "Keep each reply to at most 2-3 sentences unless the user clearly asks for a detailed or in-depth answer.",
    "Do not use bullet points, bold text, headers, numbered lists, or other structured formatting. Use plain sentences only (no markdown emphasis or lists).",
    "Ask one follow-up question at a time to keep the conversation going.",
    "Do not repeat information the user already got during onboarding or that is already listed in their saved preferences below; assume they know it and move forward.",
    "Stay supportive, clear, and evidence-informed.",
    "",
    "The following lines are the user's saved preferences and targets (exact keys and values from their account). Personalize every reply using this data. Do not invent conflicting numbers or goals.",
    "",
  ];

  const nonMacro = rows
    .filter((r) => NON_MACRO_PREFERENCE_KEYS.has(r.key) && r.value.trim())
    .sort((a, b) => a.key.localeCompare(b.key));

  if (nonMacro.length) {
    lines.push("Profile & plan preferences:");
    for (const r of nonMacro) {
      lines.push(`${r.key}: ${r.value.trim()}`);
    }
    lines.push("");
  }

  const macros = extractMacroTargets(rows);
  if (macros.length) {
    lines.push("Macro targets (from onboarding):");
    for (const m of macros) {
      lines.push(`${m.key}: ${m.displayValue}`);
    }
    lines.push("");
  }

  const macroKeys = new Set(macros.map((m) => m.key));
  const extras = rows.filter(
    (r) =>
      r.value.trim() &&
      !NON_MACRO_PREFERENCE_KEYS.has(r.key) &&
      !macroKeys.has(r.key)
  );
  if (extras.length) {
    lines.push("Other saved preferences:");
    for (const r of extras.sort((a, b) => a.key.localeCompare(b.key))) {
      lines.push(`${r.key}: ${r.value.trim()}`);
    }
    lines.push("");
  }

  if (nonMacro.length === 0 && macros.length === 0 && extras.length === 0) {
    lines.push(
      "No detailed preferences are on file yet. Ask short, practical questions to learn how you can help."
    );
  }

  return lines.join("\n").trim();
}
