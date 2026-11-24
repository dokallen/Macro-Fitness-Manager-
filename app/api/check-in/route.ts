import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildCheckInRecord,
  loadCheckInData,
  runCalculation,
  validTimeZone,
  weighedSinceLastCheckIn,
} from "@/lib/coaching/check-in";
import { describeResult } from "@/lib/coaching/calc";
import { buildCheckInReviewRequest } from "@/lib/coaching/coach-context";
import { readGoalPace } from "@/lib/coaching/goal-pace";
import { ownTargetsProgress, readOwnTargets } from "@/lib/coaching/own-targets";
import { callCoachClaudeChat } from "@/lib/coach-chat";
import { SCHEDULE_KEYS, checkInRecordKey, isWeighInDue, readSchedule } from "@/lib/coaching/schedule";
import { updateConversationMessages } from "@/lib/coach-actions/conversation-store";
import { setMacroTargets } from "@/lib/coach-actions/macro-targets";
import type { CoachProposal } from "@/lib/coach-actions/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";

export const dynamic = "force-dynamic";
/** Several Claude calls in a row can exceed the platform's default limit. */
export const maxDuration = 60;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

/** What the check-in and weigh-in cards need to decide what to show. */
export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const tz = new URL(req.url).searchParams.get("tz");
  const now = new Date();
  try {
    const data = await loadCheckInData(supabase, user.id, now, tz);
    const schedule = readSchedule(data.prefs);
    const snoozed = data.prefs.find((p) => p.key === SCHEDULE_KEYS.weighInSnoozedDate)?.value === data.today;
    const lastWeighIn = data.lastWeighInAt ? new Date(data.lastWeighInAt) : null;
    const weighInDue = isWeighInDue(schedule, data.timeZone, lastWeighIn, now);
    return json({
      today: data.today,
      status: data.status,
      weighInDue: weighInDue && !snoozed,
      weighedSinceLastCheckIn: weighedSinceLastCheckIn(data),
      lastCheckIn: data.lastCheckIn,
      weightUnit: data.weightUnit,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Could not load check-in." }, 500);
  }
}

const runSchema = z.object({
  loggingAnswer: z.enum(["yes", "mostly", "no"]),
  timeZone: z.string().optional(),
  /** The user's answer to "which target is calories?", remembered for next time. */
  caloriesKey: z.string().trim().min(1).optional(),
});

/** Runs the check-in: calculates, saves the record, and proposes any change. */
export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = runSchema.safeParse(body);
  if (!parsed.success) return json({ error: "loggingAnswer must be yes, mostly or no." }, 400);
  const { loggingAnswer, caloriesKey } = parsed.data;
  const now = new Date();

  try {
    let data = await loadCheckInData(supabase, user.id, now, validTimeZone(parsed.data.timeZone));
    if (!["early", "due", "late", "missed"].includes(data.status.state)) {
      return json({ error: "No check-in is due right now." }, 409);
    }
    if (data.lastCheckIn === data.today) {
      return json({ error: "You already checked in today." }, 409);
    }
    if (!weighedSinceLastCheckIn(data)) {
      return json({ error: "Log a weigh-in first.", needsWeighIn: true }, 409);
    }

    if (caloriesKey) {
      if (!data.targets.some((t) => t.key === caloriesKey)) {
        return json({ error: "That is not one of your targets." }, 400);
      }
      const { error } = await supabase.from("user_preferences").upsert(
        {
          user_id: user.id,
          key: SCHEDULE_KEYS.caloriesKey,
          value: caloriesKey,
          updated_by: "user",
          updated_at: now.toISOString(),
        },
        { onConflict: "user_id,key" }
      );
      if (error) throw new Error(error.message);
      data = await loadCheckInData(supabase, user.id, now, data.timeZone);
    }

    let result = runCalculation(data, loggingAnswer);
    // Own numbers: kept while they work; the calculated targets come back when they don't.
    const own = readOwnTargets(data.prefs);
    let ownNote = "";
    if (own && result.decision === "change") {
      const progress = ownTargetsProgress(result, readGoalPace(data.prefs));
      if (progress === "on_track") {
        result = { ...result, decision: "hold", changes: [], holdReasons: ["own_targets_on_track"] };
      } else if (progress === "off_track") {
        ownNote = ` You're on your own targets (${own.reason}), but your trend isn't moving toward your goal, so here are the calculated targets again.`;
      }
    }
    if (result.holdReasons.includes("calories_unknown")) {
      // Ask, then run again; nothing is saved yet.
      return json({ needsCaloriesKey: true, targetKeys: data.targets.map((t) => t.key) });
    }

    let proposal: CoachProposal | undefined;
    if (result.decision === "change") {
      const parsedInput = setMacroTargets.schema.safeParse({
        targets: result.changes.map((c) => ({ key: c.key, value: c.to, ...(c.unit ? { unit: c.unit } : {}) })),
        source: "calculated",
      });
      if (parsedInput.success) {
        proposal = {
          id: randomUUID(),
          action: setMacroTargets.name,
          input: parsedInput.data as unknown as Json,
          summary: setMacroTargets.summarize(parsedInput.data),
          status: "pending",
        };
      } else {
        // Never propose something Apply would reject; hold instead.
        result = { ...result, decision: "hold", changes: [], holdReasons: ["macros_unknown"] };
      }
    }
    const proposalId = proposal?.id;
    const record = buildCheckInRecord(data, result, loggingAnswer, now, proposalId);
    const resultText = describeResult(result);
    // The Coach's short review, written from the calculated numbers only.
    let text = `Weekly check-in.${ownNote} ${resultText}`;
    try {
      // The review is told about the user's own numbers too.
      const req = buildCheckInReviewRequest(record, `${ownNote.trim()} ${resultText}`.trim());
      const review = await callCoachClaudeChat({
        system: req.system,
        messages: [{ role: "user", content: req.user }],
        timeoutMs: 20_000,
      });
      text = `Weekly check-in.${ownNote} ${review}`;
    } catch (e) {
      console.error("[check-in] review", e);
    }

    // The check-in shows in the Coach chat, with any change as an Apply/Cancel card.
    const coachId = data.prefs.find((p) => p.key === "chosen_coach_id")?.value?.trim() || "drdata";
    const message = {
      role: "assistant",
      content: text,
      timestamp: now.toISOString(),
      coachId,
      /** Marks the check-in message so a second submit the same day is refused. */
      checkInDate: data.today,
      ...(proposal ? { proposals: [proposal] } : {}),
    };
    const { data: latest } = await supabase
      .from("coach_conversations")
      .select("id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let conversationId: string | null = null;
    let alreadyInChat: { proposals?: { id?: string }[] } | null = null;
    if (latest?.id) {
      const saved = await updateConversationMessages(supabase, {
        conversationId: latest.id,
        userId: user.id,
        build: (stored) => {
          const existing = stored.find((m) => (m as { checkInDate?: unknown }).checkInDate === data.today);
          if (existing) {
            alreadyInChat = existing as typeof alreadyInChat;
            return null;
          }
          return [...stored, message];
        },
      });
      if (saved.ok) conversationId = latest.id;
      else if (saved.reason === "aborted") {
        // Today's check-in is already in the chat. If its record wasn't saved
        // (an earlier attempt failed after the chat write), save it now so the
        // check-in counts; otherwise this is a second submit.
        const recordExists = data.prefs.some((p) => p.key === checkInRecordKey(data.today));
        if (recordExists) return json({ error: "You already checked in today." }, 409);
        const existingId = (alreadyInChat as { proposals?: { id?: string }[] } | null)?.proposals?.[0]?.id;
        const recovered = buildCheckInRecord(data, result, loggingAnswer, now, existingId);
        const { error: recErr } = await supabase.from("user_preferences").upsert(
          {
            user_id: user.id,
            key: checkInRecordKey(data.today),
            value: JSON.stringify(recovered),
            updated_by: "user",
            updated_at: now.toISOString(),
          },
          { onConflict: "user_id,key" }
        );
        if (recErr) throw new Error(recErr.message);
        const stored = (alreadyInChat as { content?: unknown } | null)?.content;
        return json({ record: recovered, text: typeof stored === "string" ? stored : text, conversationId: latest.id });
      }
    }
    if (!conversationId) {
      const { data: ins, error } = await supabase
        .from("coach_conversations")
        .insert({
          user_id: user.id,
          title: "Weekly check-in",
          // A user turn first, so the Coach keeps its own review as context
          // (a conversation that starts with the assistant has that turn dropped).
          messages: [
            { role: "user", content: "Weekly check-in", timestamp: now.toISOString(), coachId },
            message,
          ] as unknown as Json,
          coach_id: coachId,
          updated_at: now.toISOString(),
        })
        .select("id")
        .single();
      if (error || !ins) throw new Error(error?.message ?? "Could not save the check-in to the chat.");
      conversationId = ins.id;
    }

    const { error: recErr } = await supabase.from("user_preferences").upsert(
      {
        user_id: user.id,
        key: checkInRecordKey(data.today),
        value: JSON.stringify(record),
        updated_by: "user",
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id,key" }
    );
    if (recErr) throw new Error(recErr.message);

    return json({
      record,
      text,
      conversationId,
      ...(proposal ? { proposal: { id: proposal.id, summary: proposal.summary, status: proposal.status } } : {}),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Check-in failed." }, 500);
  }
}
