import "server-only";

import { normalizeClaudeTurns } from "@/lib/claude-messages";

export type ClaudeChatTurn = { role: "user" | "assistant"; content: string };

const MODEL = "claude-sonnet-4-6";

export async function callCoachClaudeChat(params: {
  system: string;
  messages: ClaudeChatTurn[];
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const messages = normalizeClaudeTurns(params.messages);
  if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
    throw new Error("No user message to send");
  }

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      temperature: 0.7,
      system: params.system,
      messages,
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
