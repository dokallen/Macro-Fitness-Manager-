# Phase 0 — Foundation (v3)

Read CLAUDE.md first and follow it. This is Phase 0 of Macro Fit v3: foundation only, no feature work. Work on branch v3. Run each step, pass all gates, run the reviewer subagent, commit, push, then continue to the next step automatically. Stop at the end of Phase 0.

## Step 0.1 — Confirm setup
- Confirm the working directory is the 03_v3 folder (path ends in `\03_v3`), the current branch is v3, and the working tree is clean. If not, stop.
- Confirm node_modules exists (run `npm ci` if it does not).
- Confirm .env.local exists and NEXT_PUBLIC_SUPABASE_URL does NOT contain "sqpklcwtfukpuhhdbcus". If it does, stop and tell Derak v3 is pointed at production.

## Step 0.2 — Build the v3 database from migrations
- Using the Supabase CLI, link to the v3 Supabase project and apply all files in supabase/migrations in order. If the CLI needs a password or login, stop and ask Derak.
- Regenerate Supabase TypeScript types against the v3 project.
- Acceptance: every migration applied without error; the app starts and the login page loads against the v3 database.

## Step 0.3 — Test tooling
- Add Vitest (unit tests) and Playwright (end-to-end).
- Add package.json scripts: "typecheck" (tsc --noEmit), "test" (vitest run), "test:e2e" (playwright test).
- Write a small set of real unit tests for existing pure logic in lib/ (macro math, date logic, or similar — pick what exists). No placeholder tests that assert true.
- Write one Playwright smoke test: app loads, login page renders without console errors.
- Acceptance: npm test and npm run test:e2e pass locally.

## Step 0.4 — CI gate
- Add a GitHub Actions workflow running on every push to v3 and on pull requests: npm ci, lint, typecheck, test, build.
- Use placeholder values for NEXT_PUBLIC_* env vars in CI. If the build cannot pass without real values, stop and tell Derak which GitHub Actions secrets to add. Never put real keys in the workflow file.
- Do not run Playwright in CI yet.
- Acceptance: workflow passes on GitHub after the push.

## Step 0.5 — Inventory report
- Create docs/v3-inventory.md, verified from the actual code (not commit messages). For each item, state BUILT / PARTIAL / MISSING with file paths and what's left:
  1. Body composition tracking (visceral fat, muscle mass, body fat %, skeletal muscle %, BMR, metabolic age, trends)
  2. Changing the workout program after initial setup
  3. Recipe-to-meal-plan flow (macro-friendly recipes into the meal plan)
  4. Weekly meal plan auto-rotation (route, cron, CRON_SECRET handling)
  5. Any hardcoded user values still present anywhere
  6. Every Claude model string and where it appears (report only, do not change)
- Acceptance: every claim has a file path.

## End of Phase 0
- Write docs/phase-0-report.md: what was done per step, gate results, reviewer findings and fixes, anything you stopped on.
- Commit and push. Stop. Do not start Phase 1.
