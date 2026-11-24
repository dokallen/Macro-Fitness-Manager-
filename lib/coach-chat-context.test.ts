import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildCoachSystemPromptFromPreferences, isHiddenFromCoachPrompt } from "@/lib/coach-chat-context";

describe("Coach prompt preference list", () => {
  const rows = [
    { key: "goal", value: "Lose fat" },
    { key: "calories", value: "2200 kcal" },
    { key: "push_subscription", value: '{"endpoint":"https://push.example/secret","keys":{"auth":"abc"}}' },
    { key: "notification_morning_time", value: "07:00" },
    { key: "notification_last_sent_morning_motivation", value: "2026-11-22" },
    { key: "profile_birth_year", value: "1990" },
    { key: "weigh_in_snoozed_date", value: "2026-11-23" },
    { key: "check_in_2026-11-16", value: '{"date":"2026-11-16","decision":"hold"}' },
    { key: "favorite_snack", value: "almonds" },
  ];

  it("never sends the push token, app bookkeeping, or raw profile/check-in keys", () => {
    const prompt = buildCoachSystemPromptFromPreferences(rows, "drdata");
    for (const k of ["push_subscription", "notification_last_sent", "profile_birth_year", "weigh_in_snoozed", "check_in_2026"]) {
      expect(prompt, k).not.toContain(k);
    }
    expect(prompt).not.toContain("push.example");
  });

  it("still lists goals, current targets and other saved preferences", () => {
    const prompt = buildCoachSystemPromptFromPreferences(rows, "drdata");
    expect(prompt).toContain("goal: Lose fat");
    expect(prompt).toContain("Current macro targets:\ncalories: 2200 kcal");
    expect(prompt).toContain("favorite_snack: almonds");
  });

  it("keeps settings the Coach can change visible", () => {
    const prompt = buildCoachSystemPromptFromPreferences(
      [...rows, { key: "check_in_day", value: "Monday" }, { key: "weigh_in_frequency", value: "weekly" }],
      "drdata"
    );
    expect(prompt).toContain("notification_morning_time: 07:00");
    expect(prompt).toContain("check_in_day: Monday");
    expect(prompt).toContain("weigh_in_frequency: weekly");
    expect(isHiddenFromCoachPrompt("check_in_calories_key")).toBe(false);
    expect(isHiddenFromCoachPrompt("check_in_2026-11-16")).toBe(true);
  });
});
