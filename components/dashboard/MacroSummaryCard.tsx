"use client";

import { useCallback, useEffect, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { MacroTargetRow } from "@/lib/dashboard/preferences";
import { formatMacroLabel } from "@/lib/dashboard/preferences";
import { fetchTodayMacroTotals } from "@/lib/dashboard/food-macros";
import { cn } from "@/lib/utils";

const BAR_COLORS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
] as const;

type Props = {
  userId: string;
  targets: MacroTargetRow[];
  initialTotals: Record<string, number>;
};

export function MacroSummaryCard({
  userId,
  targets,
  initialTotals,
}: Props) {
  const [totals, setTotals] = useState<Record<string, number>>(initialTotals);

  const refresh = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const next = await fetchTodayMacroTotals(supabase, userId);
    setTotals(next);
  }, [userId]);

  useEffect(() => {
    setTotals(initialTotals);
  }, [initialTotals]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel(`food_logs_home_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "food_logs",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  if (targets.length === 0) {
    return (
      <section
        className="rounded-xl border border-border bg-card p-5 shadow-sm"
        aria-labelledby="macro-summary-heading"
      >
        <h2
          id="macro-summary-heading"
          className="text-lg font-semibold text-foreground"
        >
          Today&apos;s macros
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No macro targets found. Complete onboarding or add targets in preferences
          to see progress here.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
      aria-labelledby="macro-summary-heading"
    >
      <h2
        id="macro-summary-heading"
        className="text-lg font-semibold text-foreground"
      >
        Today&apos;s macros
      </h2>
      <ul className="mt-4 space-y-4">
        {targets.map((t, i) => {
          const current = totals[t.key] ?? 0;
          const target = t.targetNumber;
          const pct =
            target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
          const color = BAR_COLORS[i % BAR_COLORS.length];

          return (
            <li key={t.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-foreground">
                  {formatMacroLabel(t.key)}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatAmount(current)} / {t.displayValue}
                </span>
              </div>
              <div
                className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${formatMacroLabel(t.key)} progress`}
              >
                <div
                  className={cn("h-full rounded-full transition-all", color)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatAmount(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace(/\.0$/, "");
}
