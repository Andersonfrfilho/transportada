-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 058 P2: o fuso da operacao em `company_route_optimization_settings`.
--
-- Reverter devolve a **premissa** que a coluna substituiu: o worker volta a assumir UTC-3 para toda
-- instalacao. Onde a operacao nao e UTC-3 (o Acre e UTC-5), a janela de atendimento do cliente passa
-- a ser lida com duas horas de erro, e o roteiro propoe chegada fora do horario da portaria — sem
-- aviso, porque a conta continua fechando.
BEGIN;

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected
    FROM "company_route_optimization_settings"
    WHERE "timezone" <> 'America/Sao_Paulo';
  IF affected > 0 THEN
    RAISE EXCEPTION 'Companies with a non-default timezone: %. Their delivery windows would be read with the wrong offset.', affected;
  END IF;
END
$$;

ALTER TABLE "company_route_optimization_settings" DROP COLUMN IF EXISTS "timezone";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260828002117_route_optimization_timezone'
      AND "hash" = 'a55b937ea2801f3fad0086b0c9dc5c292db13151d0a255d9418b049ce204ef1d';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one route_optimization_timezone migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
