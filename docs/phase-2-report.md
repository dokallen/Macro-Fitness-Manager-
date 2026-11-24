# Phase 2 report — Coach write access, saved profile, weekly check-ins

Branch `v3`. Every step: lint, typecheck, tests, build all passed; an independent reviewer checked the diff against the step's acceptance criteria; findings were fixed and gates re-run before commit. GitHub Actions CI is green on 2.1–2.6 (2.7 running at time of writing).

| Step | Commit | Tests after step |
|---|---|---|
| 2.1 Action framework | 11450e0 | proposals, chat route with tools |
| 2.2 Apply / Cancel | 8433d17 | 13 apply/cancel route tests |
| 2.3 First actions | b63786a | executor tests for every action |
| 2.4 Proposal cards | a1d8fd7 | card-state logic |
| 2.5 Saved profile | c361ab9 | 171 total |
| 2.6 Weekly check-in | bfb1c8c | 240 total |
| 2.7 Coach role | b073c6e | 249 total |
| 2.8 Cleanup (audit fixes) | e24a6fe | 259 total |

## Order change (needs no action)
The target calculation (spec Step 2.7, items 1–7) was built in Step 2.6, because the check-in's decision step uses it. Building it later would have meant check-ins recording a placeholder decision. Step 2.7 then added only the Coach's side.

## Per step

### 2.1 Action framework
Files: `lib/coach-actions/{types,proposals,registry,macro-targets}.ts`, `lib/coach-chat.ts`, `app/api/coach-chat/route.ts`, `lib/test-utils/fake-supabase.ts`.
Claude's tool calls become stored proposals (pending); nothing is executed. Reviewer: added the system note that a tool call is only a proposal, photo-path tools, JSON round-trip in the fake client.

### 2.2 Apply and Cancel
Files: `app/api/coach-actions/route.ts`, `lib/coach-actions/conversation-store.ts`.
The browser sends only the proposal id; the server reads the stored input from the user's own conversation, re-validates it, runs it as the user. Compare-and-set save; statuses only move forward; nothing applied twice. Reviewer blocker fixed: a chat save could revert a decided proposal → shared CAS save + forward-only merge.

### 2.3 First actions
Files: `lib/coach-actions/{set-preference,logging}.ts`, `lib/metrics/tracked.ts`, `lib/coach-actions/dates.ts`.
`set_macro_targets`, `remove_macro_target`, `set_preference` (allowlist), `log_food`, `log_progress_entry`. Reviewer fixes: reminder times refused until the app knows the user's time zone; metric's own unit wins; Coach given today's date; past dates stored at local noon; allowlist in the tool schema; food card says only tracked macros are saved; rotation day can be cleared; unit only with quantity.

### 2.4 Proposal cards
Files: `lib/coach-actions/card-state.ts`, `components/coach/CoachClient.tsx`.
Apply/Cancel under the message, then Applied / Cancelled / Failed with reason. One request per card. Reviewer fixes: chat replies never move a card backwards; "applying on another device" message; accessible labels; signed-out message.

### 2.5 Saved profile
Files: `lib/profile/{profile,macro-prompt}.ts`, `lib/metrics/weight.ts`, `components/settings/ProfileSection.tsx`, `lib/coach-actions/update-profile.ts`, onboarding, `/api/macro-targets`.
Optional date of birth; age computed, never stored; profile in Settings; `update_profile`; first weigh-in from onboarding. Reviewer fixes: repeat onboarding never clears a date of birth the user wasn't shown; first weigh-in stored in the weight metric's own unit; goal weight always with its unit; only changed fields written (Coach labels survive).

### 2.6 Weekly check-in
Files: `lib/coaching/*`, `app/api/check-in/route.ts`, `components/check-in/CheckInPanel.tsx`, `components/settings/CheckInSection.tsx`, onboarding, push-notify, `lib/metrics/scale-scan.ts` (moved unchanged from BodyCompositionClient).
Reviewer fixes (4 must-fix): macro roles misread for keys like `fat_g`/`saturated_fat`/`net_carbs` → exact names win, ambiguity holds; zero/negative targets never proposed; window made 15 days so every-2-weeks weigh-ins work; same-day weigh-in/check-in compared by time, not date. Plus: reminder keeps coming after a missed week; unitless weigh-ins counted; no lbs default (card asks); calorie query filtered; double submit adds nothing; card scrolls inside itself.

### 2.7 Coach role
Files: `lib/coaching/coach-context.ts`, chat and check-in routes.
Coach sees profile, pace, last 8 entries per metric, trend, burn, check-in status, last 4 check-ins, targets. "Adjust my macros" runs the server calculation (`propose_calculated_targets`) and Claude explains it. Check-in review written from calculated numbers only. Reviewer must-fix: the explanation call would have been rejected by the real API (no tools defined while history had tool blocks) → now sends tools with `tool_choice: none` (confirmed as a documented option). Other fixes: no paid call possible in tests; per-metric history queries; invented `set_macro_targets` numbers dropped when the calculation runs; Coach told not to propose targets if data fails to load.

### 2.8 Cleanup (cross-cutting audit of Phases 1–2)
Home weight stats from weigh-ins and the profile goal weight, in the user's unit; Coach prompt no longer carries the push token, bookkeeping or raw records; refresh after Apply; check-in message kept if posted during a chat reply; Coach keeps its own review; optional goal pace in onboarding; calorie floor; changed-only settings writes; 60 s route limit; push settings read paged; device time zone for the Coach. Reviewer must-fix: a timing gap could still overwrite a check-in posted mid-reply → now keyed on what the request read, not on time; the Coach must still see settings it can change.

## Decisions
1. **Calorie floor (decided by Derak: "based on the target").** One check-in may lower calories by at most 10% of the current calorie target. If the calculation is lower, the floor is proposed and explained, and the record notes it. The 10% is for Derak to confirm.
2. **Macro target editing (pending Derak's approval of the design).** Proposed: targets come from the calculation; goal, pace or activity changes recalculate; own numbers go through the Coach, which explains the trade-off, asks the reason, and marks them as the user's own; check-ins offer the calculated targets again if progress stalls. Not built yet.

## Constants for Derak to confirm (`lib/coaching/constants.ts`)
| Constant | Value |
|---|---|
| Trend smoothing (per day) | 0.1 |
| Energy per lb of body weight | 3,500 kcal (standard approximation; ≈ 7,716 kcal/kg) |
| Calculation window | 15 days |
| Hold: weigh-ins needed | 2, at least 7 days apart |
| Hold: food logged | at least 5 of the last 7 days |
| Check-in early window | 2 days before |
| Late → missed | after 14 days |
| kcal per gram | protein 4, carbs 4, fat 9 |
| Calorie rounding | 10 kcal |
| Loss pace guide (%/week) | Gentle 0.25–0.5, Moderate 0.5–0.75, Aggressive 0.75–1.0; max 1.5 |
| Gain pace guide (%/week) | Gentle 0.1–0.25, Moderate 0.25–0.5; max 1.0 |
| Coach context | 8 entries per metric, 4 check-ins |
| Calorie floor | at most a 10% cut of the current target per check-in |

## Not testable without a paid API call
How well the real model chooses tools, explains a calculation, writes the check-in review, and respects "ask once". Tests mock Claude. Try these on the `v3` preview.

## Known limitations and notes
- "Ask for missing profile info once" is prompt-only; a new conversation may ask again.
- Very old pending proposals can be dropped by chat compression; Apply then says expired.
- Two chat messages sent at the same moment can still drop one (pre-existing).
- The check-in review uses a generic coach voice, not the chosen Coach persona.
- Morning push runs at 11:00 UTC; users at UTC+12–14 get the check-in reminder near local midnight.
- Pre-existing bug, not fixed (cleanup phase): reminder pushes run once a day and need an exact minute match, so custom reminder times rarely fire.
- The fake Supabase client used in tests is not a full database emulator. The live v3 schema was checked separately: columns, own-row security, UNIQUE(user_id, key), the updated_by check and cascades all match.
- Not yet: the push-subscription read isn't paged (matters only with many users); onboarding checks goal pace only at the final step.
- Settings the user can change but the Coach can't yet: tracked-metric lists, favourite/disliked foods, chosen coach, display name, editing or deleting past logs.

## How the two metric systems relate (not merged, per spec)
- `body_metric_keys` `[{name, unit, better}]` feeds Body composition, Metric setup and the trend chart.
- `progress_metric_keys` `["Weight", …]` (no unit) feeds the Progress page and onboarding.
- Both store entries in `progress_entries` with `metric_key` = the exact metric name.
- The weight metric is any "Weight" / "Body weight" (optionally "Weight (lbs|kg)") in either list. The check-in reads all of them, converted to one unit.

## Stopped
Phase 2 is complete. Phase 3 not started.
