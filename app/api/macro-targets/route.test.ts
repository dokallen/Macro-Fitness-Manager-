import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type FakeSupabase } from "@/lib/test-utils/fake-supabase";

let fake: FakeSupabase;
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => fake.client }));

import { POST } from "@/app/api/macro-targets/route";

const PROFILE = {
  currentWeight: 228.8,
  currentWeightUnit: "lbs",
  goalWeight: 200,
  goalWeightUnit: "lbs",
  height: "6'0\"",
  biologicalSex: "male",
  activityLevel: "very active",
  primaryGoal: "fat loss",
};

const CLAUDE_REPLY = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        summary: "s",
        timeframe: "t",
        workoutFrequency: "w",
        weeklyPlan: "p",
        targets: [{ key: "calories", value: "2200", unit: "kcal" }],
        macroContext: { calories: "c", protein: "p", carbs: "c", fat: "f" },
      }),
    },
  ],
};

let sentBodies: { system: string; messages: { content: string }[] }[];

function req(body: unknown) {
  return new Request("http://localhost/api/macro-targets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  fake = createFakeSupabase({}, { id: "user-1" });
  sentBodies = [];
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sentBodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify(CLAUDE_REPLY), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    })
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function sentProfile() {
  const text = sentBodies[0]!.messages[0]!.content;
  return { text, profile: JSON.parse(text.slice(text.indexOf("{"), text.indexOf("}") + 1)) };
}

describe("/api/macro-targets", () => {
  it("works with a date of birth, sending a computed age", async () => {
    const res = await POST(req({ ...PROFILE, dateOfBirth: { year: 1990, month: 3, day: 14 } }));
    expect(res.status).toBe(200);
    const { profile } = sentProfile();
    expect(typeof profile.age).toBe("number");
    expect(profile.age).toBeGreaterThanOrEqual(35);
  });

  it("works without a date of birth, saying age is unknown", async () => {
    const res = await POST(req(PROFILE));
    expect(res.status).toBe(200);
    const { profile, text } = sentProfile();
    expect(String(profile.age)).toMatch(/^unknown/);
    expect(text).toMatch(/Age is unknown/);
    expect(sentBodies[0]!.system).toMatch(/never invent an age/);
  });

  it("ignores an age number sent by the client", async () => {
    await POST(req({ ...PROFILE, age: 99 }));
    expect(String(sentProfile().profile.age)).toMatch(/^unknown/);
  });

  it("rejects an invalid date of birth without calling Claude", async () => {
    const res = await POST(req({ ...PROFILE, dateOfBirth: { year: 1990, month: 2, day: 30 } }));
    expect(res.status).toBe(400);
    expect(sentBodies).toHaveLength(0);
  });

  it("requires a signed-in user", async () => {
    fake = createFakeSupabase({}, null);
    expect((await POST(req(PROFILE))).status).toBe(401);
  });
});
