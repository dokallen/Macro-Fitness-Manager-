import { describe, expect, it } from "vitest";

import {
  extractMacroTargets,
  formatMacroLabel,
  NON_MACRO_PREFERENCE_KEYS,
  parseLeadingNumber,
} from "@/lib/dashboard/preferences";

describe("parseLeadingNumber", () => {
  it("reads the leading number from values with or without units", () => {
    expect(parseLeadingNumber("2200 kcal")).toBe(2200);
    expect(parseLeadingNumber("12.5 g")).toBe(12.5);
    expect(parseLeadingNumber("165")).toBe(165);
  });

  it("ignores surrounding whitespace", () => {
    expect(parseLeadingNumber("  180 g  ")).toBe(180);
  });

  it("returns null when the value does not start with a number", () => {
    expect(parseLeadingNumber("")).toBeNull();
    expect(parseLeadingNumber("about 200 g")).toBeNull();
    expect(parseLeadingNumber("-20 g")).toBeNull();
  });

  it("returns null for malformed numbers instead of NaN", () => {
    expect(parseLeadingNumber("1.2.3 g")).toBeNull();
    expect(parseLeadingNumber(". g")).toBeNull();
  });
});

describe("extractMacroTargets", () => {
  it("returns every numeric user-defined target with its raw display value", () => {
    expect(
      extractMacroTargets([
        { key: "calories", value: "2200 kcal" },
        { key: "protein", value: "180 g" },
        { key: "sodium_mg", value: "2300" },
      ])
    ).toEqual([
      { key: "calories", displayValue: "2200 kcal", targetNumber: 2200 },
      { key: "protein", displayValue: "180 g", targetNumber: 180 },
      { key: "sodium_mg", displayValue: "2300", targetNumber: 2300 },
    ]);
  });

  it("skips non-macro preference keys even when their values start with a number", () => {
    expect(
      extractMacroTargets([
        { key: "program_start", value: "2026-01-05" },
        { key: "water_goal_oz", value: "100" },
        { key: "meal_plan_rotation_day", value: "0" },
        { key: "fiber", value: "30 g" },
      ])
    ).toEqual([{ key: "fiber", displayValue: "30 g", targetNumber: 30 }]);
  });

  it("never treats any NON_MACRO_PREFERENCE_KEYS entry as a macro target", () => {
    const rows = Array.from(NON_MACRO_PREFERENCE_KEYS, (key) => ({
      key,
      value: "1",
    }));
    expect(extractMacroTargets(rows)).toEqual([]);
  });

  it("skips blank keys and values without a leading number", () => {
    expect(
      extractMacroTargets([
        { key: "   ", value: "50 g" },
        { key: "carbs", value: "as needed" },
      ])
    ).toEqual([]);
  });

  it("trims keys and display values", () => {
    expect(extractMacroTargets([{ key: "  fat  ", value: "  70 g " }])).toEqual(
      [{ key: "fat", displayValue: "70 g", targetNumber: 70 }]
    );
  });
});

describe("formatMacroLabel", () => {
  it("turns snake_case keys into title-cased labels", () => {
    expect(formatMacroLabel("protein")).toBe("Protein");
    expect(formatMacroLabel("net_carbs")).toBe("Net Carbs");
    expect(formatMacroLabel("sodium_mg")).toBe("Sodium Mg");
  });
});
