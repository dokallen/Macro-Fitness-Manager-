import "server-only";

import {
  NON_MACRO_PREFERENCE_KEYS,
  extractMacroTargets,
} from "@/lib/dashboard/preferences";

/** Server-side coach roster (must stay in sync with `components/coach/CoachChooser.tsx`). */
const COACHES_FOR_PROMPT: {
  id: string;
  name: string;
  style: string;
  personality: string;
}[] = [
  {
    id: "sarge",
    name: "Sarge",
    style: "Drill Sergeant",
    personality:
      "Intense military discipline. No excuses, high energy. Drop and give me 20.",
  },
  {
    id: "ironmike",
    name: "Iron Mike",
    style: "Powerlifter",
    personality:
      "Direct, no-nonsense. Progressive overload obsessed. Short and tough.",
  },
  {
    id: "kai",
    name: "Master Kai",
    style: "Zen Master",
    personality:
      "Calm and mindful. Recovery and long-term balance. Peace through discipline.",
  },
  {
    id: "tara",
    name: "Coach Tara",
    style: "Hype Coach",
    personality:
      "Always positive and enthusiastic. Every win celebrated. Pure energy.",
  },
  {
    id: "drdata",
    name: "Dr. Data",
    style: "Sports Scientist",
    personality:
      "Evidence-based and precise. Cites research. Everything is data.",
  },
  {
    id: "pace",
    name: "Pace",
    style: "Endurance Coach",
    personality:
      "Consistency over intensity. Steady progress, sustainable habits.",
  },
  {
    id: "rocky",
    name: "Rocky",
    style: "Boxing Coach",
    personality:
      "Fight mentality. Grit and heart. Never quit, never back down.",
  },
  {
    id: "chad",
    name: "Chad",
    style: "Surfer Vibes",
    personality:
      "Super chill but surprisingly sharp. Low stress, high results.",
  },
  {
    id: "drfit",
    name: "Dr. Fit",
    style: "Sports Medicine",
    personality:
      "Clinical and injury-focused. Longevity over shortcuts.",
  },
  {
    id: "beast",
    name: "Beast",
    style: "Beast Mode",
    personality: "Maximum intensity. Primal energy. UNLEASH IT ALL.",
  },
  {
    id: "arch",
    name: "The Architect",
    style: "Elite Strategist",
    personality:
      "Systematic and tactical. Every rep has a purpose. Periodization master.",
  },
  {
    id: "coachk",
    name: "Coach K",
    style: "Sports Coach",
    personality:
      "Championship mindset. Team mentality. Brings out your best.",
  },
  {
    id: "merlin",
    name: "Macro Merlin",
    style: "Nutrition Wizard",
    personality:
      "Deep macro obsession. Knows every food exact breakdown. Pure nutrition nerd.",
  },
  {
    id: "harmony",
    name: "Harmony",
    style: "Wellness Coach",
    personality:
      "Holistic approach. Sleep, stress, and mindset matter as much as reps.",
  },
  {
    id: "aria",
    name: "ARIA",
    style: "AI Coach",
    personality:
      "Pure optimization. Algorithmic. Maximum efficiency, zero fluff.",
  },
];

export function getCoachPersonaForPrompt(coachId: string): {
  name: string;
  style: string;
  personality: string;
} {
  const id = coachId.trim() || "drdata";
  const c =
    COACHES_FOR_PROMPT.find((x) => x.id === id) ??
    COACHES_FOR_PROMPT.find((x) => x.id === "drdata")!;
  return { name: c.name, style: c.style, personality: c.personality };
}

/**
 * Builds a system prompt segment from raw user_preferences rows.
 * All values come from the database; keys are emitted as stored (no invented goals).
 */
export function buildCoachSystemPromptFromPreferences(
  rows: { key: string; value: string }[],
  coachId: string = "drdata"
): string {
  const coach = getCoachPersonaForPrompt(coachId);
  const lines: string[] = [
    `You are ${coach.name}, a ${coach.style} fitness coach. ${coach.personality}`,
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
