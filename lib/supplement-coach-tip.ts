import "server-only";

export async function generateSupplementCoachTip(stackSummary: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const system = `You are a supportive fitness coach. Reply with one short paragraph only: at most 3 sentences. No title, no markdown, no bullet points. Focus on supplement timing, consistency, and safety for this stack.`;

  const userContent = `The user's current supplement stack (name, dosage, time, purpose):\n${stackSummary || "Empty stack — suggest starting with basics."}\n\nGive one personalized tip about their stack for today.`;

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
