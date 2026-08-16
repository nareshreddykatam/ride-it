# Ride It — Phase 9: Maps, Location & Live Tracking Review

## A note on this environment, stated up front

`maps.googleapis.com` is **not reachable** from this sandbox's network
(confirmed: a direct request returns `403 host_not_allowed`). No real
Google Maps API key exists anywhere in this environment either. This means
**no code in this phase that actually talks to Google has been executed**
— not the Maps JS API, not Geocoding, not Routes. This is stated plainly
here and repeated throughout rather than implied away. What *was* possible
and *was* done for real: real `npm`/`pnpm` access to verify actual current
package versions and API shapes (catching a real deprecated-API bug — see
§2), real `tsc` type-checking, and real `next dev` runtime boots of every
changed screen. Precisely which is which is detailed in §15–18.

## 1. Architecture

**Nothing about Phase 8's location/matching infrastructure was replaced.**
`drivers.current_location`/`location_updated_at` remain the single
authoritative location columns; `_find_eligible_drivers` (matching) still
computes distance via PostGIS server-side, unchanged. Phase 9 extends this
in exactly two ways:

1. **A new way to read coordinates back to a client** — `get_ride_tracking()`,
   because nothing before this phase ever needed to (see §9).
2. **A new client-facing map/location layer** — `@ride-it/maps`, a new
   package following the same isolated-package pattern established since
   Phase 2 (`@ride-it/supabase`, `@ride-it/auth`, `@ride-it/data`).

No second location system, no duplicate lat/lng columns, no competing
"freshness" definition — the UI's staleness indicator threshold
(`LOCATION_CONFIG.STALE_LOCATION_THRESHOLD_SECONDS`) is a documented
*mirror* of the value the matching engine actually enforces
(`app_settings.driver_location_freshness_seconds`), not a second
authoritative definition — see §5's honest note on this.

## 2. Google Maps integration

**`@googlemaps/js-api-loader@2.1.1`** (Google's own officially-maintained
npm package) is used for script loading — real, current version, verified
against the npm registry this session (not training-data memory).

**A real bug was found and fixed by that verification, not by guessing.**
The initial implementation used the package's `Loader` *class*
(`new Loader({...}).importLibrary(...)`), which is the well-known pattern
from most existing tutorials/training data. Reading the actually-installed
package's real `.d.ts` file revealed `Loader` is marked `@deprecated` in
`2.1.1`, in favor of a functional API: `setOptions({ key })` once, then
standalone `importLibrary("maps")`/`importLibrary("marker")` calls. Fixed
before this document was written — this is exactly the failure mode the
task brief's "use the current supported approach rather than relying on
outdated documentation" instruction anticipated, and it's disclosed here
specifically because it would have been very easy to ship the deprecated
pattern without noticing.

**Marker API**: `google.maps.marker.AdvancedMarkerElement` (current
recommended marker API) is used throughout, not the older
`google.maps.Marker` class (deprecated for new implementations per
Google's 2024 guidance). This requires a Map ID — see §3.

**Only three Google APIs are used, each for exactly one purpose:**
- **Maps JavaScript API** — rendering only (`RideMap` component).
- **Geocoding API** — one address→coordinates lookup per booking
  confirmation (not per keystroke — no Places Autocomplete API is used at
  all, a deliberate scope decision, see §13).
- **Routes API** (`routes.googleapis.com/directions/v2:computeRoutes`) —
  the current recommended service for server-side distance/duration,
  replacing the older DirectionsService/DistanceMatrixService for new
  integrations. Used for throttled ETA display only.

No Places API, no Directions rendering, no Elevation/other unrelated
Maps Platform products.

## 3. Environment variables

Four variables, three separate keys by design (own quota/billing/restriction
per Google Cloud product — a leaked or over-quota rendering key can't also
exhaust geocoding/routing budget):

| Variable | Scope | Apps |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Client — Maps JS rendering | passenger, driver, admin |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Client — required for `AdvancedMarkerElement` styling in production; falls back to Google's public `DEMO_MAP_ID` placeholder if unset | passenger, driver, admin |
| `GOOGLE_MAPS_GEOCODING_API_KEY` | **Server-only** | passenger only |
| `GOOGLE_MAPS_ROUTES_API_KEY` | **Server-only** | passenger, driver |

`packages/maps/src/env.ts` throws if a server-only getter is somehow called
from `typeof window !== "undefined"` — same defensive pattern as
`@ride-it/supabase`'s service-role key guard. Unlike Supabase's env module,
`getGoogleMapsBrowserKey()`/`isGoogleMapsConfigured()` never throw — a
missing Maps key must not break the app (see §14).

No key is committed anywhere; every `.env.example` documents the variable
with no value filled in.

## 4. Location update strategy

**`watchDriverLocation()`** (`packages/maps/src/geolocation.ts`) wraps
`navigator.geolocation.watchPosition` (continuous, not repeated
`getCurrentPosition` polling) with time+distance throttling applied
*before* the update callback ever fires:

- General online-but-idle (Driver Dashboard): unchanged from Phase 8 — a
  20s interval ping, since no one is actively tracking a specific ride yet.
- **Active ride (new this phase, Driver Navigation screen)**: continuous
  watch, throttled to at most one accepted update per 5s *and* only if the
  driver moved ≥25m — both thresholds centralized in
  `LOCATION_CONFIG` (`packages/maps/src/config.ts`), not scattered inline.
  The watcher starts when the Navigation screen mounts and stops the
  moment the ride reaches its `SUMMARY` phase (ride completed) — cleanup
  is an explicit `useEffect` return, not left to garbage collection.

Permission-denied, position-unavailable, timeout, and unsupported-browser
are all distinct, handled error states (`GeolocationErrorReason`), each
with an honest message shown in the Driver UI — never a crash, never a
silent failure.

## 5. Realtime strategy

Extends Phase 8's pattern exactly:

- **`drivers` added to the `supabase_realtime` publication** (new this
  phase) — but the raw `postgres_changes` payload for a `geography` column
  is still undecoded WKB hex (see §9), so subscribers treat an UPDATE
  event as a **refetch signal only**, never reading coordinates out of the
  payload directly. `subscribeToDriverLocationChanges()` reflects this
  explicitly in its name and doc comment.
- Passenger subscribes filtered to `id=eq.<their assigned driver's id>` —
  RLS (`drivers_select_active_ride_passenger`, unchanged since Phase 3/8)
  scopes what actually arrives, exactly as for every other Phase 8
  subscription.
- A periodic reconciliation poll (`LOCATION_CONFIG.TRACKING_POLL_INTERVAL_MS`,
  10s) runs alongside the realtime subscription on both the Passenger ride
  screen and (implicitly, via its own refresh) Admin's Ride Detail — the
  same heartbeat-plus-realtime belt-and-suspenders pattern Phase 8
  established for matching, applied here to location.
- **Honest gap, not silently glossed over**: the mirrored staleness
  threshold in `LOCATION_CONFIG` (§1) is a plain TS constant, not
  read from `app_settings` the way the matching engine's real freshness
  check is. If an admin ever changes `driver_location_freshness_seconds`
  via the database, this UI-only indicator would silently drift out of
  sync with the value matching actually enforces. Flagged as known debt
  in §19, not fixed this phase (would require either a new client-side
  fetch of that setting or duplicating Phase 8's
  `_get_matching_setting_int` pattern for browser use).

## 6. Passenger changes

- **`/booking/confirm`**: real coordinates replace the previous
  always-hardcoded `DEMO_PICKUP`/`DEMO_DROP`. Pickup: one-shot browser
  geolocation (`getCurrentPositionOnce`). Drop: server-side geocoding of
  the destination text already selected on Search, via `/api/geocode`
  (called once, on mount — not per keystroke). Both degrade honestly to
  the previous fixed coordinates with a visible note
  ("Using an approximate location...") if geolocation is denied or
  geocoding fails/isn't configured — never a crash, never a silent switch
  to fake-but-unlabeled data.
- **`/ride/[id]`**: `RideMap` replaces the placeholder map area, showing
  real pickup/drop/assigned-driver coordinates via `get_ride_tracking()`
  polling + realtime. A stale-location indicator (§5) if the assigned
  driver's last update exceeds the threshold. Falls back to the existing
  `MockMap` "live" variant (unchanged animation) when Maps isn't
  configured or `tracking` hasn't loaded yet.
- Home, Search, `/booking` (fare estimate), `/booking/matching`: import
  path updated to `@ride-it/maps`, otherwise **unchanged** — these screens
  have no real assigned-ride data to show yet, so upgrading them to
  `RideMap` would have nothing real to render; they correctly stay on the
  decorative `MockMap`.

## 7. Driver changes

- **Navigation screen**: `RideMap` shows real pickup/drop (via
  `get_ride_tracking`) and the driver's own live position (via
  `watchDriverLocation`, written to `updateDriverLocation()` on every
  accepted update). Honest error text for each `GeolocationErrorReason`.
  Tracking starts on mount, stops explicitly at `SUMMARY` phase.
- Dashboard: **unchanged** — its Phase 8 online-ping behavior remains
  correct for "available but not on a specific ride" and wasn't
  redesigned.
- `RideRequestSheet`: **unchanged** — no location display there, out of
  scope.

## 8. Admin changes

- **Ride Detail**: `RideMap` added directly below the header, showing
  pickup/drop/assigned-driver via `get_ride_tracking()` (admin's own
  branch of that RPC's authorization check — `is_admin()`). Fetched
  alongside the screen's existing `refresh()` call, not a separate
  polling loop.
- **Live Rides list**: intentionally untouched — no per-row map, matching
  "do not redesign the entire Admin dashboard." Its existing Phase 8
  realtime subscription (list refetch on any ride change) is unaffected.
- No other Admin screen touched.

## 9. PostGIS changes

**No new spatial columns, no duplicated location data.** One genuinely new
capability: `get_ride_tracking()` is the first function in this project's
history to *decode* a `geography` column back into plain `double precision`
lat/lng for a client, via `ST_X`/`ST_Y` cast through `::geometry`. Every
prior use of `geography` was either write-only (WKT text on `INSERT`) or
consumed entirely server-side inside `ST_Distance()` for matching — this
is a real gap Phase 8 didn't anticipate needing to close, found while
implementing this phase, not before.

Distance calculations shown to users continue to originate from PostGIS
(`ST_Distance`, included in `get_ride_tracking`'s output) as the
authoritative figure — Google's Routes API is used *additionally* for a
road-based ETA/duration display (which straight-line PostGIS distance
cannot provide), never as a replacement for PostGIS's role in matching.

No new spatial index was required — `rides_pickup_location_idx`,
`rides_drop_location_idx`, and `drivers_online_location_idx` (all Phase 3)
already cover every spatial query this phase performs.

## 10. Database migrations

Exactly one: `20260814090000_ride_tracking.sql` —

1. `get_ride_tracking(p_ride_id uuid)` — `SECURITY DEFINER`,
   `search_path = public, extensions` (PostGIS lives in `extensions`,
   same lesson already learned and documented in Phase 8's own
   `_find_eligible_drivers` fix — applied correctly from the start here,
   not found as a second instance of the same bug). Explicit
   authorization check (ride's passenger, assigned driver, or admin) — not
   solely relying on RLS on the underlying tables, since this function
   joins `rides` and `drivers` together. `EXECUTE` revoked from `PUBLIC`,
   granted to `authenticated` only.
2. `ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers` — the
   realtime-signal-only addition described in §5.

## 11. RLS/security changes

**No RLS policy was added, dropped, or modified this phase.** Every
privacy boundary Phase 9's map/location UI relies on was already correct
from Phase 3/8:

- `drivers_select_active_ride_passenger` — a passenger sees the assigned
  driver's row only while genuinely assigned to an active ride. Unchanged.
- `rides_select_driver` / `rides_select_passenger` / `rides_all_admin` —
  unchanged.
- The Phase 8 location-privacy fix (`drivers_select_online` dropped) is
  **untouched and still in effect** — confirmed by re-reading it as part
  of this phase's own instruction to preserve it, not just assumed.

`get_ride_tracking()`'s own explicit `auth.uid()` + ownership check is
additive defense-in-depth on top of that existing RLS, not a replacement
for it — stated because a `SECURITY DEFINER` function *could* in principle
bypass RLS if it weren't careful, and this one deliberately isn't careless
about that.

## 12. Privacy model

Directly against the brief's explicit list:

| Requirement | How it's satisfied |
|---|---|
| Passenger can't query all online drivers | No client code selects from `drivers` without a `WHERE id = <specific assigned driver>` — and RLS would block a broader query anyway |
| Passenger can't query another passenger's assigned driver | `get_ride_tracking()`'s authorization check requires `passenger_id = auth.uid()` on the specific `p_ride_id` passed |
| Driver can't query other drivers' locations | Same function, same check, requires `driver_id = auth.uid()` for the driver branch |
| Driver can't query unrelated passenger locations | Passengers have no location column at all — only `drivers.current_location` exists in this schema |
| Admin governed by existing authorization | `is_admin()`, unchanged |
| No global GPS stream | `subscribeToDriverLocationChanges` always takes a specific `driverId` filter; nothing subscribes unfiltered to `drivers` |

## 13. API/cost-control strategy

- **Geocoding**: once per booking confirmation. No autocomplete —
  explicitly not built this phase (the brief permitted it "if actually
  required"; the existing mock Search suggestion list already provides a
  selection UX, and adding Places Autocomplete would mean a Google API
  call on every keystroke, which is exactly the cost pattern to avoid).
- **Routes/ETA**: throttled via `ETA_CONFIG` (30s minimum interval, 200m
  minimum movement) — centralized, not scattered. **Not yet wired into any
  screen's UI this phase** — the server-side `getEta()`/`/api/eta` plumbing
  exists and is real, but no component currently calls `fetchEta()`. Named
  explicitly in §19 as unfinished, not silently left half-done.
- **Map loading**: only on screens with something to show — `RideMap` is
  never rendered on a screen with no `pickup`/`drop`/`driverLocation` to
  display (Home/Search/Booking still use the lightweight `MockMap`
  directly, not `RideMap`, so they never load the Maps JS API at all).
- **No global driver-location stream** — see §12.

## 14. Development fallback

`MockMap` — **moved**, not duplicated, from
`apps/passenger/components/mock-map.tsx` into
`packages/maps/src/fallback/MockMapFallback.tsx`. Confirmed via `grep`
that no stale reference to the old path remains anywhere in the repo.
`RideMap` renders it automatically whenever `isGoogleMapsConfigured()` is
false *or* the real script fails to load — the fallback badge text was
strengthened from "Mock map preview" to **"Demo map — not live GPS"**,
specifically so it can never be mistaken for real tracking data, per the
explicit "clearly distinguish demo/mock mode from real location mode"
instruction.

## 15. Tests actually executed

| Check | Result |
|---|---|
| `pnpm install` | **Executed**, multiple times as dependencies were added. Clean. |
| `tsc --noEmit`, all 4 apps | **Executed for real, repeatedly.** Found and fixed 5 real bugs (§16). Zero errors on the final pass across `passenger`, `driver`, `admin`, `marketing`. |
| `next dev` runtime boot | **Executed**, deliberately *without* a Google Maps key configured, to verify the fallback path specifically. Real `307` (correct auth-redirect) responses from Passenger `/ride/[id]`, Driver `/navigation`, and Admin `/rides/[id]` — the three heaviest new Maps integrations — confirming each compiles and boots cleanly on the no-key path. |
| Google Maps JS API / Geocoding / Routes API execution | **Not executed.** `maps.googleapis.com` is unreachable from this sandbox (confirmed `403 host_not_allowed`), and no real API key exists. Nothing in this phase claims otherwise. |
| Live Supabase (migration execution, `get_ride_tracking` against real data, realtime delivery) | **Not executed** — no live Supabase project in this environment, same standing caveat as every phase since Phase 3. |

## 16. Test results — bugs found and fixed by real verification

1. **Deprecated `Loader` class** (§2) — the single most valuable finding
   this phase; would have shipped silently wrong without real package
   inspection.
2. **Missing `@ride-it/ui`/`framer-motion` dependencies** in the new
   `packages/maps/package.json` — both genuinely used, neither declared.
3. **`noUncheckedIndexedAccess` violation** in `geocoding.ts`'s destructured
   array access.
4. **Ambient `@types/google.maps` invisible to consuming apps** — pnpm's
   strict (non-hoisting) install means a dependency's devDependency isn't
   automatically visible for TypeScript's ambient-type discovery in the
   *consumer's* compilation. Fixed by adding `@types/google.maps` directly
   to each of the three apps' own `devDependencies`, not just the shared
   package's.
5. (Carried from Phase 8, re-confirmed still correct) — the
   `search_path = public, extensions` pattern for PostGIS-calling
   `SECURITY DEFINER` functions was applied correctly to
   `get_ride_tracking()` from the start, because that lesson was already
   learned.

## 17. Anything requiring a real Google Maps key

Everything in §2 — script loading, marker rendering, geocoding, ETA/route
computation. All architecturally complete and type-safe; none executed
against Google's actual platform. A real key + Map ID is the next concrete
step to move from "correctly built" to "confirmed working."

## 18. Anything requiring live Supabase

`get_ride_tracking()`'s actual query correctness (join, authorization
branches, `ST_X`/`ST_Y` decoding), the `drivers` realtime publication
addition actually delivering events, and RLS behaving as designed under a
real session — all reasoned through carefully, none observed running.

## 19. Known limitations

- **ETA/Routes plumbing exists but isn't wired into any screen's UI yet**
  (§13) — `fetchEta()` is callable, throttling constants exist, but no
  component calls it. The visible "ETA" text on the Booking screen is
  still the pre-existing static estimate from the fare-estimate step, not
  a live Routes-API-backed figure.
- **Staleness threshold is a UI-only mirror of the real matching
  threshold** (§5), not read from the same `app_settings` row — could
  drift if an admin changes the real value.
- **No Places Autocomplete** — deliberate, documented cost-control
  decision (§13), not an oversight.
- **`AdvancedMarkerElement` requires a real Map ID for production styling**
  — falls back to Google's public `DEMO_MAP_ID` otherwise, which is fine
  for local development but not a production-ready visual.
- **No presence/backgrounding handling beyond what the browser's
  Geolocation API itself provides** — "app going into background" is
  listed in the brief's requirements; this implementation relies on
  `watchPosition`'s own OS-level behavior rather than adding explicit
  Page Visibility API handling, which is a real gap for a native/PWA
  context where backgrounding behaves differently than a desktop browser
  tab.

## 20. Deferred work

Matches this phase's explicit exclusions:

- No payment gateway work — nothing in this phase touches any fare or
  payment column; `get_ride_tracking()` reads `rides.status` and
  coordinates only.
- No restaurant/food/delivery features — untouched.
- No turn-by-turn navigation product — `RideMap` is map + marker
  visualization only, exactly the brief's stated boundary ("map
  visualization and route/ETA information are enough").

## 21. Recommended Phase 10

Two reasonable directions:

1. **Wire the ETA/Routes plumbing into the UI** (§19's first limitation) —
   the server-side work is done; this is the smallest remaining gap
   between "architecturally complete" and "visibly functional," and would
   be the first thing to validate once a real Google Maps key exists.
2. **A real Google Maps key + Supabase project validation pass** — before
   any further feature phase, actually running Phase 8 and 9 together
   against live infrastructure (the concurrent-acceptance race, the
   `get_ride_tracking` authorization branches, real Realtime delivery, and
   real Maps rendering) would convert a large amount of "reasoned through
   carefully" into "confirmed" across two consecutive phases at once.

---

Phase 9 complete. Not starting Phase 10.
