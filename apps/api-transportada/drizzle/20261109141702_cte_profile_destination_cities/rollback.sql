-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 312: o perfil de CT-e deixa de poder se restringir a cidades de destino.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com perfil que ainda tem lista de cidades: soltar a coluna
-- faria o perfil regional passar a valer para qualquer cidade, e com isso mudaria o percentual cobrado.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  with_cities integer;
BEGIN
  SELECT count(*) INTO with_cities FROM "cte_emission_profiles" WHERE "destination_cities" IS NOT NULL;
  IF with_cities > 0 THEN
    RAISE EXCEPTION '% CT-e profiles still have destination cities; refusing to drop the column', with_cities;
  END IF;
END
$$;

ALTER TABLE "cte_emission_profiles" DROP COLUMN "destination_cities";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261109141702_cte_profile_destination_cities';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte_profile_destination_cities journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
