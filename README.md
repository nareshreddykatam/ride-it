# Ride It — Monorepo

Built from the Master/Passenger/Driver/Admin PRDs. See `packages/ui/DESIGN_SYSTEM.md`
for the visual design rationale.

## Locked architecture decisions
- **Passenger**: Next.js PWA
- **Driver**: Next.js + Capacitor native shell (background location + push
  notifications need OS-level access a plain PWA can't reliably provide)
- **Admin**: Next.js, desktop-first, internal tool
- **Marketing**: Next.js, SEO/SSR-focused static site
- All four share `packages/ui` (design system + components), `packages/types`
  (domain types matching the PRDs' exact enums/lifecycles), and
  `packages/api-client` (typed fetch wrapper — no backend exists yet, so
  every call is a stub pointing at `NEXT_PUBLIC_API_BASE_URL`).
- Admin "Revenue" intentionally separates **subscription revenue** (what
  Ride It actually collects) from **ride fare volume** (cash/UPI passengers
  pay drivers directly — shown for analytics only, never conflated with
  platform revenue).

## Getting started (not yet run in this environment — no network access)
```bash
pnpm install
pnpm dev            # runs all four apps via turbo
pnpm dev:passenger  # http://localhost:3001
pnpm dev:driver     # http://localhost:3002
pnpm dev:admin      # http://localhost:3003
pnpm dev:marketing  # http://localhost:3004
```

Each app needs a `.env.local` with `NEXT_PUBLIC_API_BASE_URL` pointing at the
backend once one exists (see `.env.example` in each app).

## What's implemented in this pass
- Full monorepo scaffold (turborepo + pnpm workspaces)
- Design tokens, shared UI components, the signature "meter digit" motif
  (`OtpInput`, `MeterValue`) used for OTP entry, fares, and earnings
- Shared domain types matching the PRDs exactly (`RideStatus`, `Subscription`, etc.)
- Passenger + Driver: working OTP login → verify flow, landing on placeholder
  Home / Documents screens
- Admin: sidebar shell + Overview dashboard matching the Admin PRD's exact
  dashboard fields (drivers online, rides today, subscriptions, complaints, revenue split)
- Marketing: homepage with the "flat line vs. jagged commission line" hero —
  the product's real structural difference, rendered as the thesis visual

## What's not implemented yet
- No real backend — every API call in `packages/api-client` is typed but stubbed
- Fare estimate / search / live map screens (Passenger)
- Subscription purchase, dashboard, navigation, earnings, wallet (Driver)
- Drivers/Passengers/Rides/Subscriptions/Analytics/Settings pages beyond Overview (Admin)
- Remaining marketing pages (How It Works detail, For Drivers/pricing, Cities, About, Safety, Blog, Careers, Contact, Legal)
- Open PRD gaps flagged earlier (fare calc logic, driver cancellation policy,
  admin RBAC permission matrix, SOS flow detail, subscription grace period,
  supported languages, city/service-area scoping) — worth resolving before
  building the screens that depend on them
