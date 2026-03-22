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
