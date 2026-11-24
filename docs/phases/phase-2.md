# Phase 2 — Coach write access, profile and weekly check-ins (v3)

Read CLAUDE.md first and follow it. Phase 2 does three things:
- **The Coach can change the user's data**, which CLAUDE.md requires ("Coach must be able to update anything the user can"). Derak's decision: **the Coach always asks first.** It proposes a change, shown as a card with **Apply** and **Cancel**, and nothing is written until the user taps Apply.
- **A saved profile** that the user and the Coach can update.
- **A weekly check-in** fed by scheduled weigh-ins, where a formula calculates targets from real intake and weight trend and the Coach explains them.

Work on branch `v3`. Run each step, pass all gates, run the reviewer subagent, commit, push, then continue automatically. Stop at the end of Phase 2. Workout program changes (Phase 3) and meal plans (Phase 4) plug into the same framework later; do not build them now.

## Rules for the whole phase
- **The model never writes.** Claude only proposes. Only the user's Apply runs a write.
- **Writes run as the user.** Use the server Supabase client with the user's session, so row-level security applies. `user_id` always comes from the session, never from model output or the request body.
- **Apply never trusts the browser.** The browser sends only which proposal to apply. The server reads the proposal's stored input from that user's own conversation, validates it again with zod, then executes it.
- **Nothing is applied twice.** Applying or cancelling an already decided proposal does nothing and says so.
- **Coach preference writes are labelled.** They set `updated_by: 'coach'`.
- **No hardcoded user values or defaults presented as the user's choice.** For example, there is no default weigh-in day, and the weigh-in push is off until the user turns it on.
- **New preference keys must never become macro targets.** Profile keys use the `profile_` prefix; schedule and check-in keys use the `weigh_in_` and `check_in_` prefixes. Add all three prefixes to `isNonMacroPreferenceKey` and to the app-written-keys test from Phase 1.2.
- **No database migrations.** Proposals live in `coach_conversations.messages` (jsonb). Profile and schedule live in `user_preferences`. Weigh-ins live in `progress_entries`. If a migration seems unavoidable, stop and report.
- **No paid API calls in tests.** Mock `fetch` for Claude, and use a fake Supabase client for executors.
- **Leave the task endpoints alone.** The single-purpose `coachTaskReply` endpoints in `app/api/coach-chat/route.ts` and the existing Coach quick-log are unchanged.

## Step 2.1 — Action framework
Add `lib/coach-actions/` with one registry entry per action:
- a name and a Claude tool definition (name, description, JSON input schema);
- a zod schema for the input (the source of truth; keep the tool schema in line with it);
- a short plain-language summary for the card;
- an executor `(supabase, userId, input) => result`.

Then:
- Send the registry's tools on the Coach chat call (text and photo paths in `app/api/coach-chat/route.ts`).
- When Claude replies with `tool_use` blocks:
  - Do not execute them. Validate each input with zod.
  - Store each valid one as a proposal `{ id, action, input, summary, status: "pending" }` on the assistant message.
  - Record each invalid one as a short failure note, not as a proposal.
  - Keep Claude's text as the reply. If Claude replied with tool calls only, the reply is a short line listing the proposals.
  - At most 5 proposals per reply; drop the rest and note it.
- Do not store raw `tool_use` blocks. When sending history to Claude, add each proposal and its status to its assistant turn as plain text (e.g. `[Proposed: Set protein target to 180 g — applied]`).
- Old conversations without proposals load and work exactly as before.
- Acceptance: tests show that a mocked `tool_use` reply becomes pending proposals with nothing written; invalid input becomes a note; history sent to Claude includes proposal statuses; a text-only reply is unchanged.

## Step 2.2 — Apply and Cancel
- Add `POST /api/coach-actions` with body `{ conversationId, proposalId, decision: "apply" | "cancel" }`. It requires a session (normal middleware).
- Load the conversation by id **and** the session user's id; 404 if not found.
- Apply: re-validate the stored input, run the executor, then set the status to `applied` (with time) or `failed` (with a short reason), and save.
- Cancel: set the status to `cancelled`.
- A proposal that is not `pending` is not run again; return its current status.
- Acceptance: tests cover apply success, executor failure, cancel, repeat apply (executor runs once), another user's conversation (404), an unknown proposal (404), and client-altered input (ignored; the stored input is used).

## Step 2.3 — First actions
Each needs executor tests that check exactly what is written and that bad input is rejected.
1. `set_macro_targets { targets: [{ key, value, unit? }] }`
   - Upsert one or more targets in one card (e.g. "Calories 1,900 · Protein 180 g · Fat 60 g").
   - Use the value format onboarding writes; check `OnboardingWizard` and `extractMacroTargets` and keep them consistent.
   - Reject keys excluded by `isNonMacroPreferenceKey`. Values must be positive numbers.
2. `remove_macro_target { key }`: delete one of this user's current macro targets.
3. `set_preference { key, value }`
   - Only an explicit allowlist: `goal`, `meal_plan_rotation_day`, the notification time and on/off keys from Settings, and the weigh-in and check-in schedule keys and the goal pace from Step 2.6.
   - Never `push_subscription`, `notification_last_sent_*`, `notification_timezone`, `body_metric_keys` or `meal_plan_needs_rotation`.
   - Validate each key's value shape the way Settings and Meals do.
4. `log_food { food_name, meal_number?, quantity?, unit?, macros }`
   - Same writes as the existing quick-log.
   - Macro keys must be this user's target keys; drop the rest and say so.
   - `meal_number` defaults to 1, as quick-log does today.
5. `log_progress_entry { metric_key, value, unit?, logged_at? }`
   - For a metric the user already tracks. `logged_at` defaults to now and may not be in the future.
6. `update_profile { fields }`: change any profile field from Step 2.5. Never set date of birth unless the user stated it in the conversation.

## Step 2.4 — Proposal cards in the Coach chat
- In `components/coach/CoachClient.tsx`, show each proposal under its assistant message: the summary, then **Apply** and **Cancel** while pending; afterwards its status (Applied, Cancelled, or Failed with a reason).
- Disable the buttons while a request is in flight, so a double tap sends one request.
- After an apply, refresh what depends on the changed data, as the page already does after a quick-log.
- Old messages render exactly as before.
- Acceptance: tests for any card-state logic pulled into a pure function; typecheck and build pass.

## Step 2.5 — Saved profile
Today onboarding uses weight, goal weight, age, height, sex and activity level once to calculate targets, and saves none of them.

**Profile fields** (all in `user_preferences` with the `profile_` prefix):
- **Date of birth: fully optional.** Month, year and day are each optional, but a day needs a month, and a month needs a year. Store what the user gave. Never store or show age as a fixed number; compute it from the date of birth whenever it is needed.
  - If the day is missing, treat the birthday as the 1st of that month.
  - If only the year is given, show age as a range ("35–36") in the UI and give both values to the AI.
- **Height:** one value with its unit, as entered.
- **Biological sex and activity level:** the same choices as onboarding today.
- **Goal weight:** with its unit.

**Current weight is not a profile field.** It is always the latest weigh-in (Step 2.6).

**Onboarding step 2:**
- Replace the required **Age** field with an optional date of birth (month, year, optional day) and a short note that it improves calorie estimates and can be added later.
- All other fields stay required as in Phase 1.4.
- On finish, save the profile fields, and save the entered current weight as the user's first weigh-in.
- `/api/macro-targets` must work with or without date of birth. When age is unknown, its prompt says so instead of sending a number.

**Settings:**
- Add a Profile section where the user can view and edit every profile field, including adding or clearing the date of birth.
- Changes save with `updated_by: 'user'`.

**Coach and the existing weight metric:** check how `BodyCompositionClient`, `MetricSetupClient` and `progress_metric_keys` name and store weight today, and use one consistent weight metric (create it as a tracked metric if the user has none). Do not merge the two metric systems in this phase; report how they relate.

**Acceptance:** tests cover age computed from each partial date of birth (year only, month and year, full date), including the day of a birthday and the day before; profile keys never become macro targets; `/api/macro-targets` builds a valid prompt with and without age; onboarding validation still requires every field except date of birth.

## Step 2.6 — Weekly check-in
Modelled on the weekly check-ins in MacroFactor and Carbon: the check-in is the centre of the app, and weigh-ins feed it.

**Schedule (set by the user, no default):**
- Weigh-in frequency: daily, weekly or every 2 weeks.
- Check-in day: a weekday. Check-ins are weekly.
- Push reminder: on or off. It starts off.
- Stored as `weigh_in_*` and `check_in_*` preferences.
- Set in onboarding (can be skipped; it shows the recommendation "weigh in at least weekly, same day and time, e.g. morning before eating; daily gives a smoother trend") and editable in Settings.
- The Coach can propose changes with `set_preference`.

**Goal pace (added to the profile from Step 2.5):**
- The user sets a goal rate as a percent of body weight per week, for loss or gain, or "maintain".
- Show guided ranges when choosing it. Keep the ranges in one constants file and list them in the phase report for Derak to confirm.
- No default rate.

**Pure functions, each with tests:**
- `isWeighInDue(schedule, timezone, lastWeighIn, today)` and `checkInStatus(schedule, timezone, lastCheckIn, today)`, returning not due, due, late (up to 14 days after the check-in day) or missed (beyond 14 days).
- No schedule means never due, and the app says nothing.

**Weigh-in card:**
- When a weigh-in is due, a card appears at the top of the Coach chat and on the home screen.
- It holds weight plus the user's other tracked metrics, and offers the existing smart-scale screenshot scan.
- Saving writes `progress_entries` as the user.
- "Not today" hides it until tomorrow.

**Check-in flow:** when a check-in is due or late, a "Weekly check-in" card replaces the weigh-in card.
1. **Weigh-in:** if the user has not weighed in since the last check-in, they log one first.
2. **Logging:** the app asks "Did you log everything you ate this week?", answered Yes, Mostly or No.
3. **Decision:** the app runs the calculation from Step 2.7 and shows the result.
   - The result is either a proposed target change or "Holding targets steady", with the reason.
   - Any change is a `set_macro_targets` proposal: Apply or Cancel, as everywhere else.
4. **Record:** each completed check-in is saved as a `check_in_<date>` preference holding a JSON summary: weight trend, intake, the logging answer, the decision and the reason.

The user can also start a check-in early, up to 2 days before the check-in day.

**Push reminder:**
- Add a `check_in_reminder` type to `app/api/push-notify/route.ts`.
- Send it once on the check-in day from the existing morning cron run, only to users who turned it on and have not checked in.
- No exact-time matching. Do not add a cron entry unless the morning run cannot be used; report if it cannot.

**Acceptance:** tests for both due functions (each frequency, timezone edges, early, late, missed, no schedule), push eligibility, and the check-in record format.

## Step 2.7 — Calculated targets, explained by the Coach
**Principle:** a formula sets the numbers. The Coach explains them and never invents them.

**Calculation** (pure, in `lib/coaching/`, every step unit tested):
1. **Trend weight:** a time-aware exponentially smoothed average of weigh-ins that handles uneven gaps between entries. Keep the smoothing constant in one constants file.
2. **Daily intake:** average logged calories over the check-in window, counting only days with food logged.
3. **Estimated calorie burn:** average intake minus the energy implied by the change in trend weight over the window. Use 3,500 kcal per lb, converted for kg users. Keep it in the constants file and note in the code and report that it is a standard approximation.
4. **New calorie target:** estimated burn adjusted for the user's goal pace.
5. **Hold steady when the data is not good enough.** If any of these is true, the targets stay as they are and the reason is shown:
   - fewer than 2 weigh-ins spanning at least 7 days;
   - the logging answer is No;
   - food logged on fewer than 5 of the last 7 days;
   - the check-in is missed (more than 14 days late).
   Keep these thresholds in the constants file.
6. **Macros:**
   - Targets are user-defined keys. Identify the calorie, protein, carb and fat targets by key name or unit.
   - If the calorie target cannot be identified with certainty, do not adjust. Ask the user in the check-in which target is calories, and remember the answer as a preference.
   - Keep protein as the user set it. Scale carbs and fat in their current proportion to fill the new calories.
   - Leave any other target untouched.
7. **Before the user has enough data:** the first targets still come from `/api/macro-targets` at onboarding, as today.

**The Coach's role:**
- Its context includes:
  - the profile: age from date of birth, or "unknown";
  - the goal pace;
  - the last 8 entries per tracked metric, with dates;
  - trend weight;
  - estimated burn;
  - check-in status and the last 4 check-in records;
  - current target keys.
- After a check-in, the Coach posts a short review in the chat: what was reviewed, what was decided and why, using the calculation's numbers only.
- If the user asks "adjust my macros" outside a check-in, the Coach runs the same calculation (via a server function, not its own arithmetic) and proposes the result, or explains why it is holding.
- It never claims a change was made before it is applied.

**System prompt rules:** the Coach
- knows it can propose changes and that nothing changes until the user taps Apply;
- proposes only when the user asks or clearly agrees, or in the check-in review;
- uses only calculated numbers for targets;
- asks for missing profile information (such as date of birth) at most once, and accepts no for an answer.

**Acceptance:** tests for:
- the trend weight with uneven gaps;
- the burn estimate on a known worked example (show the arithmetic in the test);
- every hold-steady rule;
- the calorie target for loss, gain and maintain;
- macro scaling that keeps protein fixed, plus the "calories not identifiable" case;
- the system prompt contents;
- the review request built from calculated numbers (mocked Claude call).

## End of Phase 2
- Write `docs/phase-2-report.md`: per step, the files changed, the tests added, gate results, reviewer findings and fixes, and anything you stopped on.
- Note what was not testable without a paid API call: how well the real model uses the tools and explains check-ins.
- List every constant in the constants file (smoothing, 3,500 kcal/lb, hold-steady thresholds, goal-pace ranges) for Derak to confirm. Derak should try it on the `v3` preview.
- Commit and push. Stop. Do not start Phase 3.
