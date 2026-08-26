-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 065 D4c: `trips.requires_mdfe` e a trilha da sobrescrita saem da tabela.
--
-- Reverter **quebra** se alguma viagem tiver sobrescrita viva. Dispensa de MDF-e e decisao assinada
-- por gente, com motivo na trilha; apagar isso em silencio faria a viagem voltar a derivar da
-- classificacao — e a carga que alguem dispensou de proposito passaria a cobrar manifesto, ou o
-- contrario. A excecao abaixo mostra quantas sao, e quem reverte decide o que fazer com elas.
BEGIN;

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected FROM "trips" WHERE "requires_mdfe" IS NOT NULL;
  IF affected > 0 THEN
    RAISE EXCEPTION 'Trips with an explicit MDF-e requirement: %. Decide them before rolling back.',
      affected;
  END IF;
END
$$;

ALTER TABLE "trips" DROP CONSTRAINT "trips_requires_mdfe_trail_check";
ALTER TABLE "trips" DROP CONSTRAINT "trips_requires_mdfe_reason_check";
ALTER TABLE "trips" DROP CONSTRAINT "trips_requires_mdfe_actor_membership_fk";
ALTER TABLE "trips" DROP COLUMN "requires_mdfe_set_at";
ALTER TABLE "trips" DROP COLUMN "requires_mdfe_actor_user_id";
ALTER TABLE "trips" DROP COLUMN "requires_mdfe_reason";
ALTER TABLE "trips" DROP COLUMN "requires_mdfe";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260826192739_striped_satana'
      AND "hash" = 'cafe23fed3ac39963114038c7c66dd28a710c374bd4861da529a63a0186dab57';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one striped_satana migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
