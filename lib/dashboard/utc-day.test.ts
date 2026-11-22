import { afterEach, describe, expect, it, vi } from "vitest";

import { getUtcDayBounds } from "@/lib/dashboard/utc-day";

describe("getUtcDayBounds", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("spans the full UTC calendar day containing the given instant", () => {
    expect(getUtcDayBounds(new Date("2026-11-22T15:30:00.000Z"))).toEqual({
      start: "2026-11-22T00:00:00.000Z",
      end: "2026-11-22T23:59:59.999Z",
    });
  });

  it("uses the UTC date, not the local date, near midnight", () => {
    // 23:30 at UTC-05:00 is already the next day in UTC.
    expect(getUtcDayBounds(new Date("2026-11-22T23:30:00-05:00"))).toEqual({
      start: "2026-11-23T00:00:00.000Z",
      end: "2026-11-23T23:59:59.999Z",
    });
  });

  it("keeps the first and last millisecond of a day in that day", () => {
    const day = {
      start: "2026-11-22T00:00:00.000Z",
      end: "2026-11-22T23:59:59.999Z",
    };
    expect(getUtcDayBounds(new Date("2026-11-22T00:00:00.000Z"))).toEqual(day);
    expect(getUtcDayBounds(new Date("2026-11-22T23:59:59.999Z"))).toEqual(day);
  });

  it("handles year-end and leap days", () => {
    expect(getUtcDayBounds(new Date("2026-12-31T18:00:00Z"))).toEqual({
      start: "2026-12-31T00:00:00.000Z",
      end: "2026-12-31T23:59:59.999Z",
    });
    expect(getUtcDayBounds(new Date("2028-02-29T12:00:00Z"))).toEqual({
      start: "2028-02-29T00:00:00.000Z",
      end: "2028-02-29T23:59:59.999Z",
    });
  });

  it("defaults to the current time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T15:30:00.000Z"));
    expect(getUtcDayBounds()).toEqual({
      start: "2026-11-22T00:00:00.000Z",
      end: "2026-11-22T23:59:59.999Z",
    });
  });
});
