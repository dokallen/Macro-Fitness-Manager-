import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

type MacroRequest = {
  currentWeight: number;
  currentWeightUnit: "lbs" | "kg";
  goalWeight: number;
  goalWeightUnit: "lbs" | "kg";
  age: number;
  height: string;
  biologicalSex: "female" | "male" | "other";
  activityLevel:
    | "sedentary"
    | "lightly active"
    | "moderately active"
    | "very active";
  primaryGoal:
    | "fat loss"
    | "muscle gain"
    | "maintenance"
    | "body recomposition";
};

type MacroResponse = {
  summary: string;
  timeframe: string;
  workoutFrequency: string;
  weeklyPlan: string;
  targets: Array<{ key: string; value: string; unit?: string }>;
  macroContext: {
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
  };
};

const SYSTEM_PROMPT = `You are an expert fitness and nutrition coach.

CRITICAL OUTPUT RULES — violate any of these and your answer is invalid:
- Respond with ONLY a single JSON object. No markdown. No code fences. No backticks. No preamble or postscript before or after the JSON.
- Do not wrap the JSON in \`\`\` or label it as json.
- The response must start with the character { and end with the character }.

Use this exact JSON shape and key names:

{
  "summary": "Conversational personalized summary for this user.",
  "timeframe": "Recommended safe timeframe to reach goal.",
  "workoutFrequency": "Recommended training days per week.",
  "weeklyPlan": "Suggested weekly structure such as split + rest days.",
  "targets": [
    { "key": "calories", "value": "2200", "unit": "kcal" },
    { "key": "protein", "value": "165", "unit": "g" },
    { "key": "carbs", "value": "220", "unit": "g" },
    { "key": "fat", "value": "70", "unit": "g" }
  ],
  "macroContext": {
    "calories": "Why this calorie level is appropriate.",
    "protein": "Why this protein target is appropriate.",
    "carbs": "Why this carb target is appropriate.",
    "fat": "Why this fat target is appropriate."
  }
}

Rules for the JSON:
- Interpret user profile: current weight, goal weight, age, height, biological sex, activity level, and primary goal.
- Always use established sports nutrition formulas (Mifflin-St Jeor for BMR, TDEE multipliers for activity level) to calculate targets. Show your math in the explanation. Results must be consistent for the same inputs.
- Use proven deterministic calculation order: calories from TDEE adjusted for goal, protein based on lean body mass or goal weight, and carbs/fat from remaining calories after protein is set.
- Give a realistic timeframe using safe rates of progress.
- Provide recommended workout frequency that matches the timeframe and goal.
- Give a weekly plan structure suggestion with training and rest-day pattern.
- "targets" must include calories, protein, carbs, fat.
- "value" must be a string (e.g. "2200" not 2200).
- "macroContext" must explain WHY each macro target supports the goal.
- Keep tone conversational, clear, and practical.`;

/** Strip ```json ... ``` or ``` ... ``` fences if present (anywhere in the string). */
function stripCodeFences(text: string): string {
  const t = text.trim();
  const block = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) return block[1].trim();
  if (t.startsWith("```")) {
    return t
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/m, "")
      .trim();
  }
  return t;
}

/**
 * Extract a balanced JSON object substring (handles strings with braces in quotes).
 */
function extractJsonObject(text: string): string | null {
  const inner = stripCodeFences(text);
  const start = inner.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < inner.length; i++) {
    const ch = inner[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return inner.slice(start, i + 1);
      }
    }
  }
  return null;
}

function normalizeMacroPayload(raw: unknown): MacroResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const targetsRaw = o.targets ?? o.Targets;
  if (!Array.isArray(targetsRaw) || targetsRaw.length === 0) return null;

  const targets: MacroResponse["targets"] = [];
  for (const item of targetsRaw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = String(row.key ?? row.name ?? "").trim();
    const value = String(row.value ?? "").trim();
    const unit =
      row.unit !== undefined && row.unit !== null
        ? String(row.unit).trim()
        : "";
    if (key && value) {
      targets.push({ key, value, ...(unit ? { unit } : {}) });
    }
  }

  if (targets.length === 0) return null;

  const summary = String(o.summary ?? o.explanation ?? o.Explanation ?? "").trim();
  const timeframe = String(o.timeframe ?? o.timeline ?? "").trim();
  const workoutFrequency = String(
    o.workoutFrequency ?? o.workout_frequency ?? o.trainingFrequency ?? ""
  ).trim();
  const weeklyPlan = String(o.weeklyPlan ?? o.weekly_plan ?? "").trim();

  const mcRaw = (o.macroContext ?? o.macro_context ?? {}) as Record<string, unknown>;
  const calories = String(mcRaw.calories ?? "").trim();
  const protein = String(mcRaw.protein ?? "").trim();
  const carbs = String(mcRaw.carbs ?? "").trim();
  const fat = String(mcRaw.fat ?? "").trim();

  if (!summary || !timeframe || !workoutFrequency || !weeklyPlan) return null;
  if (!calories || !protein || !carbs || !fat) return null;

  return {
    targets,
    summary,
    timeframe,
    workoutFrequency,
    weeklyPlan,
    macroContext: { calories, protein, carbs, fat },
  };
}

function parseClaudeMacroJson(assistantText: string): MacroResponse | null {
  const trimmed = assistantText.trim();
  console.log("[macro-targets] raw Claude assistant text (length=%d):\n%s", trimmed.length, trimmed);

  const candidates: string[] = [];
  candidates.push(trimmed);
  const extracted = extractJsonObject(trimmed);
  if (extracted) candidates.push(extracted);

  for (const blob of candidates) {
    try {
      const raw = JSON.parse(blob) as unknown;
      const norm = normalizeMacroPayload(raw);
      if (norm) return norm;
    } catch {
      /* try next */
    }
  }

  const loose = trimmed.match(/\{[\s\S]*\}/);
  if (loose) {
    try {
      const raw = JSON.parse(loose[0]) as unknown;
      return normalizeMacroPayload(raw);
    } catch {
      /* fall through */
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return jsonError(
        "ANTHROPIC_API_KEY is not set. Add it to .env.local (server-only; no NEXT_PUBLIC_ prefix) and restart the dev server.",
        503
      );
    }

    let input: MacroRequest;
    try {
      input = (await req.json()) as MacroRequest;
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const userPrompt = `User profile (JSON):
${JSON.stringify(input, null, 2)}

Respond with ONLY the JSON object in the exact format specified in your instructions. No other text.`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 900,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const txt = (await anthropicRes.text()).slice(0, 2000);
      const looksHtml = /^\s*</.test(txt);
      return jsonError(
        looksHtml
          ? `Claude API returned an error (${anthropicRes.status}). Check ANTHROPIC_API_KEY and model name.`
          : `Claude API error (${anthropicRes.status}): ${txt}`,
        502
      );
    }

    const rawCt = anthropicRes.headers.get("content-type") ?? "";
    if (!rawCt.includes("application/json")) {
      const preview = (await anthropicRes.text()).slice(0, 500);
      return jsonError(
        preview.trimStart().startsWith("<")
          ? "Claude API returned non-JSON (HTML). Check ANTHROPIC_API_KEY and API endpoint."
          : "Claude API returned an unexpected response format.",
        502
      );
    }

    const raw = (await anthropicRes.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = raw.content?.find((c) => c.type === "text")?.text?.trim() ?? "";

    const parsed = parseClaudeMacroJson(text);

    if (!parsed) {
      return jsonError("Failed to parse macro recommendations from Claude.", 500);
    }

    const targets = parsed.targets
      .map((t) => ({
        key: String(t.key ?? "").trim(),
        value: String(t.value ?? "").trim(),
        unit: t.unit ? String(t.unit).trim() : "",
      }))
      .filter((t) => t.key && t.value);

    if (targets.length === 0) {
      return jsonError("Claude returned no usable targets.", 500);
    }

    return NextResponse.json({
      summary: parsed.summary,
      timeframe: parsed.timeframe,
      workoutFrequency: parsed.workoutFrequency,
      weeklyPlan: parsed.weeklyPlan,
      macroContext: parsed.macroContext,
      targets,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Unknown error",
      500
    );
  }
}
