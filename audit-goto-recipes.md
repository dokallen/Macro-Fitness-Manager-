# Audit: Go-To Recipes + NON_MACRO preference keys

## Branch
- `v2` (confirm with `git branch --show-current` before changes).

## NON_MACRO_PREFERENCE_KEYS (`lib/dashboard/preferences.ts`)
Added keys so they are not parsed as macro targets:
- `body_metric_keys`, `body_weighin_notes`, `chosen_coach_id`, `program_start`, `mf_coach_rules`, `water_goal_oz`

## New routes / components
- `app/(app)/goto-recipes/page.tsx` — Auth/guest pattern aligned with meals; passes `macroTargets` + `userGoal`.
- `components/recipes/GoToRecipesClient.tsx` — Full UI: tabs, localStorage `mf_gotoRecipes`, coach tasks, logging to `food_logs` / `food_log_macros`, compare sheet, macro fit card (`goto_recipe_macro_fit`).

## API (`app/api/coach-chat/route.ts`)
New `coachTask` values:
- `scan_recipe` (vision)
- `build_recipe_from_description` (text)
- `goto_recipe_compare` (text; prompt per spec)
- `goto_recipe_macro_fit` (text JSON verdict for plan fit card)

Existing `recipe_macros` used for “Calculate macros” from ingredients (same as recipe analyzer).

## Navigation
- `components/layout/SideDrawer.tsx` — “Go-To Recipes” after Pantry (`/goto-recipes`).

## localStorage (all `mf_` prefix)
- `mf_gotoRecipes` — curated recipe array
- `mf_pendingCookMode` — written when starting cook mode with `{ steps, openedAt }` for future Meals integration

## Cook mode vs `/meals?cook=true`
Per file constraints, **MealsClient was not modified**. Cook mode uses the same overlay pattern as Meals (`.cook-overlay-base`, `prog-bar`, wake lock, step timers) **on the Go-To Recipes page**. `mf_pendingCookMode` is populated so a future `MealsClient` mount hook can read it when navigating with `?cook=true`. Navigating away before that hook exists would not open cook mode on Meals.

## Rules
- No hardcoded recipe names, ingredients, or numeric macros in UI logic; values come from user data or Coach JSON.
- Styling uses existing globals (e.g. `.ph`, `.pt`, `.ps`, `.upload-area`, `.macro-card`, `.section-label`, `.inf`, bottom sheet classes).

## Build
- `npm run build` — pass before commit.

## Suggested git message
`Go-To Recipes with Coach integration and NON_MACRO_PREFERENCE_KEYS fix`
