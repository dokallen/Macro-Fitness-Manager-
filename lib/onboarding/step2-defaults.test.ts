import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ONBOARDING_STEP2_DEFAULTS,
  ONBOARDING_STEP2_PROFILE_FIELDS,
} from "@/lib/onboarding/step2-defaults";
import { onboardingStep2Schema } from "@/lib/validations";

// What step 2 submits if the user touches nothing: empty number inputs registered
// with valueAsNumber give NaN, unit selects sit on their empty "Unit" option, the
// optional date-of-birth inputs give undefined, and the sex / activity / goal
// button groups stay unset.
const UNTOUCHED_FORM = {
  ...ONBOARDING_STEP2_DEFAULTS,
  currentWeight: Number.NaN,
  currentWeightUnit: "",
  goalWeight: Number.NaN,
  goalWeightUnit: "",
};

const COMPLETE_ANSWERS = {
  ...ONBOARDING_STEP2_DEFAULTS,
  currentWeight: 228.8,
  currentWeightUnit: "lbs",
  goalWeight: 200,
  goalWeightUnit: "lbs",
  height: "6'0\"",
  biologicalSex: "male",
  activityLevel: "very active",
  primaryGoal: "fat loss",
  targets: [{ key: "calories", value: "1900", unit: "kcal" }],
};

describe("onboarding step 2 defaults", () => {
  it("pre-fills no weight, age, height, sex, activity level, goal or unit", () => {
    for (const field of ONBOARDING_STEP2_PROFILE_FIELDS) {
      const value = ONBOARDING_STEP2_DEFAULTS[field];
      expect(value === undefined || value === "", field).toBe(true);
    }
  });

  it("is what OnboardingWizard uses as step 2 default values", () => {
    const source = readFileSync(
      path.join(process.cwd(), "components/onboarding/OnboardingWizard.tsx"),
      "utf8"
    );
    expect(source).toContain("defaultValues: ONBOARDING_STEP2_DEFAULTS");
    // Both unit selects start on an empty option; without it the browser would
    // silently select "lbs".
    expect(source.match(/<option value="">Unit<\/option>/g)).toHaveLength(2);
    // The removed fake profile must not come back inline.
    expect(source).not.toMatch(/currentWeight:\s*\d/);
    expect(source).not.toMatch(/age:\s*\d/);
  });
});

describe("onboardingStep2Schema", () => {
  it("rejects the untouched form, with a message on every unanswered field", () => {
    const result = onboardingStep2Schema.safeParse(UNTOUCHED_FORM);
    expect(result.success).toBe(false);
    const messages = new Map(
      (result.error?.issues ?? []).map((i) => [String(i.path[0]), i.message])
    );
    expect(messages.get("currentWeight")).toBe("Enter current weight.");
    expect(messages.get("currentWeightUnit")).toBe("Choose a unit.");
    expect(messages.get("goalWeight")).toBe("Enter goal weight.");
    expect(messages.get("goalWeightUnit")).toBe("Choose a unit.");
    expect(messages.has("birthYear")).toBe(false);
    expect(messages.get("height")).toBe("Enter height.");
    expect(messages.get("biologicalSex")).toBe("Choose an option.");
    expect(messages.get("activityLevel")).toBe("Choose your activity level.");
    expect(messages.get("primaryGoal")).toBe("Choose your primary goal.");
  });

  it("accepts a complete, valid set of answers", () => {
    expect(onboardingStep2Schema.safeParse(COMPLETE_ANSWERS).success).toBe(true);
  });

  it("does not require a date of birth", () => {
    expect(onboardingStep2Schema.safeParse(COMPLETE_ANSWERS).success).toBe(true);
    expect(
      onboardingStep2Schema.safeParse({ ...COMPLETE_ANSWERS, birthYear: 1990 }).success
    ).toBe(true);
    expect(
      onboardingStep2Schema.safeParse({ ...COMPLETE_ANSWERS, birthYear: 1990, birthMonth: 3, birthDay: 14 }).success
    ).toBe(true);
  });

  it("rejects an incomplete or impossible date of birth", () => {
    const bad = [
      { birthMonth: 3 },
      { birthYear: 1990, birthDay: 14 },
      { birthYear: 1990, birthMonth: 2, birthDay: 30 },
      { birthYear: 1990, birthMonth: 13 },
      { birthYear: new Date().getFullYear() - 5 },
      { birthYear: 1990, birthMonth: 3, birthDay: 14.5 },
      { birthYear: 1990.5 },
    ];
    for (const b of bad) {
      const r = onboardingStep2Schema.safeParse({ ...COMPLETE_ANSWERS, ...b });
      expect(r.success, JSON.stringify(b)).toBe(false);
      expect(r.error!.issues[0]!.path[0]).toBe("birthYear");
    }
  });
});
