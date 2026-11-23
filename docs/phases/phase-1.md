# Phase 1 — Critical bug fixes (v3)

Read CLAUDE.md first and follow it. Phase 1 fixes four bugs found by the Phase 0 inventory (`docs/v3-inventory.md`). Targeted fixes only: no refactors, no new features. Work on branch `v3`. Run each step, pass all gates, run the reviewer subagent, commit, push, then continue to the next step automatically. Stop at the end of Phase 1.

Every fix needs a unit test that fails before the fix and passes after it. Never call the paid Anthropic API, Supabase writes, or any production resource to test.

## Step 1.1 — Let Vercel Cron reach the cron routes

**Bug:** `lib/supabase/middleware.ts` redirects any request without a Supabase session to `/login` before its `/api` exemption runs. Vercel Cron requests carry no session, so `/api/meal-plan-rotate` and every `/api/push-notify` schedule in `vercel.json` never reach their handlers.

- Let requests to exactly `/api/meal-plan-rotate` and `/api/push-notify` pass through the middleware without a session.
- Do NOT exempt any other `/api` route. Every other route keeps today's behavior.
- The two cron routes already fail closed on `CRON_SECRET` (503 when unset, 401 on mismatch). Do not weaken that.
- Extract the path decision into a small pure function so it can be unit tested.
- Acceptance:
  - Tests prove both cron paths pass without a session, with and without a query string (e.g. `?type=morning_motivation`).
  - Tests prove `/`, `/meals`, `/api/coach-chat` and a lookalike path such as `/api/push-notify-x` still redirect to `/login` without a session.

## Step 1.2 — Stop push-notify dates from becoming macro targets

**Bug:** `app/api/push-notify/route.ts` saves `notification_last_sent_<type>` = `YYYY-MM-DD` to `user_preferences`. That key is not in `NON_MACRO_PREFERENCE_KEYS` (`lib/dashboard/preferences.ts`), so `extractMacroTargets` reads the date as a macro target of 2026. Step 1.1 makes push-notify run, which would trigger this for every user.

- Exclude every key starting with `notification_last_sent_` from `extractMacroTargets`.
- Do not redesign macro-target detection. That is a later phase.
- Acceptance:
  - A test proves `notification_last_sent_morning_motivation` = `2026-11-22` is not returned as a macro target.
  - A test proves every preference key the app writes that is not a macro target (grep `user_preferences` writes in `app/`, `components/`, `lib/`) is excluded. List the keys found in the phase report.

## Step 1.3 — Never send Claude a conversation that starts with an assistant message

**Bug:** Several chats send an assistant message first. The Claude Messages API expects the first message to be from the user.
- `components/workout/CustomWorkoutBuilder.tsx` and `components/workout/WorkoutOnboarding.tsx` (via `app/api/workout-plan-builder/route.ts`).
- `components/challenges/ChallengesClient.tsx` (via `app/api/challenge-builder/route.ts`).
- `app/api/coach-chat/route.ts`: when a long conversation is condensed, the summary is inserted as an assistant message at the start.

Before changing code, confirm the first-message rule in the current Claude API docs (docs.claude.com) and record what you found in the phase report.

- Add one shared function that makes any message list valid before it is sent:
  - A leading assistant greeting that carries no information (the hardcoded opening lines) is dropped.
  - The condensed conversation summary must NOT be lost. Send it as context in a way the API accepts (for example as part of the system prompt, or inside the first user turn).
  - Consecutive messages from the same role are merged, so roles alternate.
- Use it in `lib/coach-chat.ts` (covers workout-plan-builder and challenge-builder) and in every direct Messages API call in `app/api/coach-chat/route.ts` that sends a multi-turn history.
- Do not change what the user sees in the chat UI.
- Acceptance: tests cover an assistant-first list, a summary-first list (summary text still present in what is sent), consecutive same-role turns, an empty list, and a list that is already valid (unchanged).

## Step 1.4 — Remove the fake onboarding profile

**Bug:** `components/onboarding/OnboardingWizard.tsx` pre-fills step 2 with 180 lbs current, 170 lbs goal, age 30, male, "moderately active" and "fat loss" as real input values, which are sent to `/api/macro-targets`. This violates the CLAUDE.md zero-hardcoding rule.

- Every step 2 field starts empty. Units start unselected.
- The user must enter or choose every required field before continuing. The existing `onboardingStep2Schema` messages should show for missing fields.
- Placeholder text (grey hint text that is not a value) is allowed, but must not look like a pre-filled answer.
- Acceptance:
  - A test proves the step 2 default values contain no weight, age, sex, activity level, goal or unit.
  - A test proves `onboardingStep2Schema` rejects the empty defaults and accepts a complete, valid set of answers.

## End of Phase 1
- Write `docs/phase-1-report.md`: per step, what changed (files), the tests added, gate results, reviewer findings and fixes, and anything you stopped on.
- Note in the report that `v2` production has bugs 1.1–1.3 too, and that fixing production is Derak's decision (a pull request into `v2`).
- Commit and push. Stop. Do not start Phase 2.
