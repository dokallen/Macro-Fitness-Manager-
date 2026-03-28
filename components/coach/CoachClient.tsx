"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const supabase = createBrowserSupabaseClient();

export type CoachMessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface-2 px-4 py-3 text-sm font-sans text-muted-foreground"
        aria-live="polite"
        aria-label="Coach is typing"
      >
        <span className="inline-flex gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:0ms]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:150ms]" />
          <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  );
}

export function CoachClient({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<CoachMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const loadMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from("coach_messages")
      .select("id, role, content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setMessages((data ?? []) as CoachMessageRow[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending, scrollToBottom]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setDraft("");

    try {
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        messages?: CoachMessageRow[];
      };

      if (!res.ok) {
        toast.error(payload.error ?? "Could not send message.");
        setDraft(text);
        return;
      }

      if (Array.isArray(payload.messages)) {
        setMessages(payload.messages);
      } else {
        await loadMessages();
      }
    } catch {
      toast.error("Network error. Try again.");
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-8">
        <p className="text-sm font-sans text-muted-foreground">Loading chat…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-background px-4 py-3">
        <h1 className="font-heading text-2xl tracking-[0.125em] text-foreground">
          Coach
        </h1>
        <p className="mt-1 text-xs font-sans text-muted-foreground">
          Chat with your AI coach using your saved goals and targets.
        </p>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && !sending ? (
          <p className="py-8 text-center text-sm font-sans text-muted-foreground">
            Say hello to start. Your onboarding preferences shape every reply.
          </p>
        ) : null}

        {messages.map((m) => {
          const isUser = m.role === "user";
          return (
            <div
              key={m.id}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm font-sans shadow-sm ${
                  isUser
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border border-border bg-card text-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                <p
                  className={`mt-1 text-[10px] ${
                    isUser ? "text-primary-foreground/80" : "text-muted-foreground"
                  }`}
                >
                  {formatTime(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}

        {sending ? <TypingIndicator /> : null}
        <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
      </div>

      <form
        onSubmit={onSubmit}
        className="flex shrink-0 gap-2 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message your coach…"
          className="min-w-0 flex-1 placeholder:text-muted-foreground/80"
          disabled={sending}
          autoComplete="off"
          maxLength={12000}
        />
        <Button type="submit" disabled={sending || !draft.trim()}>
          {sending ? "…" : "Send"}
        </Button>
      </form>
    </div>
  );
}
