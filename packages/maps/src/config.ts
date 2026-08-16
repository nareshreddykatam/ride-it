/**
 * Every location-update and ETA/route throttling threshold for Phase 9,
 * centralized here rather than scattered across components — matching the
 * explicit instruction not to hardcode magic numbers inline.
 *
 * These are plain TS constants, not database-backed (unlike Phase 8's
 * matching config in app_settings) — a deliberate, smaller-scope choice:
 * these thresholds are client-side behavior (how often THIS browser's
 * geolocation watcher/ETA calculator fires), not a cross-cutting business
 * rule multiple services need to agree on the way matching's freshness
 * threshold is. If admin-tunability becomes a real requirement later,
 * moving these into app_settings (the same helper pattern as
 * _get_matching_setting_int) is a small, isolated change — noted as a
 * possible improvement in the Phase 9 review doc, not built here.
 */
export const LOCATION_CONFIG = {
  /**
   * Minimum time between location writes to the database while a driver
   * is online but has no active ride (Phase 8's existing dashboard ping
   * behavior — unchanged this phase).
   */
  ONLINE_PING_INTERVAL_MS: 20_000,

  /**
   * Minimum time between location writes while actively on a ride
   * (Navigation screen) — tighter than the general online ping since
   * live tracking needs to feel responsive, but still bounded so a
   * driver's GPS chatter doesn't flood the database/Realtime.
   */
  ACTIVE_RIDE_MIN_INTERVAL_MS: 5_000,

  /**
   * Minimum horizontal movement (meters) before a location update is
   * even considered for writing, regardless of how much time has passed
   * — prevents a stationary driver's GPS jitter from generating writes.
   * Combined with ACTIVE_RIDE_MIN_INTERVAL_MS via "update only if BOTH
   * enough time has passed AND the driver moved far enough."
   */
  MIN_MOVEMENT_METERS: 25,

  /**
   * Matches the matching engine's driver_location_freshness_seconds
   * default (Phase 8, app_settings) — used here only for the UI's
   * "location may be stale" indicator, not for matching eligibility
   * itself (which continues to read the real app_settings value via
   * _get_matching_setting_int, unchanged). Documented explicitly as a
   * mirror, not a second definition — if the Admin-configurable
   * app_settings value is ever changed, this constant should be updated
   * to match, or (better, future work) the client could fetch the real
   * value instead of mirroring it.
   */
  STALE_LOCATION_THRESHOLD_SECONDS: 120,

  /**
   * How often the Passenger/Driver map screens re-fetch decoded tracking
   * data (get_ride_tracking RPC) as a reconciliation safety net,
   * independent of realtime events — mirrors Phase 8's heartbeat pattern.
   */
  TRACKING_POLL_INTERVAL_MS: 10_000,
} as const;

export const ETA_CONFIG = {
  /**
   * Minimum time between route/ETA recalculations for the same ride —
   * the map marker itself can update far more often (every location
   * write), but a routed ETA/distance call to Google is throttled
   * separately and much less frequently, per the explicit cost-control
   * instruction ("do not call route APIs every few seconds").
   */
  MIN_RECALC_INTERVAL_MS: 30_000,

  /** Minimum driver movement (meters) to justify a new ETA calculation even if the time threshold has elapsed. */
  MIN_MOVEMENT_FOR_RECALC_METERS: 200,
} as const;
