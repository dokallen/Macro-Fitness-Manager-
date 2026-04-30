"use client";

export type MealPlanEntryRow = {
  id: string;
  day: number;
  meal_number: number;
  recipe_id: string | null;
  recipes: {
    id: string;
    name: string;
    instructions: string[];
  } | null;
};

type Props = {
  weekLabel: string;
  entries: MealPlanEntryRow[];
  hasPlan: boolean;
  favoriteRecipeIds: Set<string>;
  dislikedRecipeNames: Set<string>;
  onToggleFavorite: (entry: MealPlanEntryRow) => void;
  onDislikeMeal: (entry: MealPlanEntryRow) => void;
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MealPlanTab({
  weekLabel,
  entries,
  hasPlan,
  favoriteRecipeIds,
  dislikedRecipeNames,
  onToggleFavorite,
  onDislikeMeal,
}: Props) {
  if (!hasPlan) {
    return (
      <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 px-4 py-8 text-center">
        <p className="text-sm text-foreground">
          No meal plan for this week yet.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask your Coach in chat to generate a weekly meal plan.
        </p>
      </div>
    );
  }

  const byDay = new Map<number, MealPlanEntryRow[]>();
  for (const e of entries) {
    const list = byDay.get(e.day) ?? [];
    list.push(e);
    byDay.set(e.day, list);
  }
  const days = Array.from(byDay.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{weekLabel}</p>
      <div className="space-y-4">
        {days.map((day) => {
          const label =
            day >= 1 && day <= 7
              ? DAY_NAMES[day - 1] ?? `Day ${day}`
              : `Day ${day}`;
          const rows = byDay.get(day) ?? [];
          rows.sort((a, b) => a.meal_number - b.meal_number);

          return (
            <section
              key={day}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <h3 className="text-sm font-semibold text-foreground">
                {label}
              </h3>
              <ul className="mt-2 space-y-2">
                {rows.map((row) => {
                  const rid = row.recipe_id ?? "";
                  const rname = row.recipes?.name?.trim() ?? "";
                  const fav = rid ? favoriteRecipeIds.has(rid) : false;
                  const dis = rname
                    ? dislikedRecipeNames.has(rname.toLowerCase())
                    : false;
                  return (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-background/50 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-muted-foreground">
                          Meal {row.meal_number}:{" "}
                        </span>
                        {row.recipes ? (
                          <span className="font-medium text-foreground">
                            {row.recipes.name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No recipe</span>
                        )}
                        {dis ? (
                          <span className="ml-2 text-xs text-[var(--text3)]">
                            (disliked)
                          </span>
                        ) : null}
                      </div>
                      {row.recipe_id ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-base leading-none"
                          style={{
                            color: fav ? "#e11d48" : "var(--text3)",
                          }}
                          aria-label={
                            fav ? "Remove from favorites" : "Add to favorites"
                          }
                          onClick={() => onToggleFavorite(row)}
                        >
                          {fav ? "❤️" : "🤍"}
                        </button>
                      ) : null}
                      {row.recipes?.name ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-base leading-none"
                          aria-label="Dislike and remove from plan"
                          onClick={() => onDislikeMeal(row)}
                        >
                          👎
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
