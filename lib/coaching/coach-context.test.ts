import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  COACH_TARGET_RULES,
  buildCheckInReviewRequest,
  calculatedTargetsProposal,
  loadCoachDataContext,
} from "@/lib/coaching/coach-context";
import { buildCheckInRecord, loadCheckInData, runCalculation } from "@/lib/coaching/check-in";
import { describeResult } from "@/lib/coaching/calc";
import { FIXTURE_NOW, FIXTURE_TODAY, coachingFixture } from "@/lib/test-utils/coaching-fixture";
import { createFakeSupabase } from "@/lib/test-utils/fake-supabase";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXTURE_NOW);
});
afterEach(() => vi.useRealTimers());

const client = (tables = coachingFixture()) => createFakeSupabase({ ...tables, check_ins: [] }).client as Parameters<typeof loadCoachDataContext>[0];

describe("Coach data context", () => {
  it("includes profile age, goal pace, targets, trend, burn, status, metric history and check-ins", async () => {
    const tables = coachingFixture();
    tables.user_preferences.push({
      user_id: "user-1",
      key: "check_in_2026-11-16",
      value: JSON.stringify({ date: "2026-11-16", decision: "hold", reason: "Need more weigh-ins.", trendWeight: 201.4, weightUnit: "lbs", averageIntake: 2380, loggingAnswer: "mostly" }),
    });
    const { text } = await loadCoachDataContext(client(tables), "user-1", FIXTURE_NOW);
    expect(text).toContain("use these numbers, never invent your own");
    expect(text).toContain(`Today: ${FIXTURE_TODAY}`);
    expect(text).toContain("Profile: age 36;");
    expect(text).toContain("Goal pace: lose 1% of body weight per week.");
    expect(text).toContain("Current targets: calories = 2200 kcal; protein = 180 g; carbs = 200 g; fat = 60 g.");
    expect(text).toMatch(/Trend weight: \d+\.\d lbs\./);
    expect(text).toMatch(/Estimated calorie burn: \d+ kcal\/day\./);
    expect(text).toContain("Check-in status: due (next check-in 2026-11-23).");
    // Last 8 entries per tracked metric, newest first, with dates.
    const waist = text.split("\n").find((l) => l.startsWith("- Waist:"))!;
    expect(waist.split(",")).toHaveLength(8);
    expect(waist).toMatch(/^- Waist: 2026-11-23 39.1 in, 2026-11-22 39.2 in/);
    expect(text).toContain("- 2026-11-16: held steady; Need more weigh-ins. Trend 201.4 lbs. Intake 2380 kcal. Logging: mostly.");
  });

  it("says age is unknown without a date of birth", async () => {
    const tables = coachingFixture();
    tables.user_preferences = tables.user_preferences.filter((p) => !p.key.startsWith("profile_birth"));
    const { text } = await loadCoachDataContext(client(tables), "user-1", FIXTURE_NOW);
    expect(text).toMatch(/Profile: age unknown/);
  });
});

describe("calculatedTargetsProposal", () => {
  it("proposes the calculated targets as a pending set_macro_targets card", async () => {
    const data = await loadCheckInData(client(), "user-1", FIXTURE_NOW);
    const r = calculatedTargetsProposal(data, () => "id-1");
    expect(r.proposal).toMatchObject({ id: "id-1", action: "set_macro_targets", status: "pending" });
    expect(r.resultText).toMatch(/Proposed: Calories 2200 →/);
  });

  it("explains a hold instead of proposing", async () => {
    const tables = coachingFixture();
    tables.user_preferences = tables.user_preferences.filter((p) => !p.key.startsWith("profile_goal_pace"));
    const data = await loadCheckInData(client(tables), "user-1", FIXTURE_NOW);
    const r = calculatedTargetsProposal(data, () => "id-1");
    expect(r.proposal).toBeNull();
    expect(r.resultText).toMatch(/Holding targets steady: Set a goal pace/);
  });
});

describe("system prompt rules", () => {
  it("covers proposals, calculated numbers only, Apply first, and asking once", () => {
    expect(COACH_TARGET_RULES).toMatch(/propose_calculated_targets; never work out new targets yourself/);
    expect(COACH_TARGET_RULES).toMatch(/only when the user asks or clearly agrees, or in a check-in review/);
    expect(COACH_TARGET_RULES).toMatch(/Nothing changes until the user taps Apply/);
    expect(COACH_TARGET_RULES).toMatch(/ask for it once\. If the user declines, accept that/);
  });
});

describe("check-in review request", () => {
  it("is built from the calculated numbers only", async () => {
    const data = await loadCheckInData(client(), "user-1", FIXTURE_NOW);
    const result = runCalculation(data, "yes");
    const record = buildCheckInRecord(data, result, "yes", FIXTURE_NOW, "p-1");
    const req = buildCheckInReviewRequest(record, describeResult(result));
    expect(req.system).toMatch(/Use only the numbers given below\. Do not calculate, estimate or invent/);
    expect(req.system).toMatch(/Say they can apply them\. Do not say they were changed/);
    expect(req.user).toContain(JSON.stringify(record, null, 2));
    expect(req.user).toContain(`Summary: ${describeResult(result)}`);
  });
});
