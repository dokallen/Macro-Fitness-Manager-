# Audit: Workout page smart onboarding

**Branch:** `v2` (confirmed before changes)  
**Date:** 2026-04-04

## Files changed

| File | Change |
|------|--------|
| `app/(app)/workout/page.tsx` | Server component: guests → `WorkoutClient`; signed-in users with no `workout_splits` rows → `WorkoutOnboarding`; otherwise → `WorkoutClient` (unchanged behavior). On RLS/query error, falls back to `WorkoutClient`. |
| `components/workout/WorkoutOnboarding.tsx` | **New** — welcome cards, existing-program chat path, guided Q&A path, shared plan editor, save to `workout_splits`, `router.refresh()`. |
| `app/api/workout-plan-builder/route.ts` | `mode: "guided_onboarding"` + `guidedAnswers` branch with dedicated system prompt; existing `messages` flow unchanged. |

## Checklist

| Item | Status |
|------|--------|
| Users with splits see same `WorkoutClient` as before | OK |
| Empty splits → onboarding only | OK |
| Both paths use `/api/workout-plan-builder` | OK — conversation + guided mode |
| Guided questions: dropdown + text (Q1–4); Q5 text + skip | OK |
| Plan editor: full edit, follow-up chat, `save-btn` | OK |
| Save: delete all splits for user, insert rows; `name` = `dayName — focus` (single `name` column) | OK |
| No hardcoded exercises in code — from Coach JSON | OK |
| Dropdown labels are UI options only, not workout taxonomy in logic | OK |
| `npm run build` | OK |

## Notes

- `workout_splits` has no `focus` column; focus is appended to `name` for storage.
- Guided loading UI shows when `guidedStep >= 5` and request is in flight.

## Commit

`Workout page smart onboarding - existing or new plan flow`
