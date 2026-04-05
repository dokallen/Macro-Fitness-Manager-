# Audit: Prompt B (AI-first meals & workout + coach FAB)

Date: 2026-04-04  
Build: `npm run build` — passed.

## Summary

- **Meals (`MealsClient`, `LogMealForm`, `RecipeLibraryTab`)**  
  Food label scan → `/api/coach-chat` `coachTask: food_label`; voice for food name; cook mode overlay (wake lock, steps, optional timers); recipe analyzer sheet (ingredient scan, macro calc, save/log).  
- **Workout (`WorkoutClient`)**  
  Warm-up sheet (🔥), session notes (📝, `mf_workoutNotes`), 1RM sheet + Epley + `mf_oneRepMaxes`, exercise info (YouTube + coach text), rest timer bar on weight entry, screenshot + spoken burn (`workout_screenshot`, `workout_spoken_burn`), post-finish overlay + `post_workout` coach task.  
- **Coach (`CoachClient`, `CoachFabPanel`)**  
  Context chips (path-based), 📷 pending image + vision send, 🎤 Web Speech with auto-send after stop.  
- **API (`app/api/coach-chat/route.ts`)**  
  `coachTask` modes for labels, recipes, warmup, exercise copy, OCR, screenshot, spoken burn, post-workout; multimodal chat when `content` + `imageBase64`.  
- **Styles (`globals.css`)**  
  `.rest-timer-bar.open`, `.coach-chip-row` (hidden scrollbar).

## localStorage (`mf_`)

| Key | Use |
|-----|-----|
| `mf_oneRepMaxes` | Per-exercise 1RM history (max 10) |
| `mf_workoutNotes` | Notes by date (YMD) |
| `mf_bodyWeightLbs` | Optional; MET / screenshot prompts |
| `mf_chosenCoachId` | Post-workout + coach chat personality |

## Notes

- `components/coach/CoachFabPanel.tsx` in the spec maps to `components/home/CoachFabPanel.tsx` in this repo (layout import unchanged).  
- Rest timer opens when weight field has any non-empty input during an active session; default duration 90s; 60/90/120s presets restart countdown.  
- Post-workout “Calories” tile shows a check when `burnText` was set from screenshot or voice during that session.
