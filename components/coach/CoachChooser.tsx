"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

export const COACHES = [
  {
    id: "sarge",
    name: "Sarge",
    icon: "🫡",
    style: "Drill Sergeant",
    personality:
      "Intense military discipline. No excuses, high energy. Drop and give me 20.",
  },
  {
    id: "ironmike",
    name: "Iron Mike",
    icon: "🏋️",
    style: "Powerlifter",
    personality:
      "Direct, no-nonsense. Progressive overload obsessed. Short and tough.",
  },
  {
    id: "kai",
    name: "Master Kai",
    icon: "🧘",
    style: "Zen Master",
    personality:
      "Calm and mindful. Recovery and long-term balance. Peace through discipline.",
  },
  {
    id: "tara",
    name: "Coach Tara",
    icon: "📣",
    style: "Hype Coach",
    personality:
      "Always positive and enthusiastic. Every win celebrated. Pure energy.",
  },
  {
    id: "drdata",
    name: "Dr. Data",
    icon: "🧬",
    style: "Sports Scientist",
    personality:
      "Evidence-based and precise. Cites research. Everything is data.",
  },
  {
    id: "pace",
    name: "Pace",
    icon: "🏃",
    style: "Endurance Coach",
    personality:
      "Consistency over intensity. Steady progress, sustainable habits.",
  },
  {
    id: "rocky",
    name: "Rocky",
    icon: "🥊",
    style: "Boxing Coach",
    personality:
      "Fight mentality. Grit and heart. Never quit, never back down.",
  },
  {
    id: "chad",
    name: "Chad",
    icon: "🏄",
    style: "Surfer Vibes",
    personality:
      "Super chill but surprisingly sharp. Low stress, high results.",
  },
  {
    id: "drfit",
    name: "Dr. Fit",
    icon: "👨‍⚕️",
    style: "Sports Medicine",
    personality:
      "Clinical and injury-focused. Longevity over shortcuts.",
  },
  {
    id: "beast",
    name: "Beast",
    icon: "🦁",
    style: "Beast Mode",
    personality: "Maximum intensity. Primal energy. UNLEASH IT ALL.",
  },
  {
    id: "arch",
    name: "The Architect",
    icon: "🎯",
    style: "Elite Strategist",
    personality:
      "Systematic and tactical. Every rep has a purpose. Periodization master.",
  },
  {
    id: "coachk",
    name: "Coach K",
    icon: "🏈",
    style: "Sports Coach",
    personality:
      "Championship mindset. Team mentality. Brings out your best.",
  },
  {
    id: "merlin",
    name: "Macro Merlin",
    icon: "🧙",
    style: "Nutrition Wizard",
    personality:
      "Deep macro obsession. Knows every food exact breakdown. Pure nutrition nerd.",
  },
  {
    id: "harmony",
    name: "Harmony",
    icon: "🌺",
    style: "Wellness Coach",
    personality:
      "Holistic approach. Sleep, stress, and mindset matter as much as reps.",
  },
  {
    id: "aria",
    name: "ARIA",
    icon: "⚡",
    style: "AI Coach",
    personality:
      "Pure optimization. Algorithmic. Maximum efficiency, zero fluff.",
  },
] as const;

export type CoachDef = (typeof COACHES)[number];

const STORAGE_KEY = "mf_chosenCoachId";
const DEFAULT_ID = "drdata";

function coachById(id: string): CoachDef {
  return (
    COACHES.find((c) => c.id === id) ??
    COACHES.find((c) => c.id === DEFAULT_ID)!
  );
}

export function getCoach(): CoachDef {
  if (typeof window === "undefined") {
    return coachById(DEFAULT_ID);
  }
  const raw = localStorage.getItem(STORAGE_KEY)?.trim();
  return coachById(raw && raw.length ? raw : DEFAULT_ID);
}

function persistCoachId(id: string) {
  localStorage.setItem(STORAGE_KEY, id);
  document.cookie = `${STORAGE_KEY}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

type Props = {
  onCoachChange?: () => void;
};

export function CoachChooser({ onCoachChange }: Props) {
  const [selectedId, setSelectedId] = useState(() =>
    typeof window !== "undefined" ? getCoach().id : DEFAULT_ID
  );

  const syncFromStorage = useCallback(() => {
    setSelectedId(getCoach().id);
  }, []);

  useEffect(() => {
    syncFromStorage();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) syncFromStorage();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [syncFromStorage]);

  return (
    <>
      <style>{`
        .coach-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding: 8px 0 12px;
        }
        .coach-card {
          background: var(--surface2);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 10px 8px;
          cursor: pointer;
          text-align: center;
          transition: border-color 0.15s, background 0.15s;
        }
        .coach-card.sel {
          border-color: var(--accent);
          background: linear-gradient(135deg, #0f1f35, #1a2a4a);
        }
        .coach-icon { font-size: 22px; line-height: 1; margin-bottom: 4px; }
        .coach-cname {
          font-family: var(--fb);
          font-size: 12px;
          font-weight: 600;
          color: var(--text);
        }
        .coach-style {
          font-size: 10px;
          color: var(--text3);
          margin-top: 2px;
        }
      `}</style>
      <div className="coach-grid">
        {COACHES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`coach-card${selectedId === c.id ? " sel" : ""}`}
            onClick={() => {
              persistCoachId(c.id);
              setSelectedId(c.id);
              toast.success(`${c.name} is your coach!`);
              onCoachChange?.();
            }}
          >
            <div className="coach-icon" aria-hidden>
              {c.icon}
            </div>
            <div className="coach-cname">{c.name}</div>
            <div className="coach-style">{c.style}</div>
          </button>
        ))}
      </div>
    </>
  );
}
