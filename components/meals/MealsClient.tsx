"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AddRecipeForm } from "@/components/meals/AddRecipeForm";
import { LogMealForm, type LabelPrefill } from "@/components/meals/LogMealForm";
import {
  MealPlanTab,
  type MealPlanEntryRow,
} from "@/components/meals/MealPlanTab";
import {
  RecipeLibraryTab,
  type RecipeRow,
} from "@/components/meals/RecipeLibraryTab";
import { SubpageHeader } from "@/components/layout/SubpageHeader";
import {
  TodayFoodLogTab,
  type FoodLogRow,
} from "@/components/meals/TodayFoodLogTab";
import {
  formatMacroLabel,
  type MacroTargetRow,
} from "@/lib/dashboard/preferences";
import { getUtcDayBounds } from "@/lib/dashboard/utc-day";
import { getUtcWeekMondayDateString } from "@/lib/meals/week";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type WebSpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  onresult:
    | ((ev: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

type TabId = "today" | "plan" | "library";

type Props = {
  userId: string;
  macroTargets: MacroTargetRow[];
};

function normalizeMacroKey(key: string): string {
  return key.trim().toLowerCase();
}

function parseNumber(value: string | number): number {
  const n = Number.parseFloat(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function ymdLocalFromIso(iso: string): string {
  const dt = new Date(iso);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdUtc(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yesterdayUtcYmd(todayYmd: string): string {
  const [y, mo, d] = todayYmd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return ymdUtc(dt);
}

function utcBoundsForYmd(ymd: string): { start: string; end: string } {
  const [y, mo, d] = ymd.split("-").map(Number);
  const start = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
  return { start: start.toISOString(), end: end.toISOString() };
}

function totalsFromLogs(logs: FoodLogRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const log of logs) {
    for (const m of log.food_log_macros ?? []) {
      const key = normalizeMacroKey(m.key ?? "");
      if (!key) continue;
      totals[key] = (totals[key] ?? 0) + parseNumber(m.value ?? "");
    }
  }
  return totals;
}

function withinAllMacroTargets(
  totals: Record<string, number>,
  targets: MacroTargetRow[]
): boolean {
  if (targets.length === 0) return false;
  for (const t of targets) {
    const k = normalizeMacroKey(t.key);
    const target = t.targetNumber;
    if (!Number.isFinite(target) || target <= 0) continue;
    const c = totals[k] ?? 0;
    if (Math.abs(c - target) / target > 0.1) return false;
  }
  return true;
}

function readMacroStreak(): { streak: number; lastQualifiedYmd: string | null } {
  if (typeof window === "undefined") return { streak: 0, lastQualifiedYmd: null };
  try {
    const raw = localStorage.getItem(LS_MACRO_STREAK);
    if (!raw) return { streak: 0, lastQualifiedYmd: null };
    const p = JSON.parse(raw) as {
      streak?: number;
      lastQualifiedYmd?: string | null;
    };
    return {
      streak: typeof p.streak === "number" ? p.streak : 0,
      lastQualifiedYmd:
        typeof p.lastQualifiedYmd === "string" ? p.lastQualifiedYmd : null,
    };
  } catch {
    return { streak: 0, lastQualifiedYmd: null };
  }
}

function writeMacroStreak(s: { streak: number; lastQualifiedYmd: string | null }) {
  try {
    localStorage.setItem(LS_MACRO_STREAK, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function bumpMacroStreakIfQualified(todayYmd: string, qualified: boolean) {
  if (!qualified) return;
  const yest = yesterdayUtcYmd(todayYmd);
  const s = readMacroStreak();
  if (s.lastQualifiedYmd === todayYmd) return;
  let nextStreak = 1;
  if (s.lastQualifiedYmd === yest) nextStreak = Math.max(0, s.streak) + 1;
  writeMacroStreak({ streak: nextStreak, lastQualifiedYmd: todayYmd });
}

async function fetchTotalsForUtcYmd(
  userId: string,
  ymd: string
): Promise<Record<string, number>> {
  const { start, end } = utcBoundsForYmd(ymd);
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("food_logs")
    .select("food_log_macros(key, value)")
    .eq("user_id", userId)
    .gte("logged_at", start)
    .lte("logged_at", end);
  if (error || !data) return {};
  const totals: Record<string, number> = {};
  for (const row of data) {
    const macros =
      (row as { food_log_macros?: { key: string; value: number }[] | null })
        .food_log_macros ?? [];
    for (const m of macros) {
      const key = normalizeMacroKey(m.key ?? "");
      if (!key) continue;
      totals[key] = (totals[key] ?? 0) + parseNumber(m.value ?? "");
    }
  }
  return totals;
}

function validateMacroStreakAfterDayChange(
  userId: string,
  macroTargets: MacroTargetRow[]
) {
  const today = ymdUtc();
  const yest = yesterdayUtcYmd(today);
  void (async () => {
    const s = readMacroStreak();
    if (!s.lastQualifiedYmd || s.lastQualifiedYmd >= yest) return;
    const yTotals = await fetchTotalsForUtcYmd(userId, yest);
    if (!withinAllMacroTargets(yTotals, macroTargets)) {
      writeMacroStreak({ streak: 0, lastQualifiedYmd: null });
    }
  })();
}

const LS_HABIT_DATA = "mf_habitData";
const LS_HABIT_STREAKS = "mf_habitStreaks";
const LS_CUSTOM_HABITS = "mf_customHabits";
const LS_WATER_LOG = "mf_waterLog";
const LS_WATER_GOAL = "mf_waterGoal";
const LS_FOOD_LOG_FLAG = "mf_foodLog";
const LS_MACRO_STREAK = "mf_macroStreak";

type CookStep = { text: string; timerSec: number | null };

function parseTimerFromInstruction(text: string): number | null {
  const m = text.match(
    /(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i
  );
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = m[2].toLowerCase();
  if (/hour|hr/.test(u)) return Math.round(n * 3600);
  if (/min/.test(u)) return Math.round(n * 60);
  return Math.round(n);
}

function buildCookSteps(instructions: string[]): CookStep[] {
  return instructions.map((text) => ({
    text,
    timerSec: parseTimerFromInstruction(text),
  }));
}

function AnalyzerNameVoice({ onTranscript }: { onTranscript: (t: string) => void }) {
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: WebSpeechCtor;
      webkitSpeechRecognition?: WebSpeechCtor;
    };
    setOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);
  if (!ok) return null;
  return (
    <button
      type="button"
      className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-lg"
      disabled={busy}
      aria-label="Voice recipe name"
      onClick={() => {
        const w = window as unknown as {
          SpeechRecognition?: WebSpeechCtor;
          webkitSpeechRecognition?: WebSpeechCtor;
        };
        const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
        if (!Ctor) return;
        try {
          setBusy(true);
          const r = new Ctor();
          r.lang = "en-US";
          r.interimResults = false;
          r.onresult = (ev: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => {
            const t = Array.from(ev.results)
              .map((x) => x[0]?.transcript ?? "")
              .join(" ")
              .trim();
            if (t) onTranscript(t);
          };
          r.onerror = () => {
            setBusy(false);
            toast.error("Voice not available. Try typing instead.");
          };
          r.onend = () => setBusy(false);
          r.start();
        } catch {
          setBusy(false);
          toast.error("Voice not available. Try typing instead.");
        }
      }}
    >
      🎤
    </button>
  );
}

function mapLabelJsonToPrefill(
  macroTargets: MacroTargetRow[],
  raw: Record<string, unknown>
): LabelPrefill {
  const name = String(raw.name ?? "").trim() || "Scanned item";
  const servingSize = String(raw.servingSize ?? "").trim();
  const nums = {
    cal: Number(raw.cal),
    pro: Number(raw.pro),
    fat: Number(raw.fat),
    carbs: Number(raw.carbs),
    sodium: Number(raw.sodium),
    fiber: Number(raw.fiber),
    sugar: Number(raw.sugar),
  };
  const macroValues: Record<string, string> = {};
  for (const t of macroTargets) {
    const k = normalizeMacroKey(t.key);
    let v: number | undefined;
    if (k === "calories" || k === "calorie") v = nums.cal;
    else if (k === "protein") v = nums.pro;
    else if (k === "fat") v = nums.fat;
    else if (k === "carbs" || k === "carbohydrates") v = nums.carbs;
    else if (k === "sodium") v = nums.sodium;
    else if (k === "fiber") v = nums.fiber;
    else if (k === "sugar") v = nums.sugar;
    if (v !== undefined && Number.isFinite(v)) {
      macroValues[t.key] = String(v);
    }
  }
  return {
    foodName: name,
    quantity: "",
    unit: servingSize,
    macroValues,
  };
}

function CookModeOverlay({
  open,
  steps,
  onExit,
}: {
  open: boolean;
  steps: CookStep[];
  onExit: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [timerLeft, setTimerLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const wakeRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!open) {
      void wakeRef.current?.release().catch(() => {});
      wakeRef.current = null;
      setIdx(0);
      setTimerLeft(0);
      setTimerRunning(false);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.wakeLock?.request) {
      void navigator.wakeLock
        .request("screen")
        .then((w) => {
          wakeRef.current = w;
        })
        .catch(() => {});
    }
    return () => {
      void wakeRef.current?.release().catch(() => {});
      wakeRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !steps.length) return;
    const sec = steps[idx]?.timerSec ?? 0;
    setTimerLeft(sec);
    setTimerRunning(false);
  }, [open, idx, steps]);

  useEffect(() => {
    if (!timerRunning || timerLeft <= 0) return;
    const id = window.setInterval(() => {
      setTimerLeft((s) => {
        if (s <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, timerLeft]);

  if (!open || !steps.length) return null;

  const step = steps[idx]!;
  const pct = ((idx + 1) / steps.length) * 100;
  const timerTotal = step.timerSec ?? 0;
  const timerPct =
    timerTotal > 0 ? Math.min(100, ((timerTotal - timerLeft) / timerTotal) * 100) : 0;
  const mm = Math.floor(timerLeft / 60);
  const ss = timerLeft % 60;
  const timeLabel = `${mm}:${String(ss).padStart(2, "0")}`;

  return (
    <div className={`cook-overlay-base${open ? " open" : ""}`}>
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <button
          type="button"
          className="text-sm text-[var(--text)]"
          onClick={onExit}
        >
          ✕ Exit
        </button>
        <span className="text-sm text-[var(--text2)]">
          Step {idx + 1} of {steps.length}
        </span>
      </header>
      <div className="px-4 pt-2">
        <div className="prog-bar">
          <div className="prog-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-8 text-center">
        <p
          className="mb-4 font-[family-name:var(--fd)] text-5xl tabular-nums"
          style={{ color: "var(--accent)" }}
        >
          {idx + 1}
        </p>
        <p className="max-w-md text-lg leading-relaxed text-[var(--text)]">
          {step.text}
        </p>
        {timerTotal > 0 ? (
          <div className="mt-8 w-full max-w-sm">
            <p
              className="mb-2 font-[family-name:var(--fd)] text-3xl tabular-nums"
              style={{ color: "var(--accent3)" }}
            >
              {timeLabel}
            </p>
            <div className="mb-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm text-white"
                onClick={() => setTimerRunning((r) => !r)}
              >
                {timerRunning ? "⏸ Pause" : "▶ Start"}
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--surface2)] px-3 py-2 text-sm text-[var(--text)]"
                onClick={() => {
                  setTimerLeft(timerTotal);
                  setTimerRunning(false);
                }}
              >
                ↺ Reset
              </button>
            </div>
            <div className="prog-bar">
              <div className="prog-fill" style={{ width: `${timerPct}%` }} />
            </div>
          </div>
        ) : null}
      </div>
      <footer className="flex shrink-0 gap-3 border-t border-[var(--border)] p-4">
        <button
          type="button"
          className="flex-1 rounded-xl bg-[var(--surface2)] py-3 text-sm font-medium text-[var(--text)]"
          disabled={idx === 0}
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
        >
          ◀ Prev
        </button>
        {idx >= steps.length - 1 ? (
          <button
            type="button"
            className="flex-1 rounded-xl py-3 text-sm font-medium text-white"
            style={{ background: "var(--accent2)" }}
            onClick={onExit}
          >
            ✅ Done
          </button>
        ) : (
          <button
            type="button"
            className="flex-1 rounded-xl py-3 text-sm font-medium text-white"
            style={{ background: "var(--accent)" }}
            onClick={() => setIdx((i) => Math.min(steps.length - 1, i + 1))}
          >
            Next ▶
          </button>
        )}
      </footer>
    </div>
  );
}

type CustomHabit = { id: string; emoji: string; name: string };

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function streakForHabit(
  habitId: string,
  data: Record<string, Record<string, boolean>>
): number {
  const h = data[habitId] ?? {};
  let count = 0;
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  for (let i = 0; i < 400; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const ymd = `${y}-${m}-${day}`;
    if (h[ymd]) count++;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

function HabitsWaterTracker() {
  const [habits, setHabits] = useState<CustomHabit[]>([]);
  const [habitData, setHabitData] = useState<Record<string, Record<string, boolean>>>({});
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [waterGoal, setWaterGoal] = useState<number | null>(null);
  const [waterLog, setWaterLog] = useState<Record<string, number>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [emojiIn, setEmojiIn] = useState("");
  const [nameIn, setNameIn] = useState("");
  const [goalPicker, setGoalPicker] = useState(false);
  const [customWater, setCustomWater] = useState("");

  const refresh = useCallback(() => {
    setHabits(loadJson<CustomHabit[]>(LS_CUSTOM_HABITS, []));
    setHabitData(loadJson<Record<string, Record<string, boolean>>>(LS_HABIT_DATA, {}));
    setStreaks(loadJson<Record<string, number>>(LS_HABIT_STREAKS, {}));
    const g = localStorage.getItem(LS_WATER_GOAL);
    setWaterGoal(g && g !== "null" ? Number(g) : null);
    setWaterLog(loadJson<Record<string, number>>(LS_WATER_LOG, {}));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const today = todayYmdLocal();
  const waterToday = waterLog[today] ?? 0;

  function persistHabitData(next: Record<string, Record<string, boolean>>) {
    localStorage.setItem(LS_HABIT_DATA, JSON.stringify(next));
    setHabitData(next);
    const habitList = loadJson<CustomHabit[]>(LS_CUSTOM_HABITS, []);
    const nextStreaks: Record<string, number> = {};
    for (const h of habitList) {
      nextStreaks[h.id] = streakForHabit(h.id, next);
    }
    localStorage.setItem(LS_HABIT_STREAKS, JSON.stringify(nextStreaks));
    setStreaks(nextStreaks);
  }

  function toggleHabit(id: string) {
    const next = { ...habitData, [id]: { ...(habitData[id] ?? {}) } };
    next[id] = { ...next[id], [today]: !next[id]?.[today] };
    persistHabitData(next);
  }

  function addHabit() {
    const name = nameIn.trim();
    if (!name) return;
    const emoji = emojiIn.trim().slice(0, 4) || "•";
    const id = crypto.randomUUID();
    const next = [...habits, { id, emoji, name }];
    localStorage.setItem(LS_CUSTOM_HABITS, JSON.stringify(next));
    setHabits(next);
    setEmojiIn("");
    setNameIn("");
    setSheetOpen(false);
  }

  function setGoal(oz: number) {
    localStorage.setItem(LS_WATER_GOAL, String(oz));
    setWaterGoal(oz);
    setGoalPicker(false);
  }

  function addWater(oz: number) {
    const next = { ...waterLog, [today]: (waterLog[today] ?? 0) + oz };
    localStorage.setItem(LS_WATER_LOG, JSON.stringify(next));
    setWaterLog(next);
  }

  function logCustomWater() {
    const n = Number.parseFloat(customWater);
    if (!Number.isFinite(n) || n <= 0) return;
    addWater(n);
    setCustomWater("");
  }

  const doneToday = habits.filter((h) => habitData[h.id]?.[today]).length;
  const totalHabits = habits.length;

  const barDays = useMemo(() => {
    const out: { ymd: string; ratio: number }[] = [];
    for (let ago = 6; ago >= 0; ago--) {
      const d = new Date();
      d.setDate(d.getDate() - ago);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const ymd = `${y}-${m}-${day}`;
      if (habits.length === 0) {
        out.push({ ymd, ratio: -1 });
        continue;
      }
      let done = 0;
      for (const h of habits) {
        if (habitData[h.id]?.[ymd]) done++;
      }
      out.push({ ymd, ratio: done / habits.length });
    }
    return out;
  }, [habits, habitData]);

  const waterPct =
    waterGoal && waterGoal > 0 ? Math.min(100, (waterToday / waterGoal) * 100) : 0;
  const hitGoal = waterGoal != null && waterToday >= waterGoal;

  return (
    <div className="mt-8 space-y-6 border-t border-[var(--border)] pt-8">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="font-[family-name:var(--fd)] text-sm uppercase tracking-wide text-[var(--text)]">
            TODAY&apos;S HABITS
          </h3>
          {habits.length > 0 ? (
            <span className="text-xs text-[var(--text3)]">
              {doneToday} / {totalHabits}
            </span>
          ) : null}
        </div>

        {habits.length === 0 ? (
          <p className="text-sm text-[var(--text2)]">No habits yet. Add your first habit below.</p>
        ) : (
          <>
            <ul className="list-none p-0">
              {habits.map((h) => {
                const checked = Boolean(habitData[h.id]?.[today]);
                const st = streaks[h.id] ?? streakForHabit(h.id, habitData);
                return (
                  <li
                    key={h.id}
                    className={`habit-row${checked ? " checked" : ""}`}
                    onClick={() => toggleHabit(h.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleHabit(h.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="habit-chk" aria-hidden>
                      {checked ? "✓" : ""}
                    </span>
                    <span className="habit-label">
                      <span className="mr-1">{h.emoji}</span>
                      {h.name}
                    </span>
                    {st > 1 ? (
                      <span className="text-xs" style={{ color: "var(--accent3)" }}>
                        🔥 {st} day streak
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-[10px] text-[var(--text3)]">
                <span>7 days ago</span>
                <span>Today</span>
              </div>
              <div className="flex gap-1">
                {barDays.map((b) => {
                  let bg = "var(--surface2)";
                  if (b.ratio < 0) bg = "var(--surface2)";
                  else if (b.ratio >= 1) bg = "var(--accent2)";
                  else if (b.ratio > 0) bg = "#f59e0b";
                  return (
                    <div
                      key={b.ymd}
                      title={b.ymd}
                      className="h-3 flex-1 rounded-sm"
                      style={{ background: bg }}
                    />
                  );
                })}
              </div>
            </div>
          </>
        )}

        <button
          type="button"
          className="mt-4 w-full rounded-xl border-2 border-dashed border-[var(--border)] bg-transparent py-3 text-sm text-[var(--text2)]"
          onClick={() => setSheetOpen(true)}
        >
          + Add Habit
        </button>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-[family-name:var(--fd)] text-sm uppercase tracking-wide text-[var(--text)]">
            💧 WATER
          </h3>
          {waterGoal != null ? (
            <span className="text-xs text-[var(--text3)]">
              {Math.round(waterToday)}oz / {waterGoal}oz
            </span>
          ) : null}
        </div>

        {waterGoal == null ? (
          <div>
            <p className="mb-2 text-sm text-[var(--text2)]">Set your daily water goal</p>
            <div className="flex flex-wrap gap-2">
              {[64, 80, 100].map((oz) => (
                <button
                  key={oz}
                  type="button"
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-4 py-2 text-sm text-[var(--text)]"
                  onClick={() => setGoal(oz)}
                >
                  {oz}oz
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="macro-bar-track mb-3 h-2 w-full rounded-full bg-[var(--surface2)]">
              <div
                className="macro-bar-fill h-full rounded-full transition-all"
                style={{
                  width: `${waterPct}%`,
                  background: hitGoal ? "var(--accent2)" : "var(--accent)",
                }}
              />
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              {[8, 16, 32].map((oz) => (
                <button
                  key={oz}
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-xs text-white"
                  style={{ background: "var(--accent2)" }}
                  onClick={() => addWater(oz)}
                >
                  +{oz}oz
                </button>
              ))}
            </div>
            <div className="mb-2 flex gap-2">
              <input
                className="inf min-w-0 flex-1"
                inputMode="decimal"
                placeholder="Custom oz"
                value={customWater}
                onChange={(e) => setCustomWater(e.target.value)}
              />
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-white"
                style={{ background: "var(--accent2)" }}
                onClick={logCustomWater}
              >
                Log
              </button>
            </div>
            <button
              type="button"
              className="text-xs text-[var(--text3)] underline"
              onClick={() => setGoalPicker((v) => !v)}
            >
              ⚙ Goal
            </button>
            {goalPicker ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {[64, 80, 100].map((oz) => (
                  <button
                    key={oz}
                    type="button"
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-1 text-xs"
                    onClick={() => setGoal(oz)}
                  >
                    {oz}oz
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </section>

      <button
        type="button"
        className={`sheet-overlay${sheetOpen ? " open" : ""}`}
        aria-label="Close"
        onClick={() => setSheetOpen(false)}
      />
      <div className={`bottom-sheet-base${sheetOpen ? " open" : ""}`}>
        <div className="p-4 pb-8">
          <p className="mb-2 text-sm font-medium text-[var(--text)]">New habit</p>
          <input
            className="inf mb-2"
            placeholder="Emoji (max 4)"
            maxLength={4}
            value={emojiIn}
            onChange={(e) => setEmojiIn(e.target.value)}
          />
          <input
            className="inf mb-3"
            placeholder="Habit name"
            value={nameIn}
            onChange={(e) => setNameIn(e.target.value)}
          />
          <button
            type="button"
            className="w-full rounded-xl py-3 font-semibold text-white"
            style={{ background: "var(--accent2)" }}
            onClick={addHabit}
          >
            Add Habit
          </button>
        </div>
      </div>
    </div>
  );
}

export function MealsClient({ userId, macroTargets }: Props) {
  const [tab, setTab] = useState<TabId>("today");
  const [logs, setLogs] = useState<FoodLogRow[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [planEntries, setPlanEntries] = useState<MealPlanEntryRow[]>([]);
  const [hasMealPlan, setHasMealPlan] = useState(false);
  const [weekLabel, setWeekLabel] = useState("");
  const [initialLoad, setInitialLoad] = useState(true);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  const [cookOpen, setCookOpen] = useState(false);
  const [cookSteps, setCookSteps] = useState<CookStep[]>([]);

  const [labelScanBusy, setLabelScanBusy] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const [labelPrefill, setLabelPrefill] = useState<LabelPrefill | null>(null);
  const [labelPrefillNonce, setLabelPrefillNonce] = useState(0);

  const [voiceFoodOk, setVoiceFoodOk] = useState(false);
  const [foodVoiceBusy, setFoodVoiceBusy] = useState(false);
  const [voiceFoodNonce, setVoiceFoodNonce] = useState(0);
  const [voiceFoodText, setVoiceFoodText] = useState("");

  const [coachTip, setCoachTip] = useState("");
  const [coachTipPinned, setCoachTipPinned] = useState(false);
  const tipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mealSuggestions, setMealSuggestions] = useState<string[]>([]);
  const [mealSuggestBusy, setMealSuggestBusy] = useState(false);
  const [mealSuggestNonce, setMealSuggestNonce] = useState(0);
  const [streakCount, setStreakCount] = useState(0);
  const lastUtcYmdRef = useRef(ymdUtc());

  const [analyzerOpen, setAnalyzerOpen] = useState(false);
  const [anRecipeName, setAnRecipeName] = useState("");
  const [anServings, setAnServings] = useState("1");
  const [anIngredients, setAnIngredients] = useState<
    { amount: string; unit: string; name: string }[]
  >([{ amount: "", unit: "", name: "" }]);
  const [anCalcBusy, setAnCalcBusy] = useState(false);
  const [anScanBusy, setAnScanBusy] = useState(false);
  const anImgRef = useRef<HTMLInputElement>(null);
  const [anResult, setAnResult] = useState<{
    macrosPerServing: { cal: number; pro: number; fat: number; carbs: number };
    verdict: string;
    verdictNote: string;
    adjustments: { change: string; reason: string }[];
  } | null>(null);

  const macroSummaryRows = useMemo(() => {
    const targetMap = new Map(
      macroTargets.map((t) => [normalizeMacroKey(t.key), t.targetNumber])
    );
    const totals: Record<string, number> = {};
    for (const log of logs) {
      for (const m of log.food_log_macros ?? []) {
        const key = normalizeMacroKey(m.key ?? "");
        if (!key) continue;
        totals[key] = (totals[key] ?? 0) + parseNumber(m.value ?? "");
      }
    }
    return (["calories", "protein", "carbs", "fat"] as const)
      .filter((k) => targetMap.has(k))
      .slice(0, 4)
      .map((key) => {
        const target = targetMap.get(key) ?? 0;
        const current = totals[key] ?? 0;
        const widthPct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
        return { key, label: formatMacroLabel(key), target, current, widthPct };
      });
  }, [macroTargets, logs]);

  const remainingSummary = useMemo(() => {
    const targetMap = new Map(
      macroTargets.map((t) => [normalizeMacroKey(t.key), t.targetNumber])
    );
    const totals = totalsFromLogs(logs);
    const calT = targetMap.get("calories");
    const proT = targetMap.get("protein");
    const fatT = targetMap.get("fat");
    const calC = totals.calories ?? 0;
    const proC = totals.protein ?? 0;
    const fatC = totals.fat ?? 0;
    return {
      calRem: calT !== undefined ? calT - calC : null,
      proRem: proT !== undefined ? proT - proC : null,
      fatRem: fatT !== undefined ? fatT - fatC : null,
      over:
        (calT !== undefined && calC > calT) ||
        (proT !== undefined && proC > proT) ||
        (fatT !== undefined && fatC > fatT),
    };
  }, [logs, macroTargets]);

  const coachTipPinnedRef = useRef(false);

  const clearCoachTipTimer = useCallback(() => {
    if (tipTimerRef.current) {
      clearTimeout(tipTimerRef.current);
      tipTimerRef.current = null;
    }
  }, []);

  const scheduleCoachTipDismiss = useCallback(() => {
    coachTipPinnedRef.current = false;
    clearCoachTipTimer();
    tipTimerRef.current = setTimeout(() => {
      if (!coachTipPinnedRef.current) setCoachTip("");
    }, 8000);
  }, [clearCoachTipTimer]);

  const loadLogs = useCallback(async (): Promise<FoodLogRow[]> => {
    const supabase = createBrowserSupabaseClient();
    const { start, end } = getUtcDayBounds();
    const { data, error } = await supabase
      .from("food_logs")
      .select(
        "id, logged_at, meal_number, food_name, quantity, unit, food_log_macros(id, key, value)"
      )
      .eq("user_id", userId)
      .gte("logged_at", start)
      .lte("logged_at", end)
      .order("logged_at", { ascending: false });

    if (error) {
      console.error(error);
      return [];
    }
    const list = (data ?? []) as FoodLogRow[];
    setLogs(list);
    try {
      const prevRaw = localStorage.getItem(LS_FOOD_LOG_FLAG);
      const map: Record<string, boolean> =
        prevRaw && typeof JSON.parse(prevRaw) === "object"
          ? (JSON.parse(prevRaw) as Record<string, boolean>)
          : {};
      for (const log of list) {
        map[ymdLocalFromIso(log.logged_at)] = true;
      }
      localStorage.setItem(LS_FOOD_LOG_FLAG, JSON.stringify(map));
    } catch {
      /* ignore */
    }

    const todayU = ymdUtc();
    validateMacroStreakAfterDayChange(userId, macroTargets);
    const dayTotals = totalsFromLogs(list);
    if (withinAllMacroTargets(dayTotals, macroTargets)) {
      bumpMacroStreakIfQualified(todayU, true);
    }
    setStreakCount(readMacroStreak().streak);

    return list;
  }, [macroTargets, userId]);

  const handlePostMealLogged = useCallback(async () => {
    const list = await loadLogs();
    if (list.length === 0) return;
    const latest = list[0];
    const mealJustLogged = latest.food_name?.trim() ?? "";
    const todayTotals = totalsFromLogs(list);
    const hour = new Date().getHours();
    const timeOfDay =
      hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    try {
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          coachTask: "nutrition_check",
          userText: JSON.stringify({
            todayTotals,
            macroTargets,
            timeOfDay,
            mealJustLogged,
          }),
        }),
      });
      const data = (await res.json()) as { coachTaskReply?: string };
      if (!res.ok) return;
      const tip = (data.coachTaskReply ?? "").trim();
      if (!tip) return;
      coachTipPinnedRef.current = false;
      setCoachTipPinned(false);
      clearCoachTipTimer();
      setCoachTip(tip);
      scheduleCoachTipDismiss();
    } catch {
      /* ignore */
    }
  }, [loadLogs, macroTargets, clearCoachTipTimer, scheduleCoachTipDismiss]);

  const loadRecipes = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from("recipes")
      .select(
        "id, name, instructions, created_at, recipe_macros(id, key, value, unit)"
      )
      .eq("user_id", userId)
      .order("name");

    if (error) {
      console.error(error);
      return;
    }
    setRecipes((data ?? []) as RecipeRow[]);
  }, [userId]);

  const loadMealPlan = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const monday = getUtcWeekMondayDateString();
    setWeekLabel(`Week of ${monday} (UTC)`);

    const { data: plan, error: pErr } = await supabase
      .from("meal_plans")
      .select("id, week_start")
      .eq("user_id", userId)
      .eq("week_start", monday)
      .maybeSingle();

    if (pErr) {
      console.error(pErr);
      setHasMealPlan(false);
      setPlanEntries([]);
      return;
    }

    if (!plan) {
      setHasMealPlan(false);
      setPlanEntries([]);
      return;
    }

    setHasMealPlan(true);
    const { data: entries, error: eErr } = await supabase
      .from("meal_plan_entries")
      .select(
        "id, day, meal_number, recipe_id, recipes(id, name, instructions)"
      )
      .eq("meal_plan_id", plan.id)
      .order("day", { ascending: true })
      .order("meal_number", { ascending: true });

    if (eErr) {
      console.error(eErr);
      setPlanEntries([]);
      return;
    }

    setPlanEntries((entries ?? []) as MealPlanEntryRow[]);
  }, [userId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadLogs(), loadRecipes(), loadMealPlan()]);
    setInitialLoad(false);
  }, [loadLogs, loadRecipes, loadMealPlan]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    setStreakCount(readMacroStreak().streak);
  }, []);

  useEffect(() => () => clearCoachTipTimer(), [clearCoachTipTimer]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = ymdUtc();
      if (now !== lastUtcYmdRef.current) {
        lastUtcYmdRef.current = now;
        validateMacroStreakAfterDayChange(userId, macroTargets);
        void loadLogs();
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [loadLogs, macroTargets, userId]);

  useEffect(() => {
    if (macroTargets.length === 0 || logs.length === 0) {
      setMealSuggestions([]);
      return;
    }
    let cancelled = false;
    setMealSuggestBusy(true);
    void (async () => {
      try {
        const todayTotals = totalsFromLogs(logs);
        const hour = new Date().getHours();
        const timeOfDay =
          hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
        const recentMeals = logs
          .slice(0, 3)
          .map((l) => l.food_name)
          .filter(Boolean);
        const res = await fetch("/api/coach-chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            coachTask: "meal_suggestion",
            userText: JSON.stringify({
              todayTotals,
              macroTargets,
              timeOfDay,
              recentMeals,
            }),
          }),
        });
        const data = (await res.json()) as { coachTaskReply?: string };
        if (cancelled) return;
        const text = (data.coachTaskReply ?? "").trim();
        const lines = text
          .split(/\n+/)
          .map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, "").trim())
          .filter(Boolean);
        setMealSuggestions(lines.length ? lines : text ? [text] : []);
      } catch {
        if (!cancelled) setMealSuggestions([]);
      } finally {
        if (!cancelled) setMealSuggestBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logs, macroTargets, mealSuggestNonce]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`meals_food_logs_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "food_logs",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadLogs();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, loadLogs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: WebSpeechCtor;
      webkitSpeechRecognition?: WebSpeechCtor;
    };
    setVoiceFoodOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result ?? ""));
      fr.onerror = () => rej(new Error("read"));
      fr.readAsDataURL(file);
    });
  }

  const startFoodVoice = useCallback(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: WebSpeechCtor;
      webkitSpeechRecognition?: WebSpeechCtor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    try {
      setFoodVoiceBusy(true);
      const r = new Ctor();
      r.lang = "en-US";
      r.interimResults = false;
      r.onresult = (ev: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => {
        const t = Array.from(ev.results)
          .map((x) => x[0]?.transcript ?? "")
          .join(" ")
          .trim();
        if (t) {
          setVoiceFoodText(t);
          setVoiceFoodNonce((n) => n + 1);
        }
      };
      r.onerror = () => {
        setFoodVoiceBusy(false);
        toast.error("Voice not available. Try typing instead.");
      };
      r.onend = () => setFoodVoiceBusy(false);
      r.start();
    } catch {
      setFoodVoiceBusy(false);
      toast.error("Voice not available. Try typing instead.");
    }
  }, []);

  async function onLabelScanFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setLabelScanBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachTask: "food_label",
          imageBase64: dataUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        coachTaskReply?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Could not read label.");
        return;
      }
      const raw = data.coachTaskReply?.trim() ?? "";
      const json = JSON.parse(
        raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
      ) as Record<string, unknown>;
      const prefill = mapLabelJsonToPrefill(macroTargets, json);
      setLabelPrefill(prefill);
      setLabelPrefillNonce((n) => n + 1);
      toast.success("Label scanned — review and tap Add");
    } catch {
      toast.error("Could not read label. Try better lighting.");
    } finally {
      setLabelScanBusy(false);
    }
  }

  function macroKeyForAliases(aliases: string[]): string | null {
    for (const a of aliases) {
      const na = normalizeMacroKey(a);
      const hit = macroTargets.find((t) => normalizeMacroKey(t.key) === na);
      if (hit) return hit.key;
    }
    const sub = macroTargets.find((t) => {
      const k = normalizeMacroKey(t.key);
      return aliases.some((a) => k.includes(normalizeMacroKey(a)) || normalizeMacroKey(a).includes(k));
    });
    return sub?.key ?? null;
  }

  async function runRecipeMacroCalc() {
    const name = anRecipeName.trim();
    if (!name) {
      toast.error("Enter a recipe name.");
      return;
    }
    const ings = anIngredients.filter((x) => x.name.trim());
    if (ings.length === 0) {
      toast.error("Add at least one ingredient.");
      return;
    }
    const serv = Number(anServings);
    if (!Number.isFinite(serv) || serv <= 0) {
      toast.error("Servings must be a positive number.");
      return;
    }
    setAnCalcBusy(true);
    setAnResult(null);
    try {
      const targets: Record<string, number> = {};
      for (const t of macroTargets) {
        targets[t.key] = t.targetNumber;
      }
      const userText = JSON.stringify({
        recipeName: name,
        servings: serv,
        ingredients: ings,
        userDailyMacroTargets: targets,
      });
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachTask: "recipe_macros", userText }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        coachTaskReply?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Calculation failed.");
        return;
      }
      const raw = (data.coachTaskReply ?? "")
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
      const j = JSON.parse(raw) as {
        macrosPerServing?: { cal: number; pro: number; fat: number; carbs: number };
        verdict?: string;
        verdictNote?: string;
        adjustments?: { change: string; reason: string }[];
      };
      const m = j.macrosPerServing;
      if (!m || typeof m !== "object") {
        toast.error("Invalid macro response.");
        return;
      }
      setAnResult({
        macrosPerServing: {
          cal: Number(m.cal) || 0,
          pro: Number(m.pro) || 0,
          fat: Number(m.fat) || 0,
          carbs: Number(m.carbs) || 0,
        },
        verdict: String(j.verdict ?? ""),
        verdictNote: String(j.verdictNote ?? ""),
        adjustments: Array.isArray(j.adjustments) ? j.adjustments : [],
      });
    } catch {
      toast.error("Could not calculate macros.");
    } finally {
      setAnCalcBusy(false);
    }
  }

  async function onRecipeScanFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setAnScanBusy(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachTask: "recipe_ingredients",
          imageBase64: dataUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        coachTaskReply?: string;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Scan failed.");
        return;
      }
      const raw = data.coachTaskReply?.trim() ?? "";
      const arr = JSON.parse(
        raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
      ) as { amount?: string; unit?: string; name?: string }[];
      if (!Array.isArray(arr) || arr.length === 0) {
        toast.error("No ingredients detected.");
        return;
      }
      setAnIngredients(
        arr.map((x) => ({
          amount: String(x.amount ?? "").trim(),
          unit: String(x.unit ?? "").trim(),
          name: String(x.name ?? "").trim(),
        }))
      );
    } catch {
      toast.error("Could not scan recipe image.");
    } finally {
      setAnScanBusy(false);
    }
  }

  async function saveAnalyzedRecipeToLibrary() {
    if (!anResult) return;
    const name = anRecipeName.trim();
    if (!name) return;
    const supabase = createBrowserSupabaseClient();
    const { data: rec, error: recErr } = await supabase
      .from("recipes")
      .insert({
        user_id: userId,
        name,
        instructions: [`Analyzed — ${anServings} servings`],
      })
      .select("id")
      .single();
    if (recErr || !rec) {
      toast.error(recErr?.message ?? "Save failed.");
      return;
    }
    const m = anResult.macrosPerServing;
    const pairs: { val: number; aliases: string[]; unit: string }[] = [
      { val: m.cal, aliases: ["calories", "calorie", "cal"], unit: "" },
      { val: m.pro, aliases: ["protein", "pro"], unit: "g" },
      { val: m.fat, aliases: ["fat"], unit: "g" },
      { val: m.carbs, aliases: ["carbs", "carbohydrates"], unit: "g" },
    ];
    const rows: { recipe_id: string; key: string; value: number; unit: string }[] =
      [];
    for (const p of pairs) {
      if (!Number.isFinite(p.val)) continue;
      const key = macroKeyForAliases(p.aliases);
      if (!key) continue;
      rows.push({ recipe_id: rec.id, key: key, value: p.val, unit: p.unit });
    }
    if (rows.length > 0) {
      const { error: mErr } = await supabase.from("recipe_macros").insert(rows);
      if (mErr) {
        toast.error(mErr.message);
        return;
      }
    }
    toast.success("Saved to recipe library.");
    void loadRecipes();
    setAnalyzerOpen(false);
  }

  async function logAnalyzedAsFood() {
    if (!anResult) return;
    const name = anRecipeName.trim() || "Recipe";
    const supabase = createBrowserSupabaseClient();
    const { data: log, error: logErr } = await supabase
      .from("food_logs")
      .insert({
        user_id: userId,
        meal_number: 1,
        food_name: `${name} (1 serving)`,
        quantity: 1,
        unit: "serving",
      })
      .select("id")
      .single();
    if (logErr || !log) {
      toast.error(logErr?.message ?? "Log failed.");
      return;
    }
    const m = anResult.macrosPerServing;
    const pairs: { val: number; aliases: string[] }[] = [
      { val: m.cal, aliases: ["calories", "calorie", "cal"] },
      { val: m.pro, aliases: ["protein", "pro"] },
      { val: m.fat, aliases: ["fat"] },
      { val: m.carbs, aliases: ["carbs", "carbohydrates"] },
    ];
    const ins: { food_log_id: string; key: string; value: number }[] = [];
    for (const p of pairs) {
      if (!Number.isFinite(p.val)) continue;
      const key = macroKeyForAliases(p.aliases);
      if (!key) continue;
      ins.push({ food_log_id: log.id, key, value: p.val });
    }
    if (ins.length > 0) {
      const { error: fErr } = await supabase.from("food_log_macros").insert(ins);
      if (fErr) {
        toast.error(fErr.message);
        return;
      }
    }
    toast.success("Logged as food.");
    void loadLogs();
  }

  async function handleDeleteLog(id: string) {
    if (!confirm("Delete this log entry?")) return;
    setDeleteBusyId(id);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from("food_logs")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    setDeleteBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted.");
    void loadLogs();
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "today", label: "Today’s log" },
    { id: "plan", label: "Meal plan" },
    { id: "library", label: "Recipes" },
  ];

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 bg-[var(--bg)] px-4 pb-10 pt-4 sm:max-w-2xl sm:px-6">
      <SubpageHeader title="MEALS" subtitle="Log food, meal plan, and recipes." />

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        {macroSummaryRows.length === 0 ? (
          <p className="text-xs text-[var(--text3)]">
            Complete onboarding to set your macro targets
          </p>
        ) : (
          <div style={{ maxHeight: 120, overflow: "hidden" }}>
            {macroSummaryRows.map((row) => (
              <div
                key={row.key}
                className="macro-bars-row"
                style={{ marginBottom: 4, gap: 6 }}
              >
                <div className="macro-bar-label" style={{ fontSize: 10, width: 54 }}>
                  {row.label}
                </div>
                <div className="macro-bar-track" style={{ height: 5 }}>
                  <div
                    className="macro-bar-fill"
                    style={{
                      width: `${row.widthPct}%`,
                      background:
                        row.current >= row.target ? "var(--accent2)" : "var(--accent)",
                    }}
                  />
                </div>
                <div className="macro-bar-value" style={{ fontSize: 10, width: 68 }}>
                  {Math.round(row.current)} / {Math.round(row.target)}
                </div>
              </div>
            ))}
          </div>
        )}
        {macroSummaryRows.length > 0 ? (
          <p
            className={`mt-2 text-xs ${remainingSummary.over ? "text-[var(--red)]" : "text-[var(--text2)]"}`}
          >
            {remainingSummary.calRem != null
              ? `${Math.round(remainingSummary.calRem)} cal remaining`
              : ""}
            {remainingSummary.proRem != null
              ? `${remainingSummary.calRem != null ? " · " : ""}${Math.round(remainingSummary.proRem)}g protein left`
              : ""}
            {remainingSummary.fatRem != null
              ? `${remainingSummary.calRem != null || remainingSummary.proRem != null ? " · " : ""}${Math.round(remainingSummary.fatRem)}g fat left`
              : ""}
          </p>
        ) : null}
      </div>

      {coachTip ? (
        <div
          key={coachTip}
          role="note"
          className="animate-in fade-in-0 slide-in-from-top-2 rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3 text-sm text-[var(--text)] duration-300"
          onClick={() => {
            coachTipPinnedRef.current = true;
            setCoachTipPinned(true);
            clearCoachTipTimer();
          }}
        >
          <span className="mr-1" aria-hidden>
            🧠
          </span>
          {coachTip}
          {coachTipPinned ? (
            <span className="ml-2 text-[10px] text-[var(--text3)]">(pinned)</span>
          ) : null}
        </div>
      ) : null}

      {streakCount > 0 ? (
        <div
          className="inline-flex rounded-full px-3 py-1 text-xs font-medium text-white"
          style={{ background: "var(--accent2)" }}
        >
          🎯 {streakCount} day macro streak
        </div>
      ) : null}

      {macroTargets.length > 0 && logs.length > 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--fd)] text-sm uppercase tracking-wide text-[var(--text)]">
              NEXT MEAL IDEAS
            </h2>
            <button
              type="button"
              className="text-lg text-[var(--accent)]"
              aria-label="Refresh suggestions"
              disabled={mealSuggestBusy}
              onClick={() => setMealSuggestNonce((n) => n + 1)}
            >
              ↻
            </button>
          </div>
          {mealSuggestBusy && mealSuggestions.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--text3)]">Loading ideas…</p>
          ) : null}
          <ul className="mt-3 space-y-3 text-sm text-[var(--text2)]">
            {mealSuggestions.map((line, i) => (
              <li key={`${i}-${line.slice(0, 24)}`} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <span className="min-w-0 flex-1">{line}</span>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-1 text-xs font-medium text-[var(--text)]"
                  onClick={() => {
                    const name = line.replace(/\s*\([^)]*\)\s*$/g, "").split(/[–—-]/)[0]?.trim() || line;
                    setVoiceFoodText(name);
                    setVoiceFoodNonce((n) => n + 1);
                  }}
                >
                  + Log This
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        className="flex gap-1 rounded-2xl border border-border bg-card p-1"
        role="tablist"
        aria-label="Meals sections"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={cn(
              "min-h-[44px] flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {initialLoad ? (
        <p className="text-sm text-muted-foreground">Loading your data…</p>
      ) : null}

      {tab === "today" ? (
        <div className="space-y-6" role="tabpanel">
          <TodayFoodLogTab
            logs={logs}
            onDelete={handleDeleteLog}
            busyId={deleteBusyId}
          />
          <input
            ref={labelInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onLabelScanFile(f);
            }}
          />
          <LogMealForm
            userId={userId}
            macroTargets={macroTargets}
            onLogged={() => void handlePostMealLogged()}
            labelPrefill={labelPrefill}
            labelPrefillNonce={labelPrefillNonce}
            voiceFoodNameNonce={voiceFoodNonce}
            voiceFoodName={voiceFoodText}
            labelScanSlot={
              <button
                type="button"
                className="upload-area w-full text-left"
                disabled={labelScanBusy}
                onClick={() => labelInputRef.current?.click()}
              >
                {labelScanBusy ? (
                  <span className="text-sm text-[var(--text2)]">🧠 Reading label…</span>
                ) : (
                  <>
                    <span className="block text-center text-2xl" aria-hidden>
                      📸
                    </span>
                    <span className="mt-1 block text-center text-sm font-medium text-[var(--text)]">
                      Scan Label
                    </span>
                    <span className="mt-0.5 block text-center text-xs text-[var(--text3)]">
                      Nutrition facts photo
                    </span>
                  </>
                )}
              </button>
            }
            foodNameEndSlot={
              voiceFoodOk ? (
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-lg"
                  aria-label="Voice food name"
                  disabled={foodVoiceBusy}
                  onClick={startFoodVoice}
                >
                  🎤
                </button>
              ) : null
            }
          />
        </div>
      ) : null}

      {tab === "plan" ? (
        <div role="tabpanel">
          <MealPlanTab
            weekLabel={weekLabel}
            entries={planEntries}
            hasPlan={hasMealPlan}
          />
        </div>
      ) : null}

      {tab === "library" ? (
        <div className="space-y-6" role="tabpanel">
          <button
            type="button"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] py-3 text-sm font-medium text-[var(--text)]"
            onClick={() => {
              setAnalyzerOpen(true);
              setAnResult(null);
            }}
          >
            ➕ Analyze a Recipe
          </button>
          <RecipeLibraryTab
            recipes={recipes}
            onCookMode={(r) => {
              setCookSteps(buildCookSteps(r.instructions));
              setCookOpen(true);
            }}
          />
          <AddRecipeForm userId={userId} onAdded={() => void loadRecipes()} />
        </div>
      ) : null}

      <CookModeOverlay
        open={cookOpen}
        steps={cookSteps}
        onExit={() => setCookOpen(false)}
      />

      <input
        ref={anImgRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onRecipeScanFile(f);
        }}
      />

      <button
        type="button"
        className={`sheet-overlay${analyzerOpen ? " open" : ""}`}
        aria-label="Close analyzer"
        onClick={() => setAnalyzerOpen(false)}
      />
      <div className={`bottom-sheet-base${analyzerOpen ? " open" : ""}`}>
        <div className="max-h-[85vh] overflow-y-auto p-4 pb-10">
          <div className="mb-3 flex items-start justify-between gap-2">
            <h2 className="font-[family-name:var(--fd)] text-sm uppercase tracking-wide text-[var(--text)]">
              ANALYZE RECIPE
            </h2>
            <button
              type="button"
              className="text-sm text-[var(--accent)]"
              onClick={() => setAnalyzerOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="mb-3 flex gap-2">
            <input
              className="inf min-w-0 flex-1"
              placeholder="Recipe name"
              value={anRecipeName}
              onChange={(e) => setAnRecipeName(e.target.value)}
            />
            <AnalyzerNameVoice onTranscript={(t) => setAnRecipeName(t)} />
          </div>
          <label className="mb-1 block text-xs text-[var(--text3)]">Servings</label>
          <input
            className="inf mb-4 w-24"
            inputMode="decimal"
            value={anServings}
            onChange={(e) => setAnServings(e.target.value)}
          />
          <p className="mb-2 text-xs font-medium text-[var(--text2)]">Ingredients</p>
          {anIngredients.map((row, i) => (
            <div key={i} className="mb-2 flex flex-wrap gap-2">
              <input
                className="inf w-16"
                placeholder="Amt"
                value={row.amount}
                onChange={(e) =>
                  setAnIngredients((rows) =>
                    rows.map((r, j) =>
                      j === i ? { ...r, amount: e.target.value } : r
                    )
                  )
                }
              />
              <input
                className="inf w-20"
                placeholder="Unit"
                value={row.unit}
                onChange={(e) =>
                  setAnIngredients((rows) =>
                    rows.map((r, j) =>
                      j === i ? { ...r, unit: e.target.value } : r
                    )
                  )
                }
              />
              <input
                className="inf min-w-0 flex-1"
                placeholder="Ingredient"
                value={row.name}
                onChange={(e) =>
                  setAnIngredients((rows) =>
                    rows.map((r, j) =>
                      j === i ? { ...r, name: e.target.value } : r
                    )
                  )
                }
              />
              <button
                type="button"
                className="text-[var(--text3)]"
                aria-label="Remove"
                onClick={() =>
                  setAnIngredients((rows) => rows.filter((_, j) => j !== i))
                }
              >
                ×
              </button>
            </div>
          ))}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
              onClick={() =>
                setAnIngredients((rows) => [
                  ...rows,
                  { amount: "", unit: "", name: "" },
                ])
              }
            >
              + Add Ingredient
            </button>
            <button
              type="button"
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
              disabled={anScanBusy}
              onClick={() => anImgRef.current?.click()}
            >
              {anScanBusy ? "…" : "📸 Scan"}
            </button>
          </div>
          <button
            type="button"
            className="mb-4 w-full rounded-xl py-3 font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--accent2)" }}
            disabled={anCalcBusy}
            onClick={() => void runRecipeMacroCalc()}
          >
            {anCalcBusy ? "🧠 Coach is calculating…" : "🧠 Calculate Macros"}
          </button>
          {anResult ? (
            <div
              className="rounded-xl border border-[var(--border)] p-3"
              style={{
                borderColor:
                  anResult.verdict === "fits"
                    ? "#10b98188"
                    : anResult.verdict === "adjust"
                      ? "#f59e0b88"
                      : "#ef444488",
              }}
            >
              <p className="text-sm font-medium text-[var(--text)]">
                {anResult.verdictNote}
              </p>
              <div className="recipe-macros mt-3">
                {(
                  [
                    { aliases: ["calories", "calorie", "cal"] as const, v: anResult.macrosPerServing.cal },
                    { aliases: ["protein", "pro"] as const, v: anResult.macrosPerServing.pro },
                    { aliases: ["fat"] as const, v: anResult.macrosPerServing.fat },
                    { aliases: ["carbs", "carbohydrates"] as const, v: anResult.macrosPerServing.carbs },
                  ] as const
                ).map(({ aliases, v }) => {
                  const mk = macroKeyForAliases([...aliases]);
                  return (
                    <div key={aliases[0]} className="recipe-macro-val">
                      <div className="recipe-macro-num">{Math.round(v)}</div>
                      <div className="recipe-macro-lbl">
                        {formatMacroLabel(mk ?? aliases[0])}
                      </div>
                    </div>
                  );
                })}
              </div>
              {anResult.adjustments.length > 0 ? (
                <ul className="mt-3 list-disc pl-5 text-xs text-[var(--text2)]">
                  {anResult.adjustments.map((a, i) => (
                    <li key={i}>
                      {a.change} — {a.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  className="w-full rounded-xl py-3 font-semibold text-white"
                  style={{ background: "var(--accent2)" }}
                  onClick={() => void saveAnalyzedRecipeToLibrary()}
                >
                  Save to Recipe Library
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl py-3 font-semibold text-[var(--text)]"
                  style={{ background: "var(--surface2)" }}
                  onClick={() => void logAnalyzedAsFood()}
                >
                  Log as Food
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <HabitsWaterTracker />
    </div>
  );
}
