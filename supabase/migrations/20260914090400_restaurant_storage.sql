-- ============================================================================
-- 20260914090400_restaurant_storage.sql
-- Ridora Food Phase 1. Storage buckets for restaurant/menu imagery.
--
-- Deliberate deviation from driver-documents/driver-payment-qr (both
-- private): these buckets are PUBLIC (public=true) because restaurant
-- logos/covers and dish photos are meant for public discovery, not private
-- KYC data — matching real-world practice for food-delivery imagery and
-- avoiding a signed-URL round trip for every image the Passenger app loads
-- (performance, spec section 44). public=true only affects unauthenticated
-- SELECT via the public URL helper — every write (insert/update/delete)
-- below is still RLS-gated to the owning restaurant's owner, exactly like
-- the private buckets. size/type limits are enforced application-side at
-- upload time (packages/data upload helper) AND via the bucket's own
-- file_size_limit/allowed_mime_types below, so a client cannot bypass the
-- limit by calling the Storage API directly.
--
-- Path convention: <bucket>/<restaurant_id>/<file> — same shape as
-- driver-documents/<driver_id>/<file>.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('restaurant-images', 'restaurant-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('menu-item-images', 'menu-item-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "restaurant_images_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'restaurant-images'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(name))[1] and r.owner_id = auth.uid()
    )
  );

create policy "restaurant_images_storage_update_own" on storage.objects
  for update using (
    bucket_id = 'restaurant-images'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(name))[1] and r.owner_id = auth.uid()
    )
  );

create policy "restaurant_images_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'restaurant-images'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(name))[1] and r.owner_id = auth.uid()
    )
  );

create policy "restaurant_images_storage_select_admin" on storage.objects
  for select using (bucket_id = 'restaurant-images' and public.is_admin());

create policy "menu_item_images_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'menu-item-images'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(name))[1] and r.owner_id = auth.uid()
    )
  );

create policy "menu_item_images_storage_update_own" on storage.objects
  for update using (
    bucket_id = 'menu-item-images'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(name))[1] and r.owner_id = auth.uid()
    )
  );

create policy "menu_item_images_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'menu-item-images'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(name))[1] and r.owner_id = auth.uid()
    )
  );

create policy "menu_item_images_storage_select_admin" on storage.objects
  for select using (bucket_id = 'menu-item-images' and public.is_admin());

comment on policy "restaurant_images_storage_insert_own" on storage.objects is
  'Path convention restaurant-images|menu-item-images/<restaurant_id>/<file> — an owner can only write inside folders matching a restaurant they own. Both buckets are public for read (public discovery imagery); writes remain RLS-gated to ownership.';
