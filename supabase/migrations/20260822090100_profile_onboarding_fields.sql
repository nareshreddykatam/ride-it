-- ============================================================================
-- 20260822090100_profile_onboarding_fields.sql
--
-- Part 2/3 — first-time onboarding needs date of birth and gender for both
-- passengers and drivers. Added to public.users (not passengers/drivers
-- separately) because both roles need the identical two fields and users
-- is already the shared 1:1 profile extension of auth.users — adding a
-- second, role-duplicated pair of columns would just be the same data
-- modeled twice. full_name/phone/email already exist there.
--
-- Both columns are nullable: every existing account (created before this
-- migration) legitimately has neither set yet. "Profile complete" is an
-- application-level check (full_name, phone-or-email, date_of_birth,
-- gender all present), not a NOT NULL constraint here — enforcing it at
-- the DB layer would break every pre-existing account's ability to log
-- in at all, rather than routing them through onboarding as intended.
-- ============================================================================

create type public.gender_enum as enum ('male', 'female', 'other', 'prefer_not_to_say');

alter table public.users add column date_of_birth date;
alter table public.users add column gender public.gender_enum;

alter table public.users add constraint users_date_of_birth_sane
  check (date_of_birth is null or (date_of_birth <= current_date and date_of_birth >= current_date - interval '120 years'));

comment on column public.users.date_of_birth is 'Collected during onboarding (Passenger and Driver). Nullable — null means onboarding has not been completed yet, not that the user has no birth date.';
comment on column public.users.gender is 'Collected during onboarding (Passenger and Driver). Nullable for the same reason as date_of_birth.';
