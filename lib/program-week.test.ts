import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getProgramWeekNumberFromPreferencesRows,
  USER_PREFERENCE_KEY_PROGRAM_START,
} from "@/lib/program-week";

const NOW = new Date("2026-11-22T12:00:00.000Z");

function weekFor(programStart: string): number {
  return getProgramWeekNumberFromPreferencesRows([
    { key: "goal", value: "Build muscle" },
    { key: USER_PREFERENCE_KEY_PROGRAM_START, value: programStart },
  ]);
}

describe("getProgramWeekNumberFromPreferencesRows", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is week 1 for the first seven days of the program", () => {
    expect(weekFor("2026-11-22T12:00:00.000Z")).toBe(1);
    // One millisecond short of a full week.
    expect(weekFor("2026-11-15T12:00:00.001Z")).toBe(1);
  });

  it("advances exactly every seven days", () => {
    expect(weekFor("2026-11-15T12:00:00.000Z")).toBe(2);
    expect(weekFor("2026-11-08T12:00:00.000Z")).toBe(3);
  });

  it("accepts a date-only program_start", () => {
    // "2026-09-27" is midnight UTC: 8 weeks and 12 hours before NOW.
    expect(weekFor("2026-09-27")).toBe(9);
  });

  it("trims whitespace around program_start", () => {
    // A padded timestamp is an invalid date unless it is trimmed first,
    // which would fall back to week 1.
    expect(weekFor("  2026-09-27T00:00:00.000Z  ")).toBe(9);
  });

  it("falls back to week 1 when program_start is missing, blank, or invalid", () => {
    expect(getProgramWeekNumberFromPreferencesRows([])).toBe(1);
    expect(
      getProgramWeekNumberFromPreferencesRows([{ key: "goal", value: "Cut" }])
    ).toBe(1);
    expect(weekFor("   ")).toBe(1);
    expect(weekFor("not a date")).toBe(1);
  });

  it("never returns less than week 1 for a start date in the future", () => {
    expect(weekFor("2026-12-01")).toBe(1);
  });
});
