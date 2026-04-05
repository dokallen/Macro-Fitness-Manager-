"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { COACHES } from "@/components/coach/CoachChooser";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const supabase = createBrowserSupabaseClient();

export type ConversationSummary = {
  id: string;
  title: string;
  updated_at: string;
  coach_id: string;
};

function coachIconForId(coachId: string): string {
  const c = COACHES.find((x) => x.id === coachId);
  return c?.icon ?? "🧠";
}

function formatConversationTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const startY = new Date(startToday);
    startY.setDate(startY.getDate() - 1);
    if (d >= startY && d < startToday) return "Yesterday";
    const weekAgo = new Date(startToday);
    weekAgo.setDate(weekAgo.getDate() - 6);
    if (d >= weekAgo) {
      return d.toLocaleDateString(undefined, { weekday: "long" });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

type Props = {
  userId: string;
  searchQuery: string;
  activeId: string | null;
  onSelect: (id: string) => void;
  onLongPressDelete: (id: string) => void;
  refreshNonce?: number;
};

export function ConversationList({
  userId,
  searchQuery,
  activeId,
  onSelect,
  onLongPressDelete,
  refreshNonce = 0,
}: Props) {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pullOffset, setPullOffset] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("coach_conversations")
      .select("id, title, updated_at, coach_id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error(error);
      setItems([]);
      setLoading(false);
      return;
    }
    setItems((data ?? []) as ConversationSummary[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void fetchList();
  }, [fetchList, refreshNonce]);

  useEffect(() => {
    const channel = supabase
      .channel(`coach_conversations_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "coach_conversations",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void fetchList();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchList, userId]);

  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? items.filter((x) => x.title.toLowerCase().includes(q))
    : items;

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (touchStartY.current === null) return;
    const y = e.touches[0]?.clientY ?? 0;
    const delta = y - touchStartY.current;
    if (delta > 0 && (e.currentTarget as HTMLDivElement).scrollTop <= 0) {
      setPullOffset(Math.min(80, delta * 0.4));
    }
  }

  function onTouchEnd() {
    touchStartY.current = null;
    if (pullOffset > 48) {
      void fetchList();
    }
    setPullOffset(0);
  }

  if (loading) {
    return (
      <div className="space-y-2 px-2 py-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-lg bg-muted/60"
            aria-hidden
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-[var(--text3)]">
        No conversations yet. Start chatting!
      </p>
    );
  }

  if (filtered.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-[var(--text3)]">
        No matches.
      </p>
    );
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {pullOffset > 8 ? (
        <div
          className="py-2 text-center text-[10px] text-[var(--text3)]"
          style={{ height: pullOffset }}
        >
          Release to refresh
        </div>
      ) : null}
      <ul className="space-y-0.5 pb-2">
        {filtered.map((row) => {
          const active = row.id === activeId;
          return (
            <li key={row.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-start gap-2 border-l-[3px] px-2 py-2.5 text-left transition-colors",
                  active
                    ? "border-[var(--accent)] bg-[var(--surface2)]"
                    : "border-transparent hover:bg-[var(--surface2)]/80"
                )}
                onClick={() => {
                  if (longPressFired.current) {
                    longPressFired.current = false;
                    return;
                  }
                  onSelect(row.id);
                }}
                onMouseDown={() => {
                  longPressFired.current = false;
                  longPressTimer.current = window.setTimeout(() => {
                    longPressFired.current = true;
                    onLongPressDelete(row.id);
                  }, 550);
                }}
                onMouseUp={() => {
                  if (longPressTimer.current) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                }}
                onMouseLeave={() => {
                  if (longPressTimer.current) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                }}
                onTouchStart={() => {
                  longPressFired.current = false;
                  longPressTimer.current = window.setTimeout(() => {
                    longPressFired.current = true;
                    onLongPressDelete(row.id);
                  }, 550);
                }}
                onTouchEnd={() => {
                  if (longPressTimer.current) {
                    clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                  }
                }}
              >
                <span
                  className={cn(
                    "shrink-0 text-lg leading-none",
                    active ? "opacity-100" : "opacity-80"
                  )}
                  style={{ color: active ? "var(--accent)" : "var(--text2)" }}
                  aria-hidden
                >
                  {coachIconForId(row.coach_id)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-sm font-medium text-[var(--text)]">
                    {row.title || "Untitled"}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[var(--text3)]">
                    {formatConversationTime(row.updated_at)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
