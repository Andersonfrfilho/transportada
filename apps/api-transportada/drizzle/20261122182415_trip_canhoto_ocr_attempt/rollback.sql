-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Tira a fila do OCR do Nº/Série do canhoto (spec 344 D7). As tentativas de OCR já carimbadas se
-- perdem: reaplicar a migration devolve todas as provas pendentes sem leitura à fila do OCR.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP INDEX "trip_delivery_proofs_canhoto_ocr_pending_idx";
ALTER TABLE "trip_delivery_proofs" DROP COLUMN "canhoto_ocr_attempted_at";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261122182415_trip_canhoto_ocr_attempt';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_canhoto_ocr_attempt journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
