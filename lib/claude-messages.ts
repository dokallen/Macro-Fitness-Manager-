/**
 * Makes a multi-turn message list safe to send to the Claude Messages API.
 *
 * The Claude API reference says models are trained on alternating user/assistant
 * turns and that consecutive same-role turns are combined. It does not state that
 * the first turn must be the user's; this is hardening so every request follows
 * the trained format. Several chats here start with an assistant turn: a hardcoded opening
 * line (workout builders, challenges) or, in long Coach chats, the condensed
 * "[Conversation summary] ..." that compressMessagesIfNeeded puts at the front.
 *
 * Rules:
 * - A leading assistant turn that is a conversation summary is kept, sent as a
 *   user turn so its context is not lost.
 * - Any other leading assistant turn is an opening greeting with no user
 *   information, and is dropped.
 * - Turns with empty content are skipped (the API rejects empty text).
 * - Consecutive turns from the same role are merged, so roles alternate.
 *
 * Pure: never mutates its input. What the user sees in the chat UI is unchanged.
 */

export const CONVERSATION_SUMMARY_PREFIX = "[Conversation summary]";

export type ClaudeRole = "user" | "assistant";

/** Content is plain text or an array of content blocks (text, image, ...). */
export type ClaudeTurn<Block = unknown> = {
  role: ClaudeRole;
  content: string | Block[];
};

function isSummary(content: ClaudeTurn["content"]): boolean {
  return (
    typeof content === "string" &&
    content.trimStart().startsWith(CONVERSATION_SUMMARY_PREFIX)
  );
}

function isEmpty(content: ClaudeTurn["content"]): boolean {
  return typeof content === "string" ? content.trim() === "" : content.length === 0;
}

function mergeContent<Block>(
  a: string | Block[],
  b: string | Block[]
): string | Block[] {
  if (typeof a === "string" && typeof b === "string") {
    return `${a}\n\n${b}`;
  }
  const toBlocks = (c: string | Block[]): Block[] =>
    typeof c === "string" ? [{ type: "text", text: c } as Block] : c;
  return [...toBlocks(a), ...toBlocks(b)];
}

export function normalizeClaudeTurns<Block = unknown>(
  turns: readonly ClaudeTurn<Block>[]
): ClaudeTurn<Block>[] {
  const out: ClaudeTurn<Block>[] = [];
  let seenUserTurn = false;

  for (const turn of turns) {
    if (isEmpty(turn.content)) continue;
    let role = turn.role;
    if (!seenUserTurn && role === "assistant") {
      if (!isSummary(turn.content)) continue; // opening greeting: drop
      role = "user"; // conversation summary: keep as context
    }
    if (role === "user") seenUserTurn = true;

    const last = out[out.length - 1];
    if (last && last.role === role) {
      out[out.length - 1] = {
        role,
        content: mergeContent(last.content, turn.content),
      };
    } else {
      out.push({ role, content: turn.content });
    }
  }

  return out;
}
