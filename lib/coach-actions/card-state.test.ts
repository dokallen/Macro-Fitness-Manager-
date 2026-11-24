import { describe, expect, it } from "vitest";

import {
  applyProposalUpdate,
  interpretDecisionResponse,
  mergeIncomingMessages,
  proposalCardView,
  readUiProposals,
  type UiProposal,
} from "@/lib/coach-actions/card-state";

const NOW = new Date("2026-11-24T15:00:00.000Z");
const pending: UiProposal = { id: "p1", summary: "Set Protein 180 g", status: "pending" };

describe("proposalCardView", () => {
  it("shows buttons only while pending", () => {
    expect(proposalCardView(pending)).toMatchObject({ showButtons: true, statusLabel: null });
    expect(proposalCardView({ ...pending, status: "applying" })).toMatchObject({ showButtons: false, statusLabel: "Applying…" });
  });

  it("shows the outcome afterwards", () => {
    expect(proposalCardView({ ...pending, status: "applied", result: "Done." })).toEqual({
      showButtons: false, statusLabel: "Applied", detail: "Done.", tone: "success",
    });
    expect(proposalCardView({ ...pending, status: "cancelled" })).toMatchObject({ statusLabel: "Cancelled", tone: "muted" });
    expect(proposalCardView({ ...pending, status: "failed", error: "No such target" })).toMatchObject({
      statusLabel: "Failed", detail: "No such target", tone: "error",
    });
    expect(proposalCardView({ ...pending, status: "failed" }).detail).toBeTruthy();
  });
});

describe("readUiProposals", () => {
  it("returns undefined for old messages without proposals", () => {
    expect(readUiProposals(undefined)).toBeUndefined();
    expect(readUiProposals([])).toBeUndefined();
  });

  it("drops malformed entries and keeps only display fields", () => {
    const out = readUiProposals(
      [
        { id: "a", summary: "S", status: "pending", action: "set_preference", input: { key: "goal" } },
        { id: "b", summary: "S", status: "weird" },
        { summary: "no id", status: "pending" },
        null,
      ],
      NOW
    );
    expect(out).toEqual([{ id: "a", summary: "S", status: "pending" }]);
  });

  it("shows an interrupted apply as failed, but not a fresh one", () => {
    const stale = readUiProposals([{ ...pending, status: "applying", decidedAt: "2026-11-24T14:50:00.000Z" }], NOW)!;
    expect(stale[0]).toMatchObject({ status: "failed" });
    expect(stale[0]!.error).toContain("Interrupted");
    const fresh = readUiProposals([{ ...pending, status: "applying", decidedAt: "2026-11-24T14:59:00.000Z" }], NOW)!;
    expect(fresh[0]!.status).toBe("applying");
  });
});

describe("applyProposalUpdate", () => {
  const msgs = [
    { id: "m1", proposals: [pending, { id: "p2", summary: "Other", status: "pending" as const }] },
    { id: "m2" },
  ];

  it("updates only the matching proposal", () => {
    const next = applyProposalUpdate(msgs, { id: "p1", summary: "Set Protein 180 g", status: "applied", result: "Done." });
    expect(next[0]!.proposals![0]).toMatchObject({ status: "applied", result: "Done." });
    expect(next[0]!.proposals![1]!.status).toBe("pending");
    expect(next[1]).toBe(msgs[1]);
  });

  it("never moves a decided card backwards or flips it", () => {
    const applied = applyProposalUpdate(msgs, { ...pending, status: "applied" });
    expect(applyProposalUpdate(applied, { ...pending, status: "applying" })).toBe(applied);
    expect(applyProposalUpdate(applied, { ...pending, status: "cancelled" })).toBe(applied);
  });

  it("returns the same array when nothing matches", () => {
    expect(applyProposalUpdate(msgs, { id: "zzz", summary: "", status: "applied" })).toBe(msgs);
  });
});

describe("interpretDecisionResponse", () => {
  it("applied: success toast with the result, and refresh", () => {
    const o = interpretDecisionResponse("p1", "S", true, { proposal: { id: "p1", summary: "S", status: "applied", result: "Logged Egg." } });
    expect(o).toMatchObject({ toast: { kind: "success", text: "Logged Egg." }, refresh: true });
    expect(o.update!.status).toBe("applied");
  });

  it("applied with a save warning still refreshes and shows the warning", () => {
    const o = interpretDecisionResponse("p1", "S", true, {
      proposal: { id: "p1", summary: "S", status: "applied" },
      warning: "The change was saved, but its status on this card was not.",
    });
    expect(o).toMatchObject({ refresh: true, toast: { kind: "success", text: expect.stringContaining("saved") } });
  });

  it("failed: error toast with the reason, no refresh", () => {
    const o = interpretDecisionResponse("p1", "S", true, { proposal: { id: "p1", summary: "S", status: "failed", error: "Nope" } });
    expect(o).toMatchObject({ toast: { kind: "error", text: "Nope" }, refresh: false });
  });

  it("cancelled: no toast", () => {
    const o = interpretDecisionResponse("p1", "S", true, { proposal: { id: "p1", summary: "S", status: "cancelled" } });
    expect(o).toMatchObject({ toast: null, refresh: false, update: { status: "cancelled" } });
  });

  it("already decided: shows the stored outcome", () => {
    const o = interpretDecisionResponse("p1", "S", true, {
      proposal: { id: "p1", summary: "S", status: "applied" }, alreadyDecided: true,
    });
    expect(o).toMatchObject({ toast: { kind: "info" }, update: { status: "applied" } });
  });

  it("expired: marks the card failed", () => {
    const o = interpretDecisionResponse("p1", "S", false, { error: "gone", status: "expired" });
    expect(o.update).toMatchObject({ id: "p1", status: "failed", error: "This proposal has expired." });
  });

  it("busy, server or network errors: leave the card pending so the user can retry", () => {
    expect(interpretDecisionResponse("p1", "S", false, { error: "This conversation is busy." })).toMatchObject({
      update: null, toast: { kind: "error", text: "This conversation is busy." },
    });
    expect(interpretDecisionResponse("p1", "S", false, {})).toMatchObject({ update: null, toast: { kind: "error" } });
    expect(interpretDecisionResponse("p1", "S", true, {})).toMatchObject({ update: null });
  });
});

describe("mergeIncomingMessages", () => {
  it("keeps a card that is further along than the server copy", () => {
    type M = { id: string; proposals: UiProposal[] };
    const prev: M[] = [{ id: "m1", proposals: [{ ...pending, status: "applied", result: "Done." }] }];
    const incoming: M[] = [
      { id: "m1", proposals: [{ ...pending, status: "applying" as const }] },
      { id: "m2", proposals: [{ id: "p9", summary: "New", status: "pending" as const }] },
    ];
    const out = mergeIncomingMessages(prev, incoming);
    expect(out[0]!.proposals![0]).toMatchObject({ status: "applied", result: "Done." });
    expect(out[1]).toBe(incoming[1]);
  });

  it("takes the server copy when it is newer or equal", () => {
    const prev = [{ id: "m1", proposals: [pending] }];
    const incoming = [{ id: "m1", proposals: [{ ...pending, status: "cancelled" as const }] }];
    expect(mergeIncomingMessages(prev, incoming)).toEqual(incoming);
  });
});

describe("interpretDecisionResponse edge cases", () => {
  it("says when another device is still applying", () => {
    const o = interpretDecisionResponse("p1", "S", true, {
      proposal: { id: "p1", summary: "S", status: "applying", decidedAt: new Date().toISOString() },
      alreadyDecided: true,
    });
    expect(o).toMatchObject({ refresh: false, toast: { kind: "info", text: expect.stringContaining("another device") } });
  });

  it("explains a signed-out user plainly", () => {
    const o = interpretDecisionResponse("p1", "S", false, { error: "Unauthorized" }, 401);
    expect(o).toMatchObject({ update: null, toast: { kind: "error", text: expect.stringContaining("signed out") } });
  });
});
