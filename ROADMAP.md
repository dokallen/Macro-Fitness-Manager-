# MacroFit — Feature Roadmap

## BATCH 1 — Meal Planning Foundation ✅ COMPLETE (2026-03-21)
- [x] 1. Onboarding flow — 15-step comprehensive onboarding: name, age, height, weight, goal weight, sex, goal, activity, training days, gym, dietary restrictions; Claude calculates all 7 macros; review/approve targets; wipes existing data on new account
- [x] 2. AI macro target generator — Claude calculates all 7 macros from profile; shown for review; user can ask Coach to adjust; Settings page for recalculation anytime
- [x] 3. Pantry manager — upgraded to mf_ key prefix
- [x] 4. AI meal plan generator — draft/approval banner, 👎 dislike button per meal, Coach substitution flow, mf_mealPlanApproved flag
- [x] 5. Auto-generated grocery checklist + full recipe cards — upgraded to mf_ key prefix

## BATCH 2 — Workout System
- [ ] 1. Workout page simplification — collapsed by default, Start Workout expands
- [ ] 2. AI workout plan generator — based on onboarding data, never assume gym/program
- [ ] 3. Workout progression system — AI-driven, locked split, weights/reps adjust
- [ ] 4. Session notes + rest timer + show exercise button
- [ ] 5. Workout streak — planned days not calendar days

## BATCH 3 — Bug Fixes & Coach Upgrades
- [~] Coach image upload (EXISTS — needs testing)
- [ ] Voice input in coach
- [ ] Coach quick-tap chips
- [~] Supplements page + side drawer (EXISTS — needs review)

## BATCH 4 — Tracking & Engagement
- [~] Fitness journal (EXISTS — needs review)
- [~] Habit tracker + water tracker (EXISTS — needs review)
- [~] Streak tracker + milestone badges (EXISTS — needs review)
- [ ] Google Fit / Apple Health sync
- [ ] Progress photos + body measurements
- [~] Backup and restore (EXISTS — needs review)
- [~] Offline mode indicator (EXISTS — needs review)

## Critical Fixes (Any Batch)
- [x] Remove all hardcoded USER data (age:37, startWeight:233, height, programStart)
- [x] Remove hardcoded TARGETS (cal:1850, pro:180, fat:60 etc.) — now loaded from mf_targets
- [x] Remove "Derak" from all UI text (now uses USER.name variable in all prompts)
- [x] New user data wipe on fresh onboarding (clearAllAppData())
- [x] All localStorage keys now use mf_ prefix
