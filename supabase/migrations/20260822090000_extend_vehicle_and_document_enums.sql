-- ============================================================================
-- 20260822090000_extend_vehicle_and_document_enums.sql
--
-- Extends two existing enums rather than introducing parallel vocabulary:
--   - vehicle_type_enum: adds 'scooty' and 'car' alongside the existing
--     'bike'/'auto' (Part 7 — Bike/Scooty/Auto/Car). Matching
--     (_find_eligible_drivers) already joins purely on
--     d.vehicle_type = r.vehicle_type with no hardcoded value list, so new
--     enum members work with zero changes to the matching engine.
--   - document_type_enum: adds 'vehicle_photo' (Part 3 — vehicle images
--     clearly showing the vehicle and a readable number plate).
--     replace_driver_document()/driver_documents are both already
--     document-type-generic (the RPC takes document_type_enum as a plain
--     parameter), so this also needs no function changes.
--
-- ALTER TYPE ... ADD VALUE must be the only statement of its kind touching
-- a given type in a transaction that also uses the new value — kept in its
-- own migration file, with no other DDL/DML referencing these new values,
-- so it applies cleanly regardless of how the CLI batches transactions.
-- ============================================================================

alter type public.vehicle_type_enum add value if not exists 'scooty';
alter type public.vehicle_type_enum add value if not exists 'car';
alter type public.document_type_enum add value if not exists 'vehicle_photo';
