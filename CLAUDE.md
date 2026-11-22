# CLAUDE.md — Macro Fit (v3)

## Branch rules
- Work ONLY on the `v3` branch. Never commit to, merge into, or push to `main` or `v2`.
- `main` = v1 (frozen). `v2` = live production. Never touch either.
- Pushing to `v3` is allowed after a phase step passes all gates (Vercel creates preview deploys only; production is v2).

## Project
- Next.js 14 + TypeScript + Tailwind + shadcn/ui + Supabase (Postgres, Auth, Realtime, RLS) + Claude API + Vercel.
- Local root is the folder containing package.json (C:\Users\dokal\Macro-Fitness-Manager\Macro-Fitness-Manager-\). Run all commands from there.
- v3 uses its OWN Supabase project. Never point v3 at the v2/production Supabase project (sqpklcwtfukpuhhdbcus).

## Non-negotiable product rules
- Zero hardcoding: every user value (macros, splits, meal frequency, cardio type, metrics, rotation frequency) is user-defined or set by Coach. No hardcoded user data, targets, or defaults presented as user data.
- Cardio is never limited to Zone 2.
- Coach must be able to update anything the user can.

## Database
- All schema changes are new migration files in supabase/migrations. Never edit an existing migration. Never change schema through the dashboard.
- Every new table has RLS enabled with policies.
- Service role key is server-only. Never prefix with NEXT_PUBLIC, never import into client code.

## Secrets
- Never commit .env files or any key. The repo is PUBLIC.
- If a task needs a new secret, stop and ask Derak to add it.

## Claude model strings
- When changing a model string, grep the whole repo and update every occurrence.

## Phase workflow
- Work in the phases and steps given in the prompt. Do not start the next phase without approval.
- After each step, ALL gates must pass: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- After gates pass: a reviewer subagent checks the step's diff against its acceptance criteria. Fix findings, re-run gates.
- Then commit with message "Phase X.Y: <summary>" and push to v3.
- If a gate fails twice after fixes, or something needs a decision, STOP and report. Do not work around it.
- Targeted changes only. No refactors or "improvements" outside the step's scope.

## Restarting the dev server (Windows)
- Stop ONLY the process listening on port 3000 (find its PID, kill that PID). Never kill all node processes.
- Delete the .next folder, then `npm run dev`.
- A stale .next cache causes blank pages; this restart fixes it.
