"use client";

import { useEffect, useState } from "react";

import { CoachClient } from "@/components/coach/CoachClient";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const supabase = createBrowserSupabaseClient();

export function CoachFabPanel() {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

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

  if (!userId) return null;

  return (
    <>
      <button
        type="button"
        className="fixed z-50 flex size-14 items-center justify-center rounded-full text-2xl shadow-lg"
        style={{
          bottom:
            "max(calc(5.75rem + max(20px, env(safe-area-inset-bottom))), 5.75rem)",
          right: "1rem",
          background: "linear-gradient(135deg, #6366f1, #3b82f6, #1d4ed8)",
          boxShadow: "0 8px 24px rgba(59,130,246,0.45)",
        }}
        aria-label="Open coach"
        onClick={() => setOpen(true)}
      >
        💬
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60]"
          role="dialog"
          aria-modal="true"
          aria-label="Coach"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close coach"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <button
                type="button"
                className="absolute right-3 top-3 z-20 min-h-[40px] px-2 font-body text-sm font-medium text-[var(--accent)]"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
              <CoachClient userId={userId} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
