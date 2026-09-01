-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a ADR-0047: o papel `automation` sai do CHECK de `membership_roles`.
--
-- Reverter **quebra** se alguma membership de service account ja existir — e e deliberado que
-- quebre. Apagar a membership do worker em silencio desligaria o gatilho automatico do MDF-e sem
-- nada acusar: as viagens ficariam prontas e ninguem emitiria. Quem reverter decide o que fazer com
-- o servico, e a excecao abaixo diz quantas memberships estao em jogo.
BEGIN;

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected FROM "membership_roles" WHERE "role" = 'automation';
  IF affected > 0 THEN
    RAISE EXCEPTION 'Service account memberships in automation: %. Decide their fate before rolling back.', affected;
  END IF;
END
$$;

ALTER TABLE "membership_roles" DROP CONSTRAINT "membership_roles_role_check",
  ADD CONSTRAINT "membership_roles_role_check" CHECK ("role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260826232046_solid_jack_power'
      AND "hash" = '42bce37c122644c8b5c720b1bfa67a69202ed000e3e6b3be2a9140984f7ceb84';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one solid_jack_power migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
