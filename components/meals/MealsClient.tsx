"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AddRecipeForm } from "@/components/meals/AddRecipeForm";
import { LogMealForm } from "@/components/meals/LogMealForm";
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
import { formatMacroLabel, type MacroTargetRow } from "@/lib/dashboard/preferences";
import { getUtcDayBounds } from "@/lib/dashboard/utc-day";
import { getUtcWeekMondayDateString } from "@/lib/meals/week";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

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

const LS_HABIT_DATA = "mf_habitData";
const LS_HABIT_STREAKS = "mf_habitStreaks";
const LS_CUSTOM_HABITS = "mf_customHabits";
const LS_WATER_LOG = "mf_waterLog";
const LS_WATER_GOAL = "mf_waterGoal";
const LS_FOOD_LOG_FLAG = "mf_foodLog";

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

  const loadLogs = useCallback(async () => {
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
      return;
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
  }, [userId]);

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
      </div>

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
          <LogMealForm
            userId={userId}
            macroTargets={macroTargets}
            onLogged={() => void loadLogs()}
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
          <RecipeLibraryTab recipes={recipes} />
          <AddRecipeForm userId={userId} onAdded={() => void loadRecipes()} />
        </div>
      ) : null}

      <HabitsWaterTracker />
    </div>
  );
}
