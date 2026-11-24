import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type FakeSupabase } from "@/lib/test-utils/fake-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined, getAll: () => [] }) }));

let fake: FakeSupabase;
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => fake.client }));

import { POST } from "@/app/api/coach-chat/route";

type SentBody = { system: string; messages: { role: string; content: unknown }[]; tools?: { name: string }[] };

let chatReply: unknown[];
const sent: SentBody[] = [];
const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body)) as SentBody;
  sent.push(body);
  // The chat turn carries tools; the follow-up title request does not.
  const content = body.tools ? chatReply : [{ type: "text", text: "Protein check" }];
  return new Response(JSON.stringify({ content }), { status: 200 });
});

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-real");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  sent.length = 0;
  fake = createFakeSupabase({
    user_preferences: [{ user_id: "user-1", key: "protein", value: "150 g" }],
    coach_conversations: [],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function post(body: Record<string, unknown>) {
  return POST(
    new Request("https://macro-fit.example/api/coach-chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("Coach chat with tools", () => {
  it("stores a tool call as a pending proposal and writes nothing else", async () => {
    chatReply = [
      { type: "text", text: "Let's bump protein." },
      {
        type: "tool_use",
        id: "toolu_1",
        name: "set_macro_targets",
        input: { targets: [{ key: "protein", value: 180, unit: "g" }] },
      },
    ];
    const res = await post({ content: "Set my protein to 180 g" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      messages: { role: string; content: string; proposals?: { status: string; summary: string }[] }[];
    };

    const reply = json.messages[json.messages.length - 1]!;
    expect(reply.role).toBe("coach");
    expect(reply.content).toBe("Let's bump protein.");
    expect(reply.proposals).toHaveLength(1);
    expect(reply.proposals![0]).toMatchObject({ status: "pending", summary: "Set Protein 180 g" });

    // The only writes are the conversation itself; the target is untouched.
    expect(fake.writes.every((w) => w.table === "coach_conversations")).toBe(true);
    expect(fake.tables.user_preferences).toEqual([{ user_id: "user-1", key: "protein", value: "150 g" }]);

    // The registry's tools were sent to Claude.
    expect(sent[0]!.tools!.map((t) => t.name)).toContain("set_macro_targets");
  });

  it("sends earlier proposals and their status back to Claude as text", async () => {
    fake.tables.coach_conversations!.push({
      id: "conv-1",
      user_id: "user-1",
      messages: [
        { role: "user", content: "Raise protein", timestamp: "2026-11-24T10:00:00Z", coachId: "drdata" },
        {
          role: "assistant",
          content: "Here you go.",
          timestamp: "2026-11-24T10:00:05Z",
          coachId: "drdata",
          proposals: [
            { id: "p1", action: "set_macro_targets", input: {}, summary: "Set Protein 180 g", status: "applied" },
          ],
        },
      ],
    });
    chatReply = [{ type: "text", text: "Nice work." }];
    const res = await post({ content: "Thanks", conversationId: "conv-1" });
    expect(res.status).toBe(200);
    const assistantTurn = sent[0]!.messages.find((m) => m.role === "assistant")!;
    expect(assistantTurn.content).toBe("Here you go.\n[Proposed: Set Protein 180 g — applied]");
  });

  it("keeps invalid tool input as a note instead of a proposal", async () => {
    chatReply = [
      { type: "tool_use", id: "t", name: "set_macro_targets", input: { targets: [{ key: "protein", value: 0 }] } },
    ];
    const res = await post({ content: "Set protein to zero" });
    const json = (await res.json()) as { messages: { proposals?: unknown[]; notes?: string[]; content: string }[] };
    const reply = json.messages[json.messages.length - 1]!;
    expect(reply.proposals).toBeUndefined();
    expect(reply.notes?.[0]).toContain("positive");
    expect(reply.content.length).toBeGreaterThan(0);
  });

  it("leaves a text-only reply unchanged", async () => {
    chatReply = [{ type: "text", text: "Drink some water." }];
    const res = await post({ content: "Hi" });
    const json = (await res.json()) as { messages: { content: string; proposals?: unknown }[] };
    const reply = json.messages[json.messages.length - 1]!;
    expect(reply).toMatchObject({ content: "Drink some water." });
    expect(reply.proposals).toBeUndefined();
  });

  it("offers the tools on the photo path too, with the image in the last user turn", async () => {
    chatReply = [
      {
        type: "tool_use",
        id: "t",
        name: "set_macro_targets",
        input: { targets: [{ key: "protein", value: 175, unit: "g" }] },
      },
    ];
    const res = await post({ content: "What about this meal?", imageBase64: "data:image/png;base64,AAAA" });
    expect(res.status).toBe(200);
    const body = sent[0]!;
    expect(body.tools!.map((t) => t.name)).toContain("set_macro_targets");
    const last = body.messages[body.messages.length - 1]!;
    expect(last.role).toBe("user");
    expect(last.content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
      { type: "text", text: "What about this meal?" },
    ]);
    expect(body.system).toContain("nothing changes until the user taps Apply");
    const json = (await res.json()) as { messages: { proposals?: { status: string }[] }[] };
    expect(json.messages[json.messages.length - 1]!.proposals?.[0]?.status).toBe("pending");
  });

  it("never turns a proposal applied during the Claude call back into pending", async () => {
    fake.tables.coach_conversations!.push({
      id: "conv-2",
      user_id: "user-1",
      updated_at: "2026-11-24T10:00:00.000Z",
      messages: [
        { role: "user", content: "Raise protein", timestamp: "t1", coachId: "drdata" },
        {
          role: "assistant",
          content: "Here you go.",
          timestamp: "t2",
          coachId: "drdata",
          proposals: [
            { id: "p9", action: "set_macro_targets", input: {}, summary: "Set Protein 180 g", status: "pending" },
          ],
        },
      ],
    });
    chatReply = [{ type: "text", text: "Anything else?" }];
    fetchMock.mockImplementationOnce(async (_u, init) => {
      sent.push(JSON.parse(String(init?.body)) as SentBody);
      // The user taps Apply in another tab while Claude is replying.
      const conv = fake.tables.coach_conversations!.find((c) => c.id === "conv-2")!;
      const msgs = conv.messages as { proposals?: Record<string, unknown>[] }[];
      msgs[1]!.proposals![0]!.status = "applied";
      conv.updated_at = "2026-11-24T10:00:07.000Z";
      return new Response(JSON.stringify({ content: chatReply }), { status: 200 });
    });
    const res = await post({ content: "Thanks", conversationId: "conv-2" });
    expect(res.status).toBe(200);
    const conv = fake.tables.coach_conversations!.find((c) => c.id === "conv-2")!;
    const msgs = conv.messages as { content: string; proposals?: { status: string }[] }[];
    expect(msgs[1]!.proposals![0]!.status).toBe("applied");
    expect(msgs[msgs.length - 1]!.content).toBe("Anything else?");
  });
});
