"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ConversationList } from "@/components/coach/ConversationList";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const supabase = createBrowserSupabaseClient();

function fromCoachConversationsTable() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- coach_conversations not in generated Database type
  return (supabase as any).from("coach_conversations");
}

type Props = {
  open: boolean;
  userId: string;
  activeConversationId: string | null;
  onClose: () => void;
  onNew: () => void;
  onSelectConversation: (id: string) => void;
  listRefreshNonce?: number;
};

export function ConversationSidebar({
  open,
  userId,
  activeConversationId,
  onClose,
  onNew,
  onSelectConversation,
  listRefreshNonce,
}: Props) {
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="absolute inset-0 z-[25] bg-black/35 transition-opacity"
        aria-label="Close conversation list"
        onClick={onClose}
      />
      <aside
        className="absolute bottom-0 left-0 top-0 z-[30] flex w-[240px] flex-col border-r border-[var(--border)] bg-[var(--bg)] shadow-lg transition-transform duration-200"
        style={{ transform: open ? "translateX(0)" : "translateX(-100%)" }}
        aria-hidden={!open}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-2 py-2">
          <h2 className="flex-1 font-[family-name:var(--fd)] text-xs uppercase tracking-wide text-[var(--text)]">
            CONVERSATIONS
          </h2>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-[var(--text2)]"
            aria-label="Close sidebar"
            onClick={onClose}
          >
            ×
          </button>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[11px] font-medium text-white"
            style={{ background: "var(--accent)" }}
            onClick={onNew}
          >
            + New
          </button>
        </div>
        <div className="shrink-0 px-2 py-2">
          <input
            className="inf w-full text-sm"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search conversations"
          />
        </div>
        <ConversationList
          userId={userId}
          searchQuery={search}
          activeId={activeConversationId}
          onSelect={(id) => {
            onSelectConversation(id);
            onClose();
          }}
          onLongPressDelete={(id) => setDeleteTarget(id)}
          refreshNonce={listRefreshNonce}
        />
      </aside>

      {deleteTarget ? (
        <div className="absolute inset-0 z-[40] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg">
            <p className="text-sm text-[var(--text)]">Delete this conversation?</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg border border-[var(--border)] py-2 text-sm"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-[var(--red)] py-2 text-sm text-white"
                onClick={async () => {
                  const tid = deleteTarget;
                  if (!tid) return;
                  const wasActive = tid === activeConversationId;
                  const { error } = await fromCoachConversationsTable()
                    .delete()
                    .eq("id", tid)
                    .eq("user_id", userId);
                  setDeleteTarget(null);
                  if (error) {
                    toast.error(error.message);
                    return;
                  }
                  if (wasActive) onNew();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
