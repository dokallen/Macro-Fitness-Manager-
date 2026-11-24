import { describe, expect, it } from "vitest";

import { parseCheckInRecord, weighedSinceLastCheckIn, weighInsInOneUnit } from "@/lib/coaching/check-in";

describe("weighInsInOneUnit", () => {
  it("converts to the latest entry's unit; unit from entry, metric, name, or the user's unit", () => {
    const r = weighInsInOneUnit(
      [
        { metric_key: "Weight", value: 100, unit: "kg", logged_at: "2026-11-01T12:00:00Z" },
        { metric_key: "Weight", value: 99, unit: "", logged_at: "2026-11-02T12:00:00Z" }, // metric unit kg
        { metric_key: "Weight (lbs)", value: 219, unit: "", logged_at: "2026-11-03T12:00:00Z" }, // from the name
        { metric_key: "Body weight", value: 218, unit: "", logged_at: "2026-11-04T12:00:00Z" }, // user's unit
      ],
      new Map([["Weight", "kg"], ["Weight (lbs)", ""], ["Body weight", ""]]),
      "UTC",
      "lbs"
    );
    expect(r.unit).toBe("lbs");
    expect(r.weighIns).toEqual([
      { date: "2026-11-01", value: 220.5 },
      { date: "2026-11-02", value: 218.3 },
      { date: "2026-11-03", value: 219 },
      { date: "2026-11-04", value: 218 },
    ]);
  });

  it("counts an entry in an unusable unit as a weigh-in, but leaves it out of the math", () => {
    const r = weighInsInOneUnit(
      [
        { metric_key: "Weight", value: 220, unit: "lbs", logged_at: "2026-11-01T12:00:00Z" },
        { metric_key: "Weight", value: 15.7, unit: "stone", logged_at: "2026-11-02T12:00:00Z" },
      ],
      new Map(),
      "UTC"
    );
    expect(r.lastAt).toBe("2026-11-02T12:00:00Z");
    expect(r.weighIns).toEqual([{ date: "2026-11-01", value: 220 }]);
  });

  it("knows no unit when there is nothing to go on", () => {
    const r = weighInsInOneUnit([{ metric_key: "Weight", value: 90, unit: "", logged_at: "2026-11-01T12:00:00Z" }], new Map(), "UTC");
    expect(r).toMatchObject({ unit: null, weighIns: [], lastAt: "2026-11-01T12:00:00Z" });
  });
});

describe("weighedSinceLastCheckIn", () => {
  it("compares instants, so a weigh-in earlier on the check-in day doesn't count for next week", () => {
    const base = { lastCheckIn: "2026-11-16", lastCheckInAt: "2026-11-16T15:00:00Z", timeZone: "UTC" };
    expect(weighedSinceLastCheckIn({ ...base, lastWeighInAt: "2026-11-16T13:00:00Z" })).toBe(false);
    expect(weighedSinceLastCheckIn({ ...base, lastWeighInAt: "2026-11-16T16:00:00Z" })).toBe(true);
    expect(weighedSinceLastCheckIn({ ...base, lastWeighInAt: null })).toBe(false);
    expect(weighedSinceLastCheckIn({ ...base, lastCheckIn: null, lastCheckInAt: null, lastWeighInAt: "2026-11-01T00:00:00Z" })).toBe(true);
  });
});

describe("parseCheckInRecord", () => {
  it("reads only real records", () => {
    expect(parseCheckInRecord('{"date":"2026-11-23","decision":"hold"}')).toMatchObject({ date: "2026-11-23" });
    expect(parseCheckInRecord("{}")).toBeNull();
    expect(parseCheckInRecord("not json")).toBeNull();
  });
});
