-- ============================================================================
-- 20260819090200_report_review.sql
-- Phase 15. Reporting an inappropriate review reuses Phase 13's
-- support_tickets architecture entirely — one new nullable column
-- (rating_id, paralleling Phase 13's reported_user_id) and one new
-- category, rather than a parallel moderation system.
-- ============================================================================

alter table public.support_tickets add column rating_id uuid references public.ratings (id) on delete set null;
create index support_tickets_rating_idx on public.support_tickets (rating_id) where rating_id is not null;

alter type public.support_ticket_category_enum add value 'inappropriate_review';

comment on column public.support_tickets.rating_id is 'Set when this ticket is a report about a specific rating/review (Phase 15) — reported_user_id (Phase 13) is set alongside it to the review''s author (ratings.rater_id) for Admin visibility, without needing a join at read time.';
