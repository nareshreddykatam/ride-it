import type { SupabaseClient } from "@supabase/supabase-js";

export type ReferralRole = "passenger" | "driver";
export type ReferralStatus = "attributed" | "qualified" | "rewarded" | "expired";

export interface ReferralSummary {
  referralCode: string | null;
  referralEnabled: boolean;
  totalReferrals: number;
  passengerReferrals: number;
  driverReferrals: number;
  qualifiedOrRewardedCount: number;
  totalRewardsEarned: number;
}

export interface ReferralRow {
  id: string;
  inviter_id: string;
  invitee_id: string;
  inviter_role: ReferralRole;
  invitee_role: ReferralRole;
  referral_code: string;
  status: ReferralStatus;
  required_rides_snapshot: number;
  qualifying_rides_count: number;
  reward_amount: number | null;
  qualified_at: string | null;
  rewarded_at: string | null;
  created_at: string;
}

/** Generates the caller's own referral code on first call, returns the same one thereafter. Never derived from phone/email/id — server-generated and collision-checked. */
export async function getOrCreateMyReferralCode(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc("get_or_create_my_referral_code");
  if (error) throw error;
  return data as unknown as string;
}

/**
 * Attributes the caller to the given inviter's code — the ONLY path that
 * creates a referrals row. Safe to call speculatively (e.g. right after
 * onboarding completes, with a code picked up from a referral link) since
 * an invalid/missing code, self-referral, or an already-attributed caller
 * all just raise a clear error rather than corrupting anything; callers
 * should treat failure here as non-fatal (never block onboarding on it).
 */
export async function redeemReferralCode(supabase: SupabaseClient, code: string): Promise<ReferralRow> {
  const { data, error } = await supabase.rpc("redeem_referral_code", { p_code: code });
  if (error) throw error;
  return data as unknown as ReferralRow;
}

/** The caller's own referral activity summary — used by both apps' Refer & Earn screens. Real database values only. */
export async function getMyReferralSummary(supabase: SupabaseClient): Promise<ReferralSummary> {
  const { data, error } = await supabase.rpc("get_my_referral_summary");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        referral_code: string | null;
        referral_enabled: boolean;
        total_referrals: number;
        passenger_referrals: number;
        driver_referrals: number;
        qualified_or_rewarded_count: number;
        total_rewards_earned: number;
      }
    | undefined;

  return {
    referralCode: row?.referral_code ?? null,
    referralEnabled: row?.referral_enabled ?? false,
    totalReferrals: row?.total_referrals ?? 0,
    passengerReferrals: row?.passenger_referrals ?? 0,
    driverReferrals: row?.driver_referrals ?? 0,
    qualifiedOrRewardedCount: row?.qualified_or_rewarded_count ?? 0,
    totalRewardsEarned: Number(row?.total_rewards_earned ?? 0),
  };
}

/** The caller's own referral history (as inviter) — for the "who did I refer, and their status" list. RLS already scopes this to the caller's own rows (referrals_select_own_as_inviter), no server-side filtering needed here. */
export async function listMyReferrals(supabase: SupabaseClient): Promise<ReferralRow[]> {
  const { data, error } = await supabase
    .from("referrals")
    .select(
      "id, inviter_id, invitee_id, inviter_role, invitee_role, referral_code, status, required_rides_snapshot, qualifying_rides_count, reward_amount, qualified_at, rewarded_at, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as ReferralRow[];
}

export interface AdminReferralSummary {
  totalReferrals: number;
  passengerToPassengerCount: number;
  passengerToDriverCount: number;
  driverToPassengerCount: number;
  driverToDriverCount: number;
  attributedCount: number;
  qualifiedCount: number;
  rewardedCount: number;
  expiredCount: number;
  totalRewardsPaid: number;
  conversionRate: number | null;
  avgQualificationHours: number | null;
}

/** Admin Referrals dashboard — one server-aggregated snapshot (admin_referral_summary RPC re-checks is_admin() itself). */
export async function getAdminReferralSummary(supabase: SupabaseClient): Promise<AdminReferralSummary> {
  const { data, error } = await supabase.rpc("admin_referral_summary");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        total_referrals: number;
        passenger_to_passenger_count: number;
        passenger_to_driver_count: number;
        driver_to_passenger_count: number;
        driver_to_driver_count: number;
        attributed_count: number;
        qualified_count: number;
        rewarded_count: number;
        expired_count: number;
        total_rewards_paid: number;
        conversion_rate: number | null;
        avg_qualification_hours: number | null;
      }
    | undefined;

  return {
    totalReferrals: row?.total_referrals ?? 0,
    passengerToPassengerCount: row?.passenger_to_passenger_count ?? 0,
    passengerToDriverCount: row?.passenger_to_driver_count ?? 0,
    driverToPassengerCount: row?.driver_to_passenger_count ?? 0,
    driverToDriverCount: row?.driver_to_driver_count ?? 0,
    attributedCount: row?.attributed_count ?? 0,
    qualifiedCount: row?.qualified_count ?? 0,
    rewardedCount: row?.rewarded_count ?? 0,
    expiredCount: row?.expired_count ?? 0,
    totalRewardsPaid: Number(row?.total_rewards_paid ?? 0),
    conversionRate: row?.conversion_rate != null ? Number(row.conversion_rate) : null,
    avgQualificationHours: row?.avg_qualification_hours != null ? Number(row.avg_qualification_hours) : null,
  };
}

const REFERRAL_STORAGE_KEY = "rideit_referral_code";

/** Captures a `?ref=CODE` query param into localStorage as a UX convenience ONLY — carries the code text across the pre-auth signup/login redirect boundary. The actual attribution is never decided here: redeemReferralCode() (an authenticated server RPC) is the only thing that ever persists a real referral, per the explicit "do not rely on client state for final attribution" requirement. Safe no-op outside the browser or if no `ref` param is present. */
export function captureReferralCodeFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code && code.trim()) {
      window.localStorage.setItem(REFERRAL_STORAGE_KEY, code.trim());
    }
  } catch {
    // Storage unavailable (private browsing, etc.) — the referral link
    // simply won't pre-fill; redeeming a code manually still works.
  }
}

/** Reads back a referral code captured by captureReferralCodeFromUrl(), if any — used to pre-fill (never auto-submit) the onboarding referral field. */
export function getStoredReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(REFERRAL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredReferralCode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // Nothing to do — see captureReferralCodeFromUrl's same catch.
  }
}

/** Builds a shareable referral link from the current browser origin — never a hardcoded domain, matching the existing pattern in ride/[id]'s handleShare() (createRideShare). */
export function buildReferralLink(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/login?ref=${encodeURIComponent(code)}`;
}
