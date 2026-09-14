-- ============================================================================
-- 20260914090000_food_enums_and_role.sql
-- Ridora Food Phase 1. All new enum types, plus additive ALTER TYPE ... ADD
-- VALUE statements on existing enums, isolated in their own migration and
-- their own transaction — Postgres does not allow a newly added enum value
-- to be used by another DDL/DML statement in the SAME transaction that
-- added it, so nothing that consumes these new values may live in this
-- file. Every later Food migration is a separate file/transaction and is
-- free to use them.
--
-- Naming convention matches 0002_enums.sql: snake_case, `_enum` suffix.
-- Existing ride enums (payment_status_enum, subscription_status_enum,
-- payment_gateway_status_enum, actor_type_enum) are deliberately REUSED
-- below rather than duplicated where the vocabulary is identical in
-- meaning — see comments at each reuse site in later migrations.
-- ============================================================================

-- New identity role, alongside passenger/driver/admin. A restaurant owner is
-- a distinct person type with their own 1:1 profile extension
-- (restaurant_owners, next migration), mirroring how drivers/passengers/
-- admin_users already extend users.
alter type public.user_role_enum add value 'restaurant_owner';

-- Lifecycle per product spec: pending_verification -> in_review -> approved
-- -> (rejected | suspended). "Restaurant is LIVE to customers" is not a
-- separate enum value — it's a derived condition (approved AND is_open AND
-- an active subscription exists), computed at query/RPC time, the same way
-- "can this driver receive offers" is derived from is_online +
-- verification_status + an active subscriptions row rather than being its
-- own driver status value.
create type public.restaurant_status_enum as enum (
  'pending_verification', 'in_review', 'approved', 'rejected', 'suspended'
);

create type public.food_veg_type_enum as enum ('veg', 'non_veg');

create type public.food_payment_method_enum as enum ('cod', 'online');

-- Order lifecycle exactly per spec section 17, plus terminal failure states.
create type public.food_order_status_enum as enum (
  'placed', 'accepted', 'preparing', 'ready_for_pickup', 'driver_assigned',
  'picked_up', 'out_for_delivery', 'delivered', 'cancelled', 'rejected', 'failed'
);

-- Driver-side delivery OFFER/acceptance lifecycle — mirrors ride_offers.status
-- exactly. Deliberately separate from food_order_status_enum: an order has
-- one lifecycle (restaurant + overall progress), an assignment has another
-- (this specific driver's offer), same split as rides vs ride_offers.
create type public.food_delivery_assignment_status_enum as enum (
  'offered', 'accepted', 'rejected', 'expired', 'superseded', 'picked_up', 'delivered', 'cancelled'
);

-- The driver's current work assignment. 'ride' is the default so every
-- existing driver row is unaffected until they explicitly switch — see
-- 20260914090900_driver_food_mode.sql for the mutual-exclusion enforcement.
create type public.driver_work_mode_enum as enum ('ride', 'food');

-- Extend the existing actor-tracking enum so food order status history/
-- cancellation can record a restaurant as the acting party, same as it
-- already can for passenger/driver/system/admin on the ride side.
alter type public.actor_type_enum add value 'restaurant';

-- Extend the existing notification type vocabulary with one new type for
-- every food order lifecycle notification (placed/accepted/preparing/ready/
-- assigned/picked_up/delivered/cancelled) — mirrors how ride notifications
-- use a single 'ride_status' type for the whole ride lifecycle rather than
-- one enum value per status, and carry the specific detail in the
-- notification's own title/body/data jsonb instead.
alter type public.notification_type_enum add value 'food_order';
