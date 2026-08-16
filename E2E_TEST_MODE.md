# Development-only E2E Auth Bootstrap (Phase 20)

## Why this exists

Ride It's production authentication is phone OTP through Supabase Auth
(unchanged, unmodified by this feature — see
`packages/auth/src/phone-otp.ts`). The real hosted Supabase project has
no funded SMS provider, which has blocked real hosted end-to-end testing
of the Passenger/Driver lifecycle since Phase 17. This feature provides
a **development-only** way to obtain genuine Supabase Auth sessions for
two dedicated, clearly-marked throwaway test accounts, using Supabase's
own officially-documented Admin API — not a fabricated session, not a
bypass of Supabase Auth, and not a change to how real users sign in.

## How it works, precisely

1. `supabase.auth.admin.createUser({ phone, password, phone_confirm: true, user_metadata: {...} })` —
   a real, standard Supabase Admin API call, run **only** server-side
   (`packages/supabase/src/e2e.ts`), using the service-role key, which
   never reaches the browser.
2. `supabase.auth.signInWithPassword({ phone, password })` — a real,
   standard Supabase Auth method for a phone-confirmed user, run against
   the normal anon-key session client. The resulting session is a
   genuine GoTrue session, indistinguishable from a real OTP login to
   PostgREST, RLS, RPCs, or Realtime.
3. The existing, **unmodified** `handle_new_auth_user()` trigger
   provisions the matching `passengers`/`drivers` row exactly as it
   would for a real signup, because the test user's `user_metadata`
   carries the same `role`/`vehicle_type` shape a real signup would.
4. For the Driver account only: a narrowly-scoped RPC
   (`e2e_provision_driver_readiness`, migration
   `20260820090300_e2e_driver_readiness.sql`) grants approval and an
   active subscription — but **only** for a metadata-marked E2E test
   user, checked directly in the database. It structurally cannot act on
   a real driver, regardless of who calls it. Going online remains the
   driver app's own real toggle — not performed by this bootstrap.

## Enabling E2E mode

Set these in your **local, non-production** `.env.local` for the
Passenger and/or Driver app:

```
RIDE_IT_E2E_TEST_MODE=true
RIDE_IT_E2E_PASSENGER_PHONE=<a made-up 10-digit test number, not a real phone number>
RIDE_IT_E2E_PASSENGER_PASSWORD=<a deterministic test password>
RIDE_IT_E2E_DRIVER_PHONE=<a different made-up 10-digit test number>
RIDE_IT_E2E_DRIVER_PASSWORD=<a deterministic test password>
```

`SUPABASE_SERVICE_ROLE_KEY` must already be set (same variable every
Route Handler in this project already uses — no new secret system was
introduced).

Both checks — `RIDE_IT_E2E_TEST_MODE === "true"` **and**
`NODE_ENV !== "production"` — are required together, redundantly, on
every function in `e2e.ts`. **This must never be set to `true` in any
production deployment.**

## Running Passenger/Driver test login

1. With E2E mode enabled and the app running (`pnpm dev` from that
   app's directory), open `/login`.
2. A clearly-marked "Development only — E2E test mode" panel appears
   below the real phone-entry form, with a "Sign in as E2E test
   passenger/driver" button. This panel is rendered by a **Server
   Component** that checks the flag server-side
   (`app/(auth)/login/page.tsx`) — when the flag is unset, this
   component is never included in the render tree, not merely hidden.
3. Clicking it calls `POST /api/e2e/login`, which bootstraps the account
   if needed and signs in, then redirects into the real, unmodified
   authenticated app.

## Disabling E2E mode

Unset `RIDE_IT_E2E_TEST_MODE` (or set it to anything other than
`"true"`). The button disappears from the rendered page, and
`/api/e2e/login` returns `404` — its own internal check runs before
anything else, independent of whatever route-level auth middleware also
applies.

## Deleting the test users

Via the Supabase Dashboard (Authentication → Users), search for the
configured test phone numbers and delete them — this cascades to their
`passengers`/`drivers` rows via the existing foreign key relationships,
the same as deleting any other user. There is no separate cleanup
mechanism to run; nothing about these accounts is special at the
database level beyond their `e2e_test_user` metadata marker.

## What this does NOT do

- Does not change the phone-OTP UI, `signInWithOtp`, or `verifyOtp` in
  any way.
- Does not weaken any RLS policy, trigger, or existing SECURITY DEFINER
  function.
- Does not expose the service-role key, or any secret, to any client
  bundle — verified directly (see `PHASE_20_E2E_VALIDATION_REPORT.md`).
- Does not let a real user's account be used as, or converted into, an
  E2E test account.
