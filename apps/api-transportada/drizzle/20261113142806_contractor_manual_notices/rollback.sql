-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 324 T2: remove o registro do aviso manual à contratante.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com aviso gravado: a tabela é o único registro de quem avisou a
-- contratante pelo botão, por qual canal e quando (a reserva em `idempotency_records` só guarda o último estado).
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  stored_notices integer;
BEGIN
  SELECT count(*) INTO stored_notices FROM "occurrence_contractor_manual_notices";
  IF stored_notices > 0 THEN
    RAISE EXCEPTION 'occurrence_contractor_manual_notices has % rows; refusing to drop the spec 324 T2 table', stored_notices;
  END IF;
END
$$;

DROP TABLE "occurrence_contractor_manual_notices";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261113142806_contractor_manual_notices';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_manual_notices journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
