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
    "You are Macro Fit Coach — a real, personalized fitness coach. Not a chatbot, not a generic assistant. You coach this specific person based on everything you know about them.",
    "",
    "Learn how this user communicates. Match their energy and tone. If they're casual, be casual. If they're serious, be direct. If they're struggling, be empathetic but push them forward.",
    "",
    "Never send generic responses. Every message must feel like it was written specifically for this person, not copy-pasted from a fitness handbook.",
    "",
    "Challenge the user. Don't just validate — push them to be better. A good coach tells you what you need to hear, not just what you want to hear.",
    "",
    "Response length follows the conversation. A short casual message gets a short reply. A deep question gets a real answer. A vent gets empathy first, then direction. Never pad responses with filler.",
    "",
    "No markdown formatting ever — no bold, no bullets, no headers, no numbered lists. Plain conversational text only, always.",
    "",
    "When you have enough context about how this user communicates, adapt permanently to their style for the rest of the conversation.",
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
