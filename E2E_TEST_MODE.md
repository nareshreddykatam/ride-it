# Development-only E2E Auth Bootstrap (Phase 20)

## Why this exists

Ridora's production authentication is phone OTP through Supabase Auth
(unchanged, unmodified by this feature — see
`packages/auth/src/phone-otp.ts`). The real hosted Supabase project has
no funded SMS provider, which has blocked real hosted end-to-end testing
of the Passenger/Driver lifecycle since Phase 17. This feature provides
a **development-only** way to obtain genuine Supabase Auth sessions for
two dedicated, clearly-marked throwaway test accounts, using Supabase's
own officially-documented Admin API — not a fabricated session, not a
bypass of Supabase Auth, and not a change to how real users sign in.

## How it works, precisely

1. `supabase.auth.admin.createUser({ email, phone, password, email_confirm: true, phone_confirm: true, user_metadata: {...} })` —
   a real, standard Supabase Admin API call, run **only** server-side
   (`packages/supabase/src/e2e.ts`), using the service-role key, which
   never reaches the browser.
2. `supabase.auth.signInWithPassword({ email, password })` — a real,
   standard Supabase Auth method, run against the normal anon-key
   session client. The resulting session is a genuine GoTrue session,
   indistinguishable from a real OTP login to PostgREST, RLS, RPCs, or
   Realtime.

   **Why email, not phone, for sign-in**: signing in with
   `signInWithPassword({ phone, password })` still requires Supabase's
   Phone provider to be enabled on the hosted project, and enabling that
   provider at all requires configuring an SMS provider (Twilio, Vonage,
   MessageBird, TextLocal) — even though no SMS is ever sent for a
   password-based sign-in. Email/password has no such dependency, which
   is the entire reason this feature can work with zero SMS provider
   configured.

   **Why a phone value is still set on the E2E user, even though it's
   not used for sign-in**: `handle_new_auth_user()` (unmodified) infers
   the role as passenger/driver when the new user has a non-null phone;
   only when phone is null and email is present does it fall through to
   an admin-inference branch. An E2E user created with only an email
   would be misclassified as an admin. Rather than modify that
   security-sensitive trigger, the bootstrap still sets a deterministic
   test phone so E2E users take the same safe branch a real signup
   would — the admin-inference branch is never reached, by construction.
3. The existing, **unmodified** `handle_new_auth_user()` trigger
   provisions the matching `passengers`/`drivers` row exactly as it
   would for a real signup, because the test user's `user_metadata`
   carries the same `role`/`vehicle_type` shape a real signup would.
4. For the Driver account only: a narrowly-scoped RPC
   (`e2e_provision_driver_readiness`, migration
   `20260820090300_e2e_driver_readiness.sql`, unchanged by this
   revision) grants approval and an active subscription — but **only**
   for a metadata-marked E2E test user, checked directly in the
   database. It structurally cannot act on a real driver, regardless of
   who calls it. Going online remains the driver app's own real
   toggle — not performed by this bootstrap.

## Enabling E2E mode

Set these in your **local, non-production** `.env.local` for the
Passenger and/or Driver app:

```
RIDE_IT_E2E_TEST_MODE=true
RIDE_IT_E2E_PASSENGER_EMAIL=e2e-passenger@ride-it.test
RIDE_IT_E2E_PASSENGER_PASSWORD=<a deterministic test password>
RIDE_IT_E2E_PASSENGER_PHONE=<a made-up 10-digit test number, not a real phone number>
RIDE_IT_E2E_DRIVER_EMAIL=e2e-driver@ride-it.test
RIDE_IT_E2E_DRIVER_PASSWORD=<a deterministic test password>
RIDE_IT_E2E_DRIVER_PHONE=<a different made-up 10-digit test number>
```

`ride-it.test` uses the `.test` top-level domain, which is permanently
reserved (RFC 2606) and will never resolve to a real mailbox — any
similarly reserved test domain works.

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
configured test email addresses (or the test phone numbers — both are
set on the same account) and delete them — this cascades to their
`passengers`/`drivers` rows via the existing foreign key relationships,
the same as deleting any other user. There is no separate cleanup
mechanism to run; nothing about these accounts is special at the
database level beyond their `e2e_test_user` metadata marker.

## What this does NOT do

- Does not change the phone-OTP UI, `signInWithOtp`, or `verifyOtp` in
  any way.
- Does not require Supabase's Phone provider to be enabled, or any SMS
  provider (Twilio, Vonage, MessageBird, TextLocal) to be configured —
  sign-in uses email/password specifically to avoid this dependency.
- Does not weaken any RLS policy, trigger, or existing SECURITY DEFINER
  function.
- Does not expose the service-role key, or any secret, to any client
  bundle — verified directly (see `PHASE_20_E2E_VALIDATION_REPORT.md`).
- Does not let a real user's account be used as, or converted into, an
  E2E test account.
