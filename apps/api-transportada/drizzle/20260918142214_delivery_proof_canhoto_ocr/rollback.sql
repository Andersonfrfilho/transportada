-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 156 T13 (ADR-0069 §6): o interruptor `canhoto_ocr_enabled` da configuração do
-- comprovante. Empresa que tinha ligado volta ao padrão, desligado — a leitura do canhoto é
-- experimental e só sugere nota, então perder o valor só devolve a escolha manual, nunca apaga
-- comprovante nem histórico.
BEGIN;

ALTER TABLE "company_delivery_proof_settings" DROP COLUMN "canhoto_ocr_enabled";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260918142214_delivery_proof_canhoto_ocr';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_proof_canhoto_ocr journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
