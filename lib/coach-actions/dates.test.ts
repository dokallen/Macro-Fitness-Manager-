import { describe, expect, it } from "vitest";

import { coachDateContext, localDateString, localNoon, userTimeZone } from "@/lib/coach-actions/dates";

describe("coach dates", () => {
  const late = new Date("2026-11-25T03:30:00.000Z"); // 22:30 on the 24th in New York

  it("uses the user's zone for today's date", () => {
    expect(localDateString(late, "America/New_York")).toBe("2026-11-24");
    expect(localDateString(late, null)).toBe("2026-11-25");
  });

  it("puts noon in the user's zone, across daylight saving", () => {
    expect(localNoon("2026-07-01", "America/New_York").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(localNoon("2026-12-01", "America/New_York").toISOString()).toBe("2026-12-01T17:00:00.000Z");
    expect(localNoon("2026-12-01", null).toISOString()).toBe("2026-12-01T12:00:00.000Z");
  });

  it("ignores a missing or invalid zone", () => {
    expect(userTimeZone([{ key: "notification_timezone", value: "Not/AZone" }])).toBeNull();
    expect(userTimeZone([])).toBeNull();
  });

  it("gives the Coach today's date", () => {
    expect(coachDateContext(late, [{ key: "notification_timezone", value: "America/New_York" }])).toContain(
      "2026-11-24 (time zone America/New_York)"
    );
    expect(coachDateContext(late, [])).toContain("time zone unknown");
  });
});
