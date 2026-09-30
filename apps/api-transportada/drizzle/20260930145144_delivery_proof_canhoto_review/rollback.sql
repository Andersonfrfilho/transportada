-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 220 (RF24-RF28): tira o veredito de conferência do canhoto e a leitura que o
-- alimenta. Destrutivo por natureza — apaga veredito, motivo, nota e a nota lida de cada
-- comprovante. Nada aqui é recuperável depois do COMMIT.
BEGIN;

ALTER TABLE "trip_delivery_proofs"
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_company_canhoto_read_document_fk";

ALTER TABLE "trip_delivery_proofs"
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_review_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_review_kind_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_review_origin_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_review_resolved_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_review_at_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_review_actor_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_review_reason_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_review_reason_list_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_review_note_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_review_note_length_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_read_source_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_read_number_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_read_series_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_read_kind_check",
  DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_canhoto_auto_approval_check";

ALTER TABLE "trip_delivery_proofs"
  DROP COLUMN IF EXISTS "canhoto_review",
  DROP COLUMN IF EXISTS "canhoto_review_origin",
  DROP COLUMN IF EXISTS "canhoto_review_by_user_id",
  DROP COLUMN IF EXISTS "canhoto_review_at",
  DROP COLUMN IF EXISTS "canhoto_review_reason",
  DROP COLUMN IF EXISTS "canhoto_review_note",
  DROP COLUMN IF EXISTS "canhoto_read_number",
  DROP COLUMN IF EXISTS "canhoto_read_series",
  DROP COLUMN IF EXISTS "canhoto_read_source",
  DROP COLUMN IF EXISTS "canhoto_read_document_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260930145144_delivery_proof_canhoto_review';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_proof_canhoto_review journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
