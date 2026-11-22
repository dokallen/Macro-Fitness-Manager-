import { describe, expect, it } from "vitest";

import { getUtcWeekMondayDateString } from "@/lib/meals/week";

describe("getUtcWeekMondayDateString", () => {
  it("returns the same date for a Monday", () => {
    expect(getUtcWeekMondayDateString(new Date("2026-11-23T00:00:00Z"))).toBe(
      "2026-11-23"
    );
  });

  it("returns the preceding Monday for mid-week dates and Saturday", () => {
    // Wednesday
    expect(getUtcWeekMondayDateString(new Date("2026-11-25T12:00:00Z"))).toBe(
      "2026-11-23"
    );
    // Saturday, last second
    expect(getUtcWeekMondayDateString(new Date("2026-11-28T23:59:59Z"))).toBe(
      "2026-11-23"
    );
  });

  it("treats Sunday as the end of the week, not the start", () => {
    expect(getUtcWeekMondayDateString(new Date("2026-11-22T12:00:00Z"))).toBe(
      "2026-11-16"
    );
  });

  it("crosses month and year boundaries", () => {
    // Wednesday 2 Dec 2026 -> Monday 30 Nov 2026
    expect(getUtcWeekMondayDateString(new Date("2026-12-02T08:00:00Z"))).toBe(
      "2026-11-30"
    );
    // Friday 1 Jan 2027 -> Monday 28 Dec 2026
    expect(getUtcWeekMondayDateString(new Date("2027-01-01T08:00:00Z"))).toBe(
      "2026-12-28"
    );
  });

  it("uses the UTC day, not the local day", () => {
    // 02:00 Monday at UTC+09:00 is still Sunday in UTC.
    expect(
      getUtcWeekMondayDateString(new Date("2026-11-23T02:00:00+09:00"))
    ).toBe("2026-11-16");
  });
});
