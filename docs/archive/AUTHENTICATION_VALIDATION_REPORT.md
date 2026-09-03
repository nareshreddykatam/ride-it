# Ride It — Authentication Validation Report (Phase 4.5)

No new features were added. This was a static validation pass (read every
auth-related file, trace the logic, check for real bugs) plus targeted
fixes — I could not execute `next build`, run the apps, or hit a live
Supabase project in this environment (no network access here), so this is
the most thorough review possible without that, not a substitute for it.
**Running `supabase db reset` and an actual `pnpm build` across all four
apps against a real project remains the necessary next step before trusting
any of this in production** — same standing caveat as every phase, called
out with extra emphasis here because two of the issues found below are
exactly the kind that only surface at build/runtime, not from reading code.

## Summary: 4 real issues found, all fixed

| # | Issue | Severity | Fixed |
|---|---|---|---|
| 1 | Driver app: `output: "export"` + Middleware is a hard Next.js incompatibility — `next build` would fail outright | **Build-breaking** | ✅ |
| 2 | 3 screens used `useSearchParams()` without a Suspense boundary (Passenger Verify, Driver Verify, Admin Login) | Build-breaking under static export; deopts to client-only rendering otherwise | ✅ |
| 3 | Middleware: authenticated users landing on `/` (Passenger/Driver Splash) fell through to render Splash, which then client-redirected to `/login`, which middleware then redirected again — a confusing double-bounce | Logic bug, not build-breaking | ✅ |
| 4 | `handle_new_auth_user()` defaulted **any** account without explicit `role` metadata to `'passenger'` — including admin accounts created via the Supabase Dashboard, which won't have that metadata set unless someone remembers to add it | Data-integrity bug — silently misclassifies real admin accounts | ✅ |

---

## Task-by-task validation

### Passenger OTP flow
Traced `Login → requestPhoneOtp → signInWithOtp({ phone, options: { data: { role: 'passenger' } } })` and
`Verify → verifyPhoneOtp → verifyOtp({ phone, token, type: 'sms' })`. Phone
formatting (`+91` prefix) is applied consistently in exactly one place
(`toE164()` in `phone-otp.ts`) — confirmed no double-prefixing bug (Verify
screen passes the raw 10-digit number through, same as Login). Error paths
now surface real Supabase errors through the pre-existing error-text
elements. **Fixed:** missing Suspense boundary (issue #2).

### Driver OTP flow
Same mechanism, `role: 'driver'` + a `vehicle_type` default (`'auto'`) baked
into the metadata since no onboarding screen collects it yet (already
flagged in Phase 4's own review doc — still true, not new). Post-verify
routing to `/documents` preserved unchanged. **Fixed:** missing Suspense
boundary (#2), and the `output: "export"` conflict (#1) which would have
broken this app's build entirely regardless of the OTP logic being correct.

### Admin email/password flow
`signInAdminWithPassword → signInWithPassword({ email, password })` —
straightforward, no OTP-specific edge cases. **Fixed:** missing Suspense
boundary for the `?error=wrong_app` query param (#2). **Found a real gap**
in how admin accounts get their `role` set on first sign-in — see #4 above
and the "Admin provisioning" section below.

### Middleware redirects
Traced all three branches (`!user`, wrong role, already-authenticated-on-
public-path) for all three apps' path configs. **Fixed:** the `/`
double-bounce (#3). Confirmed the wrong-role branch actually calls
`supabase.auth.signOut()` before redirecting — a passenger session hitting
the Driver app doesn't linger authenticated-but-blocked, it's terminated.

### Protected routes
Two-layer design confirmed intact: `middleware.ts` (server, runs before any
page renders) + `<RequireRole>` (client, catches auth-state changes between
client-side navigations). Confirmed `RequireRole` renders `null` while
unauthorized rather than flashing protected content.

### Session persistence
Confirmed `@supabase/ssr`'s cookie-based storage is used consistently
(browser client via `createBrowserClient`, server/middleware via
`createServerClient` with the shared cookie adapter) — no competing
storage mechanism. **Found, did not fix (documented instead):**
`packages/api-client/src/http.ts` still reads a `"ride-it:access-token"`
key from `localStorage` — leftover from before Supabase was integrated,
never actually written to by anything, so it's dead code (always returns
`null`) rather than an active conflict, but worth cleaning up before
`api-client` is wired to anything real. See Technical Debt below.

### Logout behavior
Wired in three places: Passenger Profile, Driver Profile (both pre-existing
buttons, only the handler was added), and Admin's sidebar (newly added
control — Admin had no logout anywhere before). All three call the same
`signOut()` from `@ride-it/supabase/auth`, then `router.push("/login")`.
Confirmed `AuthProvider`'s `onAuthStateChange` listener clears local
`user`/`profile` state on sign-out independent of the manual redirect, so
state can't go stale even if the redirect were somehow interrupted.

### Role-based access
Confirmed at two levels: **app-level** (middleware checks
`public.users.role` against the app's required role) and **row-level**
(Phase 3's RLS policies gate on `is_admin()` / owner-id checks
independently of app-level middleware — so even if middleware were somehow
bypassed, RLS is a second, independent enforcement layer, not just
defense-in-depth theater). `has_permission()` (fine-grained admin
permissions) is still correctly unused at this layer, per the boundary
already documented in Phase 3/4.

### Server/client authentication boundaries
Ran a full-repo grep for actual import statements (not just string
matches — the first pass had false positives from doc comments explaining
the isolation pattern, re-checked precisely). **Confirmed clean:**
`@ride-it/supabase/server` has zero importers anywhere (expected — no
Server Component/Route Handler auth reads exist yet); `@ride-it/auth/middleware`
and `@ride-it/supabase/middleware` are imported *only* by the three
app-root `middleware.ts` files and by `@ride-it/auth/middleware.ts` itself.
No client bundle can accidentally pull in `next/headers` or `next/server`.

### Production build review
Could not run an actual `next build` (no `node_modules`, no network in this
environment). Did the next-best thing: read every config file and every
`useSearchParams`/`useRouter`/`"use client"` boundary by hand against known
Next.js 14 App Router constraints. Found and fixed #1 and #2 above — both
would have failed a real build. Everything else (Suspense placement,
server/client boundaries, middleware matchers) checked out on inspection,
but **this class of bug is exactly what static reading can miss** — a real
`pnpm build` pass is the honest next step, not optional.

---

## Admin provisioning — the two-step requirement, made explicit

Because there's no self-service admin sign-up (by design, per Phase 4), an
admin account needs **two** separate things to actually work, and both are
manual:

1. An `auth.users` row with `role` inferable as `'admin'` — now more robust
   after fix #4 (infers `admin` when email is present and phone isn't, even
   without explicit metadata), but explicit `user_metadata: { role: "admin" }`
   at creation time is still the reliable path.
2. A corresponding `public.admin_users` row with a valid `admin_role_id` —
   **this is not automated by any trigger, on purpose** (Phase 3/4 both
   flagged this as deliberate — self-provisioning a role would defeat the
   point of RBAC). Without it, `is_admin()` returns false and every RLS
   policy gating on it blocks the account, even though app-level middleware
   would let them in based on `public.users.role` alone.

Practical consequence: an admin who passes the app's login screen but sees
an empty/broken dashboard almost certainly has step 1 but not step 2. This
was always true by design; it just wasn't spelled out this explicitly
before. Worth a short internal runbook note before onboarding real admins.

---

## Remaining risks / technical debt (not fixed — flagged for a decision)

- **`packages/supabase/src/types.ts` is still the Phase 3 placeholder**
  (`Tables: Record<string, never>`). Several call sites (`context.tsx`,
  `middleware.ts`) work around this with explicit `as` type assertions
  rather than relying on inferred row types. This isn't wrong, but it means
  TypeScript isn't actually catching column-name typos against the real
  schema right now. Once `supabase gen types typescript` is run against a
  real project, those casts should be removed — and doing so will likely
  surface whether any of them were silently wrong.
- **`packages/api-client`'s old auth stubs (`authApi.requestOtp`/`verifyOtp`)
  are now fully dead code** — confirmed zero call sites anywhere. They
  predate the real `@ride-it/auth` package and were never removed. Same for
  the stale `localStorage` token read in `http.ts`. Neither is actively
  harmful (both are simply unused), but both are stale assumptions that
  could mislead someone reading `api-client` later into thinking there's a
  separate custom-backend auth scheme still in play. Recommend deleting the
  dead stub functions and reworking `getAccessToken()` to read the Supabase
  session instead, whenever `api-client` is first actually wired to a real
  endpoint (Phase 5+), rather than as a change bundled into this validation
  pass.
- **Driver app's static-export/Capacitor question is deferred, not
  resolved.** Removing `output: "export"` fixed the immediate build
  conflict, but the underlying decision (how does the Driver app actually
  ship as a native app, given middleware-based auth needs a live server)
  still needs a real answer before native build work starts. Flagged
  in-line in `next.config.mjs` and `capacitor.config.ts` so it isn't
  silently rediscovered later.
- **Env vars are now a hard runtime requirement for every app**, not an
  optional nice-to-have — `middleware.ts` calls `getSupabaseUrl()`/
  `getSupabaseAnonKey()` on every single request (even to public paths like
  `/login`), and those throw immediately if unset. This is correct fail-closed
  behavior (a misconfigured app refuses to run rather than silently
  skipping auth), but it's a meaningful change from before this phase, when
  every app ran with zero configuration. Worth flagging so it isn't a
  surprise the first time someone runs `pnpm dev` without a `.env.local`.
- **Nothing in this phase has been executed.** Repeating this deliberately:
  the OTP round-trip, the trigger firing correctly on first sign-in, the
  RLS policies actually behaving as designed under a real session, cookie
  propagation timing between `verifyOtp()` and the subsequent middleware
  check — all of this is *reasoned through*, not *observed*. A real test
  pass against a live Supabase project is the only thing that converts
  "should work" into "works."

---

Waiting for your review and approval before Phase 5.
