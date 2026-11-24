import { describe, expect, it } from "vitest";

import { convertWeight, findWeightMetric, isWeightMetricName, placeFirstWeighIn } from "@/lib/metrics/weight";

const LBS = { value: 228.8, unit: "lbs" as const };

describe("weight metric", () => {
  it("recognises weight by name only", () => {
    for (const n of ["Weight", "weight", "Body weight", "BODYWEIGHT", "Weight (lbs)"]) expect(isWeightMetricName(n), n).toBe(true);
    for (const n of ["Weight lifted", "Waist", "Body fat %"]) expect(isWeightMetricName(n), n).toBe(false);
    expect(findWeightMetric([{ name: "Waist" }, { name: "Body Weight" }])?.name).toBe("Body Weight");
  });

  it("converts lbs and kg", () => {
    expect(convertWeight(100, "kg", "lbs")).toBe(220.5);
    expect(convertWeight(228.8, "lbs", "kg")).toBe(103.8);
    expect(convertWeight(80, "kg", "kg")).toBe(80);
  });
});

describe("placeFirstWeighIn", () => {
  it("uses the Body composition weight metric in its own unit", () => {
    expect(placeFirstWeighIn(["Waist"], [{ name: "Body Weight", unit: "kg" }], LBS)).toEqual({
      progressNames: ["Waist"],
      metricName: "Body Weight",
      value: 103.8,
      unit: "kg",
    });
    expect(placeFirstWeighIn([], [{ name: "Weight", unit: "lbs" }], LBS)).toMatchObject({ value: 228.8, unit: "lbs" });
    expect(placeFirstWeighIn([], [{ name: "Weight", unit: "" }], LBS)).toMatchObject({ value: 228.8, unit: "lbs" });
  });

  it("reuses the one picked in onboarding", () => {
    expect(placeFirstWeighIn(["Weight", "Energy levels"], [], LBS)).toEqual({
      progressNames: ["Weight", "Energy levels"],
      metricName: "Weight",
      ...LBS,
    });
  });

  it("adds Weight when the user tracks none", () => {
    expect(placeFirstWeighIn(["Sleep quality"], [], LBS)).toEqual({
      progressNames: ["Sleep quality", "Weight"],
      metricName: "Weight",
      ...LBS,
    });
  });

  it("never mixes units into a body metric it can't convert to", () => {
    const out = placeFirstWeighIn([], [{ name: "Weight", unit: "stone" }], LBS);
    expect(out).toEqual({ progressNames: ["Weight (lbs)"], metricName: "Weight (lbs)", ...LBS });
  });

  it("reuses a unit-named progress metric only for that unit", () => {
    expect(placeFirstWeighIn(["Weight (lbs)"], [], { value: 100, unit: "kg" })).toEqual({
      progressNames: ["Weight (lbs)", "Weight (kg)"],
      metricName: "Weight (kg)",
      value: 100,
      unit: "kg",
    });
    expect(placeFirstWeighIn(["Weight (lbs)"], [], LBS)).toMatchObject({ metricName: "Weight (lbs)" });
  });
});
