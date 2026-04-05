import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { buildCoachSystemPromptFromPreferences } from "@/lib/coach-chat-context";
import { callCoachClaudeChat } from "@/lib/coach-chat";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_CHARS = 12000;

const PANTRY_SCAN_SYSTEM = `You are a pantry scanning assistant. The user has uploaded a photo of their pantry, fridge, or shelves. Identify every visible food item, ingredient, or grocery product you can see. Return ONLY a JSON array of strings, no markdown, no explanation, no preamble. Example: ["chicken breast", "eggs", "milk", "broccoli", "olive oil"]. Be specific but concise with item names.`;

const FOOD_LABEL_SYSTEM = `You are a nutrition label reader. The user has uploaded a photo of a food nutrition label. Extract the nutrition facts and return ONLY valid JSON with no markdown: {"name": string, "cal": number, "pro": number, "fat": number, "carbs": number, "sodium": number, "fiber": number, "sugar": number, "servingSize": string}. Use 0 for any field not visible.`;

const RECIPE_INGREDIENTS_SYSTEM = `Extract all ingredients from this recipe image. Return ONLY a JSON array: [{"amount": string, "unit": string, "name": string}]. No markdown.`;

const RECIPE_MACROS_SYSTEM = `You are a precision nutrition calculator. Calculate macros per serving for this recipe. Return ONLY valid JSON: {"macrosPerServing": {"cal": number, "pro": number, "fat": number, "carbs": number}, "verdict": "fits"|"adjust"|"doesnt_fit", "verdictNote": string, "adjustments": [{"change": string, "reason": string}]}.`;

const WARMUP_SYSTEM = `You are a fitness coach. Generate a 5-minute dynamic warm-up for the specified workout type. List 5 movements with reps or duration. Format as a numbered list. Be specific and practical.`;

const ONE_RM_OCR_SYSTEM = `The user uploaded a photo of training notes (whiteboard, log, app screenshot). Extract the most prominent weight value in pounds (or convert kg to lbs if clearly labeled) and rep count for a single set. Return ONLY valid JSON: {"weight": number, "reps": number}. Use 0 if a value cannot be determined.`;

const DETECT_BODY_METRICS_SYSTEM = `The user has uploaded a screenshot or photo from a scale, fitness app, or health device. Detect every visible health metric and its value. Return ONLY valid JSON array: [{name: string, value: string, unit: string}]. Examples of metrics: weight, body fat percentage, muscle mass, visceral fat, BMR, skeletal muscle percentage, metabolic age, body water percentage, bone mass, protein percentage. Include every metric visible. No markdown.`;

const BODY_COMP_ANALYSIS_SYSTEM = `You are a fitness coach analyzing body composition trends. The user just logged a weigh-in. Compare current vs previous metrics and give 2-3 sentences of insight. Focus on what's most notable — muscle retention, fat loss progress, concerning trends. Be specific with numbers. Stay encouraging but honest. End with one actionable tip for this week.`;

const NUTRITION_CHECK_SYSTEM = `You are a real-time nutrition coach. The user just logged a meal. Review their current daily totals vs targets and give ONE sentence of forward-looking feedback. Focus on what they should eat next or what to be mindful of for the rest of the day. Be specific with numbers remaining. Never repeat what they just ate. Keep it under 20 words.`;

const MEAL_SUGGESTION_SYSTEM = `You are a nutrition coach. Based on the user's remaining macro targets for today, suggest 2-3 specific meal ideas that would fit well. Format as a simple list. Each suggestion should include approximate calories and protein. Be practical and realistic. Under 60 words total.`;

const METRIC_WEEK_INSIGHT_SYSTEM = `You are a fitness coach. The user is comparing body metrics this week vs last week (averages). Reply with exactly one short sentence about the most notable change. Use specific numbers from the payload. Stay encouraging. No markdown.`;

const SCAN_RECIPE_SYSTEM = `Extract this recipe from the image. Return ONLY valid JSON: {name: string, servings: number, ingredients: [{amount: string, unit: string, name: string}], steps: string[], prepTime: number, cookTime: number, notes: string}. Use empty string for missing string fields, 0 for missing numbers, empty array if unknown. No markdown.`;

const BUILD_RECIPE_FROM_DESCRIPTION_SYSTEM = `The user described a recipe in plain language. Extract the recipe and calculate macros per serving. Return ONLY valid JSON: {name: string, servings: number, ingredients: [{amount: string, unit: string, name: string}], steps: string[], macrosPerServing: {cal: number, pro: number, fat: number, carbs: number}, prepTime: number, cookTime: number, notes: string}. No markdown.`;

const GOTO_RECIPE_COMPARE_SYSTEM = `You are a nutrition coach comparing two recipes for a user. Analyze both recipes and give: 1) Which fits better for their current macro targets and why (2 sentences), 2) Portion sizing recommendation for each, 3) Best timing for each (e.g. pre-workout, post-workout, rest day). Be specific with numbers. Keep it under 100 words total.`;

const GOTO_RECIPE_MACRO_FIT_SYSTEM = `You compare one recipe's per-serving macros to the user's daily macro targets (JSON input). Return ONLY valid JSON: {"verdict":"fits"|"close"|"no_fit","sentence":string}. Verdict: fits if it can fit cleanly as a typical main meal; close if workable with a smaller portion or day balancing; no_fit if dominant macros make it a poor match. One concise sentence. No markdown.`;

function workoutScreenshotSystem(lbsLabel: string) {
  return `Analyze this workout screenshot. IGNORE all calorie numbers shown in the app — those are inaccurate. Look for: workout duration, exercise names, and any heart rate data. Using MET method for the workout type detected, calculate calories burned for a person weighing ${lbsLabel}. Reply in 2-3 sentences: duration detected, calculated calories using MET, brief note.`;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function parseImagePayload(rawImg: string): { mediaType: string; b64: string } {
  const dataUrl = rawImg.match(/^data:(image\/[\w+.+-]+);base64,([\s\S]+)$/i);
  const mediaType =
    dataUrl?.[1] ||
    (rawImg.startsWith("data:") ? "image/jpeg" : "image/jpeg");
  const b64 = (dataUrl?.[2] ?? rawImg.replace(/^data:[^;]+;base64,/i, "")).replace(
    /\s/g,
    ""
  );
  return { mediaType, b64 };
}

type AnthropicBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

async function callAnthropicVisionOrText(params: {
  apiKey: string;
  system: string;
  userBlocks: AnthropicBlock[];
  max_tokens: number;
  temperature: number;
}): Promise<string> {
  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: params.max_tokens,
      temperature: params.temperature,
      system: params.system,
      messages: [{ role: "user", content: params.userBlocks }],
    }),
  });

  if (!anthropicRes.ok) {
    const txt = (await anthropicRes.text()).slice(0, 1500);
    throw new Error(`Claude API error (${anthropicRes.status}): ${txt}`);
  }

  const raw = (await anthropicRes.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text =
    raw.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
  if (!text) {
    throw new Error("Empty reply from Claude");
  }
  return text;
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

  const coachTask =
    bodyObj && typeof bodyObj.coachTask === "string"
      ? bodyObj.coachTask.trim()
      : "";

  if (coachTask) {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Unauthorized", 401);
    }

    const userText =
      bodyObj && typeof bodyObj.userText === "string" ? bodyObj.userText.trim() : "";
    const rawImg =
      bodyObj && typeof bodyObj.imageBase64 === "string"
        ? bodyObj.imageBase64.trim()
        : "";

    const resolveCoachSystem = async () => {
      const { data: prefs } = await supabase
        .from("user_preferences")
        .select("key, value")
        .eq("user_id", user.id);
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
      return {
        system: buildCoachSystemPromptFromPreferences(prefs ?? [], coachId),
      };
    };

    try {
      const maxTok =
        typeof bodyObj?.max_tokens === "number" && bodyObj.max_tokens > 0
          ? Math.min(4096, Math.floor(bodyObj.max_tokens))
          : 1500;

      if (coachTask === "food_label") {
        if (!rawImg) return jsonError("imageBase64 is required.", 400);
        const { mediaType, b64 } = parseImagePayload(rawImg);
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: FOOD_LABEL_SYSTEM,
          userBlocks: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: b64 },
            },
            { type: "text", text: "Read this nutrition label and return JSON only." },
          ],
          max_tokens: maxTok,
          temperature: 0.1,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "recipe_ingredients") {
        if (!rawImg) return jsonError("imageBase64 is required.", 400);
        const { mediaType, b64 } = parseImagePayload(rawImg);
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: RECIPE_INGREDIENTS_SYSTEM,
          userBlocks: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: b64 },
            },
            { type: "text", text: "List every ingredient from this recipe image." },
          ],
          max_tokens: maxTok,
          temperature: 0.1,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "recipe_macros") {
        if (!userText) return jsonError("userText is required.", 400);
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: RECIPE_MACROS_SYSTEM,
          userBlocks: [{ type: "text", text: userText }],
          max_tokens: maxTok,
          temperature: 0.2,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "warmup") {
        if (!userText) return jsonError("userText is required.", 400);
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: WARMUP_SYSTEM,
          userBlocks: [
            { type: "text", text: `Generate a warm-up for: ${userText.slice(0, 500)}` },
          ],
          max_tokens: maxTok,
          temperature: 0.5,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "exercise_movement") {
        if (!userText) return jsonError("userText is required.", 400);
        const ex = userText.slice(0, 200);
        const sys = `Describe the movement pattern for "${ex}" in 2-3 sentences as if narrating a slow-motion video. Focus on start position, key movement points, and end position. Then list: Primary muscles, Secondary muscles.`;
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: sys,
          userBlocks: [{ type: "text", text: `Exercise: ${ex}` }],
          max_tokens: maxTok,
          temperature: 0.4,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "exercise_form") {
        if (!userText) return jsonError("userText is required.", 400);
        const ex = userText.slice(0, 200);
        const sys = `Give a coaching breakdown for "${ex}": 1) Starting position, 2) Execution steps numbered, 3) Breathing cues, 4) Three most common mistakes, 5) One pro tip. Be concise and actionable.`;
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: sys,
          userBlocks: [{ type: "text", text: `Exercise: ${ex}` }],
          max_tokens: maxTok,
          temperature: 0.4,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "one_rm_ocr") {
        if (!rawImg) return jsonError("imageBase64 is required.", 400);
        const { mediaType, b64 } = parseImagePayload(rawImg);
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: ONE_RM_OCR_SYSTEM,
          userBlocks: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: b64 },
            },
            { type: "text", text: "Extract weight and reps as JSON only." },
          ],
          max_tokens: 300,
          temperature: 0.1,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "workout_screenshot") {
        if (!rawImg) return jsonError("imageBase64 is required.", 400);
        const { mediaType, b64 } = parseImagePayload(rawImg);
        const cw =
          typeof bodyObj?.currentWeightLbs === "number" &&
          Number.isFinite(bodyObj.currentWeightLbs)
            ? `${bodyObj.currentWeightLbs} lbs`
            : "an unknown bodyweight — state any assumptions you make clearly";
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: workoutScreenshotSystem(cw),
          userBlocks: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: b64 },
            },
            {
              type: "text",
              text: "Analyze this workout screenshot and estimate calories burned using MET.",
            },
          ],
          max_tokens: maxTok,
          temperature: 0.3,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "workout_spoken_burn") {
        if (!userText) return jsonError("userText is required.", 400);
        const cw =
          typeof bodyObj?.currentWeightLbs === "number" &&
          Number.isFinite(bodyObj.currentWeightLbs)
            ? `${bodyObj.currentWeightLbs} lbs`
            : "an unknown bodyweight — state any assumptions clearly";
        const sys = `The user described their workout in words (no screenshot). Using the MET method, estimate calories burned for a person weighing ${cw}. Reply in 2-3 sentences with your estimate and brief reasoning.`;
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: sys,
          userBlocks: [{ type: "text", text: userText.slice(0, MAX_MESSAGE_CHARS) }],
          max_tokens: maxTok,
          temperature: 0.3,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "post_workout") {
        if (!userText) return jsonError("userText is required.", 400);
        const { system } = await resolveCoachSystem();
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system,
          userBlocks: [{ type: "text", text: userText.slice(0, MAX_MESSAGE_CHARS) }],
          max_tokens: 500,
          temperature: 0.7,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "detect_body_metrics") {
        if (!rawImg) return jsonError("imageBase64 is required.", 400);
        const { mediaType, b64 } = parseImagePayload(rawImg);
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: DETECT_BODY_METRICS_SYSTEM,
          userBlocks: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: b64 },
            },
            {
              type: "text",
              text: "Return only the JSON array of visible metrics and values.",
            },
          ],
          max_tokens: maxTok,
          temperature: 0.1,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "body_comp_analysis") {
        if (!userText) return jsonError("userText is required.", 400);
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: BODY_COMP_ANALYSIS_SYSTEM,
          userBlocks: [{ type: "text", text: userText.slice(0, MAX_MESSAGE_CHARS) }],
          max_tokens: 500,
          temperature: 0.65,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "nutrition_check") {
        if (!userText) return jsonError("userText is required.", 400);
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: NUTRITION_CHECK_SYSTEM,
          userBlocks: [{ type: "text", text: userText.slice(0, 2000) }],
          max_tokens: 120,
          temperature: 0.5,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "meal_suggestion") {
        if (!userText) return jsonError("userText is required.", 400);
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: MEAL_SUGGESTION_SYSTEM,
          userBlocks: [{ type: "text", text: userText.slice(0, 4000) }],
          max_tokens: 220,
          temperature: 0.55,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "metric_week_insight") {
        if (!userText) return jsonError("userText is required.", 400);
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: METRIC_WEEK_INSIGHT_SYSTEM,
          userBlocks: [{ type: "text", text: userText.slice(0, 4000) }],
          max_tokens: 120,
          temperature: 0.55,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "scan_recipe") {
        if (!rawImg) return jsonError("imageBase64 is required.", 400);
        const { mediaType, b64 } = parseImagePayload(rawImg);
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: SCAN_RECIPE_SYSTEM,
          userBlocks: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: b64 },
            },
            { type: "text", text: "Return only the JSON object for this recipe." },
          ],
          max_tokens: maxTok,
          temperature: 0.15,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "build_recipe_from_description") {
        if (!userText) return jsonError("userText is required.", 400);
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: BUILD_RECIPE_FROM_DESCRIPTION_SYSTEM,
          userBlocks: [{ type: "text", text: userText.slice(0, MAX_MESSAGE_CHARS) }],
          max_tokens: maxTok,
          temperature: 0.25,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "goto_recipe_compare") {
        if (!userText) return jsonError("userText is required.", 400);
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: GOTO_RECIPE_COMPARE_SYSTEM,
          userBlocks: [{ type: "text", text: userText.slice(0, 8000) }],
          max_tokens: 400,
          temperature: 0.45,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      if (coachTask === "goto_recipe_macro_fit") {
        if (!userText) return jsonError("userText is required.", 400);
        const text = await callAnthropicVisionOrText({
          apiKey: apiKey!,
          system: GOTO_RECIPE_MACRO_FIT_SYSTEM,
          userBlocks: [{ type: "text", text: userText.slice(0, 4000) }],
          max_tokens: 200,
          temperature: 0.35,
        });
        return NextResponse.json({ coachTaskReply: text });
      }

      return jsonError(`Unknown coachTask: ${coachTask}`, 400);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Coach task failed.";
      if (/not configured|ANTHROPIC_API_KEY/i.test(message)) {
        return jsonError(
          "ANTHROPIC_API_KEY is missing or empty. Set a valid key and retry.",
          503
        );
      }
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

  const rawChatImg =
    bodyObj && typeof bodyObj.imageBase64 === "string"
      ? bodyObj.imageBase64.trim()
      : "";

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

    const rows = history ?? [];
    let reply: string;

    if (rawChatImg) {
      const { mediaType, b64 } = parseImagePayload(rawChatImg);
      const claudePayload: {
        role: "user" | "assistant";
        content: string | AnthropicBlock[];
      }[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const isLastUser =
          i === rows.length - 1 && row.role === "user";
        if (row.role === "user") {
          if (isLastUser) {
            claudePayload.push({
              role: "user",
              content: [
                {
                  type: "image",
                  source: { type: "base64", media_type: mediaType, data: b64 },
                },
                { type: "text", text: row.content },
              ],
            });
          } else {
            claudePayload.push({ role: "user", content: row.content });
          }
        } else if (row.role === "coach") {
          claudePayload.push({ role: "assistant", content: row.content });
        }
      }

      try {
        const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            temperature: 0.7,
            system,
            messages: claudePayload,
          }),
        });

        if (!anthropicRes.ok) {
          const txt = (await anthropicRes.text()).slice(0, 1500);
          throw new Error(`Claude API error (${anthropicRes.status}): ${txt}`);
        }

        const raw = (await anthropicRes.json()) as {
          content?: Array<{ type: string; text?: string }>;
        };
        reply =
          raw.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
        if (!reply) throw new Error("Empty reply from Claude");
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
    } else {
      const claudeMessages: { role: "user" | "assistant"; content: string }[] =
        [];
      for (const row of rows) {
        if (row.role === "user") {
          claudeMessages.push({ role: "user", content: row.content });
        } else if (row.role === "coach") {
          claudeMessages.push({ role: "assistant", content: row.content });
        }
      }

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
