-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a T1.4 da spec 196: o CHECK de coordenada das três tabelas volta a aceitar só o canal
-- `driver_app`.
--
-- ⚠️ ESTRATÉGIA: RECUSAR, NÃO APAGAR. Se já existe linha `whatsapp` com coordenada, restaurar o CHECK
-- antigo falharia de qualquer jeito; este script então aborta ANTES de tocar em qualquer coisa, com a
-- contagem por tabela. A alternativa (anular a coordenada e voltar o estado para `unavailable`) foi
-- descartada de propósito: é posição de pessoa (LGPD) e perdê-la é irreversível, então a decisão de
-- destruir é de quem opera, não do script. Quem decidir apagar roda, por tabela, antes de repetir:
--   UPDATE "<tabela>" SET "latitude" = NULL, "longitude" = NULL, "accuracy_meters" = NULL,
--     "captured_at" = NULL, "location_state" = 'unavailable'
--   WHERE "channel" = 'whatsapp' AND "latitude" IS NOT NULL;
-- Linha `whatsapp` sem coordenada (estado `unavailable` ou nulo) não é afetada e fica como está.
--
-- ⚠️ Ordem: reverta a API **antes** deste script, ou ela volta a gravar coordenada de WhatsApp e o
-- INSERT passa a falhar com 23514.
BEGIN;

DO $$
DECLARE
  offending integer;
  report text := '';
BEGIN
  SELECT count(*) INTO offending FROM "trip_status_events"
    WHERE "channel" <> 'driver_app' AND "latitude" IS NOT NULL;
  IF offending > 0 THEN
    report := report || format(' trip_status_events=%s', offending);
  END IF;
  SELECT count(*) INTO offending FROM "trip_stop_occurrences"
    WHERE "channel" <> 'driver_app' AND "latitude" IS NOT NULL;
  IF offending > 0 THEN
    report := report || format(' trip_stop_occurrences=%s', offending);
  END IF;
  SELECT count(*) INTO offending FROM "trip_document_occurrences"
    WHERE "channel" <> 'driver_app' AND "latitude" IS NOT NULL;
  IF offending > 0 THEN
    report := report || format(' trip_document_occurrences=%s', offending);
  END IF;
  IF report <> '' THEN
    RAISE EXCEPTION 'Rollback recusado: existe coordenada fora do canal driver_app (%). Anule-as conscientemente (ver cabeçalho) antes de repetir.', trim(report);
  END IF;
END
$$;

ALTER TABLE "trip_status_events"
  DROP CONSTRAINT IF EXISTS "trip_status_events_coordinates_channel_check",
  ADD CONSTRAINT "trip_status_events_coordinates_channel_check" CHECK ("latitude" is null or "channel" = 'driver_app');

ALTER TABLE "trip_stop_occurrences"
  DROP CONSTRAINT IF EXISTS "trip_stop_occurrences_coordinates_channel_check",
  ADD CONSTRAINT "trip_stop_occurrences_coordinates_channel_check" CHECK ("latitude" is null or "channel" = 'driver_app');

ALTER TABLE "trip_document_occurrences"
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_coordinates_channel_check",
  ADD CONSTRAINT "trip_document_occurrences_coordinates_channel_check" CHECK ("latitude" is null or "channel" = 'driver_app');

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261003010806_event_location_whatsapp_coordinate';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one event_location_whatsapp_coordinate journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
