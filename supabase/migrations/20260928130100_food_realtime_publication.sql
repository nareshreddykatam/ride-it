-- Enable Postgres Changes for the Food tables with active client subscribers.
-- Passenger/Restaurant subscribe to food_orders; Driver subscribes to
-- food_delivery_assignments. Other Food tables have no Postgres Changes
-- consumer in the current application.

alter publication supabase_realtime
  add table public.food_orders, public.food_delivery_assignments;
