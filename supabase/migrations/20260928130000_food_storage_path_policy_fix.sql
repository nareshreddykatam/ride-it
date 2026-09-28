-- Correct Food Storage owner policies to inspect the storage.objects path.
-- The application writes <restaurant_id>/<file>; unqualified `name` inside
-- the restaurants EXISTS subquery resolves to restaurants.name.

alter policy "restaurant_images_storage_insert_own" on storage.objects
  with check (
    bucket_id = 'restaurant-images'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(objects.name))[1]
        and r.owner_id = auth.uid()
    )
  );

alter policy "restaurant_images_storage_update_own" on storage.objects
  using (
    bucket_id = 'restaurant-images'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(objects.name))[1]
        and r.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'restaurant-images'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(objects.name))[1]
        and r.owner_id = auth.uid()
    )
  );

alter policy "restaurant_images_storage_delete_own" on storage.objects
  using (
    bucket_id = 'restaurant-images'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(objects.name))[1]
        and r.owner_id = auth.uid()
    )
  );

alter policy "menu_item_images_storage_insert_own" on storage.objects
  with check (
    bucket_id = 'menu-item-images'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(objects.name))[1]
        and r.owner_id = auth.uid()
    )
  );

alter policy "menu_item_images_storage_update_own" on storage.objects
  using (
    bucket_id = 'menu-item-images'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(objects.name))[1]
        and r.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'menu-item-images'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(objects.name))[1]
        and r.owner_id = auth.uid()
    )
  );

alter policy "menu_item_images_storage_delete_own" on storage.objects
  using (
    bucket_id = 'menu-item-images'
    and exists (
      select 1 from public.restaurants r
      where r.id::text = (storage.foldername(objects.name))[1]
        and r.owner_id = auth.uid()
    )
  );
