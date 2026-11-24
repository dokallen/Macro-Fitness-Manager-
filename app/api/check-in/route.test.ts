import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addDays } from "@/lib/coaching/ymd";
import { createFakeSupabase, type FakeSupabase } from "@/lib/test-utils/fake-supabase";

let fake: FakeSupabase;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => fake.client }));

import { GET, POST } from "@/app/api/check-in/route";

// Monday 2026-11-23, 12:00 in New York.
const NOW = new Date("2026-11-23T17:00:00.000Z");
const TODAY = "2026-11-23";
const TZ = "America/New_York";

const basePrefs = [
  { key: "notification_timezone", value: TZ },
  { key: "check_in_day", value: "Monday" },
  { key: "weigh_in_frequency", value: "weekly" },
  { key: "profile_goal_pace_direction", value: "loss" },
  { key: "profile_goal_pace_percent", value: "1" },
  { key: "body_metric_keys", value: JSON.stringify([{ name: "Weight", unit: "lbs", better: "lower" }]) },
  { key: "calories", value: "2200 kcal" },
  { key: "protein", value: "180 g" },
  { key: "carbs", value: "200 g" },
  { key: "fat", value: "60 g" },
].map((p) => ({ user_id: "user-1", ...p }));

/** Noon New York time on a date. */
const noon = (ymd: string) => `${ymd}T17:00:00.000Z`;

function seed(opts: { prefs?: typeof basePrefs; weighIns?: number; logs?: boolean; conversation?: boolean } = {}) {
  const weighIns = Array.from({ length: opts.weighIns ?? 11 }, (_, i) => ({
    id: `w${i}`,
    user_id: "user-1",
    metric_key: "Weight",
    value: 203 - (i * 2) / 7,
    unit: "lbs",
    logged_at: noon(addDays(TODAY, -20 + i * 2)),
  }));
  const food_logs = opts.logs === false ? [] : Array.from({ length: 14 }, (_, i) => ({ id: `f${i}`, user_id: "user-1", logged_at: noon(addDays(TODAY, -i)) }));
  const food_log_macros = food_logs.map((f) => ({ food_log_id: f.id, key: "calories", value: 2400 }));
  fake = createFakeSupabase({
    user_preferences: opts.prefs ?? basePrefs,
    progress_entries: weighIns,
    food_logs,
    food_log_macros,
    coach_conversations: opts.conversation
      ? [{ id: "conv-1", user_id: "user-1", updated_at: "2026-11-22T10:00:00.000Z", messages: [{ role: "user", content: "hi", timestamp: "t" }] }]
      : [],
  });
}

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/check-in", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  // Never a real Claude call: no key, and any fetch fails.
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network in tests"); }));
  seed();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/check-in", () => {
  it("reports a due check-in and whether a weigh-in is due", async () => {
    const res = await GET(new Request(`http://localhost/api/check-in?tz=${encodeURIComponent(TZ)}`));
    const body = await res.json();
    expect(body).toMatchObject({ today: TODAY, status: { state: "due", dueDate: TODAY }, weighInDue: false, weighedSinceLastCheckIn: true, weightUnit: "lbs" });
  });

  it("says nothing is due with no schedule", async () => {
    seed({ prefs: basePrefs.filter((p) => !["check_in_day", "weigh_in_frequency"].includes(p.key)) });
    const body = await (await GET(new Request("http://localhost/api/check-in"))).json();
    expect(body).toMatchObject({ status: { state: "none" }, weighInDue: false });
  });
});

describe("POST /api/check-in", () => {
  it("proposes calculated targets in the chat and saves the record", async () => {
    seed({ conversation: true });
    const res = await post({ loggingAnswer: "yes", timeZone: TZ });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.record).toMatchObject({ date: TODAY, status: "due", loggingAnswer: "yes", decision: "change", weightUnit: "lbs", averageIntake: 2400, daysLogged: 14 });
    expect(body.proposal).toMatchObject({ status: "pending" });
    expect(body.proposal.summary).toMatch(/^Set Calories/);

    // The proposal is in the latest conversation, pending, not applied.
    const conv = fake.tables.coach_conversations![0]!;
    const last = (conv.messages as { content: string; proposals?: { id: string; action: string; status: string }[] }[]).at(-1)!;
    expect(last.content).toMatch(/^Weekly check-in\. Trend weight/);
    expect(last.proposals![0]).toMatchObject({ id: body.proposal.id, action: "set_macro_targets", status: "pending" });
    expect(fake.tables.user_preferences!.find((p) => p.key === "calories")!.value).toBe("2200 kcal");

    // Record format.
    const rec = fake.tables.user_preferences!.find((p) => p.key === `check_in_${TODAY}`)!;
    const parsed = JSON.parse(String(rec.value));
    expect(Object.keys(parsed).sort()).toEqual(
      ["averageIntake", "calculatedCalories", "changes", "completedAt", "date", "daysLogged", "decision", "dueDate", "estimatedBurn", "limitedByFloor", "loggingAnswer", "proposalId", "reason", "reasons", "status", "trendChangePerWeek", "trendWeight", "weightUnit"].sort()
    );
    // This fixture's 1%/week pace asks for a bigger cut than 10%, so the floor applies and is recorded.
    expect(parsed.limitedByFloor).toBe(true);
    expect(parsed.reason).toMatch(/capped at 10%/);
    expect(parsed.proposalId).toBe(body.proposal.id);
    expect(parsed.completedAt).toBe(NOW.toISOString());
  });

  it("posts the Coach's review, written from the calculated numbers only", async () => {
    seed({ conversation: true });
    const bodies: { system: string; messages: { content: string }[]; tools?: unknown }[] = [];
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-real");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ content: [{ type: "text", text: "Good week. Your trend is down; tap Apply for the new targets." }] }), { status: 200 });
      })
    );
    {
      const body = await (await post({ loggingAnswer: "yes", timeZone: TZ })).json();
      expect(bodies).toHaveLength(1);
      expect(bodies[0]!.tools).toBeUndefined();
      expect(bodies[0]!.system).toMatch(/Use only the numbers given below/);
      expect(bodies[0]!.messages[0]!.content).toContain(`"averageIntake": 2400`);
      expect(body.text).toBe("Weekly check-in. Good week. Your trend is down; tap Apply for the new targets.");
      const last = (fake.tables.coach_conversations![0]!.messages as { content: string }[]).at(-1)!;
      expect(last.content).toBe(body.text);
    }
  });

  it("keeps the user's own targets while the trend moves toward the goal", async () => {
    seed({ prefs: [...basePrefs, { user_id: "user-1", key: "check_in_own_targets", value: '{"reason":"Holiday travel","setAt":"2026-11-01T00:00:00Z"}' }] });
    const body = await (await post({ loggingAnswer: "yes", timeZone: TZ })).json();
    expect(body.record).toMatchObject({ decision: "hold", reasons: ["own_targets_on_track"] });
    expect(body.proposal).toBeUndefined();
  });

  it("brings the calculated targets back when the user's own targets aren't working", async () => {
    // Weight rising on a loss goal.
    seed({ prefs: [...basePrefs, { user_id: "user-1", key: "check_in_own_targets", value: '{"reason":"Holiday travel","setAt":"2026-11-01T00:00:00Z"}' }] });
    fake.tables.progress_entries = fake.tables.progress_entries!.map((e, i) => ({ ...e, value: 200 + i * 0.4 }));
    const body = await (await post({ loggingAnswer: "yes", timeZone: TZ })).json();
    expect(body.record.decision).toBe("change");
    expect(body.proposal).toBeDefined();
    expect(body.text).toMatch(/You're on your own targets \(Holiday travel\), but your trend isn't moving toward your goal/);
  });

  it("holds steady, with the reason, when logging was incomplete", async () => {
    const body = await (await post({ loggingAnswer: "no", timeZone: TZ })).json();
    expect(body.record).toMatchObject({ decision: "hold", reasons: ["logging_incomplete"] });
    expect(body.proposal).toBeUndefined();
    expect(body.text).toMatch(/Holding targets steady/);
    // A new conversation holds the check-in, after a user turn so the Coach keeps its review as context.
    expect(fake.tables.coach_conversations).toHaveLength(1);
    const msgs = fake.tables.coach_conversations![0]!.messages as { role: string; content: string }[];
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(msgs[0]!.content).toBe("Weekly check-in");
  });

  it("asks for a weigh-in first when there is none since the last check-in", async () => {
    vi.setSystemTime(new Date("2026-11-30T17:00:00.000Z")); // next Monday; last weigh-in was 2026-11-23
    seed({ prefs: [...basePrefs, { user_id: "user-1", key: "check_in_2026-11-24", value: "{}" }] });
    const res = await post({ loggingAnswer: "yes", timeZone: TZ });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ needsWeighIn: true });
  });

  it("asks which target is calories, remembers the answer, then runs", async () => {
    const prefs = basePrefs.map((p) => (p.key === "calories" ? { ...p, key: "budget", value: "2200" } : p));
    seed({ prefs });
    fake.tables.food_log_macros = fake.tables.food_log_macros!.map((m) => ({ ...m, key: "budget" }));
    const first = await (await post({ loggingAnswer: "yes", timeZone: TZ })).json();
    expect(first).toMatchObject({ needsCaloriesKey: true });
    expect(first.targetKeys).toContain("budget");
    expect(fake.tables.user_preferences!.some((p) => String(p.key).startsWith("check_in_2026"))).toBe(false);

    const second = await (await post({ loggingAnswer: "yes", timeZone: TZ, caloriesKey: "budget" })).json();
    expect(second.record.decision).toBe("change");
    expect(fake.tables.user_preferences!.find((p) => p.key === "check_in_calories_key")!.value).toBe("budget");
  });

  it("refuses when no check-in is due, and twice in one day", async () => {
    seed({ prefs: basePrefs.filter((p) => p.key !== "check_in_day") });
    expect((await post({ loggingAnswer: "yes" })).status).toBe(409);
    seed();
    await post({ loggingAnswer: "yes", timeZone: TZ });
    expect((await post({ loggingAnswer: "yes", timeZone: TZ })).status).toBe(409);
  });

  it("never adds today's check-in to the chat twice, and recovers a record that failed to save", async () => {
    seed({ conversation: true });
    const first = await (await post({ loggingAnswer: "yes", timeZone: TZ })).json();
    // As if the record write had failed after the chat write.
    fake.tables.user_preferences = fake.tables.user_preferences!.filter((p) => p.key !== `check_in_${TODAY}`);
    const res = await post({ loggingAnswer: "yes", timeZone: TZ });
    expect(res.status).toBe(200);
    const body = await res.json();
    // The record is saved, pointing at the proposal already in the chat; no second message.
    expect(body.record.proposalId).toBe(first.proposal.id);
    expect(fake.tables.coach_conversations![0]!.messages as unknown[]).toHaveLength(2);
    expect(fake.tables.user_preferences!.some((p) => p.key === `check_in_${TODAY}`)).toBe(true);
  });

  it("validates the body and the session", async () => {
    expect((await post({ loggingAnswer: "maybe" })).status).toBe(400);
    fake = createFakeSupabase({}, null);
    expect((await post({ loggingAnswer: "yes" })).status).toBe(401);
  });
});
