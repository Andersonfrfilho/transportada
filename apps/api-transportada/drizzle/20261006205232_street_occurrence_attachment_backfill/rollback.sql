-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 246 T1d.2 tirando SÓ o registro do journal. As linhas que o backfill gravou em
-- `trip_document_occurrence_attachments` FICAM, de propósito: não há como distinguir a linha que o
-- backfill criou da que a escrita dupla (T1d.5) gravou depois, e apagar pelo `stored_object_id`
-- levaria junto a foto registrada já com a escrita nova. Ficar não muda o que se lê: a coluna
-- `attachment_object_id` continua gravada e a leitura "linha nova, senão coluna antiga" (161 T10)
-- devolve a mesma foto, uma vez. Reaplicar a migration não duplica nada (o `NOT EXISTS`).

BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261006205232_street_occurrence_attachment_backfill';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one street_occurrence_attachment_backfill journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
