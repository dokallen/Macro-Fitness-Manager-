"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type SideDrawerContextValue = {
  openDrawer: () => void;
  closeDrawer: () => void;
};

const SideDrawerContext = createContext<SideDrawerContextValue | null>(null);

export function useSideDrawer(): SideDrawerContextValue {
  const ctx = useContext(SideDrawerContext);
  if (!ctx) {
    throw new Error("useSideDrawer must be used within SideDrawerProvider");
  }
  return ctx;
}

const MENU_ITEMS: {
  emoji: string;
  label: string;
  href?: string;
  action?: "coach";
}[] = [
  { emoji: "💊", label: "Supplements", href: "/supplements" },
  { emoji: "📓", label: "Fitness Journal", href: "/journal" },
  { emoji: "🥘", label: "Pantry", href: "/pantry" },
  { emoji: "📅", label: "Calendar", href: "/calendar" },
  { emoji: "🎯", label: "Challenges", href: "/challenges" },
  { emoji: "💬", label: "Coach", action: "coach" },
  { emoji: "🏆", label: "Achievements", href: "/badges" },
  { emoji: "⚙️", label: "Settings & Targets", href: "/settings" },
  { emoji: "💾", label: "Backup & Restore", href: "/backup" },
];

function openCoachFabFromMenu() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("mf-open-coach-fab"));
}

export function SideDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const value = useMemo(
    () => ({
      openDrawer: () => setOpen(true),
      closeDrawer: () => setOpen(false),
    }),
    []
  );

  return (
    <SideDrawerContext.Provider value={value}>
      {children}
      <SideDrawerPanel open={open} onClose={() => setOpen(false)} />
    </SideDrawerContext.Provider>
  );
}

function SideDrawerPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const handleItem = useCallback(
    (item: (typeof MENU_ITEMS)[number]) => {
      if (item.action === "coach") {
        openCoachFabFromMenu();
        onClose();
        return;
      }
      onClose();
    },
    [onClose]
  );

  return (
    <>
      <button
        type="button"
        className={`drawer-overlay${open ? " open" : ""}`}
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside
        className={`side-drawer${open ? " open" : ""}`}
        aria-hidden={!open}
        style={{
          display: "flex",
          flexDirection: "column",
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--fd)",
              fontSize: 18,
              letterSpacing: 2,
              color: "var(--text)",
            }}
          >
            MACRO FIT
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            style={{
              background: "none",
              border: "none",
              color: "var(--text2)",
              fontSize: 22,
              cursor: "pointer",
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>
        <nav aria-label="App menu" style={{ flex: 1 }}>
          {MENU_ITEMS.map((item) => {
            const rowStyle: CSSProperties = {
              display: "block",
              padding: "16px 20px",
              fontSize: 15,
              borderBottom: "1px solid var(--border)",
              color: "var(--text)",
              textDecoration: "none",
              fontFamily: "var(--fb)",
            };

            if (item.href) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  style={rowStyle}
                  onClick={() => handleItem(item)}
                >
                  {item.emoji} {item.label}
                </Link>
              );
            }

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleItem(item)}
                style={{
                  ...rowStyle,
                  width: "100%",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {item.emoji} {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
