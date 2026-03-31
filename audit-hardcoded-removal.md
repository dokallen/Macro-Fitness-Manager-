# Hardcoded user data removal audit

**Branch:** `v2` (confirmed before changes)

## Pre-change grep (PowerShell / ripgrep)

Pattern:

`Planet Fitness|2100|180g|1800|1900|Chicken breast|Isopure|Creatine|Greek yogurt|protein shake` in `*.tsx` / `*.ts`

**Results (before edits):**

| File | Match |
|------|--------|
| `components/supplements/SupplementsClient.tsx` | `Creatine Monohydrate`, `Isopure Vanilla Protein` (inside `PRESETS` array) |
| `components/meals/LogMealForm.tsx` | `placeholder="e.g. Greek yogurt"` |

**Note:** `LogMealForm.tsx` was **not** modified per instructions (meals pages are out of scope).

After removal work, the same grep on `SupplementsClient.tsx` shows **no** preset supplement strings.

## Scope: files not present in repo

- **`components/pantry/PantryClient.tsx`** — not found; no `PANTRY_STAPLES` / category arrays to remove.
- **`app/(app)/today/page.tsx`** — not found; no habits/water UI in this tree under that path.
- **`DEFAULT_HABITS` / `64` oz water defaults** — no matches in `*.tsx` / `*.ts` in this codebase (search for `DEFAULT_HABITS`, `PANTRY_STAPLES`, `water_goal`, `64oz`).

## `lib/coach-chat-context.ts`

**No code changes.** Review confirmed:

- User-facing numbers in the coach system prompt come only from `user_preferences` rows via `buildCoachSystemPromptFromPreferences`.
- `NON_MACRO_PREFERENCE_KEYS`, `extractMacroTargets`, and `extras` filtering already skip empty values.
- No hardcoded calorie/macro numbers (e.g. 2100, 180g) appear in this file.
- Coach roster entries are **personality/style** strings (allowed per your checklist), not user diet data.

## Files changed (values removed)

### `components/supplements/SupplementsClient.tsx`

**Removed:**

- Entire **`PRESETS`** constant (15 preset supplement names, including Creatine, Whey Protein, Isopure Vanilla Protein, etc.).
- **`addPreset`** and all “Choose from List” UI (tab bar + preset list).
- **`tab`** state (`list` | `custom`); only the custom add form remains in the bottom sheet.

**Behavior:** Stack is built only via **Add supplement** → custom fields (name, dosage, time of day, purpose).

### `components/journal/JournalClient.tsx`

**Removed:**

- **`TAGS`** constant (six preset quick-tag strings with emojis, e.g. “Crushed It”, “Meal Win”, etc.).
- Chip UI that selected among those presets.

**Added:** Optional free-text **Tag** input (no preset labels).

**Removed:** Hardcoded fallback sentence in the AI prompt error path (`fetchPrompt` catch no longer injects a template journal question).

**Note:** Existing saved entries keep their stored `tag` strings as-is in `localStorage`; only new UI defaults are blank-slate.

## Verification

- `npm run build` — **passes**
- Grep after change: no `PRESETS` / preset supplement names in `SupplementsClient.tsx`

## Checklist (from prompt)

- [x] Branch `v2` before changes
- [x] `PANTRY_STAPLES` — N/A (file absent)
- [x] `PRESETS` / preset list tab removed from supplements
- [x] `DEFAULT_HABITS` — N/A (not in codebase)
- [x] Water `64` default — N/A (no implementation found in allowed search)
- [x] `coach-chat-context.ts` — reviewed; no hardcoded user macro numbers; no edit required
- [x] Grep addressed matches in scope (supplements); meals placeholder left untouched by rule
- [x] `npm run build` passes
