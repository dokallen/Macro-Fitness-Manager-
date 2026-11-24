import "server-only";

import { normalizeClaudeTurns, type ClaudeTurn } from "@/lib/claude-messages";
import type { ClaudeTool } from "@/lib/coach-actions/registry";

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

export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

export type ClaudeToolUse = { id: string; name: string; input: unknown };

/**
 * One Coach chat turn with tools. Claude may answer with text, tool calls, or
 * both. Tool calls are returned to the caller as proposals; they are never
 * executed here.
 */
export async function callCoachClaudeWithTools(params: {
  system: string;
  messages: ClaudeTurn<ClaudeContentBlock>[];
  tools: ClaudeTool[];
}): Promise<{ text: string; toolUses: ClaudeToolUse[] }> {
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
      ...(params.tools.length ? { tools: params.tools } : {}),
    }),
  });

  if (!anthropicRes.ok) {
    const txt = (await anthropicRes.text()).slice(0, 1500);
    throw new Error(`Claude API error (${anthropicRes.status}): ${txt}`);
  }

  const raw = (await anthropicRes.json()) as {
    content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
  };
  const blocks = raw.content ?? [];
  const text = blocks
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text!.trim())
    .filter(Boolean)
    .join("\n\n");
  const toolUses: ClaudeToolUse[] = blocks
    .filter((c) => c.type === "tool_use" && typeof c.name === "string")
    .map((c) => ({ id: String(c.id ?? ""), name: c.name!, input: c.input }));
  if (!text && toolUses.length === 0) {
    throw new Error("Empty reply from Claude");
  }
  return { text, toolUses };
}
