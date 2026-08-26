-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 065: `not_applicable` sai do vocabulario de `trips.fiscal_readiness_state`.
--
-- Reverter **quebra** se alguma viagem ja estiver nesse estado: o CHECK antigo a recusa. E
-- deliberado que quebre em vez de reescrever o estado — viagem so de entrega urbana passaria a
-- constar como "incompleta", que e a mentira que esta spec veio consertar. Quem reverter decide para
-- onde essas viagens vao, e a excecao abaixo mostra quantas sao.
BEGIN;

DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected FROM "trips" WHERE "fiscal_readiness_state" = 'not_applicable';
  IF affected > 0 THEN
    RAISE EXCEPTION 'Trips in not_applicable: %. Decide their state before rolling back.', affected;
  END IF;
END
$$;

ALTER TABLE "trips" DROP CONSTRAINT "trips_fiscal_readiness_check",
  ADD CONSTRAINT "trips_fiscal_readiness_check" CHECK ("fiscal_readiness_state" in ('incomplete', 'ready', 'manifested', 'divergent'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260826161437_nervous_aqueduct'
      AND "hash" = 'a1441fbb3133d43d6aec56d72ccf31e8be46f4b9d3d8bb071b01708ab992b216';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nervous_aqueduct migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
