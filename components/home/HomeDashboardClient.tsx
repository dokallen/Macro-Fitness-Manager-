"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { HomeSpinDial } from "@/components/home/HomeSpinDial";
import { fetchTodayMacroTotals } from "@/lib/dashboard/food-macros";
import type { MacroTargetRow } from "@/lib/dashboard/preferences";
import { formatMacroLabel } from "@/lib/dashboard/preferences";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type HomeDashboardStats = {
  weekNumber: number;
  /** When set (e.g. from server), drives program week badge; otherwise week is 1. */
  programStart?: string | null;
  currentWeight: string;
  currentWeightLbs?: number | null;
  goalWeight?: number | null;
  startWeight?: number | null;
  weightLog?: { date: string; weight: number }[];
  lbsToGoal: string;
  workoutStreak: string;
  macroStreak: string;
};

function programWeekFromStart(programStart: string | null | undefined): number {
  if (!programStart?.trim()) return 1;
  const d = new Date(programStart.trim());
  if (!Number.isFinite(d.getTime())) return 1;
  return Math.max(Math.floor((Date.now() - d.getTime()) / WEEK_MS) + 1, 1);
}

function parseLbsFromDisplay(s: string): number | null {
  const n = parseFloat(String(s).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function computeEtaWeeks(
  weightLog: { date: string; weight: number }[] | undefined,
  goalWeight: number,
  currentWeight: number
): string | null {
  const log = weightLog ?? [];
  if (log.length < 2) return null;
  const sorted = [...log].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const dt = new Date(last.date).getTime() - new Date(first.date).getTime();
  const weeks = dt / WEEK_MS;
  if (weeks <= 0) return null;
  const dw = first.weight - last.weight;
  if (dw <= 0) return null;
  const ratePerWeek = dw / weeks;
  if (ratePerWeek <= 0) return null;
  const remaining = currentWeight - goalWeight;
  if (remaining <= 0) return null;
  const wk = remaining / ratePerWeek;
  if (!Number.isFinite(wk)) return null;
  return `~${Math.max(1, Math.round(wk))} wk to goal`;
}

function macroBarFillColor(current: number, target: number): string {
  if (target <= 0) return "var(--accent)";
  if (current >= target) return "var(--accent2)";
  if (current >= target * 0.85) return "var(--yellow)";
  return "var(--accent)";
}

export function HomeDashboardClient({
  stats,
  macroTargets,
  userId,
}: {
  stats: HomeDashboardStats;
  macroTargets: MacroTargetRow[];
  userId: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [macroTotals, setMacroTotals] = useState<Record<string, number>>({});

  const refreshMacroTotals = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const next = await fetchTodayMacroTotals(supabase, userId);
    setMacroTotals(next);
  }, [userId]);

  useEffect(() => {
    void refreshMacroTotals();
  }, [refreshMacroTotals]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`home_dashboard_food_logs_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "food_logs",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refreshMacroTotals();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refreshMacroTotals]);

  const weekToShow = programWeekFromStart(stats.programStart);

  const goalBlock = useMemo(() => {
    const goalWeight = stats.goalWeight ?? null;
    const startWeight = stats.startWeight ?? null;
    const currentWeight =
      stats.currentWeightLbs ?? parseLbsFromDisplay(stats.currentWeight);
    if (
      goalWeight == null ||
      startWeight == null ||
      currentWeight == null
    ) {
      return { goalPct: null as number | null, eta: null as string | null };
    }
    const totalNeeded = startWeight - goalWeight;
    const totalLost = startWeight - currentWeight;
    const goalPct =
      goalWeight > 0 && totalNeeded > 0
        ? Math.min(Math.max((totalLost / totalNeeded) * 100, 0), 100)
        : null;
    const eta =
      goalPct != null
        ? computeEtaWeeks(stats.weightLog, goalWeight, currentWeight)
        : null;
    return { goalPct, eta };
  }, [stats]);

  return (
    <div
      className="box-border flex h-full max-h-full w-full flex-col overflow-hidden"
      style={{
        paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
      }}
    >
      <header className="home-hdr">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="home-name">MACRO FIT</h1>
            <p className="home-sub">YOUR PROGRAM</p>
            <div className="week-badge" aria-label={`Program week ${weekToShow}`}>
              <span aria-hidden>⚡</span>
              <span>WEEK {weekToShow}</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Link
              href="/progress"
              className="flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-base sm:size-10 sm:text-lg"
              aria-label="Achievements"
            >
              🏆
            </Link>
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-base text-[var(--text)] sm:size-10 sm:text-lg"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      <section className="stats-row">
        {(
          [
            { label: "CURRENT WEIGHT", value: stats.currentWeight },
            { label: "LBS TO GOAL", value: stats.lbsToGoal },
            { label: "WORKOUT STREAK", value: stats.workoutStreak },
            { label: "MACRO STREAK", value: stats.macroStreak },
          ] as const
        ).map((s) => (
          <div key={s.label} className="stat-card">
            <div className="sl">{s.label}</div>
            <div className="sv">{s.value}</div>
          </div>
        ))}
      </section>

      {macroTargets.length === 0 ? (
        <p
          className="font-body"
          style={{
            fontSize: 12,
            color: "var(--text3)",
            textAlign: "center",
            padding: "4px 20px 10px",
          }}
        >
          Set up your macros in onboarding
        </p>
      ) : (
        <div
          className="font-body"
          style={{ padding: "0 20px 12px" }}
          aria-label="Today's macro progress"
        >
          {macroTargets.map((t) => {
            const current = macroTotals[t.key] ?? 0;
            const target = t.targetNumber;
            const widthPct =
              target > 0 ? Math.min(100, (current / target) * 100) : 0;
            const fill = macroBarFillColor(current, target);
            return (
              <div key={t.key} className="macro-bars-row">
                <div className="macro-bar-label">{formatMacroLabel(t.key)}</div>
                <div className="macro-bar-track">
                  <div
                    className="macro-bar-fill"
                    style={{
                      width: `${widthPct}%`,
                      background: fill,
                    }}
                  />
                </div>
                <div className="macro-bar-value">
                  {Math.round(current)} / {Math.round(target)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {goalBlock.goalPct != null ? (
        <div
          style={{
            gridColumn: "1/-1",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "10px 12px",
            margin: "0 20px 0",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--text3)",
                letterSpacing: 1,
              }}
            >
              GOAL PROGRESS
            </div>
            <div
              style={{ fontSize: 12, fontWeight: 600, color: "var(--accent2)" }}
            >
              {Math.round(goalBlock.goalPct)}%
            </div>
          </div>
          <div
            style={{
              height: 6,
              background: "var(--surface2)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${goalBlock.goalPct}%`,
                background:
                  goalBlock.goalPct >= 100 ? "var(--accent2)" : "var(--accent)",
                borderRadius: 3,
                transition: "width .4s",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 4,
              fontSize: 10,
              color: "var(--text3)",
            }}
          >
            <span>{stats.startWeight} lbs</span>
            <span>{stats.goalWeight} lbs</span>
          </div>
          {goalBlock.eta ? (
            <div
              style={{
                marginTop: 4,
                fontSize: 10,
                color: "var(--text2)",
                textAlign: "center",
              }}
            >
              {goalBlock.eta}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <HomeSpinDial />
      </div>

      {menuOpen ? (
        <>
          <button
            type="button"
            className="drawer-overlay open"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            className="side-drawer open flex flex-col gap-1 p-4 pt-[max(1rem,env(safe-area-inset-top))] font-body shadow-xl"
            aria-label="Menu"
          >
            <p className="mb-2 font-display text-xl tracking-[2px] text-[var(--text)]">
              MENU
            </p>
            {(
              [
                { href: "/cardio", label: "Cardio" },
                { href: "/coach", label: "Coach" },
                { href: "/meals", label: "Meals" },
                { href: "/onboarding", label: "Onboarding" },
              ] as const
            ).map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-3 text-[var(--text)] no-underline hover:bg-[var(--surface2)]"
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <button
              type="button"
              className="mt-4 rounded-lg px-3 py-3 text-left text-[var(--accent)]"
              onClick={() => setMenuOpen(false)}
            >
              Close
            </button>
          </nav>
        </>
      ) : null}
    </div>
  );
}
