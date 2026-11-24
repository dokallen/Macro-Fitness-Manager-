"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatMacroLabel } from "@/lib/dashboard/preferences";

type TargetsInfo = {
  targets: { key: string; value: string }[];
  own: { reason: string; setAt: string } | null;
  calculated: { decision: "change" | "hold"; changes: { key: string; from: number; to: number; unit: string }[]; text: string };
};

/** Built-in prompts the Coach screen accepts from a link (see CoachClient). */
export const COACH_LINK_PROMPTS = {
  recalculate: "Please recalculate my macro targets.",
  ownNumbers: "I want to set my own macro targets.",
  firstTargets: "Help me set up my macro targets.",
  chooseMetrics: "Help me choose what to track.",
} as const;

const coachLink = (ask: string) => `/coach?ask=${encodeURIComponent(ask)}`;

/**
 * Macro targets (Phase 2.9). Targets come from the calculation. To change
 * them: change the goal (profile and goal pace below) and recalculate, or set
 * your own numbers with the Coach, which compares them with the calculation
 * and asks what changed. Applying always takes a tap.
 */
export function MacroTargetsSection() {
  const [info, setInfo] = useState<TargetsInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`/api/targets?tz=${encodeURIComponent(tz)}`);
      const body = (await res.json()) as TargetsInfo & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not load targets.");
        return;
      }
      setError(null);
      setInfo(body);
    } catch {
      setError("Could not load targets.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div id="targets" className="supp-card" style={{ marginTop: 20 }}>
      <h2
        style={{
          fontFamily: "var(--fd)",
          fontSize: 13,
          letterSpacing: 2,
          color: "var(--accent3)",
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        🎯 MACRO TARGETS
      </h2>
      {error ? (
        <div>
          <p style={{ fontSize: 14, color: "var(--text2)" }}>{error}</p>
          <button type="button" className="cbtn yes" style={{ marginTop: 8 }} onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : !info ? (
        <p style={{ fontSize: 14, color: "var(--text2)" }}>Loading targets…</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {info.targets.length ? (
            <ul style={{ display: "grid", gap: 4, fontSize: 14, color: "var(--text)" }}>
              {info.targets.map((t) => (
                <li key={t.key} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{formatMacroLabel(t.key)}</span>
                  <span>{t.value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              <p style={{ fontSize: 14, color: "var(--text2)" }}>
                No targets yet. The Coach can set up your starting targets with you.
              </p>
              <Link className="cbtn yes" href={coachLink(COACH_LINK_PROMPTS.firstTargets)}>
                Set up targets with Coach
              </Link>
            </div>
          )}
          {info.targets.length ? (
          <>
          <p style={{ fontSize: 12, color: "var(--text3)" }}>
            {info.own
              ? `These are your own numbers (since ${info.own.setAt.slice(0, 10)}): ${info.own.reason}. Check-ins keep them while your trend moves toward your goal.`
              : "These come from your goal and the calculation."}
          </p>
          <p style={{ fontSize: 12, color: "var(--text2)" }}>{info.calculated.text}</p>
          <p style={{ fontSize: 12, color: "var(--text3)" }}>
            Goal or lifestyle changed? Update your profile and goal pace below, then recalculate.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Link className="cbtn yes" href={coachLink(COACH_LINK_PROMPTS.recalculate)}>
              Recalculate with Coach
            </Link>
            <Link className="cbtn" href={coachLink(COACH_LINK_PROMPTS.ownNumbers)}>
              Set my own numbers
            </Link>
          </div>
          </>
          ) : null}
        </div>
      )}
    </div>
  );
}
