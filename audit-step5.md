# Step 5 audit — Home dashboard

Files **created**:

- `app/api/coach-tip/route.ts` — `GET` handler; authenticates via Supabase session, loads coach context from `user_preferences`, returns JSON `{ tip }` using `generateCoachTip`.
- `lib/coach-tip.ts` — Server-only Claude call (`claude-sonnet-4-20250514`) for a short daily tip from goal, timeframe, and workout frequency.
- `lib/dashboard/preferences.ts` — Non-macro preference key set, `extractMacroTargets`, `parseLeadingNumber`, `formatMacroLabel`.
- `lib/dashboard/utc-day.ts` — UTC day bounds for “today” (aligned server/client).
- `lib/dashboard/food-macros.ts` — `fetchTodayMacroTotals` (today’s `food_logs` → `food_log_macros` aggregate by key).
- `lib/dashboard/workout-schedule.ts` — `parseTrainingDaysPerWeek`, `isTrainingDay` (Mon-first weekly pattern).
- `components/dashboard/DashboardHeader.tsx` — Client: time-of-day greeting + `display_name` + `SignOutButton`.
- `components/dashboard/MacroSummaryCard.tsx` — Client: macro progress bars + Realtime on `food_logs` + refetch totals.
- `components/dashboard/WorkoutDayCard.tsx` — Training vs rest copy; `Start Workout` → `/workout` on training days.
- `components/dashboard/QuickActionsRow.tsx` — Links to `/meals`, `/workout`, `/progress`.
- `components/dashboard/CoachTipCard.tsx` — Coach message card UI.
- `audit-step5.md` — This file.

Files **modified**:

- `app/(app)/page.tsx` — Full home dashboard for signed-in users (guest branch unchanged); loads user, preferences, macro totals, coach tip, workout-day logic; composes dashboard sections. **`app/(app)/layout.tsx` was not changed.**
