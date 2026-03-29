"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { CoachFabPanel } from "@/components/home/CoachFabPanel";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/", label: "Home", emoji: "🏠" },
  { href: "/workout", label: "Workout", emoji: "🏋🏾" },
  { href: "/meals", label: "Today", emoji: "📅" },
  { href: "/progress", label: "Log", emoji: "📊" },
  { href: "/progress", label: "Scale", emoji: "⚖️" },
] as const;

const NAV_RESERVE_PX = 68;

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

  const mainHeight = `calc(100dvh - ${NAV_RESERVE_PX}px)`;

  return (
    <div
      className="flex flex-1 flex-col bg-[var(--bg)] text-[var(--text)]"
      style={{
        height: "100dvh",
        maxHeight: "100dvh",
        overflow: "hidden",
      }}
    >
      <main
        className="flex min-h-0 w-full min-w-0 flex-col overflow-hidden"
        style={{
          height: mainHeight,
          maxHeight: mainHeight,
          flexShrink: 0,
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
          paddingTop: "env(safe-area-inset-top)",
          boxSizing: "border-box",
        }}
      >
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${
            pathname === "/" ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
          {children}
        </div>
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
      {userId ? <CoachFabPanel /> : null}
    </div>
  );
}
