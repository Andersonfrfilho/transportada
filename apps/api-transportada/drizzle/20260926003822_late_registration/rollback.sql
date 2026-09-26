-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 205 (D1): as colunas `late_registration` de `trip_stop_events` e
-- `trip_delivery_proofs` — o "Registrar entrega depois" da app do motorista.
--
-- O que se perde: o fato de a baixa ou o comprovante ter sido registrado depois. A pontualidade já
-- gravada (`trip_delivery_proofs.punctuality = 'late'`) fica, e a nota do motorista não muda — ela
-- lê só a pontualidade. As colunas são aditivas, com padrão `false`, e nada depende delas.

BEGIN;

ALTER TABLE "trip_delivery_proofs" DROP COLUMN "late_registration";

ALTER TABLE "trip_stop_events" DROP COLUMN "late_registration";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260926003822_late_registration';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one late_registration migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
