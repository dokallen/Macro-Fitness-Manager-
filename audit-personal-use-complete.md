# Audit: personal-use-complete (program week, streak, coach quick log, meal rotation)

Branch verified: **v2** (before changes).

## Fix 1 — Program week

- **Canonical logic** lives in `lib/program-week.ts`: `USER_PREFERENCE_KEY_PROGRAM_START`, `getProgramWeekNumberFromPreferencesRows()` using the specified week formula; fallback week **1** when `program_start` is missing or invalid.
- **`lib/coach-chat-context.ts`** re-exports that helper for server code that already imports from this module.
- **`app/api/coach-chat/route.ts`**: `body_comp_analysis` parses the client JSON payload and **overwrites `programWeek` with the computed number** so the model never sees `"not_stored"`.
- **`components/progress/BodyCompositionClient.tsx`**: sends numeric `programWeek` using the same helper (client-safe import from `lib/program-week.ts`, not `server-only` coach context).

## Fix 2 — Week workout streak

- **`app/(app)/page.tsx`**: Loads `workout_sessions.logged_at`, derives minimum sessions per week from `recommended_workout_frequency` via `parseTrainingDaysPerWeek`, or **1** if unset. Groups by **local Monday–Sunday** week keys; counts consecutive qualifying weeks (skips an incomplete current week without breaking the chain). Passes display string to stats.
- **`components/home/HomeDashboardClient.tsx`**: Stat label **WK STREAK**; value shows **🔥** when streak ≥ 2.

## Fix 3 — Quick log from coach chat

- **`components/coach/CoachClient.tsx`**: Loads macro targets from `user_preferences`. After each **assistant** message, heuristics detect food-style suggestions (calories / protein patterns + phrase list). **+ Log to Food Log** opens a **bottom sheet** (`sheet-overlay` / `bottom-sheet-base`, `inf`, `cbtn` from `globals.css`). Saves `food_logs` + `food_log_macros` like `LogMealForm`. Toast `✅ [name] logged`. No navigation away.

## Feature 4 — Meal plan rotation, favorites, archive, cron

- **Migration** `supabase/migrations/20260429220000_meal_plan_archive_columns.sql`: `meal_plans.status`, `plan_json`, `week_number`, `plan_end_date`.
- **`lib/types/index.ts`**: Reflects new `meal_plans` columns.
- **`lib/dashboard/preferences.ts`**: `NON_MACRO_PREFERENCE_KEYS` extended for meal-plan preference keys so they are not treated as macro targets.
- **`app/api/meal-plan-rotate/route.ts`**: `GET`, `dynamic = "force-dynamic"`, requires **`x-cron-secret`** (or `Authorization: Bearer`) matching `process.env.CRON_SECRET`. Uses **`createAdminSupabaseClient`**. For each user with `meal_plan_rotation_day` matching **today’s UTC weekday name**, sets `meal_plan_needs_rotation` = `"true"`.
- **`vercel.json`**: Merged existing `framework` with **`crons`** `0 0 * * *` → `/api/meal-plan-rotate` (not replaced).
- **`components/meals/MealPlanRotationClient.tsx`**: Rotation card + rotation day `<select class="inf">`.
- **`components/meals/MealsClient.tsx`**: Active plan query filters **`status = active`**. Favorites (`meal_plan_favorites` JSON), dislikes (`meal_plan_dislikes` JSON), rotation prefs, **History** tab, archived rows, **Use This Week** restore, **Generate for me** archives then opens `/coach?mealPlan=generate`, **Let me build** → `/coach?mealPlan=build`, **Use a past week** → History tab.
- **`components/meals/MealPlanTab.tsx`**: Favorite / dislike actions per row.
- **`app/(app)/meals/page.tsx`**: Passes initial rotation prefs into `MealsClient`.

### Gaps / follow-ups

- **“Approved” plan flow**: Archiving is tied to **Generate for me** (and cron flag); there is no separate hook if plans are replaced only via Coach without that button.
- **Coach meal generation** does not auto-run; user is directed to **Coach** with query params for a future wired flow.
- **Dislike → AI swap**: Entry is removed and name saved to dislikes; automatic replacement recipe is **not** implemented (no existing `swapMeal` in repo).
- **Rotation card visibility**: Shown when `meal_plan_needs_rotation` **or** UTC weekday matches `meal_plan_rotation_day` (may show weekly until dismissed).
- **FIX 1 file note**: Spec asked for `coach-chat-context.ts` only; implementation also uses `lib/program-week.ts`, `coach-chat` route, and `BodyCompositionClient` for correct client/server boundaries and payload hygiene.

## Checklist (post-review)

- [x] `programWeek` sent to analysis as a **number**, not `"not_stored"`.
- [x] Week streak from `workout_sessions` + training frequency pref (default 1).
- [x] Coach quick log detection + sheet + Supabase insert.
- [x] Favorites / dislikes / archive / cron / `vercel.json` merge.
- [x] `npm run build` passes.
