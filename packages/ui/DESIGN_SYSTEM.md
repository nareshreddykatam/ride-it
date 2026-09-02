# Ridora — Design System

> **v2 (2026-08).** This pass is a genuine visual redesign, not a token
> tweak — see additions below. The v1 grounding (flat subscription vs.
> per-ride meter cut, auto-rickshaw livery, the meter-digit signature)
> still holds; v2 makes it louder: each vehicle gets its own accent color
> and a real icon instead of sharing one blue Lucide glyph, surfaces get a
> depth scale instead of one shadow-sm everywhere, and hero/CTA surfaces
> get sanctioned gradients instead of flat fills.

## Grounding
Ridora's real differentiator is structural, not cosmetic: drivers pay a **flat
subscription** instead of a **per-ride meter cut**. Indian auto-rickshaws are
also visually iconic — yellow-black or green-yellow livery, mechanical fare
meters with ticking digits. The design system leans on that world instead of
generic "mobility app blue."

## Color
Named, not generic Tailwind defaults:

| Token | Hex | Role |
|---|---|---|
| `--ink-blue` | `#0B3B8C` | Brand anchor — nav, headers, driver-app chrome |
| `--signal-blue` | `#1E6FEF` | Primary interactive (buttons, links, active states) |
| `--marigold` | `#F5A623` | Accent — earnings, CTAs, subscription/pricing highlights. Pulled from auto-rickshaw livery, not a generic SaaS orange. |
| `--meter-green` | `#1C9B6B` | "Online" / go / success — reads as a status light, not a generic green |
| `--alert-red` | `#D6493B` | SOS, cancellations, destructive actions |
| `--paper` | `#FAFAF7` | Background — warm off-white, not stark `#FFF` or the AI-cliché cream `#F4F1EA` |
| `--ink` | `#1B2027` | Primary text |
| `--ink-soft` | `#5B6270` | Secondary text/labels |

Explicitly avoided: the cream+terracotta AI-default pairing, and pure
indigo-on-white SaaS blue with no second hue doing real work.

### Color v2 — vehicle accents, gradients, elevation

| Token | Hex | Role |
|---|---|---|
| `--violet` | `#6D4CFF` | Bike accent — icon container, selected border, radar ring |
| `--rose` | `#EF3F7A` | Scooty accent |
| `--cyan` | `#0A89A6` | Car accent — cool, deliberately not signal-blue so it never reads as "the interactive one" |
| `--surface` | `#FFFFFF` (dark: `#171B24`) | Card/sheet/dialog fill — themeable alias for what used to be a hardcoded `bg-white` |
| `--tint-blue` / `--tint-marigold` / `--tint-violet` | pale hue fills | Section backgrounds, icon-container idle states, StatCard tint |

`--marigold` (auto), `--violet` (bike), `--rose` (scooty), `--cyan` (car) are
the **vehicle accent quartet** — one hue per vehicle class, used for that
vehicle's icon container fill, its VehicleCard selected border, and its
SearchingIndicator radar rings. Deliberately picked to sit apart from
signal-blue (interactive), meter-green (status/online) and alert-red
(danger) so a vehicle color is never mistaken for a system-state color.
This is the "strategic vibrancy" the spec calls for — four hues doing
identification work, not a rainbow wash across the whole UI.

Gradients (sanctioned, narrow use — hero/CTA surfaces only, never a
full-page background): `--gradient-brand` (ink-blue → signal-blue →
violet, marketing hero / brand buttons), `--gradient-cta` (marigold →
orange, pricing/marigold buttons), `--gradient-online` (meter-green →
cyan, the driver Online toggle).

Elevation is now a real scale — `--shadow-sm/md/lg` plus two colored
"glow" shadows (`--shadow-brand`, `--shadow-marigold`) for primary CTA
hover states — instead of every card independently choosing `shadow-sm`.

### Vehicle icon system
`@ride-it/ui` exports `AutoIcon`, `BikeIcon`, `ScootyIcon`, `CarIcon` —
custom stroke SVGs (no icon library draws an auto-rickshaw), plus
`VEHICLE_VISUALS` mapping a `VehicleKind` (`"auto" | "bike" | "scooty" |
"car"`) to its icon, label, accent color, text color, and tint. Every
vehicle-aware screen (Booking, ride offers, Driver's own vehicle card,
ride history) reads from this one map so a vehicle's color/icon can never
drift screen-to-screen. See `packages/ui/src/icons/vehicle-icons.tsx`.

Everything else icon-shaped lives in `packages/ui/src/icons/index.ts` —
Lucide re-exported under Ridora names (`HomeIcon`, `WalletIcon`,
`SafetyIcon`…) so no screen imports `lucide-react` under an inconsistent
name, plus `PinGlyph` (the branded teardrop marker used inline in
pickup/destination rows — RideMap's actual Google Maps markers stay real
Google Maps `PinElement`s, just recolored to the v2 palette).

## Type
Three roles, deliberately not "Inter for everything":

- **Display — Space Grotesk.** Geometric, slightly mechanical — reads like
  signage/dashboard type. Used for screen titles, plan names, earnings totals.
- **Body — Inter.** Neutral workhorse for paragraphs, labels, form text.
- **Data/Meter — IBM Plex Mono.** Used *only* for numerals that represent a
  live value ticking upward or being counted: fares, OTP digits, wallet
  balances, subscription countdowns. This is the signature move: numbers that
  matter read like a meter/odometer, tying straight back to the product's
  "transparent flat-rate vs. opaque meter" positioning.

## Layout
- 4/8px spacing scale, `rounded-lg` (10px) as the default corner — enough to
  feel modern/minimal without going full pill-everything.
- Passenger/Driver: mobile-first, single-column, bottom-anchored primary
  actions (thumb reach), bottom sheets over modals where possible.
- Admin: dense, desktop-first, data-table heavy, sidebar nav.
- Marketing: generous whitespace, scroll-driven reveals.

## Signature element
**The OTP/meter-digit input.** Every place a number is the *point* of the
screen (OTP entry, fare estimate, live fare during ride, earnings figures)
renders in boxed Plex Mono digits with a subtle per-digit flip/tick animation
on change — literally a meter, but honest and flat, never spinning past the
real value. This is the one recurring, ownable visual signature; everything
else stays quiet around it.

## Composite components (v2)
Beyond the primitives (Button, Card, Input…), `@ride-it/ui` now exports
purpose-built units so these patterns are never re-implemented per-screen:

- **VehicleCard** — the Booking selection unit. Tinted background + 2px
  colored border + check badge when selected, in that vehicle's accent.
- **StatCard** — one operational metric with its own icon + tone, for
  Admin overview and Driver earnings.
- **DriverCard** — the driver-identity overlay on Active Ride (photo,
  rating, vehicle+plate, ETA).
- **RideOfferCard** — the Driver app's incoming-ride-request unit
  (marigold top edge, pickup/drop rows, Accept/Reject).
- **OnlineToggle** — the Driver dashboard's online/offline control
  (gradient fill + pulse dot when online).
- **SearchingIndicator** — the Matching screen's radar-pulse, centered on
  the selected vehicle's icon/color.
- **PulseDot** — a small expanding-ring dot for any "this is live right
  now" status.
- **MatchingRadar** — the full-bleed Matching-screen composition: map as
  environment (passed in as `mapSlot` so `@ride-it/ui` never depends on
  `@ride-it/maps`), radar rings in the selected vehicle's own color,
  bottom scrim panel with driver count/elapsed time/cancel.
- **LiveStatBand** — Admin overview's headline metric strip: one unified
  panel with numbers side by side and thin dividers, not four identical
  boxed `StatCard`s. Reserve `StatCard` for section-level metrics.

`VehicleCard` now takes a `size="compact"|"hero"` prop (default
`"compact"`, unchanged). `"hero"` is the large illustration-forward form
— an 80px icon panel, not a 48px badge — used on Booking, where vehicle
selection is meant to be the single most visually dominant part of the
screen. `OnlineToggle` was rebuilt around a genuine circular status disc
with pulsing rings (was a plain gradient rectangle) — same prop API, no
caller changes required.

## Motion (Framer Motion)
- Ride-status stepper: horizontal progress line that fills, not a bouncing
  spinner — calm, matches "reliability" as a stated core value.
- Digit-tick on OTP/fare/earnings updates (see signature element).
- Bottom sheets slide up with a slight overshoot-then-settle (spring, low
  bounce) — used sparingly, not on every element.
- Respect `prefers-reduced-motion` everywhere motion is non-essential.
