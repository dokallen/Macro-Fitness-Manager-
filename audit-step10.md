# Step 10 audit — Coach chat page

## Branch

Work was performed on **`v2`** (confirmed via `git branch` before implementation).

## Files created

- `app/(app)/coach/page.tsx` — Guest gate; authenticated users get `CoachClient` with `userId`.
- `components/coach/CoachClient.tsx` — Loads `coach_messages` (ascending `created_at`), scrollable bubbles (user right / coach left), typing indicator, `POST /api/coach-chat` on send.
- `app/api/coach-chat/route.ts` — Inserts user row, loads preferences + full history, calls Claude, inserts coach row, returns updated message list.
- `lib/coach-chat-context.ts` — `buildCoachSystemPromptFromPreferences`: non-macro keys from `NON_MACRO_PREFERENCE_KEYS`, macro targets via `extractMacroTargets`, plus any other preference rows (all values from DB).
- `lib/coach-chat.ts` — `callCoachClaudeChat`: Anthropic Messages API, model **`claude-sonnet-4-20250514`** (same as `lib/coach-tip.ts`).
- `audit-step10.md` — This audit file.

## Files modified

- `app/(app)/layout.tsx` — **Coach** nav item (`/coach`, `MessageCircle`), mobile grid **6** columns, slightly tighter nav padding / label size; **`main`** and column wrapper **`min-h-0`** so the chat column can scroll inside the flex layout.

No other **pages** (route `page.tsx` files outside `(app)/coach`) were edited.

## Requirement mapping

| Requirement | Implementation |
|-------------|----------------|
| Claude Sonnet 4 20250514 | `lib/coach-chat.ts` `MODEL` constant. |
| History from `coach_messages` | Client `select` ordered `created_at` asc; API reloads same after send. |
| Send → user insert → Claude → coach insert | `POST` handler sequence; maps `coach` → `assistant` for API. |
| System prompt from `user_preferences` | `buildCoachSystemPromptFromPreferences` — no hardcoded user values. |
| Typing indicator | `CoachClient` `sending` + `TypingIndicator` (bouncing dots). |
| Newest at bottom | Ascending query + `scrollIntoView` on `bottomRef`. |
| Nav Coach + MessageCircle | `layout.tsx`. |
| Dark, bubbles, mobile-first | Tailwind `dark`, `bg-primary` / `bg-card`, `max-w-[85%]`. |

## Environment

- **`ANTHROPIC_API_KEY`** must be set (server-only), same as existing coach tip route.

## Notes

- Coach reply insert failure returns 500 without deleting the user message (user can retry or continue the thread).
- Long threads may approach model context limits; trimming history is a possible future optimization.
