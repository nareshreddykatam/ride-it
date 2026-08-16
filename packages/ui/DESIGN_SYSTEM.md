# Ride It — Design System

## Grounding
Ride It's real differentiator is structural, not cosmetic: drivers pay a **flat
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

## Motion (Framer Motion)
- Ride-status stepper: horizontal progress line that fills, not a bouncing
  spinner — calm, matches "reliability" as a stated core value.
- Digit-tick on OTP/fare/earnings updates (see signature element).
- Bottom sheets slide up with a slight overshoot-then-settle (spring, low
  bounce) — used sparingly, not on every element.
- Respect `prefers-reduced-motion` everywhere motion is non-essential.
