# Audit: dial velocity, goal progress bar, 15 coaches

## Preconditions

- Branch `v2` confirmed before changes.

## FIX 1 — Dial (`HomeSpinDial.tsx`)

- `startMomentum`: friction **0.992** (was 0.988).
- `onEnd`: `vbuf.slice(-**4**)`; `smoothV * **3.5**` assigned to `dialVelRef.current`; fling threshold **0.8** (was 1.5).

## FIX 2 — Goal bar (`HomeDashboardClient.tsx` + `app/(app)/page.tsx`)

- `HomeDashboardStats` extended with optional `currentWeightLbs`, `goalWeight`, `startWeight`, `weightLog` (empty array from server until a weight history source is wired).
- `buildHomeStats` maps numeric lbs from existing `user_preferences` keys (no new Supabase queries).
- Progress block renders only when `goalPct !== null` per `goalWeight > 0 && totalNeeded > 0`.
- ETA line shows when `weightLog` has 2+ entries and a losing trend is computable.

## FIX 3 — Coaches

- **`components/coach/CoachChooser.tsx`**: 15-entry `COACHES`, `mf_chosenCoachId` in `localStorage` (default `drdata`), cookie mirror for API, `getCoach()`, `CoachChooser` grid + toast.
- **`components/home/CoachFabPanel.tsx`**: FAB shows `getCoach().icon`; panel header shows name + icon; **Switch Coach** toggles grid vs chat; uses `coach-fab`, `sheet-overlay`, `coach-panel-base`.
- **`app/(app)/layout.tsx`**: Inline coach UI replaced with `<CoachFabPanel />` (FAB lives here).
- **`lib/coach-chat-context.ts`**: Server-side `COACHES_FOR_PROMPT` (no `localStorage`); `buildCoachSystemPromptFromPreferences(rows, coachId)`; opening persona line uses selected coach.
- **`app/api/coach-chat/route.ts`**: Resolves `coachId` from **body `coachId`**, then preference `chosen_coach_id`, then cookie `mf_chosenCoachId`, default `drdata`. **No change to existing Supabase selects.**
- **`app/(app)/coach/page.tsx`**: “Choose your coach” link + `#choose-coach` anchor (chooser UI is in the FAB panel).

## Build

- `npm run build` — passing.
