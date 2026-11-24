import { describe, expect, it } from "vitest";

import { extractMacroTargets } from "@/lib/dashboard/preferences";
import {
  ageForAi,
  changedProfileWrites,
  profileError,
  ageFromDob,
  calendarDateIn,
  describeProfileForAi,
  dobError,
  formatAge,
  profileWrites,
  readProfile,
  type CalendarDate,
} from "@/lib/profile/profile";

const day = (year: number, month: number, d: number): CalendarDate => ({ year, month, day: d });

describe("ageFromDob", () => {
  it("full date: exact, changing on the birthday itself", () => {
    const dob = { year: 1990, month: 3, day: 14 };
    expect(ageFromDob(dob, day(2026, 3, 13))).toEqual({ min: 35, max: 35 }); // day before
    expect(ageFromDob(dob, day(2026, 3, 14))).toEqual({ min: 36, max: 36 }); // birthday
    expect(ageFromDob(dob, day(2026, 12, 31))).toEqual({ min: 36, max: 36 });
  });

  it("month and year: birthday treated as the 1st", () => {
    const dob = { year: 1990, month: 3 };
    expect(ageFromDob(dob, day(2026, 2, 28))).toEqual({ min: 35, max: 35 }); // day before the 1st
    expect(ageFromDob(dob, day(2026, 3, 1))).toEqual({ min: 36, max: 36 }); // the 1st
  });

  it("year only: a range of the two possible ages", () => {
    const r = ageFromDob({ year: 1990 }, day(2026, 6, 1));
    expect(r).toEqual({ min: 35, max: 36 });
    expect(formatAge(r)).toBe("35–36");
    expect(ageForAi(r)).toBe("35 or 36 (birth year only)");
  });

  it("no date of birth: unknown", () => {
    expect(ageFromDob({}, day(2026, 6, 1))).toBeNull();
    expect(formatAge(null)).toBe("");
    expect(ageForAi(null)).toMatch(/^unknown/);
  });
});

describe("dobError", () => {
  const today = day(2026, 11, 24);
  it("accepts empty and each valid partial form", () => {
    for (const dob of [{}, { year: 1990 }, { year: 1990, month: 2 }, { year: 1992, month: 2, day: 29 }]) {
      expect(dobError(dob, today), JSON.stringify(dob)).toBeNull();
    }
  });
  it("rejects a day without a month and a month without a year", () => {
    expect(dobError({ year: 1990, day: 3 }, today)).toMatch(/month/);
    expect(dobError({ month: 3 }, today)).toMatch(/year/);
  });
  it("rejects impossible dates, the future and under-13s", () => {
    expect(dobError({ year: 1991, month: 2, day: 29 }, today)).toMatch(/day/);
    expect(dobError({ year: 1990, month: 13 }, today)).toMatch(/month/);
    expect(dobError({ year: 1850 }, today)).toMatch(/year/);
    expect(dobError({ year: 2026, month: 12 }, today)).toMatch(/future/);
    expect(dobError({ year: 2014, month: 1, day: 1 }, today)).toMatch(/13/);
    expect(dobError({ year: 2013, month: 11, day: 24 }, today)).toBeNull(); // 13 today
  });
});

describe("profile storage", () => {
  it("round-trips through preference rows, storing only what was given", () => {
    const profile = {
      dob: { year: 1990, month: 3 },
      height: "6'0\"",
      biologicalSex: "male" as const,
      activityLevel: "very active" as const,
      goalWeight: 200,
      goalWeightUnit: "lbs" as const,
    };
    const { upserts, deletes } = profileWrites(profile);
    expect(deletes).toEqual(["profile_birth_day"]);
    expect(readProfile(upserts)).toEqual(profile);
    // No age is ever stored.
    expect(upserts.some((u) => /age/.test(u.key))).toBe(false);
  });

  it("ignores malformed values and a month without a year", () => {
    const p = readProfile([
      { key: "profile_birth_month", value: "3" },
      { key: "profile_biological_sex", value: "robot" },
      { key: "profile_goal_weight", value: "-4" },
    ]);
    expect(p).toEqual({ dob: {} });
  });

  it("profile values never become macro targets", () => {
    const { upserts } = profileWrites({ dob: { year: 1990, month: 3, day: 14 }, goalWeight: 200, goalWeightUnit: "lbs" });
    expect(extractMacroTargets(upserts)).toEqual([]);
  });

  it("describes the profile for the AI with computed age", () => {
    expect(describeProfileForAi({ dob: { year: 1990, month: 3, day: 14 }, goalWeight: 200, goalWeightUnit: "lbs" }, day(2026, 11, 24)))
      .toMatchObject({ age: 36, goalWeight: "200 lbs", height: "unknown" });
  });
});

describe("calendarDateIn", () => {
  it("uses the time zone's date", () => {
    const t = new Date("2026-11-25T03:00:00.000Z");
    expect(calendarDateIn(t, "America/New_York")).toEqual(day(2026, 11, 24));
    expect(calendarDateIn(t)).toEqual(day(2026, 11, 25));
  });
});

describe("profileError and changedProfileWrites", () => {
  const today = day(2026, 11, 24);
  it("needs goal weight and its unit together", () => {
    expect(profileError({ dob: {}, goalWeight: 200 }, today)).toMatch(/unit/);
    expect(profileError({ dob: {}, goalWeightUnit: "kg" }, today)).toMatch(/unit/);
    expect(profileError({ dob: {}, goalWeight: 90, goalWeightUnit: "kg" }, today)).toBeNull();
  });

  it("writes only fields that changed", () => {
    const stored = { dob: { year: 1990 }, height: "180 cm", goalWeight: 90, goalWeightUnit: "kg" as const };
    const next = { ...stored, dob: {}, height: "181 cm" };
    expect(changedProfileWrites(stored, next)).toEqual({
      upserts: [{ key: "profile_height", value: "181 cm" }],
      deletes: ["profile_birth_year"],
    });
  });

  it("rejects decimals in the date of birth", () => {
    expect(dobError({ year: 1990.5 }, today)).toMatch(/whole numbers/);
  });
});
