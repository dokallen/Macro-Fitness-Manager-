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

export function HomeDashboardClient({ stats }: { stats: HomeDashboardStats }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="home-hdr shrink-0">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <h1
              className="uppercase leading-none text-[var(--text)]"
              style={{
                fontFamily: "var(--fd)",
                fontSize: "clamp(1.65rem, 5.2vw, 2.625rem)",
                letterSpacing: "2px",
              }}
            >
              MACRO FIT
            </h1>
            <p
              className="mt-1 font-body text-xs uppercase text-[var(--text2)]"
              style={{ letterSpacing: "2px" }}
            >
              YOUR PROGRAM
            </p>
            <div
              className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-body text-xs font-bold text-white"
              style={{ background: "var(--accent)" }}
            >
              <span aria-hidden>⚡</span>
              <span>WEEK {stats.weekNumber}</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5 pt-1 sm:gap-2">
            <Link
              href="/progress"
              className="flex size-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-lg sm:size-11 sm:text-xl"
              aria-label="Achievements"
            >
              🏆
            </Link>
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] font-body text-lg text-[var(--text)] sm:size-11 sm:text-xl"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              ☰
            </button>
          </div>
        </div>
      </div>

      <div className="mt-2 grid shrink-0 grid-cols-2 gap-2 sm:mt-3 sm:gap-3">
        {[
          { label: "CURRENT WEIGHT", value: stats.currentWeight },
          { label: "LBS TO GOAL", value: stats.lbsToGoal },
          { label: "WORKOUT STREAK", value: stats.workoutStreak },
          { label: "MACRO STREAK", value: stats.macroStreak },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4"
          >
            <p
              className="font-body text-[9px] font-semibold uppercase text-[var(--text2)] sm:text-[10px]"
              style={{ letterSpacing: "clamp(1px, 0.35vw, 2px)" }}
            >
              {s.label}
            </p>
            <p
              className="stat-num mt-1.5 sm:mt-2"
              style={{ fontSize: "clamp(1.35rem, 4.2vw, 1.75rem)" }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <HomeSpinDial />

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
            <p
              className="mb-2 font-display text-xl tracking-[2px] text-[var(--text)]"
            >
              MENU
            </p>
            {[
              { href: "/cardio", label: "Cardio" },
              { href: "/coach", label: "Coach" },
              { href: "/meals", label: "Meals" },
              { href: "/onboarding", label: "Onboarding" },
            ].map((l) => (
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
