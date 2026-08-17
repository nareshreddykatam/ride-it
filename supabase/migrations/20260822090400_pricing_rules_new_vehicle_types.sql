-- ============================================================================
-- 20260822090400_pricing_rules_new_vehicle_types.sql
--
-- Part 7 follow-up: global pricing_rules rows for the two new vehicle
-- types (scooty, car) added in 20260822090000, mirroring the existing
-- bike/auto global rows exactly (city_id null = global default, same
-- shape admin Settings already reads via listPricingRulesAdmin()).
-- Values match packages/utils/src/fare.ts FARE_RATES so the passenger
-- app's client-computed estimate and this reference data don't drift,
-- same intent as the original bike/auto seed comment.
-- ============================================================================

insert into public.pricing_rules (city_id, vehicle_type, base_fare, per_km_rate, cancellation_fee)
select null, 'scooty', 18.00, 7.00, 20.00
where not exists (
  select 1 from public.pricing_rules where city_id is null and vehicle_type = 'scooty'
);

insert into public.pricing_rules (city_id, vehicle_type, base_fare, per_km_rate, cancellation_fee)
select null, 'car', 40.00, 16.00, 40.00
where not exists (
  select 1 from public.pricing_rules where city_id is null and vehicle_type = 'car'
);
