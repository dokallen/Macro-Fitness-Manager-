"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { CoachClient } from "@/components/coach/CoachClient";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/", label: "Home", emoji: "🏠" },
  { href: "/workout", label: "Workout", emoji: "🏋🏾" },
  { href: "/meals", label: "Today", emoji: "📅" },
  { href: "/progress", label: "Log", emoji: "📊" },
  { href: "/progress", label: "Scale", emoji: "⚖️" },
] as const;

function navActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppGroupLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const pathname = usePathname();
  const [coachOpen, setCoachOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
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

  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-[var(--bg)] text-[var(--text)]">
      <main
        className="flex min-h-0 flex-1 flex-col"
        style={{
          paddingBottom: 100,
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        {children}
      </main>
      <nav
        className="bnav"
        style={{
          paddingBottom: "max(20px, env(safe-area-inset-bottom))",
        }}
      >
        {NAV.map((item) => {
          const active = navActive(pathname, item.href);
          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={active ? "nt active" : "nt"}
            >
              <div className="nti">{item.emoji}</div>
              <div className="ntl">{item.label}</div>
              <div className="ntd" aria-hidden />
            </Link>
          );
        })}
      </nav>
      {userId ? (
        <>
          <button
            type="button"
            className="coach-fab"
            style={{
              bottom: "calc(90px + env(safe-area-inset-bottom, 0px))",
            }}
            aria-label="Open coach"
            onClick={() => setCoachOpen(true)}
          >
            💬
          </button>
          <button
            type="button"
            className={`sheet-overlay${coachOpen ? " open" : ""}`}
            aria-label="Close coach"
            onClick={() => setCoachOpen(false)}
          />
          <div
            className={`coach-panel-base${coachOpen ? " open" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label="Coach"
            style={{
              paddingBottom: "env(safe-area-inset-bottom)",
              pointerEvents: coachOpen ? "auto" : "none",
            }}
          >
            <div className="coach-panel-hdr">
              <span style={{ fontFamily: "var(--fb)", color: "#fff" }}>
                Coach
              </span>
              <button
                type="button"
                onClick={() => setCoachOpen(false)}
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
            <div
              className="min-h-0 flex-1 overflow-y-auto"
              style={{ maxHeight: "calc(70vh - 52px)" }}
            >
              <CoachClient userId={userId} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
