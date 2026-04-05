# Audit: AI challenges + custom workout builder

**Branch:** `v2`  
**Date:** 2026-04-04

## Scope

- **Challenges:** `app/(app)/challenges/page.tsx`, `components/challenges/ChallengesClient.tsx`, persistence `mf_challenges` / `mf_challengeLog`, Coach via `POST /api/challenge-builder`.
- **Custom workout:** `app/(app)/workout/custom/page.tsx`, `components/workout/CustomWorkoutBuilder.tsx`, Coach via `POST /api/workout-plan-builder`, save to `workout_splits` only (replace all rows for user).
- **Nav:** `components/layout/SideDrawer.tsx` — Challenges link only.
- **API (required for server-side Claude):** `app/api/challenge-builder/route.ts`, `app/api/workout-plan-builder/route.ts` (not in original file list; needed so `ANTHROPIC_API_KEY` stays server-only).

## Checklist

| Item | Status |
|------|--------|
| Branch `v2` | Confirmed before work |
| No hardcoded challenge/workout templates in UI | OK — copy is generic; structure from Coach JSON |
| JSON parsing with graceful failure | OK — `null` parse skips preview / keeps chat; toasts on API errors |
| Daily check-in inputs by rule type | OK — boolean / number / text |
| `workout_splits` insert after delete | OK |
| SideDrawer Challenges link only | OK |
| Model `claude-sonnet-4-20250514` | OK via `callCoachClaudeChat` |
| localStorage `mf_` prefix | OK |
| `npm run build` | OK |

## Notes

- Workout plan exercise detail is **not** stored in Supabase (schema has only split day names); exercises remain in the builder UI and in chat history until user refines and saves again.
- Challenge “streak” counts consecutive calendar days (including today) with a submitted log.
- First number-in-textarea parsing is not used for challenges; Coach supplies structured JSON when ready.

## Commit

`AI-generated challenges and custom workout builder`
