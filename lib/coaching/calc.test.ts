import { describe, expect, it } from "vitest";

import {
  averageIntake,
  calculateTargets,
  calorieTargetFor,
  describeResult,
  estimateBurn,
  holdReasons,
  identifyMacroRoles,
  scaleMacros,
  trendAt,
  trendSeries,
  type CalcInput,
} from "@/lib/coaching/calc";
import { KCAL_PER_KG } from "@/lib/coaching/constants";
import { addDays } from "@/lib/coaching/ymd";

const t = (key: string, displayValue: string) => ({ key, displayValue, targetNumber: parseFloat(displayValue) });
const TARGETS = [t("calories", "2200 kcal"), t("protein", "180 g"), t("carbs", "200 g"), t("fat", "60 g"), t("water", "100 oz")];

describe("trend weight", () => {
  it("starts at the first weigh-in", () => {
    expect(trendSeries([{ date: "2026-11-01", value: 200 }])[0]!.trend).toBe(200);
  });

  it("weights a weigh-in by the gap before it", () => {
    // alpha 0.1/day. A 1-day gap moves 10% of the way; a 5-day gap moves 1 − 0.9^5 = 40.951%.
    const oneDay = trendSeries([{ date: "2026-11-01", value: 200 }, { date: "2026-11-02", value: 190 }]);
    expect(oneDay[1]!.trend).toBeCloseTo(199, 6);
    const fiveDays = trendSeries([{ date: "2026-11-01", value: 200 }, { date: "2026-11-06", value: 190 }]);
    expect(fiveDays[1]!.trend).toBeCloseTo(200 - 10 * (1 - 0.9 ** 5), 6); // 195.9049
  });

  it("handles uneven gaps and same-day duplicates, in any order", () => {
    const s = trendSeries([
      { date: "2026-11-10", value: 196 },
      { date: "2026-11-01", value: 200 },
      { date: "2026-11-03", value: 199 },
      { date: "2026-11-03", value: 197 }, // averaged with 199 → 198
    ]);
    expect(s.map((p) => p.date)).toEqual(["2026-11-01", "2026-11-03", "2026-11-10"]);
    const t2 = 200 + (1 - 0.9 ** 2) * (198 - 200); // 199.62
    const t3 = t2 + (1 - 0.9 ** 7) * (196 - t2);
    expect(s[1]!.trend).toBeCloseTo(t2, 6);
    expect(s[2]!.trend).toBeCloseTo(t3, 6);
    expect(trendAt(s, "2026-11-05")!.date).toBe("2026-11-03");
    expect(trendAt(s, "2026-10-31")).toBeNull();
  });
});

describe("intake and burn", () => {
  it("averages only days with food logged", () => {
    expect(averageIntake({ "2026-11-01": 2000, "2026-11-03": 2400, "2026-10-01": 9999 }, "2026-11-01", "2026-11-14")).toEqual({
      average: 2200,
      daysLogged: 2,
    });
    expect(averageIntake({}, "2026-11-01", "2026-11-14")).toEqual({ average: null, daysLogged: 0 });
  });

  it("worked example: lbs", () => {
    // Average intake 2,400 kcal. Trend fell 2 lb over 14 days.
    // Energy from body: 2 lb × 3,500 kcal/lb = 7,000 kcal / 14 days = 500 kcal/day.
    // Burn = 2,400 − (−2 × 3,500) / 14 = 2,400 + 500 = 2,900 kcal/day.
    expect(estimateBurn(2400, -2, 14, "lbs")).toBe(2900);
  });

  it("worked example: kg and weight gain", () => {
    // Trend rose 0.5 kg over 14 days: 0.5 × 7,716.18 / 14 = 275.58 kcal/day stored.
    // Burn = 3,000 − 275.58 = 2,724.42.
    expect(estimateBurn(3000, 0.5, 14, "kg")).toBeCloseTo(3000 - (0.5 * KCAL_PER_KG) / 14, 6);
    expect(KCAL_PER_KG).toBeCloseTo(7716.18, 2);
  });
});

describe("calorie target for the goal pace", () => {
  it("loss: 0.5%/week of 200 lb = 1 lb/week = 500 kcal/day below burn", () => {
    expect(calorieTargetFor(2900, { direction: "loss", percentPerWeek: 0.5 }, 200, "lbs")).toBe(2400);
  });
  it("gain: 0.25%/week of 80 kg = 0.2 kg/week = 220.46 kcal/day above burn, rounded to 10", () => {
    expect(calorieTargetFor(2700, { direction: "gain", percentPerWeek: 0.25 }, 80, "kg")).toBe(2920);
  });
  it("maintain: burn, rounded to 10", () => {
    expect(calorieTargetFor(2504, { direction: "maintain" }, 200, "lbs")).toBe(2500);
  });
});

describe("hold-steady rules", () => {
  const good = {
    weighInsInWindow: [{ date: "2026-11-10", value: 200 }, { date: "2026-11-17", value: 199 }],
    loggingAnswer: "yes" as const,
    daysLoggedLastWeek: 5,
    missed: false,
  };
  it("passes good data", () => expect(holdReasons(good)).toEqual([]));
  it("fewer than 2 weigh-ins", () =>
    expect(holdReasons({ ...good, weighInsInWindow: [good.weighInsInWindow[0]!] })).toEqual(["not_enough_weigh_ins"]));
  it("2 weigh-ins less than 7 days apart", () =>
    expect(holdReasons({ ...good, weighInsInWindow: [{ date: "2026-11-10", value: 200 }, { date: "2026-11-16", value: 199 }] })).toEqual(["not_enough_weigh_ins"]));
  it("logging answer No (Mostly is fine)", () => {
    expect(holdReasons({ ...good, loggingAnswer: "no" })).toEqual(["logging_incomplete"]);
    expect(holdReasons({ ...good, loggingAnswer: "mostly" })).toEqual([]);
  });
  it("food logged on fewer than 5 of 7 days", () => expect(holdReasons({ ...good, daysLoggedLastWeek: 4 })).toEqual(["not_enough_logged_days"]));
  it("missed check-in", () => expect(holdReasons({ ...good, missed: true })).toEqual(["check_in_missed"]));
});

describe("macros", () => {
  it("identifies targets by key name or unit", () => {
    expect(identifyMacroRoles(TARGETS)).toEqual({ calories: "calories", protein: "protein", carbs: "carbs", fat: "fat", ambiguous: [] });
    expect(identifyMacroRoles([t("Energy budget", "2000 kcal"), t("Pro", "150 g")])).toMatchObject({ calories: "Energy budget", protein: "Pro" });
  });

  it("calories not identifiable: ambiguous or missing, unless remembered", () => {
    const two = [t("calories", "2200 kcal"), t("rest day calories", "1900 kcal")];
    expect(identifyMacroRoles(two).calories).toBeUndefined();
    expect(identifyMacroRoles(two, "calories").calories).toBe("calories");
    expect(identifyMacroRoles([t("budget", "2200")]).calories).toBeUndefined();
    expect(scaleMacros([t("budget", "2200")], { ambiguous: [] }, 2000)).toBeNull();
  });

  it("keeps protein, scales carbs and fat in proportion, leaves others alone", () => {
    // Protein 180 g × 4 = 720. New calories 2,400 → 1,680 kcal for carbs + fat.
    // Now: carbs 200 g × 4 = 800, fat 60 g × 9 = 540 → 1,340. Scale = 1,680 / 1,340 = 1.2537.
    // Carbs 200 × 1.2537 = 250.7 → 251. Fat 60 × 1.2537 = 75.2 → 75.
    const out = scaleMacros(TARGETS, identifyMacroRoles(TARGETS), 2400)!;
    expect(out).toEqual([
      { key: "calories", from: 2200, to: 2400, unit: "kcal" },
      { key: "carbs", from: 200, to: 251, unit: "g" },
      { key: "fat", from: 60, to: 75, unit: "g" },
    ]);
    expect(out.find((c) => c.key === "protein" || c.key === "water")).toBeUndefined();
  });

  it("handles real-world key names: fat_g, saturated fat, net carbs", () => {
    const keys = [t("calories", "2000 kcal"), t("protein_g", "150 g"), t("carbs_g", "200 g"), t("fat_g", "60 g")];
    expect(identifyMacroRoles(keys)).toMatchObject({ protein: "protein_g", carbs: "carbs_g", fat: "fat_g", ambiguous: [] });
    const extra = [...TARGETS, t("saturated_fat", "20 g"), t("net_carbs", "150 g")];
    expect(identifyMacroRoles(extra)).toMatchObject({ fat: "fat", carbs: "carbs", ambiguous: [] });
  });

  it("holds rather than guess when a macro role is ambiguous", () => {
    const two = [t("calories", "2000 kcal"), t("protein shake", "40 g"), t("protein meals", "120 g"), t("carbs", "200 g"), t("fat", "60 g")];
    const roles = identifyMacroRoles(two);
    expect(roles.ambiguous).toEqual(["protein"]);
    expect(scaleMacros(two, roles, 2400)).toBeNull();
  });

  it("never proposes zero or negative values", () => {
    expect(scaleMacros(TARGETS, identifyMacroRoles(TARGETS), 0)).toBeNull();
    expect(scaleMacros([t("calories", "2200 kcal")], identifyMacroRoles([t("calories", "2200 kcal")]), -100)).toBeNull();
  });

  it("keeps the user's own format: no unit added", () => {
    const plain = [t("calories", "2200"), t("protein", "150")];
    expect(scaleMacros(plain, identifyMacroRoles(plain), 2400)).toEqual([{ key: "calories", from: 2200, to: 2400, unit: "" }]);
  });

  it("can't fit carbs and fat when protein alone exceeds the calories", () => {
    expect(scaleMacros(TARGETS, identifyMacroRoles(TARGETS), 700)).toBeNull();
  });
});

describe("calculateTargets", () => {
  const today = "2026-11-23";
  // Steady 1 lb/week loss on 2,400 kcal: weigh-ins every 2 days for 3 weeks.
  const weighIns = Array.from({ length: 11 }, (_, i) => ({ date: addDays(today, -20 + i * 2), value: 203 - (i * 2) / 7 }));
  const dailyCalories = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [addDays(today, -i), 2400]));
  const input: CalcInput = {
    today,
    weighIns,
    weightUnit: "lbs",
    dailyCalories,
    loggingAnswer: "yes",
    missed: false,
    pace: { direction: "loss", percentPerWeek: 1 },
    targets: TARGETS,
  };

  it("proposes a change built only from calculated numbers", () => {
    const r = calculateTargets(input);
    expect(r.decision).toBe("change");
    expect(r.holdReasons).toEqual([]);
    expect(r.averageIntake).toBe(2400);
    // Trend lags the raw data but shows a loss, so burn is above intake.
    expect(r.estimatedBurn!).toBeGreaterThan(2400);
    expect(r.changes[0]).toMatchObject({ key: "calories", from: 2200, to: r.newCalories });
    expect(describeResult(r)).toMatch(/Proposed: Calories 2200 →/);
  });

  it("holds with every reason that applies, and says why", () => {
    const r = calculateTargets({ ...input, weighIns: weighIns.slice(-1), loggingAnswer: "no", pace: null });
    expect(r.decision).toBe("hold");
    expect(r.holdReasons).toEqual(["not_enough_weigh_ins", "logging_incomplete", "no_goal_pace"]);
    expect(r.changes).toEqual([]);
    expect(describeResult(r)).toMatch(/^Trend weight .*Holding targets steady/);
  });

  it("holds and asks when calories can't be identified", () => {
    const r = calculateTargets({ ...input, targets: [t("budget", "2200"), t("protein", "180 g")] });
    expect(r.holdReasons).toEqual(["calories_unknown"]);
  });

  it("holds when the result is zero or below", () => {
    // Fast weight gain while eating little gives a tiny burn; a steep loss pace pushes it below zero.
    const gaining = Array.from({ length: 8 }, (_, i) => ({ date: addDays(today, -14 + i * 2), value: 300 + i * 3 }));
    const lowIntake = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [addDays(today, -i), 1200]));
    const r = calculateTargets({ ...input, weighIns: gaining, dailyCalories: lowIntake, pace: { direction: "loss", percentPerWeek: 1.5 } });
    expect(r).toMatchObject({ decision: "hold", holdReasons: ["target_not_positive"] });
  });

  it("every-2-weeks weigh-ins (14 days apart) are enough", () => {
    const r = calculateTargets({ ...input, weighIns: [{ date: addDays(today, -14), value: 202 }, { date: today, value: 200 }] });
    expect(r.holdReasons).not.toContain("not_enough_weigh_ins");
  });

  it("averages only days with a calorie entry, but counts every logged day for the hold rule", () => {
    const fiveWithCalories = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [addDays(today, -i), 2400]));
    const r = calculateTargets({
      ...input,
      dailyCalories: fiveWithCalories,
      loggedDays: Array.from({ length: 7 }, (_, i) => addDays(today, -i)),
    });
    expect(r.averageIntake).toBe(2400);
    expect(r.daysLoggedLastWeek).toBe(7);
  });

  it("holds when the calculated targets equal the current ones", () => {
    const r1 = calculateTargets(input);
    const same = TARGETS.map((x) => {
      const c = r1.changes.find((ch) => ch.key === x.key);
      return c ? t(x.key, `${c.to} ${c.unit}`) : x;
    });
    const r2 = calculateTargets({ ...input, targets: same });
    expect(r2).toMatchObject({ decision: "hold", holdReasons: [] });
    expect(describeResult(r2)).toMatch(/match your current ones/);
  });
});
