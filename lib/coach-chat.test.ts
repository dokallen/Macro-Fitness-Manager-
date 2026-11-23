import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib/coach-chat.ts is server-only; the guard package throws outside a server build.
vi.mock("server-only", () => ({}));

import { callCoachClaudeChat } from "@/lib/coach-chat";

// No network and no paid API calls: fetch is replaced with a canned reply.
const fetchMock = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () =>
  new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
);

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-real");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function sentMessages() {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return (JSON.parse(String(init?.body)) as { messages: unknown[] }).messages;
}

describe("callCoachClaudeChat", () => {
  it("never sends a conversation that starts with the assistant's opening line", async () => {
    // What CustomWorkoutBuilder, WorkoutOnboarding and ChallengesClient send.
    const reply = await callCoachClaudeChat({
      system: "test",
      messages: [
        { role: "assistant", content: "Tell me about your current program." },
        { role: "user", content: "Upper/lower, 4 days." },
      ],
    });
    expect(reply).toBe("ok");
    expect(sentMessages()).toEqual([
      { role: "user", content: "Upper/lower, 4 days." },
    ]);
  });

  it("keeps a long Coach chat's summary when it is the first stored turn", async () => {
    await callCoachClaudeChat({
      system: "test",
      messages: [
        { role: "assistant", content: "[Conversation summary] Targets 180 g protein." },
        { role: "user", content: "Dinner ideas?" },
      ],
    });
    const messages = sentMessages() as { role: string; content: string }[];
    expect(messages).toHaveLength(1);
    expect(messages[0]!.role).toBe("user");
    expect(messages[0]!.content).toContain("Targets 180 g protein.");
    expect(messages[0]!.content).toContain("Dinner ideas?");
  });

  it("fails clearly, without calling the API, when there is no user message", async () => {
    await expect(
      callCoachClaudeChat({
        system: "test",
        messages: [{ role: "assistant", content: "Tell me about your program." }],
      })
    ).rejects.toThrow("No user message to send");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
