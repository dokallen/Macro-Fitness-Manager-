import { STALE_APPLYING_ERROR, STALE_APPLYING_MS } from "@/lib/coach-actions/proposals";
import type { CoachProposal, ProposalStatus } from "@/lib/coach-actions/types";

/** The fields of a proposal the chat screen needs. */
export type UiProposal = Pick<CoachProposal, "id" | "summary" | "status"> &
  Partial<Pick<CoachProposal, "decidedAt" | "result" | "error">>;

export type CardTone = "pending" | "success" | "muted" | "error";

export type CardView = {
  showButtons: boolean;
  statusLabel: string | null;
  detail: string | null;
  tone: CardTone;
};

/** What a proposal card shows for its current status. */
export function proposalCardView(p: UiProposal): CardView {
  switch (p.status) {
    case "pending":
      return { showButtons: true, statusLabel: null, detail: null, tone: "pending" };
    case "applying":
      return { showButtons: false, statusLabel: "Applying…", detail: null, tone: "pending" };
    case "applied":
      return { showButtons: false, statusLabel: "Applied", detail: p.result ?? null, tone: "success" };
    case "cancelled":
      return { showButtons: false, statusLabel: "Cancelled", detail: null, tone: "muted" };
    case "failed":
      return {
        showButtons: false,
        statusLabel: "Failed",
        detail: p.error ?? "Could not apply this change.",
        tone: "error",
      };
  }
}

const RANK: Record<ProposalStatus, number> = {
  pending: 0,
  applying: 1,
  applied: 2,
  cancelled: 2,
  failed: 2,
};

/**
 * Reads proposals from a stored or API message; drops anything malformed.
 * An "applying" left over from an interrupted request shows as failed, the
 * same rule the server uses.
 */
export function readUiProposals(raw: unknown, now: Date = new Date()): UiProposal[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: UiProposal[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.summary !== "string") continue;
    if (typeof o.status !== "string" || !(o.status in RANK)) continue;
    const p: UiProposal = {
      id: o.id,
      summary: o.summary,
      status: o.status as ProposalStatus,
      ...(typeof o.decidedAt === "string" ? { decidedAt: o.decidedAt } : {}),
      ...(typeof o.result === "string" ? { result: o.result } : {}),
      ...(typeof o.error === "string" ? { error: o.error } : {}),
    };
    if (p.status === "applying") {
      const started = p.decidedAt ? Date.parse(p.decidedAt) : NaN;
      if (!Number.isFinite(started) || now.getTime() - started > STALE_APPLYING_MS) {
        p.status = "failed";
        p.error = STALE_APPLYING_ERROR;
      }
    }
    out.push(p);
  }
  return out.length ? out : undefined;
}

/**
 * Puts a server outcome onto the matching proposal. A status never moves
 * backwards (a late "applying" can't undo "applied"). Returns the same array
 * if nothing matched or changed.
 */
export function applyProposalUpdate<M extends { proposals?: UiProposal[] }>(
  messages: M[],
  update: UiProposal
): M[] {
  let changed = false;
  const next = messages.map((m) => {
    if (!m.proposals?.some((p) => p.id === update.id)) return m;
    const proposals = m.proposals.map((p) => {
      if (p.id !== update.id) return p;
      if (RANK[update.status] < RANK[p.status]) return p;
      if (RANK[p.status] === 2 && RANK[update.status] === 2) return p;
      changed = true;
      return { ...p, ...update };
    });
    return { ...m, proposals };
  });
  return changed ? next : messages;
}

/**
 * Takes a fresh copy of the messages from the server, but keeps any card this
 * screen already knows is further along (an Apply that finished while a chat
 * reply was in flight must not drop back to "Applying…").
 */
export function mergeIncomingMessages<M extends { proposals?: UiProposal[] }>(
  previous: M[],
  incoming: M[]
): M[] {
  const known = new Map<string, UiProposal>();
  for (const m of previous) for (const p of m.proposals ?? []) known.set(p.id, p);
  if (known.size === 0) return incoming;
  return incoming.map((m) => {
    if (!m.proposals?.length) return m;
    let changed = false;
    const proposals = m.proposals.map((p) => {
      const local = known.get(p.id);
      if (local && RANK[local.status] > RANK[p.status]) {
        changed = true;
        return local;
      }
      return p;
    });
    return changed ? { ...m, proposals } : m;
  });
}

export type DecisionOutcome = {
  /** Status to show on the card, if the server gave one. */
  update: UiProposal | null;
  toast: { kind: "success" | "error" | "info"; text: string } | null;
  /** True when the user's data may have changed and the screen should reload it. */
  refresh: boolean;
};

/** Turns the /api/coach-actions response into what the screen should do. */
export function interpretDecisionResponse(
  proposalId: string,
  summary: string,
  httpOk: boolean,
  payload: unknown,
  httpStatus?: number
): DecisionOutcome {
  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const proposal = readUiProposals(body.proposal ? [body.proposal] : [])?.[0] ?? null;

  if (!httpOk) {
    if (body.status === "expired") {
      return {
        update: { id: proposalId, summary, status: "failed", error: "This proposal has expired." },
        toast: { kind: "error", text: "This proposal has expired." },
        refresh: false,
      };
    }
    if (httpStatus === 401) {
      return {
        update: null,
        toast: { kind: "error", text: "You've been signed out. Sign in again, then try once more." },
        refresh: false,
      };
    }
    const text = typeof body.error === "string" ? body.error : "Could not reach the server. Try again.";
    return { update: null, toast: { kind: "error", text }, refresh: false };
  }

  if (!proposal) {
    return { update: null, toast: { kind: "error", text: "Unexpected response. Try again." }, refresh: false };
  }

  const warning = typeof body.warning === "string" ? body.warning : null;
  if (body.alreadyDecided === true) {
    if (proposal.status === "applying") {
      // Claimed by another tab or device that hasn't finished yet.
      return {
        update: proposal,
        toast: {
          kind: "info",
          text: "This change is being applied on another device or tab. Reopen this chat to see the result.",
        },
        refresh: false,
      };
    }
    return {
      update: proposal,
      toast: { kind: "info", text: "This was already decided." },
      refresh: proposal.status === "applied",
    };
  }

  switch (proposal.status) {
    case "applied":
      return {
        update: proposal,
        toast: { kind: "success", text: warning ?? proposal.result ?? "Applied." },
        refresh: true,
      };
    case "failed":
      return {
        update: proposal,
        toast: { kind: "error", text: warning ?? proposal.error ?? "Could not apply this change." },
        refresh: false,
      };
    case "cancelled":
      return { update: proposal, toast: warning ? { kind: "info", text: warning } : null, refresh: false };
    default:
      return { update: proposal, toast: null, refresh: false };
  }
}
