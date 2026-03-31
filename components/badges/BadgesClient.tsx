"use client";

import { useEffect, useMemo, useState } from "react";

import { SubpageHeader } from "@/components/layout/SubpageHeader";

const BADGE_STORAGE_KEY = "mf_badges";
const JOURNAL_KEY = "mf_fitnessJournal";
const SUPP_KEY = "mf_supplementStack";

type BadgeDef = {
  id: string;
  icon: string;
  name: string;
  desc: string;
};

const BADGE_DEFS: BadgeDef[] = [
  {
    id: "first_workout",
    icon: "🥇",
    name: "First Workout",
    desc: "Logged your first workout session",
  },
  {
    id: "streak_7",
    icon: "🔥",
    name: "7-Week Streak",
    desc: "Completed planned workouts 7 weeks in a row",
  },
  {
    id: "lost_5lbs",
    icon: "⚖️",
    name: "5 Lbs Down",
    desc: "Lost your first 5 lbs",
  },
  {
    id: "macro_7",
    icon: "🎯",
    name: "Macro Master",
    desc: "7-day macro target streak",
  },
  {
    id: "water_7",
    icon: "💧",
    name: "Hydration Habit",
    desc: "7-day water goal streak",
  },
  {
    id: "first_journal",
    icon: "📓",
    name: "Journal Started",
    desc: "Wrote your first journal entry",
  },
  {
    id: "workouts_30",
    icon: "🏆",
    name: "30 Workouts",
    desc: "Completed 30 logged workouts",
  },
  {
    id: "first_supplement",
    icon: "💊",
    name: "Stack Builder",
    desc: "Added your first supplement to the stack",
  },
  {
    id: "journal_7",
    icon: "✨",
    name: "Journal Streak",
    desc: "Logged 7 journal entries",
  },
];

function readJournalCount(): number {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (!raw) return 0;
    const j = JSON.parse(raw) as unknown;
    return Array.isArray(j) ? j.length : 0;
  } catch {
    return 0;
  }
}

function readSupplementCount(): number {
  try {
    const raw = localStorage.getItem(SUPP_KEY);
    if (!raw) return 0;
    const j = JSON.parse(raw) as unknown;
    return Array.isArray(j) ? j.length : 0;
  } catch {
    return 0;
  }
}

function loadUnlocked(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BADGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { unlocked?: Record<string, string> };
    return parsed.unlocked ?? {};
  } catch {
    return {};
  }
}

function saveUnlocked(u: Record<string, string>) {
  localStorage.setItem(BADGE_STORAGE_KEY, JSON.stringify({ unlocked: u }));
}

function syncFromLocalData(): Record<string, string> {
  const jCount = readJournalCount();
  const sCount = readSupplementCount();
  const u = { ...loadUnlocked() };
  if (jCount >= 1 && !u.first_journal) {
    u.first_journal = new Date().toISOString();
  }
  if (jCount >= 7 && !u.journal_7) {
    u.journal_7 = new Date().toISOString();
  }
  if (sCount >= 1 && !u.first_supplement) {
    u.first_supplement = new Date().toISOString();
  }
  saveUnlocked(u);
  return u;
}

export function BadgesClient() {
  const [unlocked, setUnlocked] = useState<Record<string, string>>({});

  useEffect(() => {
    setUnlocked(syncFromLocalData());
  }, []);

  const unlockedCount = useMemo(
    () => BADGE_DEFS.filter((b) => unlocked[b.id]).length,
    [unlocked]
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-0 pb-24">
      <SubpageHeader
        title="ACHIEVEMENTS"
        subtitle={`${unlockedCount} of ${BADGE_DEFS.length} unlocked`}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
          padding: "0 16px 24px",
        }}
      >
        {BADGE_DEFS.map((b) => {
          const isUnlocked = Boolean(unlocked[b.id]);
          const earned = unlocked[b.id];
          return (
            <div
              key={b.id}
              className={`badge-card-item${isUnlocked ? "" : " locked"}`}
              style={{
                flexDirection: "column",
                textAlign: "center",
                alignItems: "center",
                marginBottom: 0,
                borderColor: isUnlocked ? "var(--accent)" : undefined,
                borderWidth: isUnlocked ? 2 : 1,
              }}
            >
              <div style={{ fontSize: 28, lineHeight: 1 }}>{b.icon}</div>
              <div
                style={{
                  fontFamily: "var(--fd)",
                  fontSize: 11,
                  letterSpacing: 0.5,
                  marginTop: 6,
                }}
              >
                {b.name}
              </div>
              <p
                style={{
                  fontSize: 9,
                  color: "var(--text2)",
                  margin: "6px 0 0",
                  lineHeight: 1.25,
                }}
              >
                {b.desc}
              </p>
              {earned ? (
                <p style={{ fontSize: 9, color: "var(--accent2)", marginTop: 6 }}>
                  {new Date(earned).toLocaleDateString()}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
