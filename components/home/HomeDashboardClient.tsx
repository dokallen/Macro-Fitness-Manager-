"use client";

import Link from "next/link";
import { useState } from "react";

import { HomeSpinDial } from "@/components/home/HomeSpinDial";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type HomeDashboardStats = {
  weekNumber: number;
  /** When set (e.g. from server), drives program week badge; otherwise week is 1. */
  programStart?: string | null;
  currentWeight: string;
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

export function HomeDashboardClient({ stats }: { stats: HomeDashboardStats }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const weekToShow = programWeekFromStart(stats.programStart);

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
