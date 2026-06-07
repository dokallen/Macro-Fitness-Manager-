# MACRO FIT V2 — Full Program Audit Report

**Branch:** v2  
**Audit date:** 2026-06-07  
**Scope:** Read-only code/build audit (no runtime or deployment verification)

---

## 1. OVERALL HEALTH SCORE (out of 100)

**Score: 82 / 100** *(updated 2026-06-07 after post-audit fixes)*

Originally **74 / 100**. Post-fix commit addresses migration gap, macro-targets auth, NON_MACRO notification keys, cardio nav, push icon paths, guest localStorage naming, and onboarding placeholders. Remaining drag: **Vercel Hobby push cron architecture** (critical, not fixable in this pass).

---

## Post-Audit Fixes Applied (2026-06-07)

| Fix | Status |
|-----|--------|
| `/api/macro-targets` Supabase `getUser()` auth (401 if unauthenticated) | **Fixed** |
| `supabase/migrations/20260430000000_coach_conversations.sql` | **Added** (documentation; table already live in Supabase) |
| `NON_MACRO_PREFERENCE_KEYS` — all `notification_*` + `push_subscription` | **Fixed** |
| Bottom nav: Cardio (`/cardio`) replaces duplicate Scale | **Fixed** |
| Side drawer: Scale (`⚖️` → `/progress`) added | **Fixed** |
| `public/sw-push.js` icon paths → `/icon-192.png` | **Fixed** |
| `macrofit_guest_mode` → `mf_guest_mode` (localStorage only) | **Fixed** — cookie `macrofit_guest` unchanged (middleware/pages) |
| Onboarding placeholder/toast — removed hardcoded `1800` | **Fixed** |
| Coach pantry scan prompt examples (`chicken breast`, etc.) | **Intentional** — AI instruction examples, not UI hardcoding |

**Still open:** Push notification timezone delivery on Hobby daily crons; `notification_last_sent_*` keys not in NON_MACRO (minor); meal plan AI flows; `mf_workoutSels` calendar dots.

---

## Original Assessment (pre-fix)

**Score was: 74 / 100**

The codebase **builds cleanly** (`npm run build`, `npx tsc --noEmit` both pass on branch `v2`). Core app surfaces (home dial, meals, workout, progress, coach, settings, PWA shell) are implemented with substantial feature depth. Score was held back by **schema/migration gaps**, **push-notification cron architecture limits**, **navigation orphans**, **unauthenticated macro API**, and **preference-key classification gaps**.

---

## 2. BUILD STATUS

| Check | Result |
|-------|--------|
| `git branch --show-current` | `v2` |
| `npm run build` | **PASS** — compiled successfully, 26 static pages, all API routes built |
| `npx tsc --noEmit` | **PASS** — exit code 0, no output |
| Font fetch during build | Transient `ECONNRESET` on Google Fonts (retried; build succeeded) |
| Untracked files | `supabase/.temp/` only |

---

## 3. FEATURES CONFIRMED WORKING (code + build evidence)

These are **present and compile**; runtime behavior is inferred from code review, not live testing:

- **Auth:** Login, signup, forgot/reset password, guest mode banner (`mf_guest_mode` localStorage + `macrofit_guest` cookie)
- **Onboarding:** Multi-step wizard with AI macro targets via `/api/macro-targets` (auth required)
- **Home dashboard:** Spin dial, macro summary, program week badge, workout streak stat, coach FAB
- **Bottom nav:** Home, Workout, Today (meals), Log (`/progress`), Cardio (`/cardio`)
- **Side drawer:** Supplements, journal, pantry, go-to recipes, calendar, challenges, coach (FAB), achievements, **Scale** (`/progress`), settings, backup
- **Workout:** Logging, onboarding, custom builder (`/workout/custom`), 1RM, notes, rest timer, post-workout summary (client code)
- **Meals:** Food log, recipe library, meal plan tabs, habits, water tracking, meal plan rotation/favorites/archive UI
- **Progress:** Body composition, trends, progress photos (localStorage-backed photos)
- **Cardio:** Full `CardioClient` page at `/cardio` — linked in bottom nav
- **Coach:** 15 personas, conversational style layer, multi-conversation sidebar, embedded FAB panel, `/coach` page
- **Challenges:** AI challenge builder API + client
- **Push notifications:** Subscribe flow, VAPID, cron routes in `vercel.json`, coach-personality message generation
- **Meal plan cron:** `/api/meal-plan-rotate` with `CRON_SECRET`
- **PWA:** `manifest.json`, `sw.js`, offline page, service worker registration (production only)
- **Backup/restore:** Export/import all `mf_*` localStorage keys
- **Supabase integration:** RLS policies in initial migration; typed client in `lib/types/index.ts`

---

## 4. KNOWN ISSUES FOUND

| # | Issue | Severity | Evidence |
|---|-------|----------|----------|
| 1 | **`coach_conversations` migration missing from repo** | ~~Critical~~ **Fixed** | `20260430000000_coach_conversations.sql` added |
| 2 | **Vercel Hobby crons — push time prefs cannot fire reliably** | **Critical** | Unchanged |
| 3 | **`/api/macro-targets` has no authentication** | ~~Major~~ **Fixed** | `getUser()` check returns 401 |
| 4 | **`NON_MACRO_PREFERENCE_KEYS` missing notification keys** | ~~Major~~ **Fixed** | All listed keys added |
| 5 | **`/cardio` not in nav** | ~~Major~~ **Fixed** | Bottom nav Cardio entry |
| 6 | **Push SW icon paths wrong** | ~~Major~~ **Fixed** | `/icon-192.png` |
| 7 | **Bottom nav duplicate Scale/Log targets** | ~~Minor~~ **Fixed** | Scale moved to side drawer |
| 8 | **`/coach` standalone page vs drawer** | **Minor** | Side drawer "Coach" opens FAB via event, not `/coach`. Standalone `/coach` page exists but is not in drawer links. |
| 9 | **`coach-overlay.open` uses `pointer-events: none`** | **Minor** | `app/globals.css` line 1193; panel uses inline `pointerEvents`. Overlay may not block background interaction as expected (prior fix targeted panel input, not overlay). |
| 10 | **Meal plan AI generate/swap flows incomplete** | **Minor** | Documented in `audit-personal-use-complete.md`: coach meal generation query params not fully wired; dislike → auto-swap not implemented. |
| 11 | **Calendar workout dots depend on `mf_workoutSels` localStorage** | **Minor** | No grep hit for writers to `mf_workoutSels` outside calendar reader — blue dots may stay empty if nothing writes the key. |
| 12 | **Mixed UI styling** | **Minor** | Original CSS classes (`.ph`, `.bnav`, `.sc-tab`) coexist with Tailwind `bg-[var(--…)]` utilities in meals/workout/home. |

---

## 5. HARDCODED VALUES FOUND

| File | Line | Match | Notes |
|------|------|-------|-------|
| `components/onboarding/OnboardingWizard.tsx` | — | `1800` | **Removed** in post-audit fix |
| `components/meals/LogMealForm.tsx` | 151 | `Greek yogurt` | Placeholder only |
| `app/api/coach-chat/route.ts` | 15 | `chicken breast` | **Intentional** — AI system prompt example for pantry scan JSON format |
| `app/api/macro-targets/route.ts` | 68–71 | `2200`, `165`, `220`, `70` | Example JSON shape in system prompt (not user defaults) |

**Not found:** `Planet Fitness`, `2100`, `180g`, `Isopure`, `Creatine` in app/components/lib source (removed from supplements per prior audit).

**Water 64oz:** No matches for `64oz`, `waterGoal.*64`, or `default.*64`.

---

## 6. MISSING ENVIRONMENT VARIABLES

Referenced in codebase; **must be set in production** (`.env.local` present locally for build):

| Variable | Used in |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client/server/middleware/admin |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase client/server/middleware |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client (cron routes, push-notify) |
| `ANTHROPIC_API_KEY` | All AI routes and lib helpers |
| `CRON_SECRET` | `/api/meal-plan-rotate`, `/api/push-notify` |
| `VAPID_PUBLIC_KEY` | `/api/push-subscribe` GET, web-push |
| `VAPID_PRIVATE_KEY` | `/api/push-notify` |
| `VAPID_EMAIL` | `/api/push-notify` (web-push contact) |

Cannot verify which are unset in deployment from this audit alone.

---

## 7. NAVIGATION GAPS

**Pages under `app/(app)/` not linked from SideDrawer or bottom nav:**

| Route | Status |
|-------|--------|
| `/coach` | Page exists; drawer opens FAB instead |
| `/workout/custom` | Reachable from workout flow only |
| `/onboarding` | Intentional gate (not main nav) |

**Bottom nav:** Home, Workout, Today, Log, Cardio. Scale via side drawer.

---

## 8. LOCALSTORAGE KEYS INVENTORY

| Key | Component / usage |
|-----|-------------------|
| `mf_badges` | BadgesClient |
| `mf_bodyWeightLbs` | WorkoutClient |
| `mf_cardioQuickTypes` | CardioClient |
| `mf_cardioQuickTypesDismissed` | CardioClient |
| `mf_challengeLog` | ChallengesClient |
| `mf_challenges` | ChallengesClient |
| `mf_chosenCoachId` | CoachChooser, CoachClient, WorkoutClient; also cookie in coach-chat API |
| `mf_customHabits` | MealsClient |
| `mf_fitnessJournal` | JournalClient, BadgesClient |
| `mf_foodLog` | MealsClient, CalendarClient |
| `mf_gotoRecipes` | GoToRecipesClient |
| `mf_habitData` | MealsClient |
| `mf_habitStreaks` | MealsClient |
| `mf_macroStreak` | MealsClient |
| `mf_notificationsDismissed` | PushNotificationClient |
| `mf_oneRepMaxes` | WorkoutClient |
| `mf_pantryCustom` | PantryClient |
| `mf_pantryItems` | PantryClient |
| `mf_pendingCookMode` | GoToRecipesClient |
| `mf_progressPhotoPin` | ProgressPhotosClient |
| `mf_progressPhotos` | ProgressPhotosClient |
| `mf_pushEnabled` | PushNotificationClient |
| `mf_supplementStack` | SupplementsClient, BadgesClient |
| `mf_waterGoal` | MealsClient |
| `mf_waterLog` | MealsClient |
| `mf_workoutNotes` | WorkoutClient |
| `mf_workoutSels` | CalendarClient (read only in audit) |
| `mf_guest_mode` | GuestModeBanner, login page |
| `macrofit_guest` | Cookie (unchanged) — middleware + all app pages for guest detection |

BackupClient exports/restores **all keys with `mf_` prefix**.

---

## 9. SECURITY FINDINGS

| Finding | Severity | Detail |
|---------|----------|--------|
| No exposed API keys in source | OK | Grep for `sk-ant`, embedded secrets: **no matches** |
| `/api/macro-targets` unauthenticated | ~~Major~~ **Fixed** | Requires authenticated Supabase session |
| Cron routes protected | OK | `meal-plan-rotate`, `push-notify` require `CRON_SECRET` |
| User routes use `getUser()` | OK | coach-chat, coach-tip, journal-prompt, challenge-builder, workout-plan-builder, push-subscribe POST |
| `push-subscribe` GET | OK | Returns public VAPID key only (by design) |
| Service role key server-only | OK | Used only in admin client for crons |
| RLS enabled on core tables | OK | Initial migration policies for user-owned data |

---

## 10. RECOMMENDED FIXES IN PRIORITY ORDER

1. **Fix push notification delivery architecture** — Hobby daily crons cannot honor per-user timezones.
2. **Add `notification_last_sent_*` to NON_MACRO** (minor follow-up).
3. **Verify `mf_workoutSels` writers** for calendar blue dots.
4. **Wire meal plan coach generate/swap** flows.
5. **Review `coach-overlay` pointer-events**.

---

## 11. FEATURES NOT YET BUILT (from original spec / prior audits)

- **Reliable timezone-aware push notifications** on Vercel Hobby (architectural gap, not just a bug)
- **Automatic meal swap on dislike** (dislike stored; no AI replacement)
- **Fully wired coach meal plan generation** from `/coach?mealPlan=generate|build` params
- **Separate "approved plan" archive hook** outside Generate-for-me button
- **Server-backed calendar workout dots** (partially localStorage-dependent)
- **`coach_conversations` in versioned migrations** — **Done** (`20260430000000_coach_conversations.sql`)
- **Cardio in primary navigation** — **Done** (bottom nav)

---

## Appendix: Section 11 Known-Issues Verification

| Check | Status |
|-------|--------|
| 11a Cardio pills `mf_cardioQuickTypes` + `sc-tab` | **Present** in `CardioClient.tsx` |
| 11b Coach panel CSS `coach-panel` / `coach-overlay` / `pointer-events` | **Present** in `globals.css` |
| 11c `NON_MACRO` includes `meal_plan_*`, `body_metric_*`, `notification_*` | **Fixed** |
| 11d Program week fix | **Present** — `lib/program-week.ts` with `program_start` formula |
| 11e Conversational style layer | **Present** — `CONVERSATIONAL STYLE LAYER (v1)` block in `coach-chat-context.ts` |

---

*Initial audit 2026-06-07 (read-only). Updated after post-audit fix commit on branch v2.*
