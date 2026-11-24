import { describe, expect, it } from "vitest";

import {
  checkInDayFor,
  checkInRecordDates,
  checkInReminderDue,
  checkInStatus,
  isWeighInDue,
  readSchedule,
} from "@/lib/coaching/schedule";

const NY = "America/New_York";
// 2026-11-23 is a Monday.
const at = (iso: string) => new Date(iso);

describe("readSchedule", () => {
  it("has no default", () => {
    expect(readSchedule([])).toEqual({ reminder: false });
  });
  it("reads frequency, weekday and reminder", () => {
    expect(
      readSchedule([
        { key: "weigh_in_frequency", value: "weekly" },
        { key: "check_in_day", value: "monday" },
        { key: "check_in_reminder", value: "true" },
      ])
    ).toEqual({ weighInFrequency: "weekly", checkInWeekday: 1, reminder: true });
  });
});

describe("isWeighInDue", () => {
  const now = at("2026-11-24T15:00:00Z"); // Tue 10:00 in New York
  it("no schedule: never due", () => {
    expect(isWeighInDue({}, NY, null, now)).toBe(false);
  });
  it("due when there has never been a weigh-in", () => {
    expect(isWeighInDue({ weighInFrequency: "weekly" }, NY, null, now)).toBe(true);
  });
  it("daily", () => {
    expect(isWeighInDue({ weighInFrequency: "daily" }, NY, at("2026-11-24T12:00:00Z"), now)).toBe(false);
    expect(isWeighInDue({ weighInFrequency: "daily" }, NY, at("2026-11-23T23:00:00Z"), now)).toBe(true);
  });
  it("weekly", () => {
    expect(isWeighInDue({ weighInFrequency: "weekly" }, NY, at("2026-11-18T15:00:00Z"), now)).toBe(false); // 6 days
    expect(isWeighInDue({ weighInFrequency: "weekly" }, NY, at("2026-11-17T15:00:00Z"), now)).toBe(true); // 7 days
  });
  it("every 2 weeks", () => {
    expect(isWeighInDue({ weighInFrequency: "biweekly" }, NY, at("2026-11-11T15:00:00Z"), now)).toBe(false); // 13
    expect(isWeighInDue({ weighInFrequency: "biweekly" }, NY, at("2026-11-10T15:00:00Z"), now)).toBe(true); // 14
  });
  it("uses the user's local date at time-zone edges", () => {
    // 23:30 on the 23rd in New York is 04:30 UTC on the 24th.
    const last = at("2026-11-24T04:30:00Z");
    const lateNight = at("2026-11-24T04:45:00Z"); // still the 23rd in New York
    expect(isWeighInDue({ weighInFrequency: "daily" }, NY, last, lateNight)).toBe(false);
    // 04:00 UTC on the 24th is the 23rd in New York, but already the 24th in UTC.
    const prev = at("2026-11-23T20:00:00Z"); // the 23rd in both zones
    expect(isWeighInDue({ weighInFrequency: "daily" }, NY, prev, at("2026-11-24T04:00:00Z"))).toBe(false);
    expect(isWeighInDue({ weighInFrequency: "daily" }, "UTC", prev, at("2026-11-24T04:00:00Z"))).toBe(true);
  });
});

describe("checkInStatus (check-in day Monday)", () => {
  const monday = { checkInWeekday: 1 };
  const nyNoon = (ymd: string) => at(`${ymd}T17:00:00Z`);

  it("no schedule: none", () => {
    expect(checkInStatus({}, NY, null, nyNoon("2026-11-23"))).toEqual({ state: "none" });
  });

  it("first check-in: due on the day, early 1–2 days before, otherwise not due", () => {
    expect(checkInStatus(monday, NY, null, nyNoon("2026-11-23"))).toEqual({ state: "due", dueDate: "2026-11-23" });
    expect(checkInStatus(monday, NY, null, nyNoon("2026-11-21"))).toEqual({ state: "early", dueDate: "2026-11-23" });
    expect(checkInStatus(monday, NY, null, nyNoon("2026-11-20"))).toEqual({ state: "not_due", dueDate: "2026-11-23" });
  });

  it("after a check-in, the next one is a week later", () => {
    expect(checkInStatus(monday, NY, "2026-11-16", nyNoon("2026-11-19"))).toEqual({ state: "not_due", dueDate: "2026-11-23" });
    expect(checkInStatus(monday, NY, "2026-11-16", nyNoon("2026-11-23"))).toMatchObject({ state: "due" });
  });

  it("an early check-in counts for that week", () => {
    expect(checkInDayFor("2026-11-21", 1)).toBe("2026-11-23"); // Saturday → Monday
    expect(checkInStatus(monday, NY, "2026-11-21", nyNoon("2026-11-23"))).toEqual({ state: "not_due", dueDate: "2026-11-30" });
  });

  it("late up to 14 days, then missed", () => {
    expect(checkInStatus(monday, NY, "2026-11-09", nyNoon("2026-11-24"))).toEqual({ state: "late", dueDate: "2026-11-16", daysLate: 8 });
    expect(checkInStatus(monday, NY, "2026-11-09", nyNoon("2026-11-30"))).toEqual({ state: "late", dueDate: "2026-11-16", daysLate: 14 });
    expect(checkInStatus(monday, NY, "2026-11-09", nyNoon("2026-12-01"))).toEqual({ state: "missed", dueDate: "2026-11-16", daysLate: 15 });
  });

  it("uses the user's local date", () => {
    // 02:00 UTC Tuesday is still Monday evening in New York.
    expect(checkInStatus(monday, NY, "2026-11-16", at("2026-11-24T02:00:00Z"))).toMatchObject({ state: "due" });
    expect(checkInStatus(monday, "UTC", "2026-11-16", at("2026-11-24T02:00:00Z"))).toMatchObject({ state: "late", daysLate: 1 });
  });
});

describe("check-in records and the push reminder", () => {
  const base = [
    { key: "check_in_day", value: "Monday" },
    { key: "check_in_reminder", value: "true" },
    { key: "check_in_calories_key", value: "calories" },
    { key: "check_in_2026-11-16", value: "{}" },
    { key: "check_in_not-a-date", value: "{}" },
  ];
  const mondayMorning = at("2026-11-23T11:00:00Z"); // the morning cron run, 06:00 in New York

  it("reads only dated records", () => {
    expect(checkInRecordDates(base)).toEqual(["2026-11-16"]);
  });

  it("reminds on the check-in day when on and not done", () => {
    expect(checkInReminderDue(base, NY, mondayMorning)).toBe(true);
  });

  it("does not remind when off, done, or not the day", () => {
    expect(checkInReminderDue(base.map((p) => (p.key === "check_in_reminder" ? { ...p, value: "false" } : p)), NY, mondayMorning)).toBe(false);
    expect(checkInReminderDue([...base, { key: "check_in_2026-11-22", value: "{}" }], NY, mondayMorning)).toBe(false);
    expect(checkInReminderDue(base, NY, at("2026-11-24T11:00:00Z"))).toBe(false); // late, not the day
    // After a missed week, it reminds again on the next check-in day.
    expect(checkInReminderDue(base, NY, at("2026-11-30T11:00:00Z"))).toBe(true);
    expect(checkInReminderDue([{ key: "check_in_reminder", value: "true" }], NY, mondayMorning)).toBe(false); // no day set
  });
});
