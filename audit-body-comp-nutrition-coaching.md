# Audit: Body composition + nutrition coaching (v2)

## Scope

Implemented per request: user-defined body metrics (`user_preferences.body_metric_keys`), `progress_entries` rows per metric per weigh-in, coach tasks on `/api/coach-chat`, progress page wiring, and meals real-time coach feedback without new Supabase tables.

## Files created

- `components/progress/MetricSetupClient.tsx` — Screenshot scan (`detect_body_metrics`) + manual list; saves `body_metric_keys` as JSON `[{ name, unit, better }]`.
- `components/progress/BodyCompositionClient.tsx` — Weigh-in form, scan-to-fill, per-field voice, notes stored in `user_preferences` key `body_weighin_notes` (JSON map by date), `body_comp_analysis` after save.
- `components/progress/TrendChartClient.tsx` — Summary (`.renpho-grid` / `.renpho-metric`), per-metric canvas charts with range chips, week-over-week averages + `metric_week_insight`.

## Files modified

- `app/(app)/progress/page.tsx` — Loads `body_metric_keys`; empty → `MetricSetupClient`; else → `BodyCompositionClient` + `TrendChartClient`; then existing `ProgressClient` + `ProgressPhotosClient`.
- `app/api/coach-chat/route.ts` — Added `detect_body_metrics`, `body_comp_analysis`, `nutrition_check`, `meal_suggestion`, `metric_week_insight`.
- `components/meals/MealsClient.tsx` — Post-log `nutrition_check` tip (auto-dismiss 8s, tap to pin), remaining macros row, `meal_suggestion` block with refresh and “+ Log This” (voice food name nonce), `mf_macroStreak` with UTC-day validation and 60s day-roll check.

## Rules checklist

| Rule | Status |
|------|--------|
| No hardcoded scale brands | OK |
| Metric names from user prefs / AI parse only | OK (UI labels from saved defs) |
| `progress_entries` only for metric values | OK (one row per metric; notes in prefs) |
| `globals.css` classes (e.g. `.upload-area`, `.renpho-*`) | OK |
| localStorage `mf_` prefix | OK (`mf_macroStreak`; existing keys unchanged) |
| Build | `npm run build` passed |

## Notes

- `DETECT_BODY_METRICS` system text includes example metric names **only inside the API prompt**, as specified; app UI does not hardcode tracked metrics.
- Program week is not stored in schema; `body_comp_analysis` payload uses `programWeek: "not_stored"` until a preference exists.

## Git

- Branch: `v2`
- Suggested message: `Body composition tracking with trends and real-time nutrition coaching`
