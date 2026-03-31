# Audit: Macro onboarding + meals summary (v2)

**Date:** 2026-03-31  
**Branch:** `v2` (confirmed before changes)

## Checklist

| Item | Status |
|------|--------|
| Git branch `v2` before changes | OK |
| Onboarding Step 2: accept Coach recommendation unchanged (generate → edit → Next → persist) | OK — custom block is additive after targets appear |
| Custom macro flow calls Claude `claude-sonnet-4-20250514` via `POST /api/macro-targets` `mode: evaluate_custom_target` | OK |
| System prompt matches spec (coach calories X vs user Y, 2–3 sentences + choice question) | OK (`app/api/macro-targets/route.ts`) |
| Payload includes profile + `recommendationTargets` + `coachSummary` + user message + `userTargetCalories` | OK |
| “Go with Coach” restores snapshot `coachRecommendedTargets` | OK |
| “Use My Target” applies custom calories + protein/carbs/fat logic | OK — protein kept when 15–38% of new calories from protein; else scale; carbs/fat split remaining kcal when protein kept |
| Meals: targets from `extractMacroTargets` on server (`app/(app)/meals/page.tsx`) — no extra Supabase query in client | OK |
| Meals: today totals from existing `loadLogs` + `food_log_macros` | OK |
| Up to 4 bars: calories, protein, carbs, fat (order) | OK |
| Realtime `food_logs` → `loadLogs` refresh | OK |
| No macro targets: copy “Complete onboarding to set your macro targets” | OK |
| Compact summary (~120px max height, thin bars, small type) | OK |
| `npm run build` | OK |

## Files touched (implementation)

- `components/onboarding/OnboardingWizard.tsx` — custom target UI, API call, choice buttons, scaling
- `app/api/macro-targets/route.ts` — `evaluate_custom_target` + Claude evaluation
- `components/meals/MealsClient.tsx` — macro summary bar above tabs

## Residual risks

- Custom calorie parsing uses the **first** number in the textarea; ambiguous text could pick the wrong value.
- Protein “reasonable” band (15–38% kcal from protein) is heuristic; edge cases may need tuning.

## Commit

`User macro choice in onboarding and auto-fill on meals page`
