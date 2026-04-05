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

const GUIDED_ONBOARDING_SYSTEM = `You are an expert strength and conditioning coach. The user completed a short questionnaire on the workout onboarding flow.

Your task:
1. Write a brief, encouraging intro (1–2 sentences only, plain text before the code block).
2. Immediately after, output ONE markdown code block \`\`\`json ... \`\`\` containing valid JSON with double-quoted keys in this exact shape:
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
        { "name": "string", "sets": number, "reps": "string", "rest": "string", "notes": "string" }
      ]
    }
  ]
}

Build the full week structure from their answers: respect how many days they can train, equipment available, goal, experience level, and any injury or limitation notes (scale volume and exercise selection accordingly). Use rest days where appropriate. Exercises must be empty arrays on rest days.

Do not paste generic boilerplate plans — every plan name, day name, and exercise selection should follow logically from the questionnaire answers.`;

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

    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const mode = typeof obj?.mode === "string" ? obj.mode.trim() : "";

    if (mode === "guided_onboarding") {
      const ga = obj?.guidedAnswers;
      if (!ga || typeof ga !== "object") {
        return jsonError("guidedAnswers object is required.", 400);
      }
      const a = ga as Record<string, unknown>;
      const goal = String(a.goal ?? "").trim();
      const daysPerWeek = String(a.daysPerWeek ?? "").trim();
      const equipment = String(a.equipment ?? "").trim();
      const experience = String(a.experience ?? "").trim();
      const injuries = String(a.injuries ?? "").trim() || "None noted";

      if (!goal || !daysPerWeek || !equipment || !experience) {
        return jsonError("Incomplete questionnaire answers.", 400);
      }

      const userContent = `Questionnaire — use every line to build the plan:

- Main goal: ${goal}
- Training frequency (days per week): ${daysPerWeek}
- Equipment access: ${equipment}
- Experience level: ${experience}
- Injuries / limitations: ${injuries}

Generate the JSON plan now.`;

      const reply = await callCoachClaudeChat({
        system: GUIDED_ONBOARDING_SYSTEM,
        messages: [{ role: "user", content: userContent }],
      });

      return NextResponse.json({ reply });
    }

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
