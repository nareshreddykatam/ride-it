-- ============================================================================
-- 0002_enums.sql
-- All enum types for the Ride It schema. Kept in one migration so the full
-- vocabulary of the system is visible at a glance. Naming convention:
-- snake_case, suffixed with `_enum` to avoid any ambiguity with a column of
-- the same conceptual name (e.g. the `status` column vs the `status_enum`
-- type it draws from).
-- ============================================================================

-- Base identity role. Admin sub-roles (Support/Finance/Operations) are NOT
-- an enum — they're rows in admin_roles, because that set is expected to
-- change over time without a schema migration (see admin_roles table).
create type public.user_role_enum as enum ('passenger', 'driver', 'admin');

create type public.vehicle_type_enum as enum ('bike', 'auto');

create type public.driver_verification_status_enum as enum (
  'pending', 'in_review', 'approved', 'rejected', 'suspended'
);

create type public.document_type_enum as enum (
  'aadhaar', 'driving_license', 'rc', 'insurance', 'selfie'
);

create type public.document_status_enum as enum ('pending', 'approved', 'rejected');

create type public.subscription_plan_enum as enum ('daily', 'weekly', 'monthly', 'yearly');

-- 'grace_period' models the still-open PRD question (subscription expiry
-- behavior) as a real state rather than pretending it's settled.
create type public.subscription_status_enum as enum (
  'active', 'grace_period', 'expired', 'cancelled'
);

create type public.payment_method_enum as enum ('cash', 'upi');

create type public.payment_status_enum as enum ('pending', 'paid', 'failed', 'refunded');

-- Mirrors packages/types/src/ride.ts RideStatus exactly (lowercased) so the
-- frontend enum and the database enum never drift apart in meaning, even
-- though TypeScript and Postgres enforce them independently.
create type public.ride_status_enum as enum (
  'requested', 'matched', 'accepted', 'driver_arriving', 'otp_verified',
  'ride_started', 'ride_completed', 'payment', 'rated', 'cancelled'
);

create type public.cancelled_by_enum as enum ('passenger', 'driver', 'system');

-- Who/what performed a ride_events entry — broader than cancelled_by_enum
-- because admins can also act on a ride (e.g. manual reassignment).
create type public.actor_type_enum as enum ('passenger', 'driver', 'system', 'admin');

create type public.rated_by_enum as enum ('passenger', 'driver');

create type public.notification_channel_enum as enum ('push', 'sms', 'email');

create type public.notification_type_enum as enum (
  'ride_status', 'offer', 'driver_arrival', 'payment_confirmation', 'subscription', 'system'
);

create type public.support_ticket_category_enum as enum (
  'ride_issue', 'payment_issue', 'account', 'driver_verification', 'other'
);

create type public.support_ticket_status_enum as enum ('open', 'in_progress', 'resolved', 'closed');

create type public.wallet_transaction_type_enum as enum ('credit', 'debit');

create type public.wallet_transaction_reason_enum as enum (
  'ride_earning', 'withdrawal', 'subscription_payment', 'refund', 'promo_credit', 'adjustment'
);

create type public.promo_discount_type_enum as enum ('flat', 'percentage');
