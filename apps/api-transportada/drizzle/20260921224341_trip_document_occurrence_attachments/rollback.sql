-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 161 T1: a tabela `trip_document_occurrence_attachments` (fotos da ocorrência de
-- galpão, original + miniatura), os purposes `trip_occurrence_attachment` e
-- `trip_occurrence_thumbnail` em `stored_objects`, e o unique `(company_id, id)` de
-- `trip_document_occurrences` que a FK composta da tabela nova exigia.
--
-- O que se perde: nenhuma foto de ocorrência de galpão sobrevive ao rollback — a tabela é
-- apagada inteira, e com ela a ligação entre ocorrência e as fotos que ela tinha. A coluna
-- `attachment_object_id` (ocorrência de rua, D6) não é tocada.
--
-- Recusa (RAISE) em vez de apagar dado de verdade: linha na tabela nova, ou `stored_objects` com
-- qualquer um dos dois purposes novos, faz o rollback parar antes de qualquer DDL.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "trip_document_occurrence_attachments") THEN
    RAISE EXCEPTION 'trip_document_occurrence_attachments has rows, refusing rollback';
  END IF;
END
$$;

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected
    FROM "stored_objects"
    WHERE "purpose" IN ('trip_occurrence_attachment', 'trip_occurrence_thumbnail');
  IF affected > 0 THEN
    RAISE EXCEPTION 'Stored objects with purpose trip_occurrence_attachment/trip_occurrence_thumbnail: %. Remove them before rolling back.', affected;
  END IF;
END
$$;

DROP TABLE "trip_document_occurrence_attachments";

ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check",
  ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document', 'delivery_proof', 'aggregate_application_attachment', 'contractor_mail_raw'));

ALTER TABLE "trip_document_occurrences" DROP CONSTRAINT "trip_document_occurrences_company_id_id_unique";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260921224341_trip_document_occurrence_attachments'
      AND "hash" = '6dfd51b05ee14b037fe686ee279d4a32ed700e221bd743ef9b17e47387a044c5';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_document_occurrence_attachments migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
