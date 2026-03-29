# Audit: exact original UI (v2)

## Checklist (spec)

- [x] `globals.css` includes design tokens (`:root` in `@layer base`) plus the full original class library appended after Tailwind (page headers, home, dial, bottom nav, cards, sheets, coach panel, etc.). Shadcn bridge variables preserved. Legacy helpers retained: `macro-card`, `page-title`, `section-label`, `coach-tip-card`, `stat-num`, `app-progress-track`.
- [x] Google Fonts link present in `app/layout.tsx` `<head>` (Bebas Neue + DM Sans weights 300–600).
- [x] `HomeSpinDial`: `DC=140`, `DR=95`, container `280×280`, initial rotation `270°`, classes `dial-wrapper`, `dial-container`, `dial-ring`, `dial-center-dot` / `lit`, `dial-btn` / `active-slot`, `dial-hint`. Exports `DIAL_ITEMS` for compatibility.
- [x] Bottom nav: `bnav`, `nt` + `nt active`, `nti`, `ntl`, `ntd`; routes Home, Workout, Today (`/meals`), Log (`/progress`), Scale (`/progress`). Active state uses pathname; both Log and Scale highlight on `/progress`.
- [x] Coach FAB: `coach-fab`, emoji 💬; sheet overlay `sheet-overlay` / `open`; panel `coach-panel-base` / `open`, header `coach-panel-hdr`.
- [x] Home: `home-hdr`, `home-name`, `home-sub`, `week-badge`, `stats-row`, `stat-card`, `sl`, `sv`. Week = `Math.max(floor((now - programStart) / 7d) + 1, 1)` when `stats.programStart` is set; otherwise `1`. `programStart` passed from `user_preferences.program_start` via `app/(app)/page.tsx` (no extra Supabase query).
- [x] App shell: `app/(app)/layout.tsx` main uses `paddingBottom: 100` for bottom nav clearance (single reserve; home does not double-pad).
- [x] Subpages: `SubpageHeader` uses `ph`, `back-btn`, `pt`, `ps` (shared by meals, workout, progress, cardio, etc.).

## Files touched beyond the strict allow list (for parity)

- `components/layout/SubpageHeader.tsx` — required so `.ph` applies everywhere those screens render their header; duplicating headers only in `page.tsx` would double headers with existing clients.
- `app/(app)/page.tsx` — adds `programStart` to `HomeDashboardStats` from existing `prefMap` so the week badge matches the program-start formula.

## Known gaps

- Full-page **Coach** route (`/coach`) still uses `CoachClient`’s internal sticky header (Tailwind), not `.ph`, because only `coach/page.tsx` was in scope for header edits and the chat UI owns its header.
- Coach slide-up panel shows `coach-panel-hdr` plus `CoachClient`’s own “COACH” header (duplicate chrome until `CoachClient` is adjusted in a future pass).

## Build

- `npm run build` — passing (last run after these changes).
