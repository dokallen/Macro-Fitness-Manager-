"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatMacroLabel } from "@/lib/dashboard/preferences";
import { cn } from "@/lib/utils";

export type RecipeRow = {
  id: string;
  name: string;
  instructions: string[];
  created_at: string;
  recipe_macros: {
    id: string;
    key: string;
    value: number;
    unit: string;
  }[] | null;
};

type Props = {
  recipes: RecipeRow[];
};

export function RecipeLibraryTab({ recipes }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = recipes.find((r) => r.id === openId) ?? null;

  if (recipes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        No recipes yet. Add one with the form below.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {recipes.map((r) => {
          const macros = r.recipe_macros ?? [];
          const summary =
            macros.length > 0
              ? macros
                  .slice(0, 4)
                  .map(
                    (m) =>
                      `${formatMacroLabel(m.key)} ${m.value}${m.unit ? ` ${m.unit}` : ""}`
                  )
                  .join(" · ")
              : "No macros";

          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className={cn(
                  "w-full rounded-xl border border-border bg-card/80 px-4 py-3 text-left shadow-sm transition-colors",
                  "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <span className="font-medium text-foreground">{r.name}</span>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {summary}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recipe-detail-title"
          onClick={() => setOpenId(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h2
                id="recipe-detail-title"
                className="text-lg font-semibold text-foreground"
              >
                {selected.name}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpenId(null)}
              >
                Close
              </Button>
            </div>

            <section className="mt-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Macros
              </h3>
              {(selected.recipe_macros ?? []).length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">None</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {(selected.recipe_macros ?? []).map((m) => (
                    <li key={m.id} className="flex justify-between gap-2">
                      <span>{formatMacroLabel(m.key)}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {m.value}
                        {m.unit ? ` ${m.unit}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-6">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Instructions
              </h3>
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-foreground">
                {selected.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
