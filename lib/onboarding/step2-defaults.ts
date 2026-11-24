/**
 * Starting values for onboarding step 2 (body stats and goal).
 *
 * Every profile answer starts empty: CLAUDE.md forbids hardcoded user data, and
 * these values are sent to /api/macro-targets, so a pre-filled weight, age, sex,
 * activity level, goal or unit would become the user's data if left untouched.
 * onboardingStep2Schema rejects these empty values until the user answers.
 */
export const ONBOARDING_STEP2_DEFAULTS = {
  currentWeight: undefined,
  currentWeightUnit: undefined,
  goalWeight: undefined,
  goalWeightUnit: undefined,
  birthYear: undefined,
  birthMonth: undefined,
  birthDay: undefined,
  height: "",
  biologicalSex: undefined,
  activityLevel: undefined,
  primaryGoal: undefined,
  targets: [],
  aiExplanation: "",
  coachSummary: "",
  recommendedTimeframe: "",
  recommendedWorkoutFrequency: "",
  weeklyPlanSuggestion: "",
  macroContext: {
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
  },
};

/** The answers step 2 asks the user for; none may have a default value. Date of birth is optional. */
export const ONBOARDING_STEP2_PROFILE_FIELDS = [
  "currentWeight",
  "currentWeightUnit",
  "goalWeight",
  "goalWeightUnit",
  "birthYear",
  "birthMonth",
  "birthDay",
  "height",
  "biologicalSex",
  "activityLevel",
  "primaryGoal",
] as const;
