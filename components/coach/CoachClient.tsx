"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ConversationSidebar } from "@/components/coach/ConversationSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MacroTargetRow } from "@/lib/dashboard/preferences";
import {
  extractMacroTargets,
  formatMacroLabel,
} from "@/lib/dashboard/preferences";
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

type StoredConvMsg = {
  role: string;
  content: string;
  timestamp: string;
  coachId?: string;
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

const COACH_FOOD_LOG_PHRASES = [
  "you could eat",
  "try having",
  "log this",
  "add this",
  "eat this",
] as const;

function coachMessageSuggestsLoggableFood(content: string): boolean {
  const lower = content.toLowerCase();
  for (const p of COACH_FOOD_LOG_PHRASES) {
    if (lower.includes(p)) return true;
  }
  if (/\d+\s*(?:cal|kcal|cals|calories)\b/i.test(content)) return true;
  if (/\d+\s*g?\s*(?:protein|pro)\b/i.test(content)) return true;
  return false;
}

function extractCoachFoodSuggestion(content: string): {
  foodName: string;
  macros: Record<string, string>;
} {
  const macros: Record<string, string> = {};
  const calM = content.match(/(\d+)\s*(?:cal|kcal|cals|calories)\b/i);
  if (calM) macros.calories = calM[1];
  const proM = content.match(/(\d+)\s*g?\s*(?:protein|pro)\b/i);
  if (proM) macros.protein = proM[1];
  const fatM = content.match(/(\d+)\s*g?\s*(?:fat)\b/i);
  if (fatM) macros.fat = fatM[1];
  const carbM = content.match(
    /(\d+)\s*g?\s*(?:carbs?|carbohydrates)\b/i
  );
  if (carbM) macros.carbs = carbM[1];
  const idx = content.search(/\d+\s*(?:cal|kcal|cals|calories)\b/i);
  const slice = idx > 0 ? content.slice(0, idx) : content.slice(0, 120);
  const foodName =
    slice
      .replace(/\n+/g, " ")
      .replace(/["'`]+/g, "")
      .trim()
      .slice(0, 80) || "Coach suggestion";
  return { foodName, macros };
}

function parseStoredMessages(
  convId: string,
  raw: unknown
): CoachMessageRow[] {
  if (!Array.isArray(raw)) return [];
  const out: CoachMessageRow[] = [];
  let i = 0;
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as StoredConvMsg;
    const role = o.role === "user" ? "user" : "coach";
    const ts = String(o.timestamp ?? new Date().toISOString());
    out.push({
      id: `${convId}-${i}-${ts}`,
      role,
      content: String(o.content ?? ""),
      created_at: ts,
    });
    i += 1;
  }
  return out;
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
  /** Controlled sidebar (FAB). If omitted, CoachClient manages internally when not embedded. */
  sidebarOpen?: boolean;
  onSidebarOpenChange?: (open: boolean) => void;
  /** Optional: notify parent when active conversation id changes */
  onConversationIdChange?: (id: string | null) => void;
};

export function CoachClient({
  userId,
  embedded = false,
  currentPath: currentPathProp,
  sidebarOpen: sidebarOpenControlled,
  onSidebarOpenChange,
  onConversationIdChange,
}: Props) {
  const pathname = usePathname() ?? "/";
  const currentPath = currentPathProp ?? pathname;

  const [internalSidebar, setInternalSidebar] = useState(false);
  const showSidebar =
    sidebarOpenControlled !== undefined ? sidebarOpenControlled : internalSidebar;
  const setShowSidebar = onSidebarOpenChange ?? setInternalSidebar;

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [listRefreshNonce, setListRefreshNonce] = useState(0);

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

  const [macroTargets, setMacroTargets] = useState<MacroTargetRow[]>([]);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogFood, setQuickLogFood] = useState("");
  const [quickLogFields, setQuickLogFields] = useState<Record<string, string>>(
    {}
  );
  const [quickLogBusy, setQuickLogBusy] = useState(false);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    onConversationIdChange?.(conversationId);
  }, [conversationId, onConversationIdChange]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const loadLatestConversation = useCallback(async () => {
    const { data, error } = await supabase
      .from("coach_conversations")
      .select("id, messages, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error(error);
      if (
        /relation|does not exist|schema cache/i.test(error.message ?? "") ||
        error.code === "42P01"
      ) {
        toast.error(
          "Coach conversations table missing. Add coach_conversations in Supabase (see audit SQL)."
        );
      } else {
        toast.error(error.message);
      }
      setConversationId(null);
      setMessages([]);
      setLoading(false);
      return;
    }

    const row = data?.[0];
    if (row) {
      setConversationId(row.id);
      setMessages(parseStoredMessages(row.id, row.messages));
    } else {
      setConversationId(null);
      setMessages([]);
    }
    setLoading(false);
  }, [userId]);

  const loadConversationById = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("coach_conversations")
      .select("id, messages")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      toast.error(error?.message ?? "Could not load conversation.");
      return;
    }
    setConversationId(data.id);
    setMessages(parseStoredMessages(data.id, data.messages));
    setListRefreshNonce((n) => n + 1);
    window.setTimeout(() => scrollToBottom(), 120);
  }, [scrollToBottom, userId]);

  useEffect(() => {
    void loadLatestConversation();
  }, [loadLatestConversation]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("key, value")
        .eq("user_id", userId);
      if (cancelled || error) return;
      setMacroTargets(extractMacroTargets(data ?? []));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

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

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setDraft("");
    setPendingImage(null);
    setShowSidebar(false);
    setListRefreshNonce((n) => n + 1);
  }, [setShowSidebar]);

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
            ...(conversationId ? { conversationId } : {}),
          }),
        });

        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
          messages?: CoachMessageRow[];
          conversationId?: string;
        };

        if (!res.ok) {
          toast.error(payload.error ?? "Could not send message.");
          return;
        }

        setPendingImage(null);
        setDraft("");
        if (typeof payload.conversationId === "string") {
          setConversationId(payload.conversationId);
        }
        if (Array.isArray(payload.messages)) {
          setMessages(payload.messages);
        } else {
          await loadLatestConversation();
        }
        setListRefreshNonce((n) => n + 1);
      } catch {
        toast.error("Network error. Try again.");
      } finally {
        setSending(false);
      }
    },
    [conversationId, loadLatestConversation, pendingImage, sending]
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

  function normalizeMacroKeyForLog(key: string) {
    return key.trim().toLowerCase();
  }

  function openQuickLogFromCoachMessage(body: string) {
    const { foodName, macros } = extractCoachFoodSuggestion(body);
    const fieldInit: Record<string, string> = {};
    for (const t of macroTargets) {
      const k = normalizeMacroKeyForLog(t.key);
      let v = "";
      if (k.includes("calor") || k === "calories") v = macros.calories ?? "";
      else if (k.includes("protein") || k === "protein")
        v = macros.protein ?? "";
      else if (k.includes("fat")) v = macros.fat ?? "";
      else if (k.includes("carb")) v = macros.carbs ?? "";
      fieldInit[t.key] = v;
    }
    setQuickLogFood(foodName);
    setQuickLogFields(fieldInit);
    setQuickLogOpen(true);
  }

  async function submitQuickLogFromCoach() {
    const name = quickLogFood.trim();
    if (!name) {
      toast.error("Enter a food name.");
      return;
    }
    setQuickLogBusy(true);
    try {
      const { data: log, error: logErr } = await supabase
        .from("food_logs")
        .insert({
          user_id: userId,
          meal_number: 1,
          food_name: name,
          quantity: null,
          unit: "",
        })
        .select("id")
        .single();
      if (logErr || !log) {
        toast.error(logErr?.message ?? "Could not save food log.");
        return;
      }
      const rows: { food_log_id: string; key: string; value: number }[] = [];
      for (const t of macroTargets) {
        const raw = quickLogFields[t.key]?.trim() ?? "";
        if (!raw) continue;
        const v = Number(raw);
        if (!Number.isFinite(v)) {
          toast.error(`${formatMacroLabel(t.key)} must be a number.`);
          return;
        }
        rows.push({ food_log_id: log.id, key: t.key, value: v });
      }
      if (rows.length > 0) {
        const { error: mErr } = await supabase
          .from("food_log_macros")
          .insert(rows);
        if (mErr) {
          toast.error(mErr.message);
          return;
        }
      }
      toast.success(`✅ ${name} logged`);
      setQuickLogOpen(false);
    } finally {
      setQuickLogBusy(false);
    }
  }

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
    <div className="relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col bg-[var(--bg)]">
      <ConversationSidebar
        open={showSidebar}
        userId={userId}
        activeConversationId={conversationId}
        onClose={() => setShowSidebar(false)}
        onNew={startNewConversation}
        onSelectConversation={(id) => void loadConversationById(id)}
        listRefreshNonce={listRefreshNonce}
      />

      {!embedded ? (
        <header className="sticky top-0 z-20 flex shrink-0 items-start gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3">
          <button
            type="button"
            className="mt-0.5 min-h-[44px] min-w-[44px] font-body text-lg text-[var(--accent)]"
            aria-label="Open conversations"
            onClick={() => setShowSidebar(true)}
          >
            ☰
          </button>
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
          const showFoodLog =
            !isUser && coachMessageSuggestsLoggableFood(m.content);
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
                {showFoodLog ? (
                  <button
                    type="button"
                    className="mt-2 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs font-semibold text-foreground"
                    onClick={() => openQuickLogFromCoachMessage(m.content)}
                  >
                    + Log to Food Log
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        {sending ? <TypingIndicator /> : null}
        <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
      </div>

      <button
        type="button"
        className={`sheet-overlay${quickLogOpen ? " open" : ""}`}
        aria-label="Close food log sheet"
        onClick={() => setQuickLogOpen(false)}
      />
      <div className={`bottom-sheet-base${quickLogOpen ? " open" : ""}`}>
        <div className="max-h-[80vh] space-y-3 overflow-y-auto p-4 pb-8">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm uppercase tracking-wide text-[var(--text)]">
              Log to food log
            </h2>
            <button
              type="button"
              className="text-xs text-[var(--accent)]"
              onClick={() => setQuickLogOpen(false)}
            >
              Cancel
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--text3)]" htmlFor="coach-qlog-name">
              Food name
            </label>
            <input
              id="coach-qlog-name"
              className="inf"
              value={quickLogFood}
              onChange={(e) => setQuickLogFood(e.target.value)}
            />
          </div>
          {macroTargets.map((t) => (
            <div key={t.key} className="space-y-1">
              <label className="text-xs text-[var(--text3)]" htmlFor={`cq-${t.key}`}>
                {formatMacroLabel(t.key)}
              </label>
              <input
                id={`cq-${t.key}`}
                className="inf"
                inputMode="decimal"
                value={quickLogFields[t.key] ?? ""}
                onChange={(e) =>
                  setQuickLogFields((prev) => ({
                    ...prev,
                    [t.key]: e.target.value,
                  }))
                }
              />
            </div>
          ))}
          {macroTargets.length === 0 ? (
            <p className="text-xs text-[var(--text3)]">
              Set macro targets in onboarding to log numbers here.
            </p>
          ) : null}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="cbtn no flex-1"
              disabled={quickLogBusy}
              onClick={() => setQuickLogOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="cbtn green flex-1"
              disabled={quickLogBusy}
              onClick={() => void submitQuickLogFromCoach()}
            >
              {quickLogBusy ? "Saving…" : "Log It"}
            </button>
          </div>
        </div>
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
