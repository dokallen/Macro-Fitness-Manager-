import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type FakeSupabase } from "@/lib/test-utils/fake-supabase";

let fake: FakeSupabase;
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: () => fake.client }));

import { POST } from "@/app/api/coach-actions/route";

const PROTEIN_180 = {
  id: "prop-1",
  action: "set_macro_targets",
  input: { targets: [{ key: "protein", value: 180, unit: "g" }] },
  summary: "Set Protein 180 g",
  status: "pending",
};

function seed(proposals: Record<string, unknown>[] = [PROTEIN_180]) {
  fake = createFakeSupabase({
    user_preferences: [{ user_id: "user-1", key: "protein", value: "150 g" }],
    coach_conversations: [
      {
        id: "conv-1",
        user_id: "user-1",
        updated_at: "2026-11-24T10:00:00.000Z",
        messages: [
          { role: "user", content: "More protein", timestamp: "t1", coachId: "drdata" },
          { role: "assistant", content: "Try this.", timestamp: "t2", coachId: "drdata", proposals },
        ],
      },
      {
        id: "conv-other",
        user_id: "user-2",
        updated_at: "2026-11-24T10:00:00.000Z",
        messages: [
          { role: "assistant", content: "x", timestamp: "t", coachId: "drdata", proposals: [{ ...PROTEIN_180, id: "prop-other" }] },
        ],
      },
    ],
  });
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request("https://macro-fit.example/api/coach-actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

const storedProposal = (convId = "conv-1") => {
  const conv = fake.tables.coach_conversations!.find((c) => c.id === convId)!;
  const msgs = conv.messages as { proposals?: Record<string, unknown>[] }[];
  return msgs[msgs.length - 1]!.proposals![0]!;
};

const prefWrites = () => fake.writes.filter((w) => w.table === "user_preferences");

beforeEach(() => seed());

describe("POST /api/coach-actions", () => {
  it("applies a pending proposal from the stored input and records it", async () => {
    const res = await post({ conversationId: "conv-1", proposalId: "prop-1", decision: "apply" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { proposal: { status: string; result: string } };
    expect(json.proposal).toMatchObject({ status: "applied", result: "Updated 1 target." });
    expect(fake.tables.user_preferences).toEqual([
      expect.objectContaining({ user_id: "user-1", key: "protein", value: "180 g", updated_by: "coach" }),
    ]);
    expect(storedProposal()).toMatchObject({ status: "applied", result: "Updated 1 target." });
  });

  it("records a failure when the write fails", async () => {
    fake.failNextWrite("user_preferences", "database is busy");
    const res = await post({ conversationId: "conv-1", proposalId: "prop-1", decision: "apply" });
    const json = (await res.json()) as { proposal: { status: string; error: string } };
    expect(json.proposal).toMatchObject({ status: "failed", error: "database is busy" });
    expect(storedProposal()).toMatchObject({ status: "failed" });
    expect(fake.tables.user_preferences![0]!.value).toBe("150 g");
  });

  it("cancels without writing anything but the status", async () => {
    const res = await post({ conversationId: "conv-1", proposalId: "prop-1", decision: "cancel" });
    expect(((await res.json()) as { proposal: { status: string } }).proposal.status).toBe("cancelled");
    expect(prefWrites()).toEqual([]);
    expect(storedProposal().status).toBe("cancelled");
  });

  it("never runs a proposal twice", async () => {
    await post({ conversationId: "conv-1", proposalId: "prop-1", decision: "apply" });
    const again = await post({ conversationId: "conv-1", proposalId: "prop-1", decision: "apply" });
    expect(((await again.json()) as { alreadyDecided: boolean }).alreadyDecided).toBe(true);
    const cancelAfter = await post({ conversationId: "conv-1", proposalId: "prop-1", decision: "cancel" });
    expect(((await cancelAfter.json()) as { proposal: { status: string } }).proposal.status).toBe("applied");
    expect(prefWrites()).toHaveLength(1);
  });

  it("lets only one of two simultaneous taps run the change", async () => {
    const [a, b] = await Promise.all([
      post({ conversationId: "conv-1", proposalId: "prop-1", decision: "apply" }),
      post({ conversationId: "conv-1", proposalId: "prop-1", decision: "apply" }),
    ]);
    const bodies = (await Promise.all([a.json(), b.json()])) as { alreadyDecided?: boolean }[];
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(bodies.filter((x) => x.alreadyDecided)).toHaveLength(1);
    expect(prefWrites()).toHaveLength(1);
  });

  it("keeps a chat message saved while the change was being applied", async () => {
    const client = fake.client as { from: (t: string) => unknown };
    const realFrom = client.from;
    let injected = false;
    client.from = (table: string) => {
      if (table === "user_preferences" && !injected) {
        // Simulate the chat route saving a new message mid-apply.
        injected = true;
        const conv = fake.tables.coach_conversations!.find((c) => c.id === "conv-1")!;
        conv.messages = [
          ...(conv.messages as unknown[]),
          { role: "user", content: "Sent while applying", timestamp: "t3", coachId: "drdata" },
        ];
        conv.updated_at = "2026-11-24T10:00:09.000Z";
      }
      return realFrom(table);
    };
    const res = await post({ conversationId: "conv-1", proposalId: "prop-1", decision: "apply" });
    expect(((await res.json()) as { proposal: { status: string } }).proposal.status).toBe("applied");
    const conv = fake.tables.coach_conversations!.find((c) => c.id === "conv-1")!;
    const msgs = conv.messages as { content: string; proposals?: { status: string }[] }[];
    expect(msgs.map((m) => m.content)).toContain("Sent while applying");
    expect(msgs[1]!.proposals![0]!.status).toBe("applied");
  });

  it("does not run a proposal another request is applying right now", async () => {
    seed([{ ...PROTEIN_180, status: "applying", decidedAt: new Date().toISOString() }]);
    const res = await post({ conversationId: "conv-1", proposalId: "prop-1", decision: "apply" });
    const json = (await res.json()) as { alreadyDecided: boolean; proposal: { status: string } };
    expect(json).toMatchObject({ alreadyDecided: true, proposal: { status: "applying" } });
    expect(prefWrites()).toEqual([]);
  });

  it("returns 404 for another user's conversation and changes nothing", async () => {
    const res = await post({ conversationId: "conv-other", proposalId: "prop-other", decision: "apply" });
    expect(res.status).toBe(404);
    expect(prefWrites()).toEqual([]);
    expect(storedProposal("conv-other").status).toBe("pending");
  });

  it("returns 404 'expired' for an unknown proposal", async () => {
    const res = await post({ conversationId: "conv-1", proposalId: "nope", decision: "apply" });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { status: string }).status).toBe("expired");
  });

  it("ignores input sent by the browser and uses the stored proposal", async () => {
    const res = await post({
      conversationId: "conv-1",
      proposalId: "prop-1",
      decision: "apply",
      action: "remove_macro_target",
      input: { targets: [{ key: "protein", value: 999 }] },
    });
    expect(res.status).toBe(200);
    expect(fake.tables.user_preferences![0]!.value).toBe("180 g");
  });

  it("fails safely when the stored input is no longer valid", async () => {
    seed([{ ...PROTEIN_180, input: { targets: [{ key: "protein", value: -1 }] } }]);
    const res = await post({ conversationId: "conv-1", proposalId: "prop-1", decision: "apply" });
    expect(((await res.json()) as { proposal: { status: string } }).proposal.status).toBe("failed");
    expect(prefWrites()).toEqual([]);
  });

  it("reports a proposal stuck in 'applying' as failed and does not run it", async () => {
    seed([{ ...PROTEIN_180, status: "applying", decidedAt: "2026-01-01T00:00:00.000Z" }]);
    const res = await post({ conversationId: "conv-1", proposalId: "prop-1", decision: "apply" });
    const json = (await res.json()) as { alreadyDecided: boolean; proposal: { status: string } };
    expect(json.alreadyDecided).toBe(true);
    expect(json.proposal.status).toBe("failed");
    expect(prefWrites()).toEqual([]);
  });

  it("requires a session and a valid body", async () => {
    fake.user = null;
    expect((await post({ conversationId: "conv-1", proposalId: "prop-1", decision: "apply" })).status).toBe(401);
    expect((await post({ conversationId: "conv-1", decision: "apply" })).status).toBe(400);
  });
});
