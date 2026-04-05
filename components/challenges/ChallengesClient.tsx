"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LS_CHALLENGES = "mf_challenges";
const LS_LOG = "mf_challengeLog";

const OPENING_MESSAGE =
  "What challenge do you want to take on? Describe it in your own words — it can be anything. A fitness challenge, a habit challenge, a personal goal. Tell me what you're thinking.";

type RuleType = "boolean" | "number" | "text";

export type ChallengeRule = {
  id: string;
  name: string;
  description: string;
  type: RuleType;
  target: number | null;
  unit: string | null;
  required: boolean;
};

export type StoredChallenge = {
  id: string;
  name: string;
  description: string;
  totalDays: number;
  startDate: string;
  rules: ChallengeRule[];
  status: "active" | "completed";
  completedAt?: string;
};

export type DayLogEntry = {
  challengeId: string;
  date: string;
  submittedAt: string;
  ruleValues: Record<string, boolean | number | string>;
};

type ChatTurn = { role: "user" | "assistant"; content: string };

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function dayNumberInChallenge(startDate: string, totalDays: number): number {
  const start = parseLocalDate(startDate.slice(0, 10));
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  start.setHours(12, 0, 0, 0);
  const diff = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const n = diff + 1;
  return Math.min(totalDays, Math.max(1, n));
}

function daysRemaining(startDate: string, totalDays: number): number {
  const cur = dayNumberInChallenge(startDate, totalDays);
  return Math.max(0, totalDays - cur);
}

function streakCount(
  logs: DayLogEntry[],
  challengeId: string,
  todayYmd: string
): number {
  const dates = new Set(
    logs.filter((l) => l.challengeId === challengeId).map((l) => l.date)
  );
  const cur = parseLocalDate(todayYmd);
  let count = 0;
  for (let i = 0; i < 400; i++) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${d}`;
    if (!dates.has(key)) break;
    count++;
    cur.setDate(cur.getDate() - 1);
  }
  return count;
}

function extractJsonBlob(text: string): string | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === "\\" && inStr) {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseChallengeFromText(text: string): StoredChallenge | null {
  const blob = extractJsonBlob(text);
  if (!blob) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(blob);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = String(o.name ?? "").trim();
  const description = String(o.description ?? "").trim();
  const totalDays = Number(o.totalDays);
  let startDate = String(o.startDate ?? "").trim().slice(0, 10);
  const rulesRaw = o.rules;
  if (!name || !Number.isFinite(totalDays) || totalDays < 1) return null;
  if (!Array.isArray(rulesRaw) || rulesRaw.length === 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) startDate = todayLocal();

  const rules: ChallengeRule[] = [];
  for (const r of rulesRaw) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const id = String(row.id ?? crypto.randomUUID());
    const ruleName = String(row.name ?? "").trim();
    const desc = String(row.description ?? "").trim();
    const type = row.type === "boolean" || row.type === "number" || row.type === "text" ? row.type : null;
    const target =
      row.target === null || row.target === undefined
        ? null
        : Number(row.target);
    const unit =
      row.unit === null || row.unit === undefined
        ? null
        : String(row.unit);
    const required = Boolean(row.required);
    if (!ruleName || !type) continue;
    rules.push({
      id,
      name: ruleName,
      description: desc,
      type,
      target: type === "number" && Number.isFinite(target!) ? target : null,
      unit: unit && unit.length ? unit : null,
      required,
    });
  }
  if (rules.length === 0) return null;

  return {
    id: "",
    name,
    description,
    totalDays,
    startDate,
    rules,
    status: "active",
  };
}

function loadChallenges(): StoredChallenge[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_CHALLENGES);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as StoredChallenge[];
  } catch {
    return [];
  }
}

function saveChallenges(list: StoredChallenge[]) {
  localStorage.setItem(LS_CHALLENGES, JSON.stringify(list));
}

function loadLogs(): DayLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_LOG);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as DayLogEntry[];
  } catch {
    return [];
  }
}

function saveLogs(list: DayLogEntry[]) {
  localStorage.setItem(LS_LOG, JSON.stringify(list));
}

function hasLogToday(logs: DayLogEntry[], challengeId: string, today: string): boolean {
  return logs.some((l) => l.challengeId === challengeId && l.date === today);
}

function TypingDots() {
  return (
    <div className="flex justify-start">
      <div
        className="chat-bubble ai"
        style={{ display: "flex", gap: 4, alignItems: "center" }}
        aria-label="Coach is typing"
      >
        <span className="size-1.5 animate-bounce rounded-full bg-[var(--text3)] [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-[var(--text3)] [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce rounded-full bg-[var(--text3)] [animation-delay:300ms]" />
      </div>
    </div>
  );
}

export function ChallengesClient() {
  const [tab, setTab] = useState<"active" | "new">("active");
  const [challenges, setChallenges] = useState<StoredChallenge[]>([]);
  const [logs, setLogs] = useState<DayLogEntry[]>([]);
  const [screen, setScreen] = useState<"home" | "checkin" | "celebrate">("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [celebrateId, setCelebrateId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatTurn[]>([
    { role: "assistant", content: OPENING_MESSAGE },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<StoredChallenge | null>(null);
  const [checkinValues, setCheckinValues] = useState<Record<string, boolean | number | string>>(
    {}
  );

  useEffect(() => {
    setChallenges(loadChallenges());
    setLogs(loadLogs());
  }, []);

  const persistChallenges = useCallback((next: StoredChallenge[]) => {
    setChallenges(next);
    saveChallenges(next);
  }, []);

  const persistLogs = useCallback((next: DayLogEntry[]) => {
    setLogs(next);
    saveLogs(next);
  }, []);

  const activeList = useMemo(
    () => challenges.filter((c) => c.status === "active"),
    [challenges]
  );
  const completedList = useMemo(
    () => challenges.filter((c) => c.status === "completed"),
    [challenges]
  );

  const selected = useMemo(
    () => challenges.find((c) => c.id === selectedId) ?? null,
    [challenges, selectedId]
  );

  const celebrateChallenge = useMemo(
    () => challenges.find((c) => c.id === celebrateId) ?? null,
    [challenges, celebrateId]
  );

  useEffect(() => {
    if (!selected) return;
    const todayLog = logs.find(
      (l) => l.challengeId === selected.id && l.date === todayLocal()
    );
    if (todayLog) {
      setCheckinValues(todayLog.ruleValues);
    } else {
      const init: Record<string, boolean | number | string> = {};
      for (const r of selected.rules) {
        if (r.type === "boolean") init[r.id] = false;
        else if (r.type === "number") init[r.id] = "";
        else init[r.id] = "";
      }
      setCheckinValues(init);
    }
  }, [selected, logs]);

  async function sendChat() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    const nextMsgs: ChatTurn[] = [...messages, { role: "user", content: text }];
    setMessages(nextMsgs);
    setSending(true);
    try {
      const res = await fetch("/api/challenge-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMsgs }),
      });
      const data = (await res.json()) as { error?: string; reply?: string };
      if (!res.ok || !data.reply) {
        toast.error(data.error ?? "Could not reach Coach.");
        setDraft(text);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply! }]);
      const parsed = parseChallengeFromText(data.reply);
      if (parsed) {
        setPreview({ ...parsed, id: preview?.id ?? "" });
      }
    } catch {
      toast.error("Network error.");
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  function startChallengeFromPreview() {
    if (!preview || !preview.name) {
      toast.error("Nothing to start yet — keep chatting with Coach.");
      return;
    }
    const id = crypto.randomUUID();
    const next: StoredChallenge = {
      ...preview,
      id,
      startDate: todayLocal(),
      status: "active",
      rules: preview.rules.map((r) => ({ ...r, id: r.id || crypto.randomUUID() })),
    };
    persistChallenges([...challenges, next]);
    setPreview(null);
    setMessages([{ role: "assistant", content: OPENING_MESSAGE }]);
    setTab("active");
    toast.success("Challenge started.");
  }

  function updatePreviewRule(
    index: number,
    patch: Partial<ChallengeRule>
  ) {
    if (!preview) return;
    const rules = preview.rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
    setPreview({ ...preview, rules });
  }

  function addPreviewRule() {
    if (!preview) return;
    setPreview({
      ...preview,
      rules: [
        ...preview.rules,
        {
          id: crypto.randomUUID(),
          name: "",
          description: "",
          type: "boolean",
          target: null,
          unit: null,
          required: true,
        },
      ],
    });
  }

  function removePreviewRule(index: number) {
    if (!preview) return;
    setPreview({
      ...preview,
      rules: preview.rules.filter((_, i) => i !== index),
    });
  }

  function openCheckin(c: StoredChallenge) {
    setSelectedId(c.id);
    setScreen("checkin");
  }

  function submitCheckin() {
    if (!selected) return;
    const t = todayLocal();
    if (hasLogToday(logs, selected.id, t)) {
      toast.error("You already submitted today.");
      return;
    }
    for (const r of selected.rules) {
      if (!r.required) continue;
      const v = checkinValues[r.id];
      if (r.type === "boolean" && v !== true) {
        toast.error(`Complete: ${r.name}`);
        return;
      }
      if (r.type === "number") {
        const n = Number(v);
        if (!Number.isFinite(n)) {
          toast.error(`Enter a number for: ${r.name}`);
          return;
        }
      }
      if (r.type === "text" && String(v ?? "").trim() === "") {
        toast.error(`Fill in: ${r.name}`);
        return;
      }
    }

    const entry: DayLogEntry = {
      challengeId: selected.id,
      date: t,
      submittedAt: new Date().toISOString(),
      ruleValues: { ...checkinValues },
    };
    const nextLogs = [...logs, entry];
    persistLogs(nextLogs);

    const dn = dayNumberInChallenge(selected.startDate, selected.totalDays);
    if (dn >= selected.totalDays) {
      const nextCh = challenges.map((c) =>
        c.id === selected.id
          ? { ...c, status: "completed" as const, completedAt: new Date().toISOString() }
          : c
      );
      persistChallenges(nextCh);
      setCelebrateId(selected.id);
      setScreen("celebrate");
      setSelectedId(null);
      toast.success("Challenge complete!");
    } else {
      toast.success("Day logged.");
      setScreen("home");
      setSelectedId(null);
    }
  }

  function shareSummary(c: StoredChallenge): string {
    const st = streakCount(logs, c.id, todayLocal());
    const loggedDays = new Set(
      logs.filter((l) => l.challengeId === c.id).map((l) => l.date)
    ).size;
    return `${c.name}\n${c.description}\nDays logged: ${loggedDays} / ${c.totalDays}\nBest streak: ${st} days`;
  }

  if (screen === "celebrate" && celebrateChallenge) {
    const c = celebrateChallenge;
    const st = streakCount(logs, c.id, todayLocal());
    const loggedDays = new Set(
      logs.filter((l) => l.challengeId === c.id).map((l) => l.date)
    ).size;
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[var(--bg)] px-6 py-10 text-center"
        style={{ minHeight: "100dvh" }}
      >
        <p className="pt">You did it</p>
        <h2 className="text-lg font-semibold text-[var(--text)]">{c.name}</h2>
        <p className="ps max-w-sm">
          {loggedDays} days logged · {c.totalDays} day program · streak {st}
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(shareSummary(c));
              toast.success("Copied summary.");
            } catch {
              toast.error("Could not copy.");
            }
          }}
        >
          Copy summary
        </Button>
        <Button
          type="button"
          onClick={() => {
            setCelebrateId(null);
            setScreen("home");
            setTab("new");
            setMessages([{ role: "assistant", content: OPENING_MESSAGE }]);
            setPreview(null);
          }}
        >
          Start another challenge
        </Button>
        <button type="button" className="back-btn mx-auto" onClick={() => setScreen("home")}>
          ← Back to challenges
        </button>
      </div>
    );
  }

  if (screen === "checkin" && selected) {
    const c = selected;
    const dn = dayNumberInChallenge(c.startDate, c.totalDays);
    const submitted = hasLogToday(logs, c.id, todayLocal());
    const pct = Math.min(100, (dn / c.totalDays) * 100);
    const st = streakCount(logs, c.id, todayLocal());

    const historyDots: { ymd: string; done: boolean }[] = [];
    const base = parseLocalDate(todayLocal());
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const ymd = `${y}-${m}-${day}`;
      historyDots.push({
        ymd,
        done: logs.some((l) => l.challengeId === c.id && l.date === ymd),
      });
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg)]">
        <header className="ph shrink-0">
          <button type="button" className="back-btn" onClick={() => setScreen("home")}>
            ← Back
          </button>
          <h1 className="pt">{c.name}</h1>
          <p className="ps">
            Day {dn} of {c.totalDays}
          </p>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-8 pt-2">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-1 flex justify-between text-xs text-[var(--text2)]">
              <span>Progress</span>
              <span>
                {dn} / {c.totalDays}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--text2)]">Current streak: {st} days</p>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text2)]">
              Today&apos;s checklist
            </p>
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              {c.rules.map((r) => (
                <div key={r.id} className="space-y-1 border-b border-[var(--border)] pb-3 last:border-0 last:pb-0">
                  {r.type === "boolean" ? (
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--text)]">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={Boolean(checkinValues[r.id])}
                        disabled={submitted}
                        onChange={(e) =>
                          setCheckinValues((v) => ({ ...v, [r.id]: e.target.checked }))
                        }
                      />
                      <span>
                        <span className="font-medium">{r.name}</span>
                        {r.description ? (
                          <span className="block text-xs text-[var(--text2)]">{r.description}</span>
                        ) : null}
                      </span>
                    </label>
                  ) : null}
                  {r.type === "number" ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[var(--text)]">{r.name}</p>
                      {r.description ? (
                        <p className="text-xs text-[var(--text2)]">{r.description}</p>
                      ) : null}
                      <p className="text-xs text-[var(--text2)]">
                        Target: {r.target ?? "—"}
                        {r.unit ? ` ${r.unit}` : ""} — enter today&apos;s amount
                      </p>
                      <Input
                        type="number"
                        className="bg-[var(--surface2)]"
                        disabled={submitted}
                        value={checkinValues[r.id] === "" ? "" : String(checkinValues[r.id] ?? "")}
                        onChange={(e) =>
                          setCheckinValues((v) => ({
                            ...v,
                            [r.id]: e.target.value === "" ? "" : Number(e.target.value),
                          }))
                        }
                      />
                    </div>
                  ) : null}
                  {r.type === "text" ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-[var(--text)]">{r.name}</p>
                      {r.description ? (
                        <p className="text-xs text-[var(--text2)]">{r.description}</p>
                      ) : null}
                      <textarea
                        className="chat-inp min-h-[72px] w-full resize-y"
                        disabled={submitted}
                        value={String(checkinValues[r.id] ?? "")}
                        onChange={(e) =>
                          setCheckinValues((v) => ({ ...v, [r.id]: e.target.value }))
                        }
                        placeholder="Notes for today"
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {submitted ? (
            <p className="text-center text-sm text-[var(--accent2)]">Submitted for today.</p>
          ) : (
            <Button type="button" className="w-full" onClick={submitCheckin}>
              Submit day
            </Button>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text2)]">
              Last 7 days
            </p>
            <div className="flex justify-center gap-2">
              {historyDots.map((h) => (
                <div
                  key={h.ymd}
                  title={h.ymd}
                  className="size-3 rounded-full"
                  style={{
                    background: h.done ? "var(--accent)" : "var(--surface2)",
                    border: "1px solid var(--border)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg)]">
      <header className="ph shrink-0">
        <Link href="/" className="back-btn">
          ← Back
        </Link>
        <h1 className="pt">CHALLENGES</h1>
        <p className="ps">Personal challenges shaped by you and Coach.</p>
      </header>

      <div className="flex shrink-0 gap-1 border-b border-[var(--border)] px-4 pb-2">
        <button
          type="button"
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            tab === "active" ? "bg-[var(--accent)] text-white" : "text-[var(--text2)]"
          }`}
          onClick={() => setTab("active")}
        >
          Active
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${
            tab === "new" ? "bg-[var(--accent)] text-white" : "text-[var(--text2)]"
          }`}
          onClick={() => setTab("new")}
        >
          New challenge
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4">
        {tab === "active" ? (
          <div className="space-y-6">
            {activeList.length === 0 ? (
              <p className="text-center text-sm text-[var(--text2)]">
                No active challenges. Start one to begin.
              </p>
            ) : (
              <div className="space-y-3">
                {activeList.map((c) => {
                  const dr = daysRemaining(c.startDate, c.totalDays);
                  const doneToday = hasLogToday(logs, c.id, todayLocal());
                  const st = streakCount(logs, c.id, todayLocal());
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openCheckin(c)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--accent)]"
                    >
                      <p className="font-semibold text-[var(--text)]">{c.name}</p>
                      <p className="mt-1 text-xs text-[var(--text2)]">
                        {dr} days left · Streak {st} · Today:{" "}
                        {doneToday ? "Done" : "Open"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {completedList.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-[var(--text2)]">
                  Completed
                </p>
                <div className="space-y-2 opacity-80">
                  {completedList.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text2)]"
                    >
                      {c.name}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-4">
            <div className="min-h-[200px] max-h-[40vh] space-y-2 overflow-y-auto">
              {messages.map((m, i) => (
                <div
                  key={`${i}-${m.role}`}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`chat-bubble ${m.role === "user" ? "user" : "ai"}`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {sending ? <TypingDots /> : null}
            </div>

            {preview ? (
              <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <p className="text-sm font-semibold text-[var(--text)]">Preview</p>
                <Input
                  className="bg-[var(--surface2)]"
                  value={preview.name}
                  onChange={(e) => setPreview({ ...preview, name: e.target.value })}
                  placeholder="Challenge name"
                />
                <textarea
                  className="chat-inp min-h-[60px] w-full"
                  value={preview.description}
                  onChange={(e) => setPreview({ ...preview, description: e.target.value })}
                />
                <label className="flex items-center gap-2 text-xs text-[var(--text2)]">
                  Total days
                  <Input
                    type="number"
                    className="w-24 bg-[var(--surface2)]"
                    value={preview.totalDays}
                    onChange={(e) =>
                      setPreview({
                        ...preview,
                        totalDays: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </label>
                <div className="space-y-2">
                  {preview.rules.map((r, idx) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-[var(--border)] p-2 text-xs"
                    >
                      <Input
                        className="mb-1 bg-[var(--surface2)]"
                        value={r.name}
                        onChange={(e) => updatePreviewRule(idx, { name: e.target.value })}
                      />
                      <select
                        className="chat-inp mb-1 w-full"
                        value={r.type}
                        onChange={(e) =>
                          updatePreviewRule(idx, {
                            type: e.target.value as RuleType,
                          })
                        }
                      >
                        <option value="boolean">boolean</option>
                        <option value="number">number</option>
                        <option value="text">text</option>
                      </select>
                      {r.type === "number" ? (
                        <div className="flex gap-1">
                          <Input
                            type="number"
                            className="bg-[var(--surface2)]"
                            placeholder="target"
                            value={r.target ?? ""}
                            onChange={(e) =>
                              updatePreviewRule(idx, {
                                target: e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                          />
                          <Input
                            className="bg-[var(--surface2)]"
                            placeholder="unit"
                            value={r.unit ?? ""}
                            onChange={(e) =>
                              updatePreviewRule(idx, {
                                unit: e.target.value || null,
                              })
                            }
                          />
                        </div>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 text-xs"
                        onClick={() => removePreviewRule(idx)}
                      >
                        Remove rule
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="secondary" size="sm" onClick={addPreviewRule}>
                    Add rule
                  </Button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" className="flex-1" onClick={startChallengeFromPreview}>
                    Looks good, start it
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      setDraft("I'd like to adjust the challenge: ");
                    }}
                  >
                    Let me adjust
                  </Button>
                </div>
              </div>
            ) : null}

            <form
              className="flex shrink-0 gap-2 border-t border-[var(--border)] pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                void sendChat();
              }}
            >
              <input
                className="chat-inp min-w-0 flex-1"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Describe your challenge…"
                disabled={sending}
              />
              <button type="submit" className="chat-send shrink-0" disabled={sending || !draft.trim()}>
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
