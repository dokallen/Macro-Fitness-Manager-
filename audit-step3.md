# Step 3 audit — Auth pages & protected `(app)` routes

## Summary

- **`/login`** and **`/signup`** under `app/(auth)/` use React Hook Form + Zod (`lib/validations`) and the **browser Supabase client** (`createBrowserSupabaseClient` — publishable key only).
- **`lib/supabase/middleware.ts`** refreshes the session, then:
  - **No session** and path is **not** `/login` or `/signup` → **302** to `/login` (session cookies from refresh are copied onto the redirect response).
  - **Has session** and path **is** `/login` or `/signup` → **302** to `/` (home dashboard).
- **`app/(app)/`** routes (e.g. `/`) are protected by that rule: unauthenticated users never reach them without being redirected to `/login` first.
- **Root `middleware.ts`** delegates to `updateSession` with the same matcher as before (static assets excluded).
- **Toasts**: `sonner` via `SonnerToaster` in `app/layout.tsx`.
- **Home** (`app/(app)/page.tsx`): server-rendered, reads user with `createServerSupabaseClient()`, shows email + **`SignOutButton`**.

---

## Files created

| Path | Role |
|------|------|
| `app/(auth)/login/page.tsx` | Login form (`signInWithPassword`), links to `/signup` |
| `app/(auth)/login/layout.tsx` | Metadata: Sign in — Macro Fit |
| `app/(auth)/signup/page.tsx` | Signup form (`signUp` + optional `display_name` metadata), links to `/login` |
| `app/(auth)/signup/layout.tsx` | Metadata: Sign up — Macro Fit |
| `components/auth/SignOutButton.tsx` | Client: `signOut`, navigate to `/login`, `router.refresh()` |
| `components/ui/input.tsx` | Text input styled for forms |
| `components/ui/label.tsx` | Label styled for forms |
| `components/ui/sonner.tsx` | Client wrapper: `<Toaster richColors position="top-center" />` |
| `audit-step3.md` | This document |

---

## Files modified

| Path | Change |
|------|--------|
| `lib/supabase/middleware.ts` | Auth redirects + cookie forwarding after `getUser()` |
| `lib/validations/index.ts` | `loginSchema`, `signupSchema`, exported input types |
| `app/layout.tsx` | Renders `<SonnerToaster />` |
| `app/(app)/page.tsx` | Async server page: user email + `SignOutButton` |
| `package.json` / `package-lock.json` | Added `sonner` |

---

## Middleware behavior (reference)

- **Public paths (no login required):** `/login`, `/signup` only.
- **All other matched routes** (including `/`) require an authenticated Supabase user; otherwise redirect to `/login`.
- **Logged-in users** hitting `/login` or `/signup` are sent to **`/`**.

`matcher` (in `middleware.ts`): same pattern as Step 2 — skips `_next/static`, `_next/image`, `favicon.ico`, and common static image extensions.

---

## Environment

- Client and middleware use **`NEXT_PUBLIC_SUPABASE_URL`** and **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** only.
- No service role or secret keys in auth UI or middleware.

---

## `package.json` dependencies (relevant to Step 3)

```json
"dependencies": {
  "@hookform/resolvers": "^5.2.2",
  "@radix-ui/react-slot": "^1.2.4",
  "@supabase/ssr": "^0.9.0",
  "@supabase/supabase-js": "^2.99.3",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "lucide-react": "^0.577.0",
  "next": "14.2.35",
  "react": "^18",
  "react-dom": "^18",
  "react-hook-form": "^7.72.0",
  "server-only": "^0.0.1",
  "sonner": "^2.0.7",
  "tailwind-merge": "^3.5.0",
  "tailwindcss-animate": "^1.0.7",
  "zod": "^4.3.6"
}
```

(Full `package.json` in repo root includes `devDependencies` unchanged except lockfile.)

---

## Manual checks

1. Visit `/` while signed out → redirect to `/login`.
2. Sign in → land on `/`, see email + Sign out.
3. Visit `/login` or `/signup` while signed in → redirect to `/`.
4. Sign out → redirect to `/login`.
5. If email confirmation is enabled in Supabase, signup may show “Check your email” with no session until confirmed.
