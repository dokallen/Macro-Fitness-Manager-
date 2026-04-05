# Audit: Prompt A remainder

Date: 2026-04-04  
Branch: `v2`  
Build: `npm run build` — passed.

## Checklist

| Item | Status |
|------|--------|
| Git branch `v2` before changes | Confirmed at handoff |
| Pantry starts empty — no preset foods/categories | `PantryClient` seeds from empty `mf_pantryCustom` / `mf_pantryItems` |
| Habits start empty — no default habit names/emojis | `HabitsWaterTracker` in `MealsClient`; empty state copy only |
| Water goal — no silent default; user picks 64/80/100 | Goal UI until `mf_waterGoal` set |
| Calendar food detail from Supabase `food_logs` | `CalendarClient` day query |
| Calendar dots: `mf_foodLog` + `mf_workoutSels` | Merged with month `food_logs` for green dot |
| Weight line from DB | `progress_entries` filtered by `metric_key` matching weight (no `weight_logs` table) |
| Progress photos base64 in `mf_progressPhotos` | `ProgressPhotosClient` |
| PIN: `mf_progressPhotoPin`, wrong PIN shows error | `tryUnlock` sets `Wrong PIN.` |
| All new localStorage keys `mf_` prefix | Verified in pantry, calendar, meals habits/water, progress photos |
| SideDrawer: Pantry + Calendar after Fitness Journal | Present |
| Pantry scan uses `/api/coach-chat` with vision | `pantryScan` branch in `route.ts`; client posts `imageBase64` |
| No new API route for scan | Reuses coach-chat |

## Fixes applied (build / lint)

- `MealsClient`: sync today’s `food_logs` dates into `mf_foodLog` after `loadLogs`.
- `PantryClient`: `prefer-const` for scan merge arrays.
- `app/api/coach-chat/route.ts`: data-URL regex without `s` flag (ES target compatibility).
- `CalendarClient`: `dayKey: string` for async day loader (TS narrowing).
- `ProgressPhotosClient`: `savePhotos` instead of erroneous `persist` call.

## Notes

- `mf_workoutSels` is read for calendar blue dots; writers elsewhere in the app populate it when users log workouts.
