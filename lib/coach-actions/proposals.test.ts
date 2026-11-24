import { describe, expect, it } from "vitest";

import {
  assistantTextForClaude,
  MAX_PROPOSALS_PER_REPLY,
  parseStoredProposals,
  proposalsFromToolUses,
  replyForToolOnlyTurn,
} from "@/lib/coach-actions/proposals";
import { COACH_ACTIONS, coachTools } from "@/lib/coach-actions/registry";

let n = 0;
const makeId = () => `p${++n}`;

describe("proposalsFromToolUses", () => {
  it("turns a valid tool call into a pending proposal with a readable summary", () => {
    const { proposals, notes } = proposalsFromToolUses(
      [
        {
          id: "toolu_1",
          name: "set_macro_targets",
          input: { targets: [{ key: "protein", value: 180, unit: "g" }] },
        },
      ],
      COACH_ACTIONS,
      () => "p-fixed"
    );
    expect(notes).toEqual([]);
    expect(proposals).toEqual([
      {
        id: "p-fixed",
        action: "set_macro_targets",
        input: { targets: [{ key: "protein", value: 180, unit: "g" }] },
        summary: "Set Protein 180 g",
        status: "pending",
      },
    ]);
  });

  it("records invalid input and unknown actions as notes, not proposals", () => {
    const { proposals, notes } = proposalsFromToolUses(
      [
        { id: "a", name: "set_macro_targets", input: { targets: [{ key: "protein", value: -5 }] } },
        { id: "b", name: "set_macro_targets", input: { targets: [{ key: "notification_timezone", value: 5 }] } },
        { id: "c", name: "delete_everything", input: {} },
      ],
      COACH_ACTIONS,
      makeId
    );
    expect(proposals).toEqual([]);
    expect(notes).toHaveLength(3);
    expect(notes[0]).toContain("positive");
    expect(notes[1]).toContain("reserved");
    expect(notes[2]).toContain("unknown action");
  });

  it(`keeps at most ${MAX_PROPOSALS_PER_REPLY} proposals per reply`, () => {
    const uses = Array.from({ length: 7 }, (_, i) => ({
      id: `t${i}`,
      name: "remove_macro_target",
      input: { key: `target${i}` },
    }));
    const { proposals, notes } = proposalsFromToolUses(uses, COACH_ACTIONS, makeId);
    expect(proposals).toHaveLength(MAX_PROPOSALS_PER_REPLY);
    expect(notes.join(" ")).toContain("left out");
  });
});

describe("assistantTextForClaude", () => {
  it("adds each proposal's status so Claude knows what the user accepted", () => {
    const text = assistantTextForClaude(
      "Here's my suggestion.",
      [
        { id: "1", action: "a", input: null, summary: "Set Protein 180 g", status: "applied" },
        { id: "2", action: "a", input: null, summary: "Set Fat 60 g", status: "cancelled" },
        { id: "3", action: "a", input: null, summary: "Set Carbs 150 g", status: "pending" },
        { id: "4", action: "a", input: null, summary: "Log 2 eggs", status: "failed", error: "Network" },
      ],
      ["Could not propose x"]
    );
    expect(text).toBe(
      [
        "Here's my suggestion.",
        "[Proposed: Set Protein 180 g — applied]",
        "[Proposed: Set Fat 60 g — cancelled by the user]",
        "[Proposed: Set Carbs 150 g — waiting for the user]",
        "[Proposed: Log 2 eggs — failed (Network)]",
        "[Note: Could not propose x]",
      ].join("\n")
    );
  });

  it("leaves a plain reply unchanged", () => {
    expect(assistantTextForClaude("Just text", undefined)).toBe("Just text");
  });
});

describe("replyForToolOnlyTurn", () => {
  it("names a single proposal, or points to the cards for several", () => {
    expect(
      replyForToolOnlyTurn([
        { id: "1", action: "a", input: null, summary: "Set Protein 180 g", status: "pending" },
      ])
    ).toContain("Set Protein 180 g");
    expect(replyForToolOnlyTurn([])).toBeTruthy();
  });
});

describe("parseStoredProposals", () => {
  it("drops malformed entries and returns undefined when none are left", () => {
    expect(parseStoredProposals(undefined)).toBeUndefined();
    expect(parseStoredProposals([{ id: 1 }, "x", null])).toBeUndefined();
    expect(
      parseStoredProposals([
        { id: "a", action: "set_macro_targets", summary: "S", status: "applied", input: { k: 1 } },
        { id: "b", action: "x" },
      ])
    ).toEqual([{ id: "a", action: "set_macro_targets", summary: "S", status: "applied", input: { k: 1 } }]);
  });
});

describe("coachTools", () => {
  it("generates a JSON object schema for every registered action", () => {
    const tools = coachTools();
    expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(COACH_ACTIONS).sort());
    for (const t of tools) {
      expect(t.input_schema.type).toBe("object");
      expect(t.input_schema).not.toHaveProperty("$schema");
      expect(t.description.length).toBeGreaterThan(20);
    }
  });
});
