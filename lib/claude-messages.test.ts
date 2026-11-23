import { describe, expect, it } from "vitest";

import {
  CONVERSATION_SUMMARY_PREFIX,
  normalizeClaudeTurns,
  type ClaudeTurn,
} from "@/lib/claude-messages";

type Block = { type: string; text?: string; source?: unknown };

describe("normalizeClaudeTurns", () => {
  it("drops a leading assistant greeting so the list starts with the user", () => {
    expect(
      normalizeClaudeTurns([
        { role: "assistant", content: "Tell me about your current program." },
        { role: "user", content: "Push/pull/legs, 6 days." },
      ])
    ).toEqual([{ role: "user", content: "Push/pull/legs, 6 days." }]);
  });

  it("keeps a leading conversation summary as user context and merges it with the next user turn", () => {
    const summary = `${CONVERSATION_SUMMARY_PREFIX} User targets 180 g protein and trains 4 days a week.`;
    const out = normalizeClaudeTurns([
      { role: "assistant", content: summary },
      { role: "user", content: "What should I eat tonight?" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.role).toBe("user");
    expect(out[0]!.content).toContain(summary);
    expect(out[0]!.content).toContain("What should I eat tonight?");
  });

  it("keeps the summary when the next stored turn is from the assistant", () => {
    const summary = `${CONVERSATION_SUMMARY_PREFIX} Goal: 200 lbs.`;
    expect(
      normalizeClaudeTurns([
        { role: "assistant", content: summary },
        { role: "assistant", content: "Great work this week!" },
        { role: "user", content: "Thanks" },
      ])
    ).toEqual([
      { role: "user", content: summary },
      { role: "assistant", content: "Great work this week!" },
      { role: "user", content: "Thanks" },
    ]);
  });

  it("merges consecutive same-role turns so roles alternate", () => {
    expect(
      normalizeClaudeTurns([
        { role: "user", content: "a" },
        { role: "user", content: "b" },
        { role: "assistant", content: "c" },
        { role: "assistant", content: "d" },
        { role: "user", content: "e" },
      ])
    ).toEqual([
      { role: "user", content: "a\n\nb" },
      { role: "assistant", content: "c\n\nd" },
      { role: "user", content: "e" },
    ]);
  });

  it("merges text with content blocks without losing the image", () => {
    const image: Block = { type: "image", source: { type: "base64" } };
    const out = normalizeClaudeTurns<Block>([
      { role: "user", content: "Earlier note" },
      { role: "user", content: [image, { type: "text", text: "What is this?" }] },
    ]);
    expect(out).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Earlier note" },
          image,
          { type: "text", text: "What is this?" },
        ],
      },
    ]);
  });

  it("returns an empty list for an empty list or greeting-only list", () => {
    expect(normalizeClaudeTurns([])).toEqual([]);
    expect(
      normalizeClaudeTurns([{ role: "assistant", content: "Hi there!" }])
    ).toEqual([]);
  });

  it("leaves an already valid list unchanged and does not mutate the input", () => {
    const valid: ClaudeTurn[] = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello" },
      { role: "user", content: "Plan my week" },
    ];
    const snapshot = structuredClone(valid);
    expect(normalizeClaudeTurns(valid)).toEqual(snapshot);
    expect(valid).toEqual(snapshot);
  });

  it("only treats a leading summary specially; later assistant turns are kept as-is", () => {
    expect(
      normalizeClaudeTurns([
        { role: "user", content: "Hi" },
        { role: "assistant", content: `${CONVERSATION_SUMMARY_PREFIX} not leading` },
      ])
    ).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: `${CONVERSATION_SUMMARY_PREFIX} not leading` },
    ]);
  });

  it("skips turns with empty content instead of sending empty text", () => {
    expect(
      normalizeClaudeTurns([
        { role: "user", content: "   " },
        { role: "assistant", content: "" },
        { role: "user", content: "Real question" },
      ])
    ).toEqual([{ role: "user", content: "Real question" }]);
  });
});
