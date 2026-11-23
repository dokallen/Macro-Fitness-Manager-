# Phase 1 Report — Critical bug fixes (v3)

Run on 2026-11-23 on branch `v3`, following `docs/phases/phase-1.md` and `CLAUDE.md`. Run by Claude (chat) in a cloud workspace, not by Claude Code on Derak's PC. Phase 1 is complete. Phase 2 has not been started.

Every fix has tests that fail without it. No paid Anthropic API call, Supabase write or production resource was used to test.

## Commits

| Commit | Step | CI on GitHub |
|---|---|---|
| `cb8bee5` | Phase 1: add phase-1 prompt | run 45114753749: success |
| `6ffc48f` | Phase 1.1: let Vercel Cron reach the cron routes | run 45115014045: success |
| `adde6c6` | Phase 1.2: stop push-notify dates from becoming macro targets | run 45115290371: success |
| `4020b82` | Phase 1.3: normalize Claude message lists before sending | run 45115678251: success |
| `c5820f6` | Phase 1.4: remove the fake onboarding profile | run 45116236093: success |
| this commit | Phase 1: add phase-1 report | runs on push |

Gates for every step, run locally before each commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` (with placeholder Supabase values, like CI). Unit tests went from 26 to 59.

## Step 1.1 — Let Vercel Cron reach the cron routes

**Changed:** `lib/supabase/middleware.ts`.
- New `isCronPath()` matches exactly `/api/meal-plan-rotate` and `/api/push-notify`.
- `updateSession` returns early for those two paths, before any session lookup. Every other route, including other `/api` routes, is unchanged.
- Both handlers still check `CRON_SECRET` before doing anything.

**Tests:** `lib/supabase/middleware.test.ts` (12) runs the real `updateSession` with a no-session Supabase client.
- Both cron paths pass through, with and without `?type=`.
- `/`, `/meals`, `/api/coach-chat`, `/api/push-notify-x` and `/api/meal-plan-rotate/x` still redirect to `/login`.
- 6 tests fail without the fix.

**Reviewer:** PASS. One defect in my test, fixed before commit: restoring an unset env var stored the string `"undefined"`. It now uses `vi.stubEnv` / `vi.unstubAllEnvs`.

**Notes from review, not changed:**
- `push-notify` returns 401, not 503, when `CRON_SECRET` is unset. It still fails closed.
- `push-notify` validates `type` before the secret check, so an unauthenticated caller with a bad `type` now gets 400 instead of a login redirect. It leaks nothing and has no side effects.
- Trailing-slash variants are redirected by Next.js before the middleware runs, so they cannot bypass the exact match.

## Step 1.2 — Stop push-notify dates from becoming macro targets

**Changed:** `lib/dashboard/preferences.ts`.
- New `isNonMacroPreferenceKey()` excludes the `notification_last_sent_` prefix plus the existing key set. `extractMacroTargets` uses it.
- Added `notification_timezone` to the set. It is the only other app-written key that was missing; it is written by Settings and `/api/push-subscribe`.

**Non-macro keys the app writes** (every `user_preferences` write in `app/`, `components/`, `lib/`; `hooks/` has none):
- Onboarding: `goal`, `recommended_goal_timeframe`, `recommended_workout_frequency`, `weekly_plan_suggestion`, `progress_metric_keys`. Everything else onboarding writes is a user-defined macro target.
- Meals: `meal_plan_favorites`, `meal_plan_dislikes`, `meal_plan_rotation_day`, `meal_plan_needs_rotation` (also written by the rotate cron).
- Settings and `/api/push-subscribe`: `push_subscription`, `notification_timezone`, `notification_morning_time`, `notification_morning_enabled`, `notification_workout_reminder`, `notification_midday_time`, `notification_midday_enabled`, `notification_evening_time`, `notification_evening_enabled`, `notification_streaks`, `notification_meal_rotation`.
- Progress: `body_weighin_notes`, `body_metric_keys`.
- `push-notify`: `notification_last_sent_<type>` for `morning_motivation`, `workout_reminder`, `midday_checkin`, `evening_recap`, `streak_celebration`, `meal_plan_rotation`.

**Tests:** in `lib/dashboard/preferences.test.ts`.
- The date is not a target.
- Every key above is excluded.
- A full set of saved preferences yields only the real macro targets.
- Lookalike keys are not excluded.
- 2 tests fail without the fix.

**Reviewer:** PASS. I removed one duplicate test (it also broke typecheck).

**Side effect, harmless:**
- In the Coach prompt (`lib/coach-chat-context.ts`), `notification_timezone` moves from "Other saved preferences" to "Profile & plan preferences".
- `notification_last_sent_*` rows move out of "Macro targets" into "Other saved preferences".
- `coach-chat-context.ts` still uses the exact key set, not the new helper. Switching it is optional and was left out of scope.

## Step 1.3 — Normalize Claude message lists

**What the API docs say** (Claude API reference, Create a Message, `messages` parameter):
- Models are trained on alternating user and assistant turns.
- Consecutive user or assistant turns are combined into a single turn.
- A final assistant turn is a prefill, which returns 400 on models that don't support it.
- The reference does **not** state that the first message must be from the user.

So the Phase 0 inventory's claim that these chats "very likely fail on their first message" is not confirmed by the docs. It was not tested against the paid API. This step was done as hardening, so every request follows the format the models are trained on.

**Changed:**
- `lib/claude-messages.ts`: new pure `normalizeClaudeTurns()`.
  - Drops a leading greeting.
  - Keeps a leading `[Conversation summary]` as user context.
  - Skips empty turns.
  - Merges consecutive same-role turns, keeping text and image blocks in order.
- `lib/coach-chat.ts`: `callCoachClaudeChat` sends normalized turns. This covers the workout-plan builder, the challenge builder and the Coach text chat. It now throws "No user message to send" instead of calling the API with none.
- `app/api/coach-chat/route.ts`: the Coach photo chat sends normalized turns, and the summary prefix is a shared constant.

Stored conversations and the chat UI are unchanged. Every other Claude call in the app sends a single user turn.

**Tests:** `lib/claude-messages.test.ts` (9) and `lib/coach-chat.test.ts` (3). The second file checks the request body actually sent, with `fetch` mocked; those tests fail without the fix.

**Reviewer:** PASS. I applied three of its notes:
- The code comment now matches what the docs actually say.
- Empty turns are skipped.
- The helper raises a clear error instead of an unclear one.

## Step 1.4 — Remove the fake onboarding profile

**Changed:**
- `lib/onboarding/step2-defaults.ts`: step 2 defaults with every profile answer empty. `OnboardingWizard` uses it as `defaultValues`.
- `components/onboarding/OnboardingWizard.tsx`:
  - Both unit selects start on an empty "Unit" option. Without it the browser silently selects "lbs".
  - Each field shows its own error under it.
  - The form uses `mode: "onTouched"`.
- `lib/validations/index.ts`: clear step 2 messages ("Enter current weight.", "Choose a unit.", "Enter your age.", and so on). The validation rules themselves are unchanged.

**Tests:** `lib/onboarding/step2-defaults.test.ts` (5).
- No profile field has a default.
- The wizard uses those defaults and has both empty unit options.
- The schema rejects the untouched form with a message per field, and accepts complete answers.
- The age range is still enforced.

**Reviewer:** CHANGES NEEDED, then PASS after the fixes.
- **Found:** because step 2 validates with `trigger()` and never `handleSubmit`, the new error lines would stay on screen after the user fixed a field. **Fixed** with `mode: "onTouched"`: an error now clears when the user leaves the field, then updates live.
- **Found:** a missing unit was hidden behind the weight error. **Fixed:** weight and unit errors now show separately.

**Behaviour changes in step 2:**
- Tabbing out of an empty field shows its error.
- Removing the last target row shows "Generate or add at least one target." right away.

**Found, not fixed (pre-existing, out of scope):** "ask coach about a custom target" (`OnboardingWizard.tsx`, `askCoachAboutCustomTarget`) sends `getValues()` without validating. `/api/macro-targets` does not validate its body with the schema.

## Production (`v2`)

`v2` production has bugs 1.1, 1.2 and 1.3 too:
- Its cron jobs and push notifications never run.
- The date-as-target bug would appear there as soon as 1.1 is fixed there.

Fixing production is Derak's decision: a pull request into `v2`, which the branch ruleset allows only through a pull request.

## Stopped on

Nothing. No step needed a decision from Derak.
