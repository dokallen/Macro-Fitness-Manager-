import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/types";

type StoredMsg = Record<string, unknown>;

export type ConversationSaveResult =
  | { ok: true; messages: StoredMsg[] }
  | { ok: false; reason: "not_found" | "aborted" | "conflict" | "error"; message?: string };

const MAX_ATTEMPTS = 4;

/**
 * Safely rewrites coach_conversations.messages when other requests may be
 * writing the same row (a chat reply and an Apply tap at the same moment).
 *
 * Each attempt reads the latest messages, asks `build` for the new array, and
 * saves it only if the row is unchanged since that read (compare-and-set on
 * updated_at). If another write got in first, it reads again and retries.
 * `build` returns null to abort without writing.
 */
export async function updateConversationMessages(
  supabase: SupabaseClient<Database>,
  params: {
    conversationId: string;
    userId: string;
    build: (stored: StoredMsg[]) => StoredMsg[] | null;
    extra?: { title?: string; coach_id?: string };
  }
): Promise<ConversationSaveResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: row, error } = await supabase
      .from("coach_conversations")
      .select("messages, updated_at")
      .eq("id", params.conversationId)
      .eq("user_id", params.userId)
      .maybeSingle();
    if (error) return { ok: false, reason: "error", message: error.message };
    if (!row) return { ok: false, reason: "not_found" };

    const stored = Array.isArray(row.messages)
      ? (row.messages as StoredMsg[]).filter((m) => m && typeof m === "object")
      : [];
    const next = params.build(stored);
    if (next === null) return { ok: false, reason: "aborted" };

    const { data: updated, error: upErr } = await supabase
      .from("coach_conversations")
      .update({
        messages: next as unknown as Json,
        updated_at: new Date().toISOString(),
        ...(params.extra ?? {}),
      })
      .eq("id", params.conversationId)
      .eq("user_id", params.userId)
      .eq("updated_at", row.updated_at)
      .select("id");
    if (upErr) return { ok: false, reason: "error", message: upErr.message };
    if (updated && updated.length > 0) return { ok: true, messages: next };
  }
  return { ok: false, reason: "conflict" };
}
