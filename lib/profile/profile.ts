/**
 * The saved profile (Phase 2.5). Every field is a `profile_` preference, so it
 * can never be read as a macro target (see isNonMacroPreferenceKey).
 *
 * Date of birth is fully optional: year, month and day are each optional, but
 * a day needs a month and a month needs a year. Age is never stored; it is
 * computed from the date of birth whenever it is needed.
 */

export const PROFILE_KEYS = {
  birthYear: "profile_birth_year",
  birthMonth: "profile_birth_month",
  birthDay: "profile_birth_day",
  height: "profile_height",
  biologicalSex: "profile_biological_sex",
  activityLevel: "profile_activity_level",
  goalWeight: "profile_goal_weight",
  goalWeightUnit: "profile_goal_weight_unit",
} as const;

/** Same choices as onboarding (lib/validations onboardingStep2Schema). */
export const BIOLOGICAL_SEX_OPTIONS = ["female", "male", "other"] as const;
export const ACTIVITY_LEVEL_OPTIONS = [
  "sedentary",
  "lightly active",
  "moderately active",
  "very active",
] as const;
export const WEIGHT_UNITS = ["lbs", "kg"] as const;

export type BiologicalSex = (typeof BIOLOGICAL_SEX_OPTIONS)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVEL_OPTIONS)[number];
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export type PartialDob = { year?: number; month?: number; day?: number };

export type Profile = {
  dob: PartialDob;
  height?: string;
  biologicalSex?: BiologicalSex;
  activityLevel?: ActivityLevel;
  goalWeight?: number;
  goalWeightUnit?: WeightUnit;
};

/** A calendar day, independent of time zone. */
export type CalendarDate = { year: number; month: number; day: number };

/** Youngest age the app accepts (unchanged from the old onboarding age field). */
export const MIN_AGE = 13;
const MIN_BIRTH_YEAR = 1900;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Checks a partial date of birth. Returns an error message, or null when it is
 * valid (including when it is empty).
 */
export function dobError(dob: PartialDob, today: CalendarDate): string | null {
  const { year, month, day } = dob;
  if (year === undefined && month === undefined && day === undefined) return null;
  if ([year, month, day].some((v) => v !== undefined && !Number.isInteger(v))) {
    return "Use whole numbers for the date of birth.";
  }
  if (day !== undefined && month === undefined) return "Add the month to go with the day.";
  if (month !== undefined && year === undefined) return "Add the year to go with the month.";
  if (year === undefined) return null;
  if (!Number.isInteger(year) || year < MIN_BIRTH_YEAR || year > today.year) {
    return "Enter a valid birth year.";
  }
  if (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12)) {
    return "Enter a valid month.";
  }
  if (day !== undefined && month !== undefined) {
    if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return "Enter a valid day.";
  }
  const range = ageFromDob(dob, today);
  if (range && range.max < 0) return "That date is in the future.";
  if (range && range.max < MIN_AGE) return `You must be at least ${MIN_AGE}.`;
  return null;
}

/** Whole-profile check: the date of birth, and goal weight always with its unit. */
export function profileError(profile: Profile, today: CalendarDate): string | null {
  const dob = dobError(profile.dob, today);
  if (dob) return dob;
  if ((profile.goalWeight === undefined) !== (profile.goalWeightUnit === undefined)) {
    return "Give the goal weight together with its unit.";
  }
  return null;
}

/**
 * The writes that change `stored` into `next`, touching only fields that differ,
 * so a field saved by the Coach keeps its label unless the user changed it.
 */
export function changedProfileWrites(stored: Profile, next: Profile): {
  upserts: { key: string; value: string }[];
  deletes: string[];
} {
  const before = profileWrites(stored);
  const after = profileWrites(next);
  const old = new Map(before.upserts.map((u) => [u.key, u.value]));
  return {
    upserts: after.upserts.filter((u) => old.get(u.key) !== u.value),
    deletes: after.deletes.filter((k) => old.has(k)),
  };
}

export type AgeRange = { min: number; max: number };

/**
 * Age on `today` from a partial date of birth.
 * - Full date: exact.
 * - Month and year: the birthday is treated as the 1st of that month.
 * - Year only: a range, because the birthday may or may not have passed.
 * Returns null when no year is known.
 */
export function ageFromDob(dob: PartialDob, today: CalendarDate): AgeRange | null {
  if (dob.year === undefined) return null;
  if (dob.month === undefined) {
    const max = today.year - dob.year;
    return { min: max - 1, max };
  }
  const day = dob.day ?? 1;
  const hadBirthday =
    today.month > dob.month || (today.month === dob.month && today.day >= day);
  const age = today.year - dob.year - (hadBirthday ? 0 : 1);
  return { min: age, max: age };
}

/** "35" or "35–36" for display. Empty string when unknown. */
export function formatAge(range: AgeRange | null): string {
  if (!range) return "";
  return range.min === range.max ? String(range.max) : `${range.min}–${range.max}`;
}

/** What the AI is told about age: a number, both possible values, or that it is unknown. */
export function ageForAi(range: AgeRange | null): number | string {
  if (!range) return "unknown (the user has not given a date of birth)";
  return range.min === range.max ? range.max : `${range.min} or ${range.max} (birth year only)`;
}

/** Today's calendar date in a time zone (UTC when none). */
export function calendarDateIn(now: Date, timeZone?: string | null): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: n("year"), month: n("month"), day: n("day") };
}

function toInt(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  if (!/^\d+$/.test(t)) return undefined;
  return Number(t);
}

function oneOf<T extends string>(options: readonly T[], v: string | undefined): T | undefined {
  const t = v?.trim().toLowerCase();
  return options.find((o) => o === t);
}

/** Reads the profile from preference rows. Malformed values are ignored. */
export function readProfile(prefs: readonly { key: string; value: string | null }[]): Profile {
  const get = (k: string) => {
    const v = prefs.find((p) => p.key === k)?.value ?? undefined;
    return v?.trim() ? v : undefined;
  };
  const year = toInt(get(PROFILE_KEYS.birthYear));
  const month = year !== undefined ? toInt(get(PROFILE_KEYS.birthMonth)) : undefined;
  const day = month !== undefined ? toInt(get(PROFILE_KEYS.birthDay)) : undefined;
  const gw = Number(get(PROFILE_KEYS.goalWeight));
  const profile: Profile = {
    dob: {
      ...(year !== undefined ? { year } : {}),
      ...(month !== undefined ? { month } : {}),
      ...(day !== undefined ? { day } : {}),
    },
  };
  const height = get(PROFILE_KEYS.height)?.trim();
  if (height) profile.height = height;
  const sex = oneOf(BIOLOGICAL_SEX_OPTIONS, get(PROFILE_KEYS.biologicalSex));
  if (sex) profile.biologicalSex = sex;
  const activity = oneOf(ACTIVITY_LEVEL_OPTIONS, get(PROFILE_KEYS.activityLevel));
  if (activity) profile.activityLevel = activity;
  if (Number.isFinite(gw) && gw > 0) profile.goalWeight = gw;
  const unit = oneOf(WEIGHT_UNITS, get(PROFILE_KEYS.goalWeightUnit));
  if (unit) profile.goalWeightUnit = unit;
  return profile;
}

/**
 * The preference writes for a profile: rows to upsert and keys to delete
 * (fields the user cleared). Every field is written, so an edit fully replaces.
 */
export function profileWrites(profile: Profile): {
  upserts: { key: string; value: string }[];
  deletes: string[];
} {
  const fields: [string, string | number | undefined][] = [
    [PROFILE_KEYS.birthYear, profile.dob.year],
    [PROFILE_KEYS.birthMonth, profile.dob.month],
    [PROFILE_KEYS.birthDay, profile.dob.day],
    [PROFILE_KEYS.height, profile.height?.trim() || undefined],
    [PROFILE_KEYS.biologicalSex, profile.biologicalSex],
    [PROFILE_KEYS.activityLevel, profile.activityLevel],
    [PROFILE_KEYS.goalWeight, profile.goalWeight],
    [PROFILE_KEYS.goalWeightUnit, profile.goalWeightUnit],
  ];
  const upserts: { key: string; value: string }[] = [];
  const deletes: string[] = [];
  for (const [key, v] of fields) {
    if (v === undefined) deletes.push(key);
    else upserts.push({ key, value: String(v) });
  }
  return { upserts, deletes };
}

/** One-paragraph profile for the Coach and the target calculator. */
export function describeProfileForAi(profile: Profile, today: CalendarDate): Record<string, string | number> {
  return {
    age: ageForAi(ageFromDob(profile.dob, today)),
    height: profile.height ?? "unknown",
    biologicalSex: profile.biologicalSex ?? "unknown",
    activityLevel: profile.activityLevel ?? "unknown",
    goalWeight:
      profile.goalWeight !== undefined
        ? `${profile.goalWeight}${profile.goalWeightUnit ? ` ${profile.goalWeightUnit}` : ""}`
        : "unknown",
  };
}

/** Today's calendar date on this device (browser code). */
export function localCalendarDate(now: Date = new Date()): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}
