# Phase 0 Report — Foundation (v3)

Run on 2026-11-22 on branch `v3`, following `docs/phases/phase-0.md` and `CLAUDE.md`. Phase 0 is complete. Phase 1 has not been started.

## Commits

| Commit | Step | CI on GitHub |
|---|---|---|
| `5d5a6be` | Phase 0.3: add Vitest and Playwright test tooling | — (CI was added in 0.4) |
| `643b1c1` | Phase 0.3: self-host DM Sans and Bebas Neue to fix flaky builds (extra step, approved by Derak) | — |
| `b8b98b8` | Phase 0.4: add CI workflow (lint, typecheck, test, build) | run 45068910447: success |
| `2525f15` | Phase 0.5: add v3 inventory report | run 45070401441: success |
| this commit | Phase 0: add phase-0 report | runs on push |

Steps 0.1 and 0.2 were checks only, so they changed no files and have no commit.

## Step 0.1 — Confirm setup

- The path ends in `\03_v3`, the branch is `v3`, and it is up to date with `origin/v3`.
- `node_modules` was already present, so `npm ci` was not needed.
- `.env.local` exists. `NEXT_PUBLIC_SUPABASE_URL` points at the v3 project (`wuihixnwjbjewzprdacz`), not production (`sqpklcwtfukpuhhdbcus`).
- **Stopped once: the working tree was not clean.**
  - An untracked `.env.loca` was present, a typo'd copy of `.env.local`.
  - `.gitignore` does not ignore it, because it only matches `.env*.local`, and the repo is public.
  - Its Supabase values matched `.env.local`, but its `ANTHROPIC_API_KEY` was different.
  - Derak chose to move it out of the repo. It is now at `C:\Users\dokal\env-loca-backup.txt`, and the tree was clean afterwards.
  - If that other Anthropic key is still active and unused, revoke it.

## Step 0.2 — Verify the v3 database

Checked through the Supabase connector with read-only calls against `wuihixnwjbjewzprdacz` only. No Supabase CLI was used, and `lib/types/index.ts` was not regenerated.

- **Project:** `macro-fit-v3` is `ACTIVE_HEALTHY`, running Postgres 17.
- **Migrations:** 5 applied, with versions assigned by the connector. Their names match the 5 files in `supabase/migrations`. They were applied in a different order from the file timestamps (`coach_conversations` before `meal_plan_archive_columns`). As instructed, this was not reconciled.
- **Tables:** 16 tables in `public`, all with RLS enabled.
- **Security advisors:** none reported.
- **Acceptance met.**
  - `npm run dev` was ready in 1.8 s.
  - `GET /login` returned 200 and rendered the email/password form.
  - `GET /` redirected to `/login` with a 307.
  - The server log showed no errors, only a Browserslist "data is old" notice and a webpack cache performance hint.

## Step 0.3 — Test tooling

**Tooling**
- Added Vitest 4.1.12 and @playwright/test 1.65.0 (Chromium) as devDependencies.
- They were installed with `npm install --before=2026-11-08`, so every new package and transitive dependency is at least 14 days old.
- Vitest 5 was not used, because its `@types/node` peer range (`^22 || >=24`) conflicts with the repo's existing `@types/node` `^20`.
- Scripts: `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:e2e` (`playwright test`).

**Unit tests (26 across 4 files)**, all on real pure logic:
- `lib/dashboard/preferences.test.ts` covers macro target parsing.
- `lib/dashboard/utc-day.test.ts`, `lib/meals/week.test.ts` and `lib/program-week.test.ts` cover the date logic.
- `lib/dashboard/workout-schedule.ts` was deliberately left untested. It hardcodes a fallback of 4 training days, which breaks the zero-hardcoding rule, and a test would lock that in.

**Smoke test:** `e2e/smoke.spec.ts` visits `/`, expects a redirect to `/login`, checks the heading, inputs and button, and fails on any `console.error` or uncaught page error.

**Gates:** lint, typecheck, test and test:e2e passed.

**The build was flaky, so I stopped and asked.**
- `npm run build` failed in 2 of 4 runs with no code changes. `next/font/google` (Next 14.2.35, `loader.js:112`) crashes when a Google Fonts response contains a font URL without a file extension.
- This was pre-existing and intermittent. 60 standalone fetches all returned normal `.woff2` URLs.
- Derak chose to self-host the fonts first (see the next section).

**Reviewer: PASS, with 4 nits.**
1. The trim test did not actually test trimming. Fixed.
2. The transitive lockfile bumps should be listed. Done in the commit message.
3. `reuseExistingServer` may reuse a stale dev server. Documented in `playwright.config.ts`.
4. Not changed:
   - The smoke test needs internet access for the runtime Google Fonts stylesheet.
   - A future Playwright-in-CI job will need the `NEXT_PUBLIC_*` placeholders.
   - Under TZ=UTC, which CI uses, the "UTC, not local" tests cannot catch a switch to local-time methods. They do catch it on this machine.

**Lockfile:**
- Vite 8's version ranges bumped transitive packages within semver: postcss 8.5.8→8.5.32, nanoid, source-map-js, tinyglobby and picomatch.
- `npm audit` went from 21 findings to 19. None were added.

### Extra step (approved by Derak) — self-host DM Sans and Bebas Neue

**What changed**
- `app/layout.tsx` now loads both fonts with `next/font/local`, with the same CSS variables and weights as before.
- `app/fonts/` holds the exact latin-subset `.woff2` files Google serves, plus each family's OFL license from `google/fonts`. Neither license declares a Reserved Font Name.

**Verification**
- An instrumented build made zero `next/font/google` requests. Every build since has passed: 10 local builds and both CI runs.
- The reviewer confirmed the font files are byte-identical to Google's.
- The reviewer returned CHANGES NEEDED because a code comment overclaimed. Next's legacy `optimizeFonts` still fetches the runtime Google `<link>` stylesheet during `next build`. The comment was reworded.
- That remaining fetch cannot fail a build: `node_modules/next/dist/server/font-utils.js:93-101` catches the error and only logs a warning.

**No visual change, and why.** Text renders with the "DM Sans" and "Bebas Neue" families loaded at runtime by the Google `<link>`. Those come first in every font stack (`app/globals.css:20-21`, `tailwind.config.ts:86-87`), ahead of the `next/font` variables. So the `next/font` copies were, and still are, effectively unused.

## Step 0.4 — CI gate

- **The workflow:** `.github/workflows/ci.yml` runs on every push to `v3` and on pull requests.
  - Steps: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - It runs Node 24 with `actions/checkout@v7` and `actions/setup-node@v7` (npm cache).
  - It sets `permissions: contents: read` and `persist-credentials: false`.
  - Playwright is not run.
- **Placeholders only, no secrets needed.**
  - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set to obvious fake values.
  - Before pushing, I ran the whole job in a clean copy of the repo without `.env.local`, with only those placeholders. `npm ci`, lint, typecheck, test and build all passed.
  - The reviewer repeated this independently from `git archive HEAD` with `TZ=UTC`, and it also passed.
  - So no GitHub Actions secrets need to be added.
- **Gates:** all four passed.
- **Reviewer: PASS, with 2 nits.**
  1. `cancel-in-progress: true` would also cancel `v3` push runs. Fixed: only superseded PR runs are cancelled, so every `v3` push keeps its own result.
  2. Pin actions to commit SHAs. Not done: this is optional hardening, and the workflow has a read-only token and no secrets.
- **Acceptance met:** run [45068910447](https://github.com/dokallen/Macro-Fitness-Manager-/actions/runs/45068910447) on `b8b98b8` succeeded, with every step green.

## Step 0.5 — Inventory report

- **`docs/v3-inventory.md`**, verified from the code, with a file path on every claim.
  1. Body composition tracking: **PARTIAL**
  2. Changing the workout program after setup: **MISSING**
  3. Recipe-to-meal-plan flow: **MISSING**
  4. Meal-plan auto-rotation: **PARTIAL**
  5. Hardcoded user values: **10 violations, 9 borderline**
  6. Model strings: `claude-sonnet-4-6` in 10 places across 7 files, all unchanged.
- **How it was built.**
  - Three read-only research agents gathered the evidence.
  - I checked the load-bearing claims against the code myself before writing.
  - Item 6 I did myself, with a repo-wide grep and the Claude API model reference: `claude-sonnet-4-6` is Active, and the current Sonnet is `claude-sonnet-5-5`.
- **Reviewer: CHANGES NEEDED.**
  - It checked about 130 `path:line` references.
  - It found 2 that pointed at the wrong code, 5 claims that were false or imprecise, and 2 blockers:
    1. The auth middleware redirects cron requests to `/login`, so the cron routes never run. Item 4 was rewritten and a cross-cutting finding added.
    2. Item 2 was changed from PARTIAL to MISSING, because no working path exists after setup.
  - Other corrections:
    - Onboarding answers can't be changed after onboarding.
    - The home page's weight keys are never written.
    - Push notifications ignore the chosen coach, added as violation 10.
    - Several line references were fixed.
    - The localStorage list was expanded.
    - `.env.example` is missing `CRON_SECRET` and the `VAPID_*` keys.
    - A remark about the local `.env.local` that couldn't be verified was removed.
  - I checked every correction against the code before applying it, then reran the gates. All passed.

## Things to know (outside Phase 0 scope, nothing changed)

1. **Cron jobs cannot run.** Vercel Cron requests carry no Supabase session, so `lib/supabase/middleware.ts:85-94` redirects them to `/login` before the `/api` exemption at `:97-99`.
   - This disables meal-plan rotation and every push notification on v3.
   - If v2 production has the same middleware, its crons are dead too. I did not check, because v2 is off-limits.
2. **Security: `next@14.2.35` carries 1 critical and several high npm advisories.** Examples: "Unauthenticated Remote Code Execution on windows-hosted servers", Image Optimization RCEs, middleware bypass and cache poisoning. Production v2 probably runs the same version, so plan a Next.js upgrade. `zod` and `eslint-config-next` also have high advisories.
3. **Macro targets and onboarding answers cannot be edited after onboarding.** Settings links to `/onboarding`, but the middleware redirects onboarded users away (`lib/supabase/middleware.ts:144-150`).
4. **Biggest product gaps** (details in `docs/v3-inventory.md`):
   - The Coach cannot write any user data.
   - There is no way to put a recipe into the meal plan.
   - The workout program cannot be changed after setup.
   - Rotation only sets a flag.
   - Push notifications store a date that becomes a fake macro target.
   - Time-based pushes almost never fire.
   - The free-form workout-builder chats probably fail on their first message.
5. **Environment variables:**
   - `.env.example` is missing `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_EMAIL`.
   - `.gitignore` ignores only `.env*.local`, which is how `.env.loca` slipped through. Consider `.env*` plus `!.env.example`.
6. **Fonts.** Choose one way to load fonts. Either use the self-hosted files through the CSS variables and drop the runtime Google `<link>`, or remove the unused `next/font` setup. The first option also removes the runtime dependency on Google, which the smoke test currently has. Adding `optimizeFonts: false` would stop the last non-fatal build-time Google request.
7. **Windows-only:** `.next/server/next-font-manifest.json` has an empty `app` map on Windows, so local builds emit no font preload tags. This is a Next.js path-separator quirk. Vercel and Linux builds are unaffected, and it was the same before this phase.
