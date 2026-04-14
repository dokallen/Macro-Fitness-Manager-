"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { CoachChooser, getCoach } from "@/components/coach/CoachChooser";
import { CoachClient } from "@/components/coach/CoachClient";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const supabase = createBrowserSupabaseClient();

export function CoachFabPanel() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [convSidebarOpen, setConvSidebarOpen] = useState(false);
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

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
    };
    window.addEventListener("mf-open-coach-fab", onOpen);
    return () => window.removeEventListener("mf-open-coach-fab", onOpen);
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
        className={`coach-overlay${open ? " open" : ""}`}
        aria-label="Close coach"
        onClick={() => {
          setOpen(false);
          setShowChooser(false);
          setConvSidebarOpen(false);
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
          zIndex: 310,
        }}
        aria-hidden={!open}
      >
        <div className="coach-panel-hdr">
          <span style={{ fontFamily: "var(--fb)", color: "#fff" }}>
            {coach.name.toUpperCase()} {coach.icon}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!showChooser ? (
              <button
                type="button"
                onClick={() => setConvSidebarOpen((s) => !s)}
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
                History
              </button>
            ) : null}
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
                setConvSidebarOpen(false);
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
          className="relative min-h-0 flex-1 overflow-hidden px-0"
          style={{ maxHeight: "calc(70vh - 52px)" }}
        >
          {showChooser ? (
            <div className="h-full overflow-y-auto px-3">
              <CoachChooser
                onCoachChange={() => {
                  bumpCoach();
                }}
              />
            </div>
          ) : (
            <CoachClient
              userId={userId}
              embedded
              currentPath={pathname}
              sidebarOpen={convSidebarOpen}
              onSidebarOpenChange={setConvSidebarOpen}
            />
          )}
        </div>
      </div>
    </>
  );
}
