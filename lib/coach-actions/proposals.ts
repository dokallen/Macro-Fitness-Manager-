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
  applying: "being applied",
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

const STATUSES = new Set<ProposalStatus>(["pending", "applying", "applied", "cancelled", "failed"]);

/**
 * A proposal left in "applying" this long means the request that claimed it
 * never finished (for example the server stopped). It is reported as failed
 * rather than pending, so it can never run twice.
 */
export const STALE_APPLYING_MS = 5 * 60 * 1000;
export const STALE_APPLYING_ERROR =
  "Interrupted before finishing. Check whether the change was saved.";

/** Reads proposals back from stored jsonb, dropping anything malformed. */
export function parseStoredProposals(
  raw: unknown,
  now: Date = new Date()
): CoachProposal[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: CoachProposal[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.action !== "string") continue;
    if (typeof o.summary !== "string") continue;
    let status = STATUSES.has(o.status as ProposalStatus)
      ? (o.status as ProposalStatus)
      : "pending";
    let staleError: string | undefined;
    if (status === "applying") {
      const started = typeof o.decidedAt === "string" ? Date.parse(o.decidedAt) : NaN;
      if (!Number.isFinite(started) || now.getTime() - started > STALE_APPLYING_MS) {
        status = "failed";
        staleError = STALE_APPLYING_ERROR;
      }
    }
    out.push({
      id: o.id,
      action: o.action,
      input: (o.input ?? null) as Json,
      summary: o.summary,
      status,
      ...(typeof o.decidedAt === "string" ? { decidedAt: o.decidedAt } : {}),
      ...(typeof o.result === "string" ? { result: o.result } : {}),
      ...(typeof o.error === "string" ? { error: o.error } : {}),
      ...(staleError ? { error: staleError } : {}),
    });
  }
  return out.length ? out : undefined;
}

export function parseStoredNotes(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return out.length ? out : undefined;
}

const STATUS_RANK: Record<ProposalStatus, number> = {
  pending: 0,
  applying: 1,
  applied: 2,
  cancelled: 2,
  failed: 2,
};

type StoredMsg = Record<string, unknown>;

/**
 * Before saving a conversation it read earlier, the chat route merges in any
 * proposal decisions saved since then. Statuses only move forward
 * (pending -> applying -> applied/cancelled/failed), so a stale copy can never
 * turn a decided proposal back into a pending one.
 */
export function mergeProposalDecisions<T extends StoredMsg>(
  local: readonly T[],
  stored: readonly StoredMsg[]
): T[] {
  const latest = new Map<string, StoredMsg>();
  for (const m of stored) {
    if (!m || !Array.isArray(m.proposals)) continue;
    for (const p of m.proposals as StoredMsg[]) {
      if (p && typeof p.id === "string") latest.set(p.id, p);
    }
  }
  return local.map((m) => {
    if (!Array.isArray(m.proposals)) return m;
    let changed = false;
    const proposals = (m.proposals as StoredMsg[]).map((p) => {
      const s = latest.get(p.id as string);
      if (!s) return p;
      const sRank = STATUS_RANK[s.status as ProposalStatus] ?? 0;
      const pRank = STATUS_RANK[p.status as ProposalStatus] ?? 0;
      // Prefer the saved copy when it is further along, or equally decided.
      if (sRank > pRank || (sRank === pRank && sRank > 0)) {
        changed = true;
        return s;
      }
      return p;
    });
    return changed ? { ...m, proposals } : m;
  });
}

/** Returns the messages with one proposal (found by id) replaced, or null if it is not there. */
export function replaceProposalById(
  messages: readonly StoredMsg[],
  proposalId: string,
  next: CoachProposal
): StoredMsg[] | null {
  let found = false;
  const out = messages.map((m) => {
    if (!m || !Array.isArray(m.proposals)) return m;
    const idx = (m.proposals as StoredMsg[]).findIndex((p) => p && p.id === proposalId);
    if (idx < 0) return m;
    found = true;
    const proposals = [...(m.proposals as StoredMsg[])];
    proposals[idx] = { ...next } as unknown as StoredMsg;
    return { ...m, proposals };
  });
  return found ? out : null;
}
