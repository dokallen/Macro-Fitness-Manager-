"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const LS_FOOD = "mf_foodLog";
const LS_WORKOUT = "mf_workoutSels";

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadFoodLs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(LS_FOOD);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return {};
    const o: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      o[k] = Boolean(v);
    }
    return o;
  } catch {
    return {};
  }
}

function loadWorkoutLs(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_WORKOUT);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return {};
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      o[k] = String(v);
    }
    return o;
  } catch {
    return {};
  }
}

type FoodLogRow = {
  id: string;
  logged_at: string;
  meal_number: number | null;
  food_name: string;
  quantity: string | null;
  unit: string | null;
  food_log_macros: { id: string; key: string; value: string | number }[] | null;
};

type Props = { userId: string };

export function CalendarClient({ userId }: Props) {
  const now = new Date();
  const [cursor, setCursor] = useState(() => ({
    y: now.getFullYear(),
    m: now.getMonth(),
  }));
  const [foodByDay, setFoodByDay] = useState<Record<string, boolean>>({});
  const [lsFood, setLsFood] = useState<Record<string, boolean>>({});
  const [lsWorkout, setLsWorkout] = useState<Record<string, string>>({});
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);
  const [detailLogs, setDetailLogs] = useState<FoodLogRow[]>([]);
  const [weightLine, setWeightLine] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const todayYmd = ymdLocal(now);
  const maxCursor = { y: now.getFullYear(), m: now.getMonth() };

  const canGoNext =
    cursor.y < maxCursor.y || (cursor.y === maxCursor.y && cursor.m < maxCursor.m);

  const monthLabel = useMemo(
    () =>
      new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      }),
    [cursor.y, cursor.m]
  );

  const grid = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1);
    const last = new Date(cursor.y, cursor.m + 1, 0);
    const startPad = first.getDay();
    const daysInMonth = last.getDate();
    const cells: { d: number | null; ymd: string | null }[] = [];
    for (let i = 0; i < startPad; i++) {
      cells.push({ d: null, ymd: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = ymdLocal(new Date(cursor.y, cursor.m, d));
      cells.push({ d, ymd });
    }
    return cells;
  }, [cursor.y, cursor.m]);

  const refreshLs = useCallback(() => {
    setLsFood(loadFoodLs());
    setLsWorkout(loadWorkoutLs());
  }, []);

  useEffect(() => {
    refreshLs();
    const t = window.setInterval(refreshLs, 2000);
    return () => clearInterval(t);
  }, [refreshLs]);

  useEffect(() => {
    let cancelled = false;
    async function loadMonth() {
      const start = new Date(cursor.y, cursor.m, 1, 0, 0, 0, 0);
      const end = new Date(cursor.y, cursor.m + 1, 0, 23, 59, 59, 999);
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase
        .from("food_logs")
        .select("logged_at")
        .eq("user_id", userId)
        .gte("logged_at", start.toISOString())
        .lte("logged_at", end.toISOString());

      if (cancelled) return;
      if (error) {
        console.error(error);
        setFoodByDay({});
        return;
      }
      const map: Record<string, boolean> = {};
      for (const row of data ?? []) {
        const dt = new Date(row.logged_at as string);
        const ymd = ymdLocal(dt);
        map[ymd] = true;
      }
      setFoodByDay(map);
    }
    void loadMonth();
    return () => {
      cancelled = true;
    };
  }, [userId, cursor.y, cursor.m]);

  useEffect(() => {
    const ymd = selectedYmd;
    if (!ymd) {
      setDetailLogs([]);
      setWeightLine(null);
      return;
    }
    const dayKey: string = ymd;
    let cancelled = false;
    async function loadDay() {
      setLoadingDetail(true);
      const [y, m, d] = dayKey.split("-").map(Number);
      const start = new Date(y, m - 1, d, 0, 0, 0, 0);
      const end = new Date(y, m - 1, d, 23, 59, 59, 999);
      const supabase = createBrowserSupabaseClient();

      const [logsRes, wRes] = await Promise.all([
        supabase
          .from("food_logs")
          .select(
            "id, logged_at, meal_number, food_name, quantity, unit, food_log_macros(id, key, value)"
          )
          .eq("user_id", userId)
          .gte("logged_at", start.toISOString())
          .lte("logged_at", end.toISOString())
          .order("logged_at", { ascending: true }),
        supabase
          .from("progress_entries")
          .select("metric_key, value, unit, logged_at")
          .eq("user_id", userId)
          .gte("logged_at", start.toISOString())
          .lte("logged_at", end.toISOString()),
      ]);

      if (cancelled) return;

      setDetailLogs((logsRes.data ?? []) as FoodLogRow[]);

      const wRows = wRes.data ?? [];
      const w = wRows.find((r) => /weight/i.test(String(r.metric_key ?? "")));
      if (w) {
        setWeightLine(
          `Weight: ${w.value}${w.unit ? ` ${w.unit}` : ""}`
        );
      } else {
        setWeightLine(null);
      }

      setLoadingDetail(false);
    }
    void loadDay();
    return () => {
      cancelled = true;
    };
  }, [selectedYmd, userId]);

  const macroTotals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const log of detailLogs) {
      for (const m of log.food_log_macros ?? []) {
        const k = (m.key ?? "").trim().toLowerCase();
        if (!k) continue;
        const n = Number.parseFloat(String(m.value).replace(/[^\d.]/g, ""));
        if (!Number.isFinite(n)) continue;
        t[k] = (t[k] ?? 0) + n;
      }
    }
    return t;
  }, [detailLogs]);

  function goPrev() {
    setCursor((c) => {
      if (c.m === 0) return { y: c.y - 1, m: 11 };
      return { ...c, m: c.m - 1 };
    });
    setSelectedYmd(null);
  }

  function goNext() {
    if (!canGoNext) return;
    setCursor((c) => {
      if (c.m === 11) return { y: c.y + 1, m: 0 };
      return { ...c, m: c.m + 1 };
    });
    setSelectedYmd(null);
  }

  const dow = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--bg)] pb-8">
      <header className="ph shrink-0">
        <Link href="/" className="back-btn">
          ← Back
        </Link>
        <h1 className="pt">CALENDAR</h1>
        <p className="ps">Tap any day to review</p>
      </header>

      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          className="cal-nav rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-[var(--text)]"
          onClick={goPrev}
          aria-label="Previous month"
        >
          ◀
        </button>
        <span
          className="cal-month px-2 text-center font-[family-name:var(--fd)] text-lg tracking-wide text-[var(--text)]"
        >
          {monthLabel}
        </span>
        <button
          type="button"
          className="cal-nav rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-[var(--text)] disabled:opacity-30"
          onClick={goNext}
          disabled={!canGoNext}
          aria-label="Next month"
        >
          ▶
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 px-2">
        {dow.map((x) => (
          <div key={x} className="cal-dow text-center text-[10px] text-[var(--text3)]">
            {x}
          </div>
        ))}
        {grid.map((cell, i) => {
          if (cell.ymd === null) {
            return <div key={`e-${i}`} className="cal-day empty" />;
          }
          const ymd = cell.ymd;
          const isToday = ymd === todayYmd;
          const isFuture = ymd > todayYmd;
          const hasFood = Boolean(foodByDay[ymd] || lsFood[ymd]);
          const hasWorkout = Boolean(lsWorkout[ymd]?.trim());
          const hasData = hasFood || hasWorkout;
          const sel = selectedYmd === ymd;
          return (
            <button
              key={ymd}
              type="button"
              disabled={isFuture}
              className={`cal-day${isToday ? " today" : ""}${isFuture ? " future" : ""}${sel ? " sel" : ""}${hasData ? " has-data" : ""}`}
              style={
                hasData
                  ? { boxShadow: "inset 0 0 0 1px var(--accent2)" }
                  : undefined
              }
              onClick={() => setSelectedYmd(ymd)}
            >
              <span className="cal-dn block text-center text-sm text-[var(--text)]">
                {cell.d}
              </span>
              <div className="cal-dots mt-1 flex justify-center gap-0.5">
                {hasFood ? (
                  <span
                    className="cal-dot inline-block size-1.5 rounded-full"
                    style={{ background: "var(--accent2)" }}
                  />
                ) : null}
                {hasWorkout ? (
                  <span
                    className="cal-dot inline-block size-1.5 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {selectedYmd ? (
        <div className="cal-detail mx-3 mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="mb-2 font-[family-name:var(--fd)] text-sm tracking-wide text-[var(--accent3)]">
            {new Date(selectedYmd + "T12:00:00").toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          {loadingDetail ? (
            <p className="text-xs text-[var(--text2)]">Loading…</p>
          ) : null}
          {weightLine ? (
            <p className="mb-2 text-sm text-[var(--text)]">{weightLine}</p>
          ) : null}
          {lsWorkout[selectedYmd] ? (
            <p className="mb-2 text-sm text-[var(--text)]">
              Workout: {lsWorkout[selectedYmd]}
            </p>
          ) : null}
          {Object.keys(macroTotals).length > 0 ? (
            <div className="mb-3 text-xs text-[var(--text2)]">
              Macros:{" "}
              {Object.entries(macroTotals)
                .map(([k, v]) => `${k}: ${Math.round(v * 10) / 10}`)
                .join(" · ")}
            </div>
          ) : null}
          <p className="mb-1 text-xs uppercase text-[var(--text3)]">Food</p>
          {detailLogs.length === 0 ? (
            <p className="text-sm text-[var(--text2)]">No meals logged.</p>
          ) : (
            <ul className="list-none space-y-2 p-0">
              {detailLogs.map((log) => (
                <li key={log.id} className="text-sm text-[var(--text)]">
                  <span className="font-medium">{log.food_name}</span>
                  {log.quantity ? (
                    <span className="text-[var(--text2)]">
                      {" "}
                      {log.quantity}
                      {log.unit ? ` ${log.unit}` : ""}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
