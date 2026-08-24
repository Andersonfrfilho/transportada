-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Estreita o CHECK de cte_batch_events de volta aos sete nomes anteriores, tirando
-- 'items_appended' — o evento que a fatia seguinte do lote grava.
-- Recusa rodar enquanto existir evento com esse nome: estreitar o CHECK falharia com erro do
-- Postgres, e apagar a linha para caber apagaria a trilha da fatia que já entrou no lote.
-- Para prosseguir, decida o que fazer com a história primeiro:
-- select batch_id, count(*) from cte_batch_events where event_name = 'items_appended' group by 1;
BEGIN;

DO $$
DECLARE
  appended_events integer;
BEGIN
  SELECT count(*) INTO appended_events
    FROM "cte_batch_events" WHERE "event_name" = 'items_appended';

  IF appended_events > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back the cte batch event names: % appended-slice events would no longer fit the check',
      appended_events;
  END IF;
END
$$;

ALTER TABLE "cte_batch_events"
  DROP CONSTRAINT "cte_batch_events_name_check",
  ADD CONSTRAINT "cte_batch_events_name_check" CHECK ("event_name" in ('created', 'updated', 'submitted', 'in_flight', 'done', 'error', 'cancelled'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260824153250_public_rattler'
      AND "hash" = '2cca15da3763901b6ef1ec188cd16045371ab480dec7e154bf8dd2e7d88cc119';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cte batch event name migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
