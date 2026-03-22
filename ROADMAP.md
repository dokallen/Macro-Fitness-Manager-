# MacroFit — Feature Roadmap

## BATCH 1 — Meal Planning Foundation ✅ COMPLETE (2026-03-21)
- [x] 1. Onboarding flow — 15-step comprehensive onboarding: name, age, height, weight, goal weight, sex, goal, activity, training days, gym, dietary restrictions; Claude calculates all 7 macros; review/approve targets; wipes existing data on new account
- [x] 2. AI macro target generator — Claude calculates all 7 macros from profile; shown for review; user can ask Coach to adjust; Settings page for recalculation anytime
- [x] 3. Pantry manager — upgraded to mf_ key prefix
- [x] 4. AI meal plan generator — draft/approval banner, 👎 dislike button per meal, Coach substitution flow, mf_mealPlanApproved flag
- [x] 5. Auto-generated grocery checklist + full recipe cards — upgraded to mf_ key prefix

## BATCH 2 — Workout System ✅ COMPLETE (2026-03-21)
- [x] 1. Workout page simplification — collapsed by default, Start Workout expands
- [x] 2. AI workout plan generator — based on onboarding data, never assume gym/program
- [x] 3. Workout progression system — AI-driven, locked split, weights/reps adjust
- [x] 4. Session notes + rest timer + show exercise button
- [x] 5. Workout streak — planned days not calendar days (weekly streak)

## BATCH 3 — Bug Fixes & Coach Upgrades ✅ COMPLETE (2026-03-21)
- [x] Coach image upload — camera capture enabled (capture="environment")
- [x] Voice input in coach — auto-sends after recognition ends
- [x] Coach quick-tap chips — enriched with dynamic calLeft, proLeft, todayWt context
- [x] Supplements page — TODAY'S SCHEDULE view grouped by time of day; AI tip cached by date+stack

## BATCH 4 — Tracking & Engagement ✅ COMPLETE (2026-03-21)
- [x] Fitness journal — expand view with full entry sheet (edit/delete), "✨ Prompt" AI button, edit mode preserves existing entry
- [x] Habit tracker — replaced native prompt() with proper add-habit sheet; 7-day consistency bar chart
- [x] Water tracker — custom oz input + configurable water goal (64/80/100oz)
- [x] Streak tracker + milestone badges — streak_7 label fixed to "7-Week Streak"; earned date shown; first_pr badge now triggers on first 1RM save
- [x] Progress photos + body measurements — mf_progressCheckins in localStorage; measurements sheet (waist/chest/hips/arms/neck/thighs); timeline with diffs on Scale page
- [x] Backup and restore — mf_progressCheckins + waterGoal added to APP_KEYS
- [x] Offline mode indicator — already working (online/offline event listeners)
- [~] Google Fit / Apple Health sync — not feasible in PWA, skipped

## Critical Fixes (Any Batch)
- [x] Remove all hardcoded USER data (age:37, startWeight:233, height, programStart)
- [x] Remove hardcoded TARGETS (cal:1850, pro:180, fat:60 etc.) — now loaded from mf_targets
- [x] Remove "Derak" from all UI text (now uses USER.name variable in all prompts)
- [x] New user data wipe on fresh onboarding (clearAllAppData())
- [x] All localStorage keys now use mf_ prefix
