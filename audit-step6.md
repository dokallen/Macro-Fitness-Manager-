# Step 6 audit — Meals page and recipe library

## Branch

Work was performed on **`v2`** (confirmed with `git checkout v2` before implementation).

## Files created

- `app/(app)/meals/page.tsx` — Server page: guest gate, loads `user_preferences` and passes `extractMacroTargets` + `userId` to client.
- `lib/meals/week.ts` — UTC Monday `YYYY-MM-DD` helper for `meal_plans.week_start`.
- `components/meals/MealsClient.tsx` — Tabs (Today’s log / Meal plan / Recipes), realtime on `food_logs`, data loaders.
- `components/meals/TodayFoodLogTab.tsx` — Today’s logs with macros and delete.
- `components/meals/MealPlanTab.tsx` — Current UTC week `meal_plan_entries` + `recipes`, empty coach prompt.
- `components/meals/RecipeLibraryTab.tsx` — Recipe list with macro summary; modal with full instructions + macros.
- `components/meals/LogMealForm.tsx` — Quick log: food, quantity, unit, meal 1–4, macro inputs from macro targets.
- `components/meals/AddRecipeForm.tsx` — Recipe name, steps, dynamic macro rows → `recipes` + `recipe_macros`.

## Files modified

- None outside the new files above ( **`app/(app)/layout.tsx` was not modified**; no edits to other existing pages).

## Notes

- “Today” for food logs uses **`getUtcDayBounds()`** (UTC calendar day), consistent with the home dashboard.
- Meal plan week uses **`meal_plans.week_start`** equal to **UTC Monday** for the current week.
- Macro log fields use **`extractMacroTargets` / `user_preferences`** keys only (no hardcoded macro names).
