import { ageForAi, ageFromDob, type CalendarDate, type PartialDob } from "@/lib/profile/profile";

/** What onboarding sends to /api/macro-targets (date of birth replaces age). */
export type MacroProfileInput = {
  currentWeight: number;
  currentWeightUnit: "lbs" | "kg";
  goalWeight: number;
  goalWeightUnit: "lbs" | "kg";
  dateOfBirth?: PartialDob;
  height: string;
  biologicalSex: "female" | "male" | "other";
  activityLevel: "sedentary" | "lightly active" | "moderately active" | "very active";
  primaryGoal: "fat loss" | "muscle gain" | "maintenance" | "body recomposition";
};

/** Reads the date of birth from a request body; anything malformed is dropped. */
export function readDobFromBody(raw: unknown): PartialDob {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : undefined);
  const year = n(o.year);
  const month = year !== undefined ? n(o.month) : undefined;
  const day = month !== undefined ? n(o.day) : undefined;
  return {
    ...(year !== undefined ? { year } : {}),
    ...(month !== undefined ? { month } : {}),
    ...(day !== undefined ? { day } : {}),
  };
}

/** The profile as the model sees it: age is computed, or stated as unknown. */
export function macroProfileForPrompt(input: MacroProfileInput, today: CalendarDate) {
  const range = ageFromDob(input.dateOfBirth ?? {}, today);
  return {
    currentWeight: input.currentWeight,
    currentWeightUnit: input.currentWeightUnit,
    goalWeight: input.goalWeight,
    goalWeightUnit: input.goalWeightUnit,
    age: ageForAi(range),
    height: input.height,
    biologicalSex: input.biologicalSex,
    activityLevel: input.activityLevel,
    primaryGoal: input.primaryGoal,
  };
}

const AGE_UNKNOWN_NOTE =
  "Age is unknown. Do not invent an age. Use a formula step that does not depend on age where possible, and say in the summary that the targets were estimated without an age and will be more precise if the user adds a date of birth.";
const AGE_RANGE_NOTE =
  "Only the birth year is known, so age is one of two values. Use the average of the two in any age-based formula.";

/** User message for the main target recommendation. */
export function buildMacroTargetsUserPrompt(input: MacroProfileInput, today: CalendarDate): string {
  const profile = macroProfileForPrompt(input, today);
  const range = ageFromDob(input.dateOfBirth ?? {}, today);
  const note = !range ? `\n\n${AGE_UNKNOWN_NOTE}` : range.min !== range.max ? `\n\n${AGE_RANGE_NOTE}` : "";
  return `User profile (JSON):
${JSON.stringify(profile, null, 2)}${note}

Respond with ONLY the JSON object in the exact format specified in your instructions. No other text.`;
}
