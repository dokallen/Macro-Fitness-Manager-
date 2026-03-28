"use client";

import Link from "next/link";
import { useState } from "react";

import { HomeSpinDial } from "@/components/home/HomeSpinDial";

export type HomeDashboardStats = {
  weekNumber: number;
  currentWeight: string;
  lbsToGoal: string;
  workoutStreak: string;
  macroStreak: string;
};

const NAV_RESERVE =
  "calc(5.75rem + max(20px, env(safe-area-inset-bottom, 0px)))";

export function HomeDashboardClient({ stats }: { stats: HomeDashboardStats }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className="box-border flex h-full max-h-full w-full flex-col overflow-hidden"
      style={{
        paddingTop: "0.5rem",
        paddingBottom: NAV_RESERVE,
        paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
      }}
    >
      <header className="flex h-[7.5rem] shrink-0 flex-col justify-center border-b border-[var(--border)]/60">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1
              className="truncate uppercase leading-none text-[var(--text)]"
              style={{
                fontFamily: "var(--fd)",
                fontSize: "clamp(1.5rem, 4.8vw, 2.25rem)",
                letterSpacing: "0.08em",
              }}
            >
              MACRO FIT
            </h1>
            <p
              className="mt-1 font-body text-[10px] uppercase tracking-[0.2em] text-[var(--text2)] sm:text-xs"
            >
              YOUR PROGRAM
            </p>
            <div
              className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-body text-[10px] font-bold text-white sm:px-3 sm:py-1.5 sm:text-xs"
              style={{ background: "var(--accent)" }}
            >
              <span aria-hidden>⚡</span>
              <span>WEEK {stats.weekNumber}</span>
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
              className="flex size-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] font-body text-base text-[var(--text)] sm:size-10 sm:text-lg"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      <section className="grid h-[9.25rem] shrink-0 grid-cols-2 gap-2 py-2 sm:h-[10rem] sm:gap-3 sm:py-3">
        {(
          [
            { label: "CURRENT WEIGHT", value: stats.currentWeight },
            { label: "LBS TO GOAL", value: stats.lbsToGoal },
            { label: "WORKOUT STREAK", value: stats.workoutStreak },
            { label: "MACRO STREAK", value: stats.macroStreak },
          ] as const
        ).map((s) => (
          <div
            key={s.label}
            className="flex flex-col justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 sm:px-3 sm:py-2.5"
          >
            <p className="font-body text-[8px] font-semibold uppercase leading-tight tracking-[0.12em] text-[var(--text2)] sm:text-[9px]">
              {s.label}
            </p>
            <p
              className="mt-1 truncate font-heading leading-none text-[var(--text)] sm:mt-1.5"
              style={{ fontSize: "clamp(1.15rem, 3.8vw, 1.5rem)" }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </section>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <HomeSpinDial />
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            className="absolute right-0 top-0 flex h-full w-[min(100%,280px)] flex-col gap-1 border-l border-[var(--border)] bg-[var(--surface)] p-4 pt-[max(1rem,env(safe-area-inset-top))] font-body shadow-xl"
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
                className="rounded-lg px-3 py-3 text-[var(--text)] hover:bg-[var(--surface2)]"
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
        </div>
      ) : null}
    </div>
  );
}
