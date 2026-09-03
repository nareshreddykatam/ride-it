# Ridora — Monorepo

Ridora is a Bike/Auto/Scooty/Car ride-hailing platform. Drivers pay a flat
subscription instead of a per-ride commission; passengers book, pay by
cash or driver UPI (with Razorpay online payment as an option), and rate
their ride. See `packages/ui/DESIGN_SYSTEM.md` for the visual design
rationale.

## Architecture

- **Passenger** (`apps/passenger`) — Next.js PWA. `app.ridora.in`
- **Driver** (`apps/driver`) — Next.js, with Capacitor configured for a
  future native shell (background location + push need OS-level access a
  plain PWA can't reliably provide — no native `android`/`ios` project has
  been generated yet). `driver.ridora.in`
- **Admin** (`apps/admin`) — Next.js, desktop-first internal tool.
  `admin.ridora.in`
- **Marketing** (`apps/marketing`) — Next.js, SEO/SSR-focused static site.
  `ridora.in`
- **Backend** — Supabase (Postgres + PostGIS, Auth, RLS, RPCs, Realtime,
  Storage, Edge Functions). There is no separate application server —
  every app talks to Supabase directly (`packages/supabase`) under RLS,
  with narrow SECURITY DEFINER RPCs (`packages/data`) for anything that
  needs elevated/trusted logic (pricing, matching, payments, ride
  lifecycle, referrals, driver verification).
- **Auth** — Supabase Auth. Email OTP via Resend SMTP; phone OTP via a
  Supabase Auth Send SMS Hook backed by MSG91 (`supabase/functions/send-sms-hook`).
  One Supabase Auth identity can hold a passenger profile, a driver
  profile, or both.
- **Maps** — MapLibre GL + self-hosted OpenFreeMap tiles as the primary
  map; Google Maps (Places/Geocoding/Routes) for search, geocoding, and
  route/ETA calculation where configured, with an honest offline/mock
  fallback (`packages/maps`) when no map provider is reachable.
- **Pricing** — server-authoritative: `_calculate_fare()` (Postgres) is
  the single source of truth for both the pre-ride fare quote
  (`get_fare_quote()` RPC) and the fare actually charged at ride creation
  (`compute_ride_fare()` trigger on `rides`). Never recomputed
  client-side.
- **Payments** — Cash, Driver UPI (with a dynamic per-driver QR), and
  Razorpay for online payment. Driver subscriptions are also billed
  through Razorpay.

All four apps share `packages/ui` (design system + components),
`packages/types` (domain types matching the product's exact enums/
lifecycles), `packages/auth` (Supabase Auth context, role/capability
guards, middleware), `packages/data` (typed Supabase queries/RPC
wrappers — the real data layer), `packages/maps`, and `packages/payments`.

## Getting started

```bash
pnpm install
pnpm dev            # runs all four apps via turbo
pnpm dev:passenger  # http://localhost:3001
pnpm dev:driver     # http://localhost:3002
pnpm dev:admin      # http://localhost:3003
pnpm dev:marketing  # http://localhost:3004
```

Each app needs its own `.env.local` — copy the matching `.env.example` in
that app's folder and fill in real values from the Supabase dashboard
(see `.env.example.md` at the repo root for the full variable reference).
Marketing needs no environment variables.

## Database

`supabase/migrations` is the full, ordered migration history for the live
Ridora Supabase project — applied in order, never rewritten. `supabase/seed.sql`
seeds lookup data (cities, pricing rules, etc.) for a fresh environment.
See `.github/workflows/ci.yml` for how the migration chain is validated
against a real Postgres+PostGIS container on every push/PR.

## E2E test mode

For local development without a funded SMS provider, see `E2E_TEST_MODE.md`.

## Historical documentation

`docs/archive/` holds phase-by-phase implementation/review reports written
during the platform's build-out (pre-Ridora-rebrand naming in some of
these is expected — they're a historical record, not current branding).
