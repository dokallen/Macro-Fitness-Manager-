import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FIXTURE_NOW, coachingFixture } from "@/lib/test-utils/coaching-fixture";
import { createFakeSupabase, type FakeSupabase } from "@/lib/test-utils/fake-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, getAll: () => [] }) }));

let fake: FakeSupabase;
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => fake.client }));

import { POST } from "@/app/api/coach-chat/route";

type Sent = {
  system: string;
  messages: { role: string; content: unknown }[];
  tools?: { name: string }[];
  tool_choice?: { type: string };
};
const sent: Sent[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXTURE_NOW);
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-real");
  sent.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Sent;
      sent.push(body);
      const last = body.messages.at(-1)!;
      const hasToolResult = Array.isArray(last.content) && (last.content as { type: string }[]).some((b) => b.type === "tool_result");
      const content = hasToolResult
        ? [{ type: "text", text: "Here is what the numbers say. Tap Apply if you want it." }]
        : body.tools
          ? [
              { type: "text", text: "Let me guess: 1800 kcal." },
              { type: "tool_use", id: "toolu_calc", name: "propose_calculated_targets", input: {} },
              { type: "tool_use", id: "toolu_made_up", name: "set_macro_targets", input: { targets: [{ key: "calories", value: 1800 }] } },
            ]
          : [{ type: "text", text: "Title" }];
      return new Response(JSON.stringify({ content }), { status: 200 });
    })
  );
  fake = createFakeSupabase({ ...coachingFixture(), coach_conversations: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const post = (content: string) =>
  POST(new Request("https://x.example/api/coach-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) }));

describe("Coach: adjust my macros", () => {
  it("gives the Coach the user's data and rules, runs the server calculation, and proposes the result", async () => {
    const res = await post("Adjust my macros");
    expect(res.status).toBe(200);

    // First call: system has the rules and the data; the calculation tool is offered.
    expect(sent[0]!.system).toMatch(/Target rules:/);
    expect(sent[0]!.system).toMatch(/USER DATA \(from the app/);
    expect(sent[0]!.system).toMatch(/Profile: age 36/);
    expect(sent[0]!.tools!.map((t) => t.name)).toContain("propose_calculated_targets");

    // Second call: every tool use gets a result; tools stay defined (the API requires it)
    // but tool_choice "none" means no new calls, so no loop.
    const follow = sent[1]!;
    expect(follow.tools!.map((t) => t.name)).toContain("propose_calculated_targets");
    expect(follow.tool_choice).toEqual({ type: "none" });
    const results = follow.messages.at(-1)!.content as { type: string; tool_use_id: string; content: string }[];
    expect(results.map((r) => r.tool_use_id)).toEqual(["toolu_calc", "toolu_made_up"]);
    expect(results[0]!.content).toMatch(/Proposed: Calories 2200 →.*nothing has changed yet/);
    expect(results[1]!.content).toMatch(/^Not shown/);

    const json = (await res.json()) as { messages: { content: string; proposals?: { status: string; summary: string }[] }[] };
    const reply = json.messages.at(-1)!;
    // Only the explanation written after the calculation; the guessed number is dropped.
    expect(reply.content).toBe("Here is what the numbers say. Tap Apply if you want it.");
    // Only the calculated targets; the made-up set_macro_targets call is not offered.
    expect(reply.proposals).toHaveLength(1);
    expect(reply.proposals![0]).toMatchObject({ status: "pending" });
    expect(reply.proposals![0]!.summary).toMatch(/^Set Calories/);
    // Nothing applied.
    expect(fake.tables.user_preferences!.find((p) => p.key === "calories")!.value).toBe("2200 kcal");
  });

  it("tells the Coach not to propose targets when the data can't be loaded", async () => {
    // Break the data load: progress_entries queries throw.
    const client = fake.client as { from: (t: string) => unknown };
    const original = client.from.bind(client);
    client.from = (t: string) => {
      if (t === "progress_entries") throw new Error("db down");
      return original(t);
    };
    await post("Adjust my macros");
    expect(sent[0]!.system).toMatch(/Target calculation is unavailable right now/);
    expect(sent[0]!.tools!.map((t) => t.name)).not.toContain("propose_calculated_targets");
  });
});
