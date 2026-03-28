# Audit — exact original Macro Fit visual redesign (dial + tokens)

## Summary

Rebuild aligns the app with the specified design tokens (`--bg`, `--surface`, `--accent`, `--fd`, `--fb`, etc.), Google Fonts link in root layout, a new **home hub** with **spinning dial** physics, **5-item bottom navigation**, **coach FAB** with slide-up panel, and **sticky subpage headers** on main feature routes. **No Supabase queries, API routes, or business logic were changed** on existing features; the home route no longer renders the previous dashboard cards/tip (visual-only recomposition).

## Files added

- `components/home/HomeSpinDial.tsx` — 5-button ring (90px), drag + fling (`velocity *= 0.988` / frame), snap to 72° steps, tap-to-nav, slide-to-center + glow on 44px center dot, hint copy.
- `components/home/HomeDashboardClient.tsx` — `home-hdr` (MACRO FIT 42px, YOUR PROGRAM, week pill, trophy, hamburger menu with Cardio / Coach / Meals / Onboarding), 2×2 stat cards, dial mount.
- `components/home/CoachFabPanel.tsx` — Gradient FAB, bottom sheet with `CoachClient` + close (auth user only).
- `components/layout/AppBottomNav.tsx` — Fixed bottom, 5 items (Home, Workout, Today, Log, Scale), DM Sans 10px uppercase, `letter-spacing: 1px`, active `var(--accent)` + dot, `padding-bottom: max(20px, env(safe-area-inset-bottom))`.
- `components/layout/SubpageHeader.tsx` — Sticky back + Bebas title (32px / 2px tracking) + subtitle.

## Files removed

- `components/navigation/AppNavLink.tsx` — Replaced by `AppBottomNav` + pathname logic.

## Files heavily modified

- `app/globals.css` — User tokens + Tailwind bridge (`--background` → `var(--bg)`, etc.), `.macro-card`, `.page-title`, `.section-label`, `.app-progress-track`, `.stat-num`, `.home-hdr`, body `font-family: var(--fb)`.
- `tailwind.config.ts` — Theme colors use `var(--…)` (no `hsl()` wrapper).
- `app/layout.tsx` — Google Fonts `<link>` (with lint suppression), existing `next/font` kept as fallback variables.
- `app/(app)/layout.tsx` — Sidebar removed; `AppBottomNav` + `CoachFabPanel`; main bottom padding for nav + safe area.
- `app/(app)/page.tsx` — New home only: stats from existing `user_preferences` keys (weight / goal heuristics), ISO week badge; guest branch unchanged in behavior (still signup CTA).
- `components/coach/CoachClient.tsx` — Sticky header with back link + COACH title styling.
- `components/meals/MealsClient.tsx`, `workout/WorkoutClient.tsx`, `progress/ProgressClient.tsx`, `cardio/CardioClient.tsx` — `SubpageHeader`, `bg-[var(--bg)]`.
- `components/ui/input.tsx`, `button.tsx` — Ring offset `var(--bg)`, focus border accent on input.
- `components/dashboard/MacroSummaryCard.tsx` — Progress track uses `.app-progress-track` (still used if mounted elsewhere).
- `public/sw.js` — Offline fallback colors aligned with `--bg` / text tokens (cosmetic).

## Routes / navigation notes

- Bottom nav **Today** → `/meals`. **Log** and **Scale** both → `/progress` (both show active on that path).
- Dial: TODAY → `/`, WORKOUT → `/workout`, MEALS → `/meals`, LOG & SCALE → `/progress`.
- **Cardio** and full-screen **Coach** remain available from the **hamburger menu** on home (and `/coach` URL). **Coach FAB** opens the same chat client in a sheet on mobile.

## Verification checklist

- [ ] Home: fling dial, snap, tap each sector, slide-from-ring to center navigates with blue center glow.
- [ ] Bottom nav: five items, active color + dot, safe-area padding.
- [ ] Coach FAB (signed-in): opens sheet, Close works, chat still hits `/api/coach-chat`.
- [ ] Meals / Workout / Progress / Cardio / Coach: sticky header + back.
- [ ] Lighthouse: fonts load (Google link + optional next/font).
