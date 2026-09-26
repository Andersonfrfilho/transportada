-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 216: exige `vehicle_id` de novo em toda viagem.
--
-- ⚠️ DESTRUTIVO PARA VIAGEM EM `awaiting_crew` SEM VEÍCULO: qualquer linha sem `vehicle_id`
-- (criada depois desta migration) impede o `SET NOT NULL` — o rollback falha ruidosamente em vez de
-- apagar viagem, então rode só depois de a app já ter voltado à versão anterior a esta spec (nenhuma
-- viagem nova nasce sem veículo) e de toda viagem `awaiting_crew` pendente ter sido completada ou
-- cancelada.

BEGIN;

ALTER TABLE "trips" ALTER COLUMN "vehicle_id" SET NOT NULL;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260926195419_trip_vehicle_optional';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one trip_vehicle_optional migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
