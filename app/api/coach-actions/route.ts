import { NextResponse } from "next/server";
import { z } from "zod";

import { updateConversationMessages } from "@/lib/coach-actions/conversation-store";
import { parseStoredProposals, replaceProposalById } from "@/lib/coach-actions/proposals";
import { COACH_ACTIONS } from "@/lib/coach-actions/registry";
import { CoachActionError, type CoachProposal } from "@/lib/coach-actions/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Apply or cancel a change the Coach proposed.
 *
 * The browser only says which proposal and what to do with it. The action and
 * its input are read from the user's own stored conversation and validated
 * again here; anything else in the request body is ignored. Writes run with the
 * user's session, so row-level security applies.
 */

const bodySchema = z.object({
  conversationId: z.string().trim().min(1),
  proposalId: z.string().trim().min(1),
  decision: z.enum(["apply", "cancel"]),
});

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

type RawMsg = Record<string, unknown>;

function findProposal(
  messages: RawMsg[],
  proposalId: string,
  now: Date
): { msgIndex: number; propIndex: number; proposal: CoachProposal } | null {
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    if (m.role !== "assistant" || !Array.isArray(m.proposals)) continue;
    const parsed = parseStoredProposals(m.proposals, now) ?? [];
    const raw = m.proposals as RawMsg[];
    const j = raw.findIndex((p) => p && p.id === proposalId);
    const proposal = parsed.find((p) => p.id === proposalId);
    if (j >= 0 && proposal) return { msgIndex: i, propIndex: j, proposal };
  }
  return null;
}

function publicProposal(p: CoachProposal) {
  return {
    id: p.id,
    summary: p.summary,
    status: p.status,
    ...(p.decidedAt ? { decidedAt: p.decidedAt } : {}),
    ...(p.result ? { result: p.result } : {}),
    ...(p.error ? { error: p.error } : {}),
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return json({ error: "conversationId, proposalId and decision are required." }, 400);
  }
  const { conversationId, proposalId, decision } = parsedBody.data;

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const now = new Date();
  const decidedAt = now.toISOString();
  const readProposal = (stored: RawMsg[]) => findProposal(stored, proposalId, now)?.proposal ?? null;

  // Claim the proposal before running anything. The save only goes through if
  // the proposal is still pending in the latest copy and nobody wrote the row
  // since that read, so a second tap, tab or device cannot also claim it.
  let before: CoachProposal | null = null;
  let claimed: CoachProposal | null = null;
  const claim = await updateConversationMessages(supabase, {
    conversationId,
    userId: user.id,
    build: (stored) => {
      before = readProposal(stored);
      if (!before || before.status !== "pending") return null;
      claimed = {
        ...before,
        status: decision === "cancel" ? "cancelled" : "applying",
        decidedAt,
      };
      return replaceProposalById(stored, proposalId, claimed);
    },
  });

  if (!claim.ok) {
    if (claim.reason === "not_found") return json({ error: "Conversation not found." }, 404);
    if (claim.reason === "error") return json({ error: claim.message ?? "Could not save." }, 500);
    if (claim.reason === "conflict") {
      return json({ error: "This conversation is busy. Try again in a moment." }, 409);
    }
    // aborted: the proposal is missing, or was already decided.
    const existing = before as CoachProposal | null;
    if (!existing) {
      return json(
        { error: "This proposal has expired or no longer exists.", status: "expired" },
        404
      );
    }
    return json({ proposal: publicProposal(existing), alreadyDecided: true });
  }

  const taken = claimed as unknown as CoachProposal;
  if (decision === "cancel") {
    return json({ proposal: publicProposal(taken) });
  }

  let final: CoachProposal;
  const def = COACH_ACTIONS[taken.action];
  const input = def?.schema.safeParse(taken.input);
  if (!def) {
    final = { ...taken, status: "failed", error: "This kind of change is no longer supported." };
  } else if (!input?.success) {
    final = { ...taken, status: "failed", error: "The proposed change is no longer valid." };
  } else {
    try {
      const result = await def.execute({ supabase, userId: user.id, now }, input.data);
      final = { ...taken, status: "applied", result: result.message };
    } catch (e) {
      final = {
        ...taken,
        status: "failed",
        error:
          e instanceof CoachActionError ? e.message : "Could not apply this change. Please try again.",
      };
    }
  }

  // Record the outcome on the latest copy, touching only this proposal, so a
  // chat message saved meanwhile is kept.
  const saved = await updateConversationMessages(supabase, {
    conversationId,
    userId: user.id,
    build: (stored) => replaceProposalById(stored, proposalId, final),
  });
  if (!saved.ok) {
    return json({
      proposal: publicProposal(final),
      warning:
        final.status === "applied"
          ? "The change was saved, but its status on this card was not."
          : "The change was not saved, and its status on this card was not updated.",
    });
  }

  return json({ proposal: publicProposal(final) });
}
