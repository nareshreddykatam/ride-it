-- ============================================================================
-- 0011_auth_helper_functions.sql
-- Helper functions used by the RLS policies in the next migration.
--
-- These are SECURITY DEFINER (not the default SECURITY INVOKER) so they can
-- read admin_users/admin_role_permissions to answer "is this caller an
-- admin?" regardless of whether the calling role would itself be allowed to
-- SELECT those tables under RLS. Without this, a policy that calls
-- is_admin() from a non-admin session could recurse into RLS evaluation on
-- admin_users and either fail or perform far worse than a simple lookup.
-- search_path is pinned for every SECURITY DEFINER function, which is the
-- documented Supabase/Postgres hardening step against search_path
-- injection attacks on definer functions.
-- ============================================================================

create or replace function public.current_role_is(target_role public.user_role_enum)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = target_role and deleted_at is null
  );
$$;

comment on function public.current_role_is(public.user_role_enum) is
  'True if the currently authenticated user has the given role. Foundation for the is_admin/is_driver/is_passenger shortcuts below.';

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users
    where id = auth.uid() and deleted_at is null
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users
    where id = auth.uid() and is_super_admin = true and deleted_at is null
  );
$$;

create or replace function public.is_driver()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_role_is('driver');
$$;

create or replace function public.is_passenger()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_role_is('passenger');
$$;

-- ----------------------------------------------------------------------------
-- has_permission() — fine-grained admin permission check via
-- admin_role_permissions, for the (later, application-layer-driven) RBAC
-- proposal from the Admin app. Super admins short-circuit to true.
--
-- Scope note (documented honestly rather than silently over-building): RLS
-- policies in this schema use is_admin() for baseline "is this an admin at
-- all" row access, NOT has_permission() per-action. Enforcing e.g. "only
-- Finance Admin can edit pricing_rules" via this function at the RLS layer
-- is possible but was intentionally left to the application/API layer for
-- this phase — see the review doc for the reasoning.
-- ----------------------------------------------------------------------------
create or replace function public.has_permission(permission_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.admin_users au
      join public.admin_role_permissions arp on arp.admin_role_id = au.admin_role_id
      join public.admin_permissions ap on ap.id = arp.admin_permission_id
      where au.id = auth.uid()
        and au.deleted_at is null
        and ap.code = permission_code
    );
$$;

comment on function public.has_permission(text) is
  'Fine-grained permission check via admin_role_permissions. Available for use, but current RLS policies rely on is_admin() for baseline access — see review doc for scope reasoning.';
