"use client";

import { useCallback, useEffect, useState } from "react";

import { CoachChooser, getCoach } from "@/components/coach/CoachChooser";
import { CoachClient } from "@/components/coach/CoachClient";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const supabase = createBrowserSupabaseClient();

export function CoachFabPanel() {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showChooser, setShowChooser] = useState(false);
  const [, setCoachRevision] = useState(0);
  const bumpCoach = useCallback(() => {
    setCoachRevision((n) => n + 1);
  }, []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const coach = getCoach();

  if (!userId) return null;

  return (
    <>
      <button
        type="button"
        className="coach-fab"
        style={{
          bottom: "calc(90px + env(safe-area-inset-bottom, 0px))",
          right: 18,
        }}
        aria-label="Open coach"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden>{coach.icon}</span>
      </button>

      <button
        type="button"
        className={`sheet-overlay${open ? " open" : ""}`}
        aria-label="Close coach"
        onClick={() => {
          setOpen(false);
          setShowChooser(false);
        }}
      />
      <div
        className={`coach-panel-base${open ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Coach"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          pointerEvents: open ? "auto" : "none",
        }}
        aria-hidden={!open}
      >
        <div className="coach-panel-hdr">
          <span style={{ fontFamily: "var(--fb)", color: "#fff" }}>
            {coach.name.toUpperCase()} {coach.icon}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowChooser((s) => !s)}
              style={{
                fontFamily: "var(--fb)",
                color: "#fff",
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.35)",
                borderRadius: 8,
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Switch Coach
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setShowChooser(false);
              }}
              style={{
                fontFamily: "var(--fb)",
                color: "#fff",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Close
            </button>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-3"
          style={{ maxHeight: "calc(70vh - 52px)" }}
        >
          {showChooser ? (
            <CoachChooser
              onCoachChange={() => {
                bumpCoach();
              }}
            />
          ) : (
            <CoachClient userId={userId} />
          )}
        </div>
      </div>
    </>
  );
}
