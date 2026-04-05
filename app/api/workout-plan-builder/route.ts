import { NextResponse } from "next/server";

import { callCoachClaudeChat, type ClaudeChatTurn } from "@/lib/coach-chat";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

const WORKOUT_PLAN_BUILDER_SYSTEM = `You are an expert strength and conditioning coach. The user wants to build a workout plan through conversation.

1. Respond naturally; ask at most ONE clarifying question if critical details are missing.
2. When you have enough information, output a complete workout plan as valid JSON with double-quoted keys inside a markdown code block (\`\`\`json ... \`\`\`).

JSON structure:
{
  "planName": "string",
  "description": "string",
  "daysPerWeek": number,
  "days": [
    {
      "dayName": "string",
      "focus": "string",
      "isRestDay": boolean,
      "exercises": [
        {
          "name": "string",
          "sets": number,
          "reps": "string",
          "rest": "string",
          "notes": "string"
        }
      ]
    }
  ]
}

Tailor exercises, sets, reps, and rest to what the user described. Use empty exercises array for rest days.

When the user asks for changes, return the FULL updated plan as JSON in a new code block (not a partial patch), then briefly confirm in 1-2 sentences.

Do not rely on any preset program names — reflect only this user's goals and constraints.`;

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const obj =
      typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
    const messagesRaw = obj?.messages;
    if (!Array.isArray(messagesRaw) || messagesRaw.length === 0) {
      return jsonError("messages array is required.", 400);
    }

    const messages: ClaudeChatTurn[] = [];
    for (const m of messagesRaw) {
      if (!m || typeof m !== "object") continue;
      const r = m as Record<string, unknown>;
      const role = r.role === "user" || r.role === "assistant" ? r.role : null;
      const content = typeof r.content === "string" ? r.content.trim() : "";
      if (!role || !content) continue;
      messages.push({ role, content });
    }

    if (messages.length === 0) {
      return jsonError("No valid messages.", 400);
    }

    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const reply = await callCoachClaudeChat({
      system: WORKOUT_PLAN_BUILDER_SYSTEM,
      messages,
    });

    return NextResponse.json({ reply });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Workout plan builder failed.";
    return jsonError(message, 500);
  }
}
