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
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MealPlanTab({ weekLabel, entries, hasPlan }: Props) {
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
              className="rounded-xl border border-border bg-card/80 p-4 shadow-sm"
            >
              <h3 className="text-sm font-semibold text-foreground">
                {label}
              </h3>
              <ul className="mt-2 space-y-2">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-lg border border-border/80 bg-background/50 px-3 py-2 text-sm"
                  >
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
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
