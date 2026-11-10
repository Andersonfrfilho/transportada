-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 318 T2: remove a tabela do canal de ocorrencia por contratante. Os canais configurados se perdem.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com canal de grupo configurado.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  group_channels integer;
BEGIN
  SELECT count(*) INTO group_channels FROM "contractor_occurrence_channels" WHERE "channel" <> 'email';
  IF group_channels > 0 THEN
    RAISE EXCEPTION 'contractor_occurrence_channels has % non-email rows; refusing to drop', group_channels;
  END IF;
END
$$;

DROP TABLE "contractor_occurrence_channels";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261110172434_contractor_occurrence_channels';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_occurrence_channels journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
