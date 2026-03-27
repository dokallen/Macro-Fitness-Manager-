"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMacroLabel } from "@/lib/dashboard/preferences";
import { cn } from "@/lib/utils";

export type FoodLogRow = {
  id: string;
  logged_at: string;
  meal_number: number;
  food_name: string;
  quantity: number | null;
  unit: string;
  food_log_macros: { id: string; key: string; value: number }[] | null;
};

type Props = {
  logs: FoodLogRow[];
  onDelete: (id: string) => void;
  busyId: string | null;
};

export function TodayFoodLogTab({ logs, onDelete, busyId }: Props) {
  if (logs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        Nothing logged today yet. Use Quick log below.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {logs.map((log) => {
        const macros = log.food_log_macros ?? [];
        const qty =
          log.quantity != null && Number.isFinite(Number(log.quantity))
            ? String(log.quantity)
            : "—";
        const unitDisp = log.unit?.trim() ?? "";

        return (
          <li
            key={log.id}
            className={cn(
              "rounded-xl border border-border bg-card/80 p-4 shadow-sm",
              "flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
            )}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium text-foreground">{log.food_name}</span>
                <span className="text-xs text-muted-foreground">
                  Meal {log.meal_number}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {qty}
                {unitDisp ? ` ${unitDisp}` : ""}
              </p>
              {macros.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {macros.map((m) => (
                    <li key={m.id}>
                      <span className="text-foreground/90">
                        {formatMacroLabel(m.key)}
                      </span>
                      : {m.value}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="shrink-0"
              disabled={busyId === log.id}
              onClick={() => onDelete(log.id)}
            >
              <Trash2 className="size-4" />
              {busyId === log.id ? "…" : "Delete"}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
