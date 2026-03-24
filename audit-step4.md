# Step 4 audit

## Scope completed

- Added **Forgot password** flow from `/login` to `/forgot-password`.
- Added **Reset password** page at `/reset-password` using Supabase recovery session and `updateUser`.
- Added full **6-step onboarding** flow at `/onboarding`.
- Added middleware onboarding gate so authenticated users with `onboarding_complete = false` are redirected to `/onboarding` before other app routes.

## Key behavior

- `/login` now includes a `Forgot password?` link to `/forgot-password`.
- `/forgot-password` submits email to `supabase.auth.resetPasswordForEmail(..., { redirectTo: "<origin>/reset-password" })`.
- `/reset-password` validates recovery session and allows setting a new password.
- After signup, if user is authenticated but onboarding is incomplete, middleware redirects to `/onboarding`.
- On onboarding completion, app sets `users.onboarding_complete = true` and redirects to `/`.

## Files created

- `app/(auth)/forgot-password/layout.tsx`
- `app/(auth)/forgot-password/page.tsx`
- `app/(auth)/reset-password/layout.tsx`
- `app/(auth)/reset-password/page.tsx`
- `app/(app)/onboarding/layout.tsx`
- `app/(app)/onboarding/page.tsx`
- `components/onboarding/OnboardingWizard.tsx`

## Files modified

- `app/(auth)/login/page.tsx`
- `lib/validations/index.ts`
- `lib/supabase/client.ts`
- `lib/supabase/middleware.ts`

## Validation & middleware references

- Forgot-password schema and reset-password schema in `lib/validations/index.ts`.
- Onboarding step schemas (Steps 1-6) in `lib/validations/index.ts`.
- Public/auth/onboarding route logic in `lib/supabase/middleware.ts`:
  - unauthenticated -> `/login` for non-public routes,
  - authenticated + auth-entry routes -> `/` or `/onboarding` based on `onboarding_complete`,
  - authenticated + incomplete onboarding -> forced `/onboarding`.

## Onboarding data persisted

On finish, wizard writes:

- `users.display_name`
- `users.onboarding_complete = true`
- `user_preferences` entries for:
  - goal
  - meals per day
  - meal plan rotation
  - cardio type
  - cardio frequency
  - cardio metric keys (JSON string)
  - progress metric keys (JSON string)
  - any user-defined macro key/value pairs
- `workout_splits` rows from user-defined day names and training-day count.

## Build verification

- `npm run build` passes successfully after changes.
- Routes generated include: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/onboarding`, and `/`.
