import { describe, expect, it } from "vitest";

import { buildMacroTargetsUserPrompt, readDobFromBody, type MacroProfileInput } from "@/lib/profile/macro-prompt";

const today = { year: 2026, month: 11, day: 24 };
const base: MacroProfileInput = {
  currentWeight: 228.8,
  currentWeightUnit: "lbs",
  goalWeight: 200,
  goalWeightUnit: "lbs",
  height: "6'0\"",
  biologicalSex: "male",
  activityLevel: "very active",
  primaryGoal: "fat loss",
};

function profileJson(prompt: string) {
  const json = prompt.slice(prompt.indexOf("{"), prompt.indexOf("}") + 1);
  return JSON.parse(json) as Record<string, unknown>;
}

describe("macro-targets prompt", () => {
  it("sends a computed age when the date of birth is given", () => {
    const prompt = buildMacroTargetsUserPrompt({ ...base, dateOfBirth: { year: 1990, month: 3, day: 14 } }, today);
    expect(profileJson(prompt)).toMatchObject({ age: 36, currentWeight: 228.8, primaryGoal: "fat loss" });
    expect(prompt).not.toMatch(/Age is unknown/);
  });

  it("says age is unknown instead of sending a number", () => {
    const prompt = buildMacroTargetsUserPrompt(base, today);
    const p = profileJson(prompt);
    expect(typeof p.age).toBe("string");
    expect(String(p.age)).toMatch(/^unknown/);
    expect(prompt).toMatch(/Age is unknown\. Do not invent an age/);
  });

  it("gives both values when only the year is known", () => {
    const prompt = buildMacroTargetsUserPrompt({ ...base, dateOfBirth: { year: 1990 } }, today);
    expect(profileJson(prompt).age).toBe("35 or 36 (birth year only)");
    expect(prompt).toMatch(/one of two values/);
  });

  it("reads only well-formed date-of-birth parts from the request", () => {
    expect(readDobFromBody({ year: 1990, month: 3, day: 14 })).toEqual({ year: 1990, month: 3, day: 14 });
    expect(readDobFromBody({ month: 3, day: 14 })).toEqual({});
    expect(readDobFromBody({ year: "1990" })).toEqual({});
    expect(readDobFromBody(undefined)).toEqual({});
  });
});
