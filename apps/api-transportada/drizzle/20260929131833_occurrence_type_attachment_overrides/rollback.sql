-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 218 RF-B1: apaga as duas tabelas de exceção de `attachmentMode` por tipo de
-- ocorrência (contratante e destinatário). Sem backfill nesta migration — granularidade nova, sem
-- dado anterior equivalente — então não há nada além das duas tabelas para desfazer.
BEGIN;

DROP TABLE IF EXISTS "company_occurrence_type_contractor_overrides";
DROP TABLE IF EXISTS "company_occurrence_type_recipient_overrides";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260929131833_occurrence_type_attachment_overrides';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_type_attachment_overrides journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
