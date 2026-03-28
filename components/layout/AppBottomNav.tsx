"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", emoji: "🏠" },
  { href: "/workout", label: "Workout", emoji: "🏋🏾" },
  { href: "/meals", label: "Today", emoji: "📅" },
  { href: "/progress", label: "Log", emoji: "📊" },
  { href: "/progress", label: "Scale", emoji: "⚖️" },
] as const;

function navItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)] md:hidden"
      style={{
        paddingBottom: "max(20px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="grid grid-cols-5 px-1 pt-1">
        {NAV.map((item) => {
          const active = navItemActive(pathname, item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex min-h-[52px] flex-col items-center justify-end gap-0.5 pb-0.5 pt-1",
                active ? "text-[var(--accent)]" : "text-[var(--text2)]"
              )}
              style={{ fontFamily: "var(--fb)" }}
            >
              <span className="text-lg leading-none" aria-hidden>
                {item.emoji}
              </span>
              <span
                className="text-[10px] font-medium uppercase leading-tight"
                style={{ letterSpacing: "1px" }}
              >
                {item.label}
              </span>
              <span
                className="mt-0.5 block h-1 w-1 rounded-full"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  boxShadow: active ? "0 0 6px var(--accent)" : "none",
                }}
                aria-hidden
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
