import "server-only";

export type CoachTipContext = {
  goal: string;
  recommended_goal_timeframe: string;
  recommended_workout_frequency: string;
};

export async function generateCoachTip(ctx: CoachTipContext): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const system = `You are a supportive fitness coach. Reply with one short paragraph only: at most 3 sentences. No title, no markdown, no bullet points, no "Dear user". Be specific and actionable for today.`;

  const userContent = `User context:
- Goal: ${ctx.goal || "Not specified"}
- Recommended timeframe: ${ctx.recommended_goal_timeframe || "Not specified"}
- Training frequency: ${ctx.recommended_workout_frequency || "Not specified"}

Give one personalized tip they can apply today.`;

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 220,
      temperature: 0.65,
      system,
      messages: [{ role: "user", content: userContent }],
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
    throw new Error("Empty coach tip from Claude");
  }
  return text;
}
