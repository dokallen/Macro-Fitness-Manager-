"use client";

import Link from "next/link";

type Props = {
  title: string;
  subtitle?: string;
  backHref?: string;
};

export function SubpageHeader({ title, subtitle, backHref = "/" }: Props) {
  return (
    <header
      className="sticky top-0 z-30 -mx-4 mb-4 border-b border-[var(--border)] bg-[var(--bg)]/95 px-4 py-3 backdrop-blur sm:-mx-6"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <div className="flex items-start gap-3">
        <Link
          href={backHref}
          className="mt-1 min-h-[44px] min-w-[44px] font-body text-sm text-[var(--accent)]"
          aria-label="Back"
        >
          ← Back
        </Link>
        <div className="min-w-0 flex-1">
          <h1
            className="font-display text-[32px] uppercase leading-none tracking-[2px] text-[var(--text)]"
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 font-body text-sm text-[var(--text2)]">{subtitle}</p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
