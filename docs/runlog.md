# MacroFit — Run Log

## Pre-Batch History (before framework)
The following features were built across multiple unstructured sessions:

**Already shipped to production:**
- Pantry Manager (basic version, pre-loaded staples)
- AI Meal Plan Generator (basic, no draft/approval flow)
- Grocery List (generated from meal plan)
- Recipe Library + Cook Mode + Recipe Analyzer
- Workout Progression System (basic)
- Side Drawer + Supplements Page
- Fitness Journal
- Habit Tracker + Water Tracker
- Rest Timer + Workout Notes + Exercise Info sheets
- 1RM Calculator
- Milestone Badges
- Backup & Restore
- Onboarding (basic 9-step version — insufficient per framework requirements)
- Coach Image Upload + Voice Input + Quick-tap Chips
- Streak Tracker (home screen)
- Offline Mode Banner

**Known issues to fix in Batch 1:**
- USER object is hardcoded: `const USER={age:37,startWeight:233,height:"5'7\"",programStart:'2026-02-23'}`
- TARGETS object is hardcoded: `const TARGETS={cal:1850,pro:180,fat:60,carbs:163,sodium:2300,fiber:28,sugar:40}`
- "Derak" appears in 2 places in AI prompts (acceptable) but USER data must be user-entered
- No mf_ prefix on localStorage keys
- Onboarding does not collect: age, height, biological makeup, primary goal, activity level, training days, gym, dietary restrictions
- Onboarding does not call Claude to generate macro targets
- No draft approval flow on meal plan
- No "disliked meal" flagging in meal plan

---

## Batch 1 Run — 2026-03-21
**Status:** Complete
**Features completed:**
1. [x] Comprehensive onboarding — 15 steps, collects full profile, AI generates macro targets, wipes existing data on new account
2. [x] AI macro target generator — Claude calculates 7 macros, settings page for review/recalculate
3. [x] Pantry manager — upgraded to mf_ key prefix
4. [x] Meal plan draft/approval — approval banner, dislike button, Coach substitution flow
5. [x] Grocery + recipe review — upgraded to mf_ key prefix

**Key decisions:**
- USER and TARGETS objects are now loaded from localStorage (mf_userProfile, mf_targets), not hardcoded
- All new keys use mf_ prefix
- "Derak" removed from all UI text; AI prompts now use USER.name variable
- clearAllAppData() wipes all non-profile keys on new onboarding
- Settings page accessible from side drawer (Settings & Targets)
- Meal plan approval persisted via mf_mealPlanApproved flag
- generateMealPlan() now uses dynamic TARGETS.cal and TARGETS.pro in system prompt

**Recommended Batch 2 features:**
1. Workout page simplification (collapsed by default)
2. AI workout plan generator based on onboarding data
3. Workout progression system
4. Session notes + rest timer improvements
5. Workout streak (planned days, not calendar days)

---

## Batch 2 Run — 2026-03-21
**Status:** Complete
**Features completed:**
1. [x] Workout page simplification — days collapsed by default, today auto-expanded, START ▶ button in header
2. [x] AI workout split generator — generateWorkoutSplit() assigns Push/Pull/Legs/Rest to all 7 days based on profile; locked after first gen
3. [x] Workout progression — renderWeeklyWorkoutProgress() shows X/planned days bar + week streak count
4. [x] Session save — saveWorkout() persists sets/reps/weight with session log entry; post-workout summary sheet
5. [x] Workout streak by planned weeks — updateWorkoutStreak() tracks weekly completion vs planned days, not calendar days

**Key decisions:**
- Workout days collapsed by default (ld('wdExpanded_'+dayIdx, isToday)); today auto-expands
- generateWorkoutSplit() uses Claude to assign workout types respecting USER.trainingDays/gym/goal
- Weekly streak: streak increments only when logged sessions >= planned days in a given week (getWeekKey())
- Gym name in day header uses USER.gym for push/pull/legs types

---

## Batch 3 Run — 2026-03-21
**Status:** Complete
**Features completed:**
1. [x] Coach image upload — added capture="environment" for mobile camera access
2. [x] Voice auto-send — coachRecognition.onend now auto-sends if input has text (200ms delay)
3. [x] Coach chips enriched — renderCoachChips() injects calLeft, proLeft, todayWt into chip context
4. [x] Supplements today schedule — renderSupplements() shows TODAY'S SCHEDULE section grouped by time of day
5. [x] Supplement AI tip caching — getSuppCoachTip() caches by mf_suppTip_DATE_STACKCOUNT key

**Key decisions:**
- Voice input send: only fires if inp.value.trim() truthy after recognition ends (prevents empty sends)
- Supp tip cache key includes stack count so tips refresh when user adds/removes supplements

---

## Batch 4 Run — 2026-03-21
**Status:** Complete
**Features completed:**
1. [x] Fitness journal — expandJournalEntry() now opens journalViewSheet with full text, edit/delete buttons; "✨ Prompt" button fetches AI journaling prompt and pre-fills textarea; saveJournalEntry() supports edit mode via window._journalEditDate
2. [x] Habit tracker — promptAddHabit() replaced with proper habitAddSheet bottom sheet (emoji + name inputs); renderHabits() now appends 7-day consistency bar chart below habits
3. [x] Water tracker — renderWaterTracker() adds custom oz input + "⚙ Goal" button (setWaterGoalPrompt: 64/80/100oz options); logWaterCustom() reads input value; waterGoal added to APP_KEYS
4. [x] Streak/badges — streak_7 badge renamed to "7-Week Streak" with accurate desc; renderBadges() now shows earned date (earnedAt formatted); first_pr badge now triggers on Object.keys(oneRepMaxes).length>=1
5. [x] Progress measurements — new mf_progressCheckins in localStorage; openCheckinSheet() collects waist/chest/hips/arms/neck/thighs + notes; renderCheckinTimeline() shows last 5 with diffs vs previous; accessible via "📏 Log Body Measurements" button on Scale page
6. [x] Backup/restore — mf_progressCheckins + waterGoal added to APP_KEYS

**Key decisions:**
- Journal edit mode: _journalEditDate global flag; save preserves createdAt, updates updatedAt
- Water goal stored in localStorage key 'waterGoal' (without mf_ prefix, already existed); added to APP_KEYS
- Measurement diffs: waist/chest/hips/arms shown in red for increase, green for decrease (smaller = better for waist/hips)
- Progress photos skipped: base64 in localStorage causes quota issues; user directed to camera roll
