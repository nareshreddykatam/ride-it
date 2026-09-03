# Ride It — Authentication Review (Phase 4)

No UI was redesigned. Every screen's layout, spacing, colors, typography,
and animation is pixel-identical to before this phase — only internal
logic changed (fake `setTimeout` stubs replaced with real Supabase calls),
plus one genuinely new screen (Admin Login) that didn't exist to "keep
unchanged" in the first place.

## What was built

| Requirement | Where |
|---|---|
| Passenger OTP auth | `apps/passenger/app/(auth)/{login,verify}` wired to `@ride-it/auth`'s `requestPhoneOtp`/`verifyPhoneOtp` |
| Driver OTP auth | Same, `apps/driver/app/(auth)/{login,verify}` |
| Admin email/password auth | **New** `apps/admin/app/(auth)/login` (see below), wired to `signInAdminWithPassword` |
| Protected routes | Two layers: `middleware.ts` per app (server, primary) + `<RequireRole>` per protected layout (client, secondary) |
| Session management | Handled by `@supabase/ssr`'s cookie-based storage (from Phase 2) + `updateSession()` refreshing it every request |
| Logout | Wired on the existing "Log out" buttons in Passenger/Driver Profile and added to Admin's sidebar (which had no logout control at all before) |
| Role-based access control | Each app's middleware checks `public.users.role` against the app's required role; mismatches are signed out and redirected, not silently allowed |
| Reusable hooks/providers | New `@ride-it/auth` package: `AuthProvider`, `useAuth`, `useRequireRole`, `RequireRole`, `createAuthMiddleware` |
| Session persistence | Native to `@supabase/ssr` — no custom code needed, verified the pattern is wired correctly |
| Loading/auth states | `useAuth().loading` (true only during initial session check); `RequireRole` renders nothing until authorized, avoiding a flash of protected content |
| Error handling | Every real Supabase error is caught and surfaced through the **same existing error-text elements** each screen already had (no new error UI was invented) |
| Isolation from business logic | `@ride-it/auth` has exactly one dependency: `@ride-it/supabase`. It does not import `@ride-it/api-client`, `@ride-it/types` ride/subscription types, or anything ride/business-related |

---

## Architecture

```
packages/
├── supabase/          (Phase 2 — unchanged except one addition)
│   └── src/middleware.ts   [NEW] generic session-refresh for Next.js middleware
└── auth/               [NEW PACKAGE — Phase 4]
    ├── types.ts             AppRole, AuthProfile
    ├── phone-otp.ts         requestPhoneOtp / verifyPhoneOtp (Passenger + Driver share this)
    ├── admin-auth.ts        signInAdminWithPassword (sign-in only, no self-serve signup)
    ├── context.tsx          AuthProvider + useAuth
    ├── hooks.tsx             useRequireRole + <RequireRole>
    ├── middleware.ts         createAuthMiddleware(options) — role-gating factory
    └── index.ts              barrel (excludes middleware.ts — see isolation note below)
```

**Why a new `@ride-it/auth` package instead of adding to `@ride-it/supabase`:**
`@ride-it/supabase` is generic Supabase infrastructure — it has no opinion
about Ride It's roles, OTP-vs-password split, or redirect targets. Auth
*flows* (phone OTP with role metadata, admin password sign-in, role-gated
middleware) are Ride It-specific product decisions layered on top of that
infrastructure. Keeping them in a separate package is the same "isolated,
single-purpose package" pattern already established by
`@ride-it/types`/`@ride-it/utils`/`@ride-it/supabase` in Phases 1–2 — Phase
4 continues that pattern rather than introducing a new one.

**The `middleware.ts` exclusion-from-barrel pattern, again:** exactly like
`@ride-it/supabase`, `@ride-it/auth`'s root export deliberately omits
`middleware.ts` (which pulls in `next/server`, edge-runtime-only) — it's
imported from `@ride-it/auth/middleware` instead, so it can never
accidentally end up in a Client Component bundle.

---

## How the three auth flows actually work

### Passenger & Driver (phone OTP)
Identical mechanism, differing only by a `role` string passed as Supabase
Auth user metadata:

```
Login screen → requestPhoneOtp(supabase, phone, "passenger" | "driver")
             → supabase.auth.signInWithOtp({ phone, options: { data: { role } } })
Verify screen → verifyPhoneOtp(supabase, phone, code)
              → supabase.auth.verifyOtp({ phone, token, type: "sms" })
              → on success, auth.users row is created/confirmed by Supabase
              → the on_auth_user_created trigger (new migration, see below)
                fires, creating the matching public.users(+passengers/drivers) row
```

Both apps' Login/Verify screens kept **every** existing visual element —
the only changes were: swap the `await new Promise(...)` stub for the real
call, and add one conditional error line using the exact same
`text-alert-red text-xs` class the screens already used for validation
errors.

### Admin (email/password)
```
Login screen → signInAdminWithPassword(supabase, email, password)
             → supabase.auth.signInWithPassword({ email, password })
```
Deliberately **sign-in only** — there is no `signUpAdminWithPassword`.
Admin accounts are expected to be provisioned out-of-band (a super admin
inserting a row into `admin_users`, or via the Supabase dashboard), not
through public self-registration. This matches how the `admin_users`
table's `admin_role_id NOT NULL REQUIRED` was already designed in Phase 3
— an admin account without a role assignment shouldn't be able to exist,
which self-serve signup can't guarantee.

**The Admin Login screen itself is new** — no login screen existed in the
Admin app at all before this phase (its root page just redirected straight
to `/overview` with a `TODO: gate behind admin auth` comment). Building it
was unavoidable to fulfill "implement Admin email/password authentication."
It was built using **only** the existing input/button visual patterns
already established in the Passenger/Driver login screens (same
`border-border` + `focus-within:ring-signal-blue` input treatment, same
`Button` component, same `font-display`/`text-ink-soft` type scale) — no
new visual language was introduced.

---

## Protected routes — two layers, on purpose

1. **`middleware.ts` (server, primary)** — runs before any page renders.
   Refreshes the session cookie, checks `public.users.role` against the
   app's required role, and redirects unauthenticated or wrong-role
   sessions to that app's login screen. A passenger session hitting the
   Driver app is **signed out**, not just redirected — it doesn't get to
   linger authenticated-but-blocked.
2. **`<RequireRole>` (client, secondary)** — wraps each protected layout
   (`(main)` in Passenger/Driver, `(dashboard)` in Admin). Covers the case
   where auth state changes *after* the initial server-rendered request
   (e.g. signed out in another tab) during client-side navigation, where
   middleware won't re-run for every link click.

Neither layer touches the actual page content or its layout — both either
render `children` unchanged or redirect away before anything paints.

---

## Database changes this phase required (and why)

One new migration, `20260804090000_auth_user_provisioning.sql`, on top of
the Phase 3 schema:

1. **`users.phone` relaxed from `NOT NULL` to conditionally required.**
   Phase 3's schema assumed every user has a phone (true for
   passengers/drivers, OTP-authenticated). Admins authenticate by email and
   have no phone at sign-in. Rather than leave the constraint contradicting
   the newly-added Admin flow, it's now enforced role-conditionally: `role
   = 'admin' → email required`, `role IN ('passenger','driver') → phone
   required` — still a real, DB-enforced rule, just correctly scoped. This
   is the one schema change in this phase, and it was necessary, not
   incidental — flagged here rather than buried in a migration file.

2. **`handle_new_auth_user()` trigger** — the standard Supabase pattern:
   when Supabase Auth creates an `auth.users` row (on first OTP verify or
   first admin sign-in), a trigger provisions the matching `public.users`
   row automatically, branching into `passengers` or `drivers` based on the
   `role` passed at sign-in. No `admin_users` branch — see above, admins
   aren't self-provisioned.

**Known gap, stated plainly:** driver sign-up doesn't collect
`vehicle_type` anywhere in the existing UI (the Documents screen has no
vehicle picker). The trigger defaults new drivers to `vehicle_type =
'auto'` if not supplied. This is a real gap, not a hidden assumption — a
future onboarding screen needs to let drivers set/correct this, and it's
out of this phase's scope (that's business-domain onboarding, not auth).

---

## Deliberate scope boundaries (per your "isolated from business logic" instruction)

- Passenger/Driver Profile screens' displayed name, phone, and rating are
  **still mock data** — I did not wire those to the real `profile` object
  `useAuth()` now provides. Doing so would mean this "auth phase" reaches
  into passenger/driver *business* profile data (rating, etc.), which
  blurs the isolation boundary you asked me to hold. Only the Log Out
  button (unambiguously an auth action) was wired.
- Driver Verify's post-login destination is still hardcoded to
  `/documents` for every sign-in, same as before. Branching returning,
  already-verified drivers straight to `/dashboard` requires reading
  `drivers.verification_status` — business/domain data, deliberately left
  for a later phase rather than reached into here.
- No password-reset flow for Admin — not requested, and forgot-password UX
  is a design decision (a new screen) I didn't want to introduce
  unprompted.
- `has_permission()` (the fine-grained admin RBAC function from Phase 3) is
  still not called anywhere — Phase 4 authenticates and identifies *that*
  someone is an admin; deciding *which* admin actions they can take remains
  the Admin app's application-layer responsibility, as already flagged in
  the Phase 3 review.

---

## What I could not verify

Same caveat as every phase so far, stated plainly rather than glossed
over: **this environment has no network access and no live Supabase
project**, so none of this — the trigger, the RLS policies interacting
with real sessions, the OTP round-trip, the middleware redirects — has
actually been executed. You already flagged before Phase 3 that you'd
validate the migrations with `supabase db reset` against a real local
instance; the same applies here, doubly so for auth: I'd specifically
recommend testing the full Login → Verify → protected-route → Logout loop
for all three apps against a real project before considering this
production-ready, since auth is exactly the kind of code where a subtle
runtime issue (a cookie not propagating, a redirect loop) won't show up
from reading the source.

---

Waiting for your review and approval before Phase 5.
