# Macro Fit v3 — Inventory

Phase 0, Step 0.5. Verified by reading the code on branch `v3` (commit `b8b98b8`), not from commit messages or the root-level `audit-*.md` notes. Paths are relative to the repo root, and `path:line` points at the evidence.

Status key: **BUILT** works end to end · **PARTIAL** some of it works · **MISSING** no working path.

## Summary

| # | Item | Status |
|---|---|---|
| 1 | Body composition tracking | **PARTIAL** |
| 2 | Changing the workout program after initial setup | **MISSING** |
| 3 | Recipe-to-meal-plan flow | **MISSING** |
| 4 | Weekly meal plan auto-rotation | **PARTIAL** |
| 5 | Hardcoded user values | **10 violations, 9 borderline** |
| 6 | Claude model strings | `claude-sonnet-4-6` in 10 places across 7 files |

## Cross-cutting findings

**The Coach cannot change user data on its own.** This affects items 1–5 and conflicts with the CLAUDE.md rule "Coach must be able to update anything the user can".
- The Claude helper sends no tools (`lib/coach-chat.ts:23-29`).
- The coach-chat route's only writes are to `coach_conversations` (`app/api/coach-chat/route.ts:879-932`).
- Every preference write hardcodes `updated_by: "user"` (for example `components/meals/MealsClient.tsx:1238`, `app/api/meal-plan-rotate/route.ts:41`), even though the schema allows `'coach'` (`supabase/migrations/20250322160000_initial_schema.sql:52`).
- AI output reaches the database only when the user saves it: onboarding targets, the workout builders, the recipe analyzer and the Coach quick-log (`components/coach/CoachClient.tsx:485-551`).

**Onboarding answers cannot be changed after onboarding.**
- Settings says macro targets and profile preferences are managed in onboarding, and links to `/onboarding` (`app/(app)/settings/page.tsx:46-54`).
- But the middleware sends users who have finished onboarding from `/onboarding` back to `/` (`lib/supabase/middleware.ts:144-150`).
- So macro targets, goals and the onboarding metric list are fixed once onboarding is done.

**Requests to `/api` without a session are redirected to `/login`.**
- The middleware redirects any request without a Supabase session to `/login` unless its path is in `PUBLIC_PATHS` (`lib/supabase/middleware.ts:5-10, 85-94`).
- The `/api` exemption (`:97-99`) is only reached after a user is found, and the matcher covers `/api` (`middleware.ts:10-12`).
- Vercel Cron requests carry no session, so the cron routes never run (item 4).

## 1. Body composition tracking — PARTIAL

The six listed metrics (visceral fat, muscle mass, body fat %, skeletal muscle %, BMR, metabolic age) can be logged and charted with trends. But each one only exists after the user creates it as a custom metric. None is built in, the Coach cannot write any of it, and an older second metric system shares the same page.

**What exists**
- Each weigh-in stores one row per metric in `progress_entries` (`metric_key`, `value`, `unit`, `logged_at`) — `supabase/migrations/20250322160000_initial_schema.sql:170-177`.
- The user defines the metric list, stored as JSON in the `body_metric_keys` preference (`components/progress/MetricSetupClient.tsx:79-102`).
  - Metrics are added by hand (`:161-174`), or picked from an AI scan of a smart-scale screenshot (`:115-159`; prompt in `app/api/coach-chat/route.ts:509-529`).
  - In that scan prompt the six metrics are only examples (`app/api/coach-chat/route.ts:27`).
- The weigh-in form can be prefilled from a scan; it inserts `progress_entries` rows (`components/progress/BodyCompositionClient.tsx:191-225, 337-371`). Notes go to the `body_weighin_notes` preference (`:251-279`).
- `/progress` shows setup until metrics exist, then the form and trends (`app/(app)/progress/page.tsx:78-96`).
- Trends are covered (`components/progress/TrendChartClient.tsx:131-145, 279-327, 472-567`):
  - direction versus the previous entry;
  - week-over-week averages;
  - a line chart per metric with 2W/1M/3M/All ranges and a regression line.
- The Coach sees values only through two one-off AI insights, neither of which is saved:
  - the post-weigh-in analysis (`components/progress/BodyCompositionClient.tsx:377-394` → `app/api/coach-chat/route.ts:531-556`);
  - the weekly one-liner (`components/progress/TrendChartClient.tsx:331-369`).

**Per metric**

| Metric | How it gets tracked | Trend | Coach can update |
|---|---|---|---|
| Visceral fat, muscle mass, body fat %, skeletal muscle %, BMR, metabolic age | Only after the user defines it (`components/progress/MetricSetupClient.tsx:161-174`) or picks it from a scan (`:115-159`). Saved to `progress_entries` (`components/progress/BodyCompositionClient.tsx:358-365`) | Yes (`components/progress/TrendChartClient.tsx:131-145, 298-327`) | No (`app/api/coach-chat/route.ts:879-932`) |
| Body fat %, additionally | Preset in onboarding's quick-track list (`components/onboarding/OnboardingWizard.tsx:73-80`), logged through the older form (`components/progress/ProgressClient.tsx:211-221`) | Basic chart only, no ranges or trend line (`components/progress/ProgressClient.tsx:66-138`) | No |
| BMR, additionally | Estimated inside the macro-targets prompt, never stored (`app/api/macro-targets/route.ts:85`) | — | No |

**What's left**
- The Coach cannot create metrics or log or edit entries (see Cross-cutting). Free Coach chat sees metric definitions and notes but no values (`lib/coach-chat-context.ts:205-215`).
- Two parallel systems run on `/progress`:
  - Onboarding's fixed list is saved as `progress_metric_keys` (`components/onboarding/OnboardingWizard.tsx:73-80, 234-241`).
  - It has its own form and charts (`components/progress/ProgressClient.tsx:150-221, 341-379`).
  - That list cannot be changed after onboarding (see Cross-cutting).
- "Edit Metrics" does not load the existing metrics, and saving replaces the whole list (`components/progress/MetricSetupClient.tsx:49-53, 93-102`).
- Because `metric_key` is the display name, renaming a metric orphans its history (`components/progress/TrendChartClient.tsx:249`).
- Scanned metrics default to "lower is better" (`components/progress/MetricSetupClient.tsx:156, 354`). Gains in muscle mass, skeletal muscle % and BMR are therefore coloured as getting worse (`components/progress/TrendChartClient.tsx:71-81`).
- Logged entries cannot be edited or deleted: there are no update or delete calls in `components/progress/`.
- Weigh-ins never reach the home dashboard:
  - it does not query `progress_entries` at all (`app/(app)/page.tsx`);
  - its weight figures read preference keys that nothing writes (`app/(app)/page.tsx:19-31`; see item 5, borderline 9);
  - its weight trend is hardcoded empty (`app/(app)/page.tsx:171`).
- Progress photos are stored only in the browser's localStorage (`components/progress/ProgressPhotosClient.tsx:13-14`).
- `hooks/useProgress.ts` is a placeholder.

## 2. Changing the workout program after initial setup — MISSING

There is no working way to change the program after setup:
- the setup flow never comes back once splits exist;
- the only other builder is not linked anywhere;
- that builder can only get a plan from a chat that very likely fails on its first message.

**What exists**
- `/workout` shows the setup flow only while the user has no `workout_splits` rows (`app/(app)/workout/page.tsx:22-36`). Splits are deleted only inside the two builders' own save steps (`components/workout/CustomWorkoutBuilder.tsx:203-206`, `components/workout/WorkoutOnboarding.tsx:382-385`). So once splits exist, the setup flow never returns.
- Setup offers an "I have a program" chat or a 5-step questionnaire. Both lead to an editable plan where days can be reordered, marked as rest, and exercises added or removed (`components/workout/WorkoutOnboarding.tsx:41-68, 211-363, 411-459, 767-933`).
- `/workout/custom` (`app/(app)/workout/custom/page.tsx:30`) renders a chat and the same editor (`components/workout/CustomWorkoutBuilder.tsx:154-185, 232-280`). Its only source for a starting plan is the parsed chat reply (`:175`).
- `app/api/workout-plan-builder/route.ts` only calls Claude and returns plan JSON. It writes nothing (`:94-152`).
- Saving replaces the whole program: delete all splits, then insert one row per day (`components/workout/CustomWorkoutBuilder.tsx:203-226`, `components/workout/WorkoutOnboarding.tsx:382-405`).

**What's left**
- There is no way back into a builder after setup:
  - Nothing in `app/`, `components/`, `lib/`, `hooks/` or `public/` links to `/workout/custom`.
  - `components/workout/WorkoutClient.tsx:935-1001` lists splits with no edit, rename, reorder or delete.
  - Settings covers notifications only (`components/settings/SettingsClient.tsx:10-19`).
- Both free-form chats very likely fail on their first message. The Messages API requires the first message to come from the user, and these chats send an assistant message first:
  - `components/workout/CustomWorkoutBuilder.tsx:145-147, 158-165` and `components/workout/WorkoutOnboarding.tsx:214`.
  - The route passes the messages through unchanged (`app/api/workout-plan-builder/route.ts:133-150`).
  - This blocks `/workout/custom` completely, because its only plan source is the chat reply (`components/workout/CustomWorkoutBuilder.tsx:175`).
  - This was not run, because running it would call the paid API.
  - The guided questionnaire sends a single user message and is not affected (`app/api/workout-plan-builder/route.ts:120-123`), but it is only shown during setup.
- Most of the plan is thrown away on save. `workout_splits` stores only `day_number` and `name` (`supabase/migrations/20250322160000_initial_schema.sql:61-68`).
  - Exercises, sets, reps, rest and notes are lost (`components/workout/WorkoutOnboarding.tsx:393-397`, `components/workout/CustomWorkoutBuilder.tsx:214-218`).
  - Every plan day, including rest days, is saved as a startable split (`components/workout/WorkoutOnboarding.tsx:393-397`).
- The replace is not atomic:
  - A failed insert leaves the user with no splits (`components/workout/CustomWorkoutBuilder.tsx:203-226`).
  - Deleting splits clears `split_id` on past sessions (`supabase/migrations/20250322160000_initial_schema.sql:75`).
- The Coach cannot change the program (see Cross-cutting), and its chat context leaves out splits (`lib/coach-chat-context.ts:141-248`). Yet the empty state says "Ask Coach to generate your training split plan first" (`components/workout/WorkoutClient.tsx:928-931`).
- There is no workout rotation: `workout_splits` has no field for it (`supabase/migrations/20250322160000_initial_schema.sql:61-68`). The training-day helper hardcodes days per week and weekdays (item 5: violation 9, borderline 4).
- `hooks/useWorkout.ts` is a placeholder.

## 3. Recipe-to-meal-plan flow — MISSING

No UI action or function puts a recipe into a meal-plan day or slot. The only insert into `meal_plan_entries` copies an archived week back in.

**What exists**
- Recipe library:
  - `components/meals/AddRecipeForm.tsx:84-108` inserts `recipes` plus free-form `recipe_macros` rows.
  - Recipes are loaded with their macros at `components/meals/MealsClient.tsx:1122-1137`.
  - The recipe detail modal offers only "Cook Mode" and "Close" (`components/meals/RecipeLibraryTab.tsx:94-115`).
- The meal plan tab displays the current UTC-Monday plan (`components/meals/MealsClient.tsx:1141-1176`). Each entry can only be favorited, or disliked, which deletes it (`components/meals/MealPlanTab.tsx:107-131`, `components/meals/MealsClient.tsx:1729-1775`).
- The only `meal_plan_entries` insert is "Use This Week", which restores an archived week (`components/meals/MealsClient.tsx:1777-1827`, insert at `:1814`). Archives can only be made from a plan that already has entries (`:1701`), so no code path can create a first plan.
- Recipes reach the food log, never the plan. Both of these write `food_logs` and `food_log_macros`:
  - the analyzer's "Log as Food" (`components/meals/MealsClient.tsx:1628-1670`);
  - Go-To "Log" (`components/recipes/GoToRecipesClient.tsx:448-498`).
- AI recipe features fill drafts or the library, never the plan:
  - `build_recipe_from_description` and `scan_recipe` (`app/api/coach-chat/route.ts:594-623`);
  - the macros analyzer's "Save to Recipe Library" (`components/meals/MealsClient.tsx:1583-1626`);
  - `meal_suggestion`, which returns text only (`components/meals/MealsClient.tsx:1977-1986`).

**What's left**
- An "add recipe to day/slot" action. None exists: the only writes are `components/meals/MealsClient.tsx:1763, 1804, 1814`.
- Plan macro totals. The plan query leaves out `recipe_macros` (`components/meals/MealsClient.tsx:1172`), and `components/meals/MealPlanTab.tsx` computes no totals.
- A link from a planned meal to a logged one. `food_logs` has no recipe or entry reference (`supabase/migrations/20250322160000_initial_schema.sql:145-153`).
- Go-To recipes are stored only in localStorage (`components/recipes/GoToRecipesClient.tsx:17`), not in `recipes`. They are capped at 12, with fixed cal/pro/fat/carbs fields (`:36, 862-865`).
- Saving from the analyzer drops the ingredients and stores a placeholder step (`components/meals/MealsClient.tsx:1590-1594`).
- Favorites and dislikes are saved (`components/meals/MealsClient.tsx:1203-1223`) and passed to the Coach chat prompt (`lib/dashboard/preferences.ts:14-15`, `lib/coach-chat-context.ts:205-213`). No plan logic uses them.
- The Coach cannot build a plan (see Cross-cutting), yet the empty plan tells users to ask it (`components/meals/MealPlanTab.tsx:42-44`).
- `hooks/useMeals.ts` is a placeholder.

## 4. Weekly meal plan auto-rotation (route, cron, CRON_SECRET) — PARTIAL

Only the client-side reminder card works.
- Vercel Cron cannot reach the rotation route, because the middleware redirects it to `/login` (see Cross-cutting).
- Even when the route runs, it only sets a "needs rotation" flag. Nothing ever creates the next plan.

**What exists**
- Route `app/api/meal-plan-rotate/route.ts` (GET, `:49`). It reads every `meal_plan_rotation_day` preference. For each user whose day matches the current UTC weekday, it upserts `meal_plan_needs_rotation = "true"` (`:65-94`).
- Cron: `vercel.json:4-7` schedules the route daily at `0 0 * * *` (00:00 UTC).
- CRON_SECRET handling:
  - Unset or blank returns 503, so it fails closed (`app/api/meal-plan-rotate/route.ts:50-56`).
  - It accepts either `x-cron-secret` or `Authorization: Bearer <secret>`.
  - It compares with a plain `!==` and returns 401 on mismatch (`:57-63`).
  - These checks are sound, but a cron request never gets this far (see What's left).
- The route uses the service-role client (`app/api/meal-plan-rotate/route.ts:69`). A missing or empty `SUPABASE_SERVICE_ROLE_KEY` makes `lib/supabase/admin.ts:12-18` throw, which the route returns as a 500 (`route.ts:95-97`).
- The rotation day is user-set, via a weekday select labelled UTC (`components/meals/MealPlanRotationClient.tsx:3-11, 76-92`). It is saved at `components/meals/MealsClient.tsx:1849-1852`.
- Client fallback: the rotation card shows when the flag is true or today (UTC) is the rotation day (`components/meals/MealsClient.tsx:1829-1833`).
- Push reminder: `vercel.json:28-31` schedules `/api/push-notify?type=meal_plan_rotation` at 13:00 UTC. Its secret check also fails closed (`app/api/push-notify/route.ts:49-57`).

**What's left, and bugs**
- **Bug: cron requests never reach the handlers.**
  - Vercel Cron calls carry no Supabase session, so the middleware redirects them to `/login` (`lib/supabase/middleware.ts:85-94`) before the `/api` exemption (`:97-99`).
  - This applies to `/api/meal-plan-rotate` and every `/api/push-notify` schedule (`vercel.json:4-31`).
  - So the flag is never set by the cron, the CRON_SECRET branches are unreachable, and no push notification is sent.
- Nothing creates the next plan:
  - "Generate for me" archives a copy of the current plan and navigates to `/coach?mealPlan=generate`; "Let me build it" navigates to `/coach?mealPlan=build` (`components/meals/MealsClient.tsx:1857-1870`).
  - No code reads that parameter. `app/(app)/coach/page.tsx` takes no `searchParams`, and no component calls `useSearchParams`.
- Rotation frequency is weekly-only and saved as `""` (`components/meals/MealsClient.tsx:1717, 1793`). Plans are keyed to the UTC Monday whatever the rotation day is (`lib/meals/week.ts:2-9`).
- Rotation runs on UTC only and ignores the user's timezone (`app/api/meal-plan-rotate/route.ts:22-28`).
- "Dismiss reminder" cannot hide the card on the rotation day, because the weekday condition stays true (`components/meals/MealsClient.tsx:1829-1833`).
- The flag never clears on its own:
  - Only user actions set it back to `"false"` (`components/meals/MealsClient.tsx:1820, 1855, 1860, 1867`).
  - push-notify keeps sending the reminder while it is `"true"` (`app/api/push-notify/route.ts:368-372`).
- Rotation route robustness (`app/api/meal-plan-rotate/route.ts`):
  - One failed upsert aborts the loop, so the remaining users are not flagged (`:46, 95-97`).
  - The read has no pagination (`:70-73`).
  - Cron writes are labelled `updated_by: "user"` (`:41`).
- The push-notify admin client is created outside a try block (`app/api/push-notify/route.ts:251`).
- **Bug, once pushes can run: a date shows up as a macro target.**
  - push-notify saves `notification_last_sent_<type>` = `YYYY-MM-DD` in `user_preferences` (`app/api/push-notify/route.ts:220-235`).
  - That key is not in `NON_MACRO_PREFERENCE_KEYS` (`lib/dashboard/preferences.ts:2-29`), and `parseLeadingNumber` reads the date as 2026.
  - So every caller of `extractMacroTargets` gets a target of 2026: `app/(app)/page.tsx:225`, `app/(app)/meals/page.tsx:46`, `app/(app)/goto-recipes/page.tsx:46`, `components/coach/CoachClient.tsx:313`, `lib/coach-chat-context.ts:217` and `app/api/push-notify/route.ts:396`.
  - It appears as an extra field in `components/meals/LogMealForm.tsx:195-215`.
- **Bug, once pushes can run: time-based pushes usually never fire.**
  - They need an exact local HH:MM match (`app/api/push-notify/route.ts:92-99`).
  - But each type runs only once a day, at a fixed UTC hour (`vercel.json:8-31`).
  - So a push fires only if the user's chosen time equals that hour in their timezone; otherwise it never fires.
- `CRON_SECRET` and the `VAPID_*` keys are read by the code (`app/api/meal-plan-rotate/route.ts:50`, `app/api/push-notify/route.ts:50, 60-62`) but are missing from `.env.example` (`.env.example:1-9`).
- The Coach cannot set the rotation day or frequency (see Cross-cutting).

## 5. Hardcoded user values — 10 violations, 9 borderline

Audited against the CLAUDE.md zero-hardcoding rule, which covers macros, splits, meal frequency, cardio type, metrics and rotation frequency.

**Violations**
1. **Onboarding pre-fills a fake profile.** 180 lbs current, 170 lbs goal, age 30, male, "moderately active" and "fat loss" are set as real input values (`components/onboarding/OnboardingWizard.tsx:150-159`) and sent to `/api/macro-targets` (`:325-338`).
2. **Meal frequency is fixed at 4.**
   - `components/meals/LogMealForm.tsx:179, 186`.
   - Quick-logs force `meal_number: 1`: `components/meals/MealsClient.tsx:1636`, `components/coach/CoachClient.tsx:515`, `components/recipes/GoToRecipesClient.tsx:456`.
   - A meals-per-day schema exists but is unused (`lib/validations/index.ts:119-122`).
3. **Rotation frequency is fixed to weekly**: `components/meals/MealsClient.tsx:1717, 1793`, `lib/meals/week.ts:2-9`, `app/api/meal-plan-rotate/route.ts:22-28`.
4. **The water goal is limited to 64, 80 or 100 oz** and kept only in localStorage (`components/meals/MealsClient.tsx:796, 858`). The `water_goal_oz` preference (`lib/dashboard/preferences.ts:13`) is never used.
5. **The macro summary only covers calories, protein, carbs and fat**, ignoring any other macros the user defined.
   - The summary: `components/meals/MealsClient.tsx:991-993`.
   - "Remaining" only covers calories, protein and fat: `:1007-1020`.
   - The same fixed set appears in `components/recipes/GoToRecipesClient.tsx:36` and `components/coach/CoachClient.tsx:79-88`.
6. **The macro-targets AI prompt requires calories, protein, carbs and fat** (`app/api/macro-targets/route.ts:90`). The parser rejects replies that lack explanations for those four (`:176-183`). Onboarding won't let those four rows be removed (`components/onboarding/OnboardingWizard.tsx:99, 1006-1019`).
7. **Macro targets are defined by exclusion.** Any preference whose value starts with a number counts as a macro target unless it is on a hardcoded exclusion list (`lib/dashboard/preferences.ts:2-29, 49-65`). This is the root cause of the date-as-target bug in item 4.
8. **Notification times are fixed.** Each type runs once a day at a fixed UTC hour (`vercel.json:8-31`). The workout reminder is fixed at 08:00 with no setting (`app/api/push-notify/route.ts:32`).
9. **Training days per week falls back to fixed numbers.** It becomes 4 when the text has no digit, and 1 when it is blank (`lib/dashboard/workout-schedule.ts:4-11`, `app/(app)/page.tsx:154-157`). That number is the target for the workout streak.
10. **Push notifications ignore the chosen coach.**
    - push-notify reads the `chosen_coach_id` preference and falls back to `"drdata"` (`app/api/push-notify/route.ts:449`), but nothing writes that preference.
    - The user's choice is kept in localStorage and an `mf_chosenCoachId` cookie (`components/coach/CoachChooser.tsx:130, 150`), which only the chat route reads (`app/api/coach-chat/route.ts:323, 725`).
    - So every push uses the default coach persona.

**Borderline**
1. **Default notification times look user-chosen.** 07:00, 12:00 and 20:00 appear in Settings as if picked (`app/api/push-notify/route.ts:29-31`, `components/settings/SettingsClient.tsx:73-78, 119-124`). Every type defaults to on (`app/api/push-notify/route.ts:106-109`).
2. **Example targets in the AI prompt.** 2200, 165, 220 and 70 appear in the macro-targets prompt schema (`app/api/macro-targets/route.ts:70-73, 91`) and could anchor the model's output.
3. **The program week never advances.** Nothing writes `program_start`; it is only read (`lib/program-week.ts:13`, `app/(app)/page.tsx:150`). So the week is always 1 (`lib/program-week.ts:15`).
4. **Unused fixed training weekdays.** `lib/dashboard/workout-schedule.ts:22-35` has fixed patterns; `isTrainingDay` and `components/dashboard/WorkoutDayCard.tsx` are never imported.
5. **Fixed rest timer.** The workout rest timer offers only 60, 90 or 120 s, defaulting to 90 (`components/workout/WorkoutClient.tsx:407, 1384`).
6. **Fixed tolerances.** The "on target" window is a fixed ±10% (`components/meals/MealsClient.tsx:184`). Onboarding's protein band is a fixed 15–38% (`components/onboarding/OnboardingWizard.tsx:417-453`).
7. **Fixed choice lists.** Goal, activity level, primary goal and supplement timing are fixed lists (`components/onboarding/OnboardingWizard.tsx:82-89`, `lib/validations/index.ts:61-72`, `components/supplements/SupplementsClient.tsx:9-14`).
8. **Scanned metrics default to "lower is better"** (`components/progress/MetricSetupClient.tsx:156, 354`).
9. **Pounds are assumed, and the home weight figures stay empty.**
   - The home page reads weight from preference keys such as `current_weight_lbs`, `weight` and `goal_weight` (`app/(app)/page.tsx:19-31`), but nothing in `app/`, `components/` or `lib/` writes any of them.
   - Onboarding saves no weights (`components/onboarding/OnboardingWizard.tsx:218-252`), so those figures stay empty.
   - "LBS TO GOAL" assumes pounds (`components/home/HomeDashboardClient.tsx:242`), and workout weights default to lbs (`components/workout/WorkoutClient.tsx:256`).
   - Onboarding accepts kg but never saves the unit (`components/onboarding/OnboardingWizard.tsx:218-252`).

**Zone 2:** cardio is not limited to Zone 2.
- Cardio type is free text (`components/cardio/CardioClient.tsx:813-821`).
- Cardio metrics are free key/value/unit (`:338-361`).
- The database default is empty (`supabase/migrations/20250322160000_initial_schema.sql:186`).
- Gap: no cardio type or frequency preference is ever stored. The schema at `lib/validations/index.ts:124-128` is unused, and quick types live only in localStorage (`components/cardio/CardioClient.tsx:21-23`).

**Coach parity:** see Cross-cutting. In addition, these values live only in the browser's localStorage, where neither the server nor the Coach can reach them:
- habits, the water log and goal, and the macro streak (`components/meals/MealsClient.tsx:269-275`);
- cardio quick types (`components/cardio/CardioClient.tsx:21`);
- supplements (`components/supplements/SupplementsClient.tsx:7`);
- challenges (`components/challenges/ChallengesClient.tsx:10`);
- Go-To recipes (`components/recipes/GoToRecipesClient.tsx:17`);
- the journal (`components/journal/JournalClient.tsx:6`);
- the pantry (`components/pantry/PantryClient.tsx:7-8`);
- progress photos (`components/progress/ProgressPhotosClient.tsx:13-14`);
- 1RMs, workout notes and bodyweight (`components/workout/WorkoutClient.tsx:36-38`).

The chosen coach is in localStorage plus a cookie that only the chat route reads (`components/coach/CoachChooser.tsx:130, 150`, `app/api/coach-chat/route.ts:323, 725`).

## 6. Claude model strings — report only, nothing changed

Every Claude call is a raw `fetch` to `https://api.anthropic.com/v1/messages` with header `anthropic-version: 2023-06-01`. No SDK is used: `package.json` has no `@anthropic-ai/sdk` dependency.

All 10 occurrences are `claude-sonnet-4-6`. In the Claude API model reference (cached 2026-11-03) that model is listed as **Active**: it is the previous-generation Sonnet and not deprecated. The current Sonnet is `claude-sonnet-5-5`.

| Where | Used by |
|---|---|
| `lib/coach-chat.ts:5` (`const MODEL`, sent at `:24`) | `app/api/coach-chat/route.ts:8`, `app/api/challenge-builder/route.ts:3`, `app/api/workout-plan-builder/route.ts:3` |
| `lib/coach-tip.ts:32` | `app/api/coach-tip/route.ts:3` |
| `lib/journal-prompt.ts:28` | `app/api/journal-prompt/route.ts:4` |
| `lib/supplement-coach-tip.ts:21` | `app/api/coach-tip-supplement/route.ts:3` |
| `app/api/coach-chat/route.ts:157, 242, 801` | inline, 3 calls |
| `app/api/macro-targets/route.ts:283, 368` | inline, 2 calls |
| `app/api/push-notify/route.ts:160` | inline, 1 call |

Only `lib/coach-chat.ts` uses a shared constant, so changing the model means editing all 7 files. This is why CLAUDE.md requires a repo-wide grep.

These docs (not code) also name a model:
- `claude-sonnet-4-6`: `audit-challenges-workout-builder.md:23`, `audit-macro-onboarding-meals.md:12`, `audit-push-notifications.md:99`, `audit-step10.md:13` and `audit-step5.md:6`.
- `audit-step10.md:26` still names the retired "Claude Sonnet 4 20250514".
