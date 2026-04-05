import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { buildCoachSystemPromptFromPreferences } from "@/lib/coach-chat-context";
import { callCoachClaudeChat } from "@/lib/coach-chat";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_CHARS = 12000;

const PANTRY_SCAN_SYSTEM = `You are a pantry scanning assistant. The user has uploaded a photo of their pantry, fridge, or shelves. Identify every visible food item, ingredient, or grocery product you can see. Return ONLY a JSON array of strings, no markdown, no explanation, no preamble. Example: ["chicken breast", "eggs", "milk", "broccoli", "olive oil"]. Be specific but concise with item names.`;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(
      "ANTHROPIC_API_KEY is missing. Add it to your server environment and redeploy.",
      503
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const bodyObj =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;

  if (bodyObj?.pantryScan === true) {
    const rawImg =
      typeof bodyObj.imageBase64 === "string" ? bodyObj.imageBase64.trim() : "";
    if (!rawImg) {
      return jsonError("imageBase64 is required for pantry scan.", 400);
    }

    try {
      const supabase = createServerSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return jsonError("Unauthorized", 401);
      }

      const dataUrl = rawImg.match(/^data:(image\/[\w+.+-]+);base64,([\s\S]+)$/i);
      const mediaType =
        (typeof bodyObj.mediaType === "string" && bodyObj.mediaType.includes("/")
          ? bodyObj.mediaType
          : null) ||
        dataUrl?.[1] ||
        "image/jpeg";
      const b64 = (dataUrl?.[2] ?? rawImg.replace(/^data:[^;]+;base64,/i, "")).replace(
        /\s/g,
        ""
      );

      const maxTok =
        typeof bodyObj.max_tokens === "number" && bodyObj.max_tokens > 0
          ? Math.min(4096, Math.floor(bodyObj.max_tokens))
          : 1000;

      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: maxTok,
          temperature: 0.2,
          system: PANTRY_SCAN_SYSTEM,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: b64,
                  },
                },
                {
                  type: "text",
                  text: "What food items can you see in this photo?",
                },
              ],
            },
          ],
        }),
      });

      if (!anthropicRes.ok) {
        const txt = (await anthropicRes.text()).slice(0, 1500);
        return jsonError(`Claude API error (${anthropicRes.status}): ${txt}`, 502);
      }

      const raw = (await anthropicRes.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text =
        raw.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
      if (!text) {
        return jsonError("Empty response from vision model.", 502);
      }

      return NextResponse.json({ pantryScanReply: text });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Pantry scan failed.";
      return jsonError(message, 500);
    }
  }

  const content =
    bodyObj &&
    "content" in bodyObj &&
    typeof bodyObj.content === "string"
      ? bodyObj.content.trim()
      : "";

  if (!content) {
    return jsonError("Message content is required.", 400);
  }
  if (content.length > MAX_MESSAGE_CHARS) {
    return jsonError(`Message too long (max ${MAX_MESSAGE_CHARS} characters).`, 400);
  }

  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const { data: insertedUser, error: userInsErr } = await supabase
      .from("coach_messages")
      .insert({
        user_id: user.id,
        role: "user",
        content,
      })
      .select("id")
      .single();

    if (userInsErr || !insertedUser) {
      return jsonError(userInsErr?.message ?? "Failed to save message.", 500);
    }

    const { data: prefs, error: prefErr } = await supabase
      .from("user_preferences")
      .select("key, value")
      .eq("user_id", user.id);

    if (prefErr) {
      await supabase.from("coach_messages").delete().eq("id", insertedUser.id);
      return jsonError(prefErr.message, 500);
    }

    const fromBody =
      bodyObj &&
      "coachId" in bodyObj &&
      typeof bodyObj.coachId === "string"
        ? bodyObj.coachId.trim()
        : "";
    const fromPref = (prefs ?? []).find((r) => r.key === "chosen_coach_id");
    const fromCookie = cookies().get("mf_chosenCoachId")?.value?.trim() ?? "";
    const coachId =
      fromBody ||
      (fromPref?.value?.trim() ?? "") ||
      fromCookie ||
      "drdata";

    const system = buildCoachSystemPromptFromPreferences(prefs ?? [], coachId);

    const { data: history, error: histErr } = await supabase
      .from("coach_messages")
      .select("id, role, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (histErr) {
      await supabase.from("coach_messages").delete().eq("id", insertedUser.id);
      return jsonError(histErr.message, 500);
    }

    const claudeMessages: { role: "user" | "assistant"; content: string }[] =
      [];
    for (const row of history ?? []) {
      if (row.role === "user") {
        claudeMessages.push({ role: "user", content: row.content });
      } else if (row.role === "coach") {
        claudeMessages.push({ role: "assistant", content: row.content });
      }
    }

    let reply: string;
    try {
      reply = await callCoachClaudeChat({ system, messages: claudeMessages });
    } catch (e) {
      await supabase.from("coach_messages").delete().eq("id", insertedUser.id);
      const message =
        e instanceof Error ? e.message : "Failed to reach Claude.";
      if (/not configured/i.test(message)) {
        return jsonError(
          "ANTHROPIC_API_KEY is missing or empty. Set a valid key and retry.",
          503
        );
      }
      if (/Claude API error \(401\)|Claude API error \(403\)/i.test(message)) {
        return jsonError(
          "Anthropic rejected the API key (401/403). Verify ANTHROPIC_API_KEY.",
          502
        );
      }
      return jsonError(message, 500);
    }

    const { error: coachInsErr } = await supabase.from("coach_messages").insert({
      user_id: user.id,
      role: "coach",
      content: reply,
    });

    if (coachInsErr) {
      return jsonError(coachInsErr.message, 500);
    }

    const { data: updated, error: finalErr } = await supabase
      .from("coach_messages")
      .select("id, role, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (finalErr) {
      return jsonError(finalErr.message, 500);
    }

    return NextResponse.json({ messages: updated ?? [] });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to process coach chat.";
    return jsonError(message, 500);
  }
}
