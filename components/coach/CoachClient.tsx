"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const supabase = createBrowserSupabaseClient();

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<{ 0?: { transcript?: string }; isFinal?: boolean }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

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

function coachChipsForPath(path: string): string[] {
  const p = path || "/";
  const universal = [
    "How am I doing today?",
    "What should I eat next?",
    "Motivate me",
  ];
  let ctx: string[];
  if (p.startsWith("/workout")) {
    ctx = [
      "Suggest a warm-up",
      "Should I increase weights?",
      "How's my training progress?",
    ];
  } else if (p.startsWith("/meals")) {
    ctx = [
      "Does my meal plan look good?",
      "High protein snack ideas",
      "Am I hitting my macros?",
    ];
  } else if (p.startsWith("/progress")) {
    ctx = ["Analyze my progress", "Am I in a plateau?", "Weekly summary"];
  } else if (p === "/" || p === "") {
    ctx = ["What should I focus on?", "How's my week going?", "Quick tip"];
  } else {
    ctx = ["Ask me anything", "Review my plan", "Coach check-in"];
  }
  return [...universal, ...ctx].slice(0, 6);
}

type Props = {
  userId: string;
  /** Compact FAB panel: no full-page header, chips + multimodal input */
  embedded?: boolean;
  currentPath?: string;
};

export function CoachClient({
  userId,
  embedded = false,
  currentPath: currentPathProp,
}: Props) {
  const pathname = usePathname() ?? "/";
  const currentPath = currentPathProp ?? pathname;

  const [messages, setMessages] = useState<CoachMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  const [sending, setSending] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [voiceOk, setVoiceOk] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    setVoiceOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const submitContent = useCallback(
    async (text: string, explicitImage?: string | null) => {
      const trimmed = text.trim();
      let img: string | undefined;
      if (explicitImage === null) img = undefined;
      else if (explicitImage) img = explicitImage;
      else img = pendingImage ?? undefined;

      if ((!trimmed && !img) || sending) return;

      setSending(true);
      const contentForApi = trimmed || "(Image attached)";
      let coachId = "";
      try {
        coachId = localStorage.getItem("mf_chosenCoachId")?.trim() ?? "";
      } catch {
        /* ignore */
      }

      try {
        const res = await fetch("/api/coach-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: contentForApi,
            ...(img ? { imageBase64: img } : {}),
            ...(coachId ? { coachId } : {}),
          }),
        });

        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
          messages?: CoachMessageRow[];
        };

        if (!res.ok) {
          toast.error(payload.error ?? "Could not send message.");
          return;
        }

        setPendingImage(null);
        setDraft("");
        if (Array.isArray(payload.messages)) {
          setMessages(payload.messages);
        } else {
          await loadMessages();
        }
      } catch {
        toast.error("Network error. Try again.");
      } finally {
        setSending(false);
      }
    },
    [sending, loadMessages, pendingImage]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text && !pendingImage) return;
    await submitContent(draft);
  }

  function onChip(text: string) {
    void submitContent(text, null);
  }

  function toggleVoice() {
    if (typeof window === "undefined" || !voiceOk) return;
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    if (listening && recogRef.current) {
      try {
        recogRef.current.stop();
      } catch {
        /* ignore */
      }
      recogRef.current = null;
      setListening(false);
      return;
    }

    try {
      setListening(true);
      const r = new Ctor();
      recogRef.current = r;
      r.lang = "en-US";
      r.interimResults = true;
      r.continuous = false;
      r.onresult = (ev: {
        results: ArrayLike<{ 0?: { transcript?: string }; isFinal?: boolean }>;
      }) => {
        let line = "";
        for (let i = 0; i < ev.results.length; i++) {
          line += ev.results[i][0]?.transcript ?? "";
        }
        setDraft(line.trim());
      };
      r.onerror = () => {
        setListening(false);
        recogRef.current = null;
        toast.error("Voice not available. Try typing instead.");
      };
      r.onend = () => {
        setListening(false);
        recogRef.current = null;
        const t = draftRef.current.trim();
        if (t) {
          window.setTimeout(() => void submitContent(t), 500);
        }
      };
      r.start();
    } catch {
      setListening(false);
      toast.error("Voice not available. Try typing instead.");
    }
  }

  useEffect(() => {
    return () => {
      try {
        recogRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-8">
        <p className="text-sm font-sans text-muted-foreground">
          Your coach is almost here — loading your chat…
        </p>
      </div>
    );
  }

  const chips = coachChipsForPath(currentPath);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col bg-[var(--bg)]">
      {!embedded ? (
        <header className="sticky top-0 z-20 flex shrink-0 items-start gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3">
          <Link
            href="/"
            className="mt-0.5 min-h-[44px] min-w-[44px] font-body text-sm text-[var(--accent)]"
            aria-label="Back to home"
          >
            ←
          </Link>
          <div>
            <h1
              className="font-display text-[32px] uppercase leading-none tracking-[2px] text-[var(--text)]"
            >
              COACH
            </h1>
            <p className="mt-1 font-body text-xs text-[var(--text2)]">
              Chat with your AI coach using your saved goals and targets.
            </p>
          </div>
        </header>
      ) : null}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 sm:px-4"
      >
        {messages.length === 0 && !sending ? (
          <p className="py-6 text-center text-sm font-sans text-muted-foreground">
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
        className="flex shrink-0 flex-col gap-2 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="coach-chip-row">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              className="coach-chip"
              disabled={sending}
              onClick={() => onChip(c)}
            >
              {c}
            </button>
          ))}
        </div>

        {pendingImage ? (
          <div className="relative inline-block max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingImage}
              alt="Pending attachment"
              className="max-h-24 rounded-lg border border-border object-cover"
            />
            <button
              type="button"
              className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground"
              aria-label="Remove image"
              onClick={() => setPendingImage(null)}
            >
              ×
            </button>
          </div>
        ) : null}

        <input
          ref={imgInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f || !f.type.startsWith("image/")) return;
            const fr = new FileReader();
            fr.onload = () => {
              const u = typeof fr.result === "string" ? fr.result : "";
              if (u) setPendingImage(u);
            };
            fr.readAsDataURL(f);
          }}
        />

        <div className="flex gap-2">
          <button
            type="button"
            className="shrink-0 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-lg"
            aria-label="Attach image"
            onClick={() => imgInputRef.current?.click()}
          >
            📷
          </button>
          {voiceOk ? (
            <button
              type="button"
              className={`shrink-0 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-lg ${
                listening ? "recording" : ""
              }`}
              aria-label={listening ? "Stop voice" : "Voice input"}
              onClick={toggleVoice}
            >
              {listening ? "🔴" : "🎤"}
            </button>
          ) : null}
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message your coach…"
            className="min-w-0 flex-1 placeholder:text-muted-foreground/80"
            disabled={sending}
            autoComplete="off"
            maxLength={12000}
          />
          <Button type="submit" disabled={sending || (!draft.trim() && !pendingImage)}>
            {sending ? "…" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}
