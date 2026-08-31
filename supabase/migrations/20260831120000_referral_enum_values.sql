-- ============================================================================
-- 20260831120000_referral_enum_values.sql
--
-- Extends two existing enums for the referral system, rather than
-- introducing parallel vocabulary — same reasoning as
-- 20260822090000_extend_vehicle_and_document_enums.sql, which established
-- this exact pattern in this codebase.
--
-- ALTER TYPE ... ADD VALUE must not be used in the same transaction as
-- code that references the new value, so this migration does nothing
-- else — the referral schema/functions that use these values live in the
-- next migration.
-- ============================================================================

alter type public.notification_type_enum add value if not exists 'referral';
alter type public.wallet_transaction_reason_enum add value if not exists 'referral_reward';
