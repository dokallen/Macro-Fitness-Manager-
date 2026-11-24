import type { z } from "zod";

import type { CoachActionDef, CoachProposal, ProposalStatus } from "@/lib/coach-actions/types";
import type { Json } from "@/lib/types";

/**
 * Added to the Coach system prompt whenever tools are offered. Claude's tool
 * calls are only proposals; it must not tell the user a change was made.
 */
export const COACH_TOOLS_SYSTEM_NOTE = [
  "",
  "You can propose changes to the user's data with your tools. A tool call is only a proposal: it appears as a card with Apply and Cancel, and nothing changes until the user taps Apply.",
  "Never say a change was made, saved or updated because you called a tool. Say what you are proposing and that they can apply it.",
  "Only propose a change when the user asks for one or clearly agrees to one.",
].join("\n");

/** At most this many proposals are kept from one Coach reply. */
export const MAX_PROPOSALS_PER_REPLY = 5;

export type ToolUse = { id: string; name: string; input: unknown };

const STATUS_LABEL: Record<ProposalStatus, string> = {
  pending: "waiting for the user",
  applied: "applied",
  cancelled: "cancelled by the user",
  failed: "failed",
};

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "invalid input";
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

/**
 * Turns Claude's tool calls into pending proposals. Nothing is executed here.
 * Unknown actions and invalid input become short notes instead of proposals.
 */
export function proposalsFromToolUses(
  toolUses: readonly ToolUse[],
  actions: Readonly<Record<string, CoachActionDef>>,
  makeId: () => string
): { proposals: CoachProposal[]; notes: string[] } {
  const proposals: CoachProposal[] = [];
  const notes: string[] = [];

  for (const use of toolUses) {
    const def = actions[use.name];
    if (!def) {
      notes.push(`Could not propose "${use.name}": unknown action.`);
      continue;
    }
    const parsed = def.schema.safeParse(use.input);
    if (!parsed.success) {
      notes.push(`Could not propose "${use.name}": ${firstIssue(parsed.error)}.`);
      continue;
    }
    if (proposals.length >= MAX_PROPOSALS_PER_REPLY) {
      notes.push(
        `Only ${MAX_PROPOSALS_PER_REPLY} changes can be proposed at once; the rest were left out.`
      );
      break;
    }
    proposals.push({
      id: makeId(),
      action: def.name,
      input: parsed.data as Json,
      summary: def.summarize(parsed.data),
      status: "pending",
    });
  }

  return { proposals, notes };
}

/** Reply text when Claude only called tools and wrote nothing. */
export function replyForToolOnlyTurn(proposals: readonly CoachProposal[]): string {
  if (proposals.length === 0) return "I couldn't put that change together. Could you say it another way?";
  if (proposals.length === 1) return `Here's the change I'd make: ${proposals[0]!.summary}. Tap Apply if you want it.`;
  return `Here are the changes I'd make. Tap Apply on the ones you want.`;
}

/**
 * The text Claude sees for a stored assistant turn: what it wrote, plus each
 * proposal and what the user did with it, so it never assumes a change was made.
 */
export function assistantTextForClaude(
  content: string,
  proposals: readonly CoachProposal[] | undefined,
  notes?: readonly string[]
): string {
  const lines = [content.trim()];
  for (const p of proposals ?? []) {
    const extra = p.status === "failed" && p.error ? ` (${p.error})` : "";
    lines.push(`[Proposed: ${p.summary} — ${STATUS_LABEL[p.status]}${extra}]`);
  }
  for (const n of notes ?? []) lines.push(`[Note: ${n}]`);
  return lines.filter(Boolean).join("\n");
}

const STATUSES = new Set<ProposalStatus>(["pending", "applied", "cancelled", "failed"]);

/** Reads proposals back from stored jsonb, dropping anything malformed. */
export function parseStoredProposals(raw: unknown): CoachProposal[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: CoachProposal[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.action !== "string") continue;
    if (typeof o.summary !== "string") continue;
    const status = STATUSES.has(o.status as ProposalStatus)
      ? (o.status as ProposalStatus)
      : "pending";
    out.push({
      id: o.id,
      action: o.action,
      input: (o.input ?? null) as Json,
      summary: o.summary,
      status,
      ...(typeof o.decidedAt === "string" ? { decidedAt: o.decidedAt } : {}),
      ...(typeof o.result === "string" ? { result: o.result } : {}),
      ...(typeof o.error === "string" ? { error: o.error } : {}),
    });
  }
  return out.length ? out : undefined;
}

export function parseStoredNotes(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return out.length ? out : undefined;
}
