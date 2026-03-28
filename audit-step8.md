# Step 8 audit — Progress page

## Branch

Work was performed on **`v2`** (confirmed via `git branch` before implementation).

## Files created

- `app/(app)/progress/page.tsx` — Server entry: guest cookie gate (sign-in prompt), authenticated `getUser()` handoff with `userId` to the client UI.
- `components/progress/ProgressClient.tsx` — Loads `progress_metric_keys` from `user_preferences` (JSON array), loads `progress_entries` for charts, per-metric SVG trend charts, log form (metric, value, unit, date defaulting to today), insert on submit, empty state when no metrics (onboarding / home / Coach copy).
- `audit-step8.md` — This audit file.

## Files modified

- None outside the new files above (**`app/(app)/layout.tsx` was not modified**; no edits to other existing pages).

## Requirement mapping

| Requirement | Implementation |
|-------------|----------------|
| Metric keys from `user_preferences.progress_metric_keys` | Single-row `select` on `key === "progress_metric_keys"`, `JSON.parse` to string array (invalid JSON → `[]`). |
| Card + chart over time | One card per tracked key; SVG polyline + points over `progress_entries` filtered by `metric_key`, ordered with global ascending `logged_at` fetch and sorted merge after insert. |
| Log form: metric, value, unit, date (today) | Native `<select>` for metrics, inputs for value/unit, `type="date"` default `localDateInputValue()`. |
| Submit → `progress_entries` | `insert` with `user_id`, `metric_key`, `value`, `unit`, `logged_at` (local noon from chosen date). |
| No metrics | Dashed panel + copy to use onboarding or Coach from home; links to `/onboarding` and `/`. |
| Dark, mobile-first | Same `dark` wrapper and spacing patterns as workout/meals clients. |
| Layout / other pages unchanged | Only new route + client component. |

## Notes

- **Charts** are dependency-free SVG (no chart library).
- **Guest** users see the same pattern as meals: centered message + Create Account.
