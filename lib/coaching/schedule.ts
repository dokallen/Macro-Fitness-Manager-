import { CHECK_IN_EARLY_DAYS, CHECK_IN_LATE_MAX_DAYS } from "@/lib/coaching/constants";
import { addDays, daysBetween, isYmd, weekdayOf, ymdInZone } from "@/lib/coaching/ymd";

/**
 * Weigh-in and check-in schedule (Phase 2.6). Set by the user; there is no
 * default. No schedule means never due, and the app says nothing.
 */
export const SCHEDULE_KEYS = {
  weighInFrequency: "weigh_in_frequency",
  weighInSnoozedDate: "weigh_in_snoozed_date",
  checkInDay: "check_in_day",
  checkInReminder: "check_in_reminder",
  caloriesKey: "check_in_calories_key",
} as const;

export const WEIGH_IN_FREQUENCIES = ["daily", "weekly", "biweekly"] as const;
export type WeighInFrequency = (typeof WEIGH_IN_FREQUENCIES)[number];
export const WEIGH_IN_FREQUENCY_LABELS: Record<WeighInFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
};
const FREQUENCY_DAYS: Record<WeighInFrequency, number> = { daily: 1, weekly: 7, biweekly: 14 };

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const WEIGH_IN_RECOMMENDATION =
  "Weigh in at least weekly, on the same day and at the same time, for example in the morning before eating. Daily weigh-ins give a smoother trend.";

export type Schedule = {
  weighInFrequency?: WeighInFrequency;
  /** 0 = Sunday … 6 = Saturday */
  checkInWeekday?: number;
  reminder: boolean;
};

type Pref = { key: string; value: string | null };

export function readSchedule(prefs: readonly Pref[]): Schedule {
  const get = (k: string) => prefs.find((p) => p.key === k)?.value?.trim() ?? "";
  const freq = WEIGH_IN_FREQUENCIES.find((f) => f === get(SCHEDULE_KEYS.weighInFrequency).toLowerCase());
  const day = WEEKDAY_NAMES.findIndex((d) => d.toLowerCase() === get(SCHEDULE_KEYS.checkInDay).toLowerCase());
  return {
    ...(freq ? { weighInFrequency: freq } : {}),
    ...(day >= 0 ? { checkInWeekday: day } : {}),
    reminder: get(SCHEDULE_KEYS.checkInReminder).toLowerCase() === "true",
  };
}

/** Check-in records are `check_in_YYYY-MM-DD` preferences. */
export const CHECK_IN_RECORD_PREFIX = "check_in_";
const RECORD_RE = /^check_in_(\d{4}-\d{2}-\d{2})$/;

export function checkInRecordKey(ymd: string): string {
  return `${CHECK_IN_RECORD_PREFIX}${ymd}`;
}

export function checkInRecordDates(prefs: readonly Pref[]): string[] {
  return prefs
    .map((p) => RECORD_RE.exec(p.key)?.[1])
    .filter((d): d is string => Boolean(d && isYmd(d)))
    .sort();
}

/**
 * Is a weigh-in due today (the user's local date)? Due when there has never
 * been one, or when the frequency's number of days has passed since the last.
 */
export function isWeighInDue(
  schedule: Pick<Schedule, "weighInFrequency">,
  timeZone: string | null | undefined,
  lastWeighIn: Date | null,
  now: Date
): boolean {
  if (!schedule.weighInFrequency) return false;
  if (!lastWeighIn) return true;
  const today = ymdInZone(now, timeZone);
  const last = ymdInZone(lastWeighIn, timeZone);
  return daysBetween(last, today) >= FREQUENCY_DAYS[schedule.weighInFrequency];
}

export type CheckInStatus =
  | { state: "none" }
  | { state: "not_due"; dueDate: string }
  | { state: "early"; dueDate: string }
  | { state: "due"; dueDate: string }
  | { state: "late"; dueDate: string; daysLate: number }
  | { state: "missed"; dueDate: string; daysLate: number };

/** The check-in weekday that falls in [from, from + 6]. */
function weekdayOnOrAfter(from: string, weekday: number): string {
  return addDays(from, (weekday - weekdayOf(from) + 7) % 7);
}

/**
 * Which check-in a date belongs to: the check-in day in [date − 4, date + 2]
 * (a check-in done up to 2 days early or up to 4 days late counts for that week).
 */
export function checkInDayFor(date: string, weekday: number): string {
  return weekdayOnOrAfter(addDays(date, -(7 - 1 - CHECK_IN_EARLY_DAYS)), weekday);
}

/**
 * Status of the next check-in on the user's local date.
 * - not_due: more than 2 days before the next check-in day
 * - early: 1–2 days before (the user may start it)
 * - due: on the check-in day
 * - late: 1–14 days after
 * - missed: more than 14 days after
 */
export function checkInStatus(
  schedule: Pick<Schedule, "checkInWeekday">,
  timeZone: string | null | undefined,
  lastCheckIn: string | null,
  now: Date
): CheckInStatus {
  if (schedule.checkInWeekday === undefined) return { state: "none" };
  const today = ymdInZone(now, timeZone);
  const dueDate = lastCheckIn
    ? addDays(checkInDayFor(lastCheckIn, schedule.checkInWeekday), 7)
    : weekdayOnOrAfter(today, schedule.checkInWeekday); // first one: today or the next check-in day
  const d = daysBetween(dueDate, today);
  if (d < -CHECK_IN_EARLY_DAYS) return { state: "not_due", dueDate };
  if (d < 0) return { state: "early", dueDate };
  if (d === 0) return { state: "due", dueDate };
  if (d <= CHECK_IN_LATE_MAX_DAYS) return { state: "late", dueDate, daysLate: d };
  return { state: "missed", dueDate, daysLate: d };
}

/**
 * Should the morning push remind this user to check in? Only on the check-in
 * weekday, only if they turned the reminder on, and only if a check-in is
 * waiting (due, or still outstanding from an earlier week).
 */
export function checkInReminderDue(prefs: readonly Pref[], timeZone: string | null | undefined, now: Date): boolean {
  const schedule = readSchedule(prefs);
  if (!schedule.reminder) return false;
  const dates = checkInRecordDates(prefs);
  if (schedule.checkInWeekday === undefined) return false;
  if (weekdayOf(ymdInZone(now, timeZone)) !== schedule.checkInWeekday) return false;
  const status = checkInStatus(schedule, timeZone, dates.at(-1) ?? null, now);
  return status.state === "due" || status.state === "late" || status.state === "missed";
}
