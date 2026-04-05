import { NextResponse } from "next/server";

import { callCoachClaudeChat, type ClaudeChatTurn } from "@/lib/coach-chat";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

const CHALLENGE_BUILDER_SYSTEM = `You are a fitness and lifestyle coach helping a user set up a personal challenge. The user has described what they want to do. Your job is to:
1. Acknowledge their goal enthusiastically in 1-2 sentences
2. Clarify any missing details with ONE question if needed (duration, specific rules, etc.)
3. Once you have enough info, generate the challenge structure as JSON inside a markdown code block (use \`\`\`json ... \`\`\`)

The JSON must be valid JSON with double-quoted keys and follow this exact structure:
{
  "name": "string",
  "description": "string",
  "totalDays": number,
  "startDate": "string (today's date in ISO date format YYYY-MM-DD)",
  "rules": [
    {
      "id": "string (unique id)",
      "name": "string",
      "description": "string",
      "type": "boolean" | "number" | "text",
      "target": number | null,
      "unit": "string | null",
      "required": boolean
    }
  ]
}

Make rules specific enough to be trackable daily. "boolean" rules are yes/no. "number" rules have a target the user tracks toward. "text" rules require a note or short description.

After the JSON block, add a friendly message asking if this looks right or if they want to adjust anything.

Never invent a fixed library of challenge names — reflect only what this user asked for.`;

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
      system: CHALLENGE_BUILDER_SYSTEM,
      messages,
    });

    return NextResponse.json({ reply });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Challenge builder failed.";
    return jsonError(message, 500);
  }
}
