# Step 9 audit — Cardio page

## Branch

Work was performed on **`v2`** (confirmed via `git branch` before implementation).

## Files created

- `app/(app)/cardio/page.tsx` — Server entry: guest cookie gate, authenticated `getUser()` → `CardioClient` with `userId`.
- `components/cardio/CardioClient.tsx` — Log form (free-text type, duration minutes, date default today, optional notes), dynamic optional metric rows (user-defined key / numeric value / optional unit) → `cardio_sessions` + `cardio_metrics`; history `logged_at` desc with metrics listed under each session; empty history state.
- `audit-step9.md` — This audit file.

## Files modified

- `app/(app)/layout.tsx` — Added **Cardio** nav item (`/cardio`, `Activity` icon from `lucide-react`); mobile bottom nav grid updated from 4 to **5** columns with slightly tighter horizontal padding.

No other existing **pages** were modified.

## Requirement mapping

| Requirement | Implementation |
|-------------|----------------|
| Log form: type, duration, date (today), notes | Text `type`, numeric duration (minutes), `type="date"`, optional notes → `cardio_sessions`. |
| Insert `cardio_sessions` | `insert` with `user_id`, `type`, `duration_minutes`, `notes`, `logged_at` (local noon from date). |
| Extra metrics → `cardio_metrics` | Zero or more rows; user-defined `key`, numeric `value`, optional `unit`; bulk `insert` after session row. |
| History newest first, metrics visible | `order("logged_at", { ascending: false })` + nested `cardio_metrics(...)`; each card lists metrics below session summary. |
| Empty state | Dashed panel when no sessions. |
| Dark, mobile-first | Same patterns as Progress/Workout clients. |
| Nav: Cardio + Activity | `layout.tsx` only. |

## Notes

- Cardio **type** and metric **keys** are never hardcoded presets — only placeholders in inputs.
- If `cardio_metrics` insert fails after session insert, the session row may remain without metrics (user sees error toast).
