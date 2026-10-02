-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 196 nas três tabelas de evento que ganharam posição agora: tira o índice, os
-- CHECKs e as cinco colunas de `trip_status_events`, `trip_stop_occurrences` e
-- `trip_document_occurrences`.
--
-- ⚠️ O que se perde é a coordenada em si — latitude, longitude, precisão, hora da leitura e
-- estado de todo evento gravado depois da migration. Não é reconstituível de nenhuma outra
-- coluna: o ponto só existe aqui.
--
-- ⚠️ Ordem: reverta a API **antes** deste script. Com o código novo no ar e as colunas fora, toda
-- escrita de evento passa a falhar com 42703, e a leitura da linha do tempo junto.
BEGIN;

DROP INDEX IF EXISTS "trip_status_events_located_recorded_at_idx";
DROP INDEX IF EXISTS "trip_stop_occurrences_located_created_at_idx";
DROP INDEX IF EXISTS "trip_document_occurrences_located_created_at_idx";

ALTER TABLE "trip_status_events"
  DROP CONSTRAINT IF EXISTS "trip_status_events_coordinates_check",
  DROP CONSTRAINT IF EXISTS "trip_status_events_latitude_range_check",
  DROP CONSTRAINT IF EXISTS "trip_status_events_longitude_range_check",
  DROP CONSTRAINT IF EXISTS "trip_status_events_accuracy_check",
  DROP CONSTRAINT IF EXISTS "trip_status_events_location_state_check",
  DROP CONSTRAINT IF EXISTS "trip_status_events_location_state_consistency_check",
  DROP CONSTRAINT IF EXISTS "trip_status_events_coordinates_channel_check",
  DROP CONSTRAINT IF EXISTS "trip_status_events_location_state_channel_check";

ALTER TABLE "trip_stop_occurrences"
  DROP CONSTRAINT IF EXISTS "trip_stop_occurrences_coordinates_check",
  DROP CONSTRAINT IF EXISTS "trip_stop_occurrences_latitude_range_check",
  DROP CONSTRAINT IF EXISTS "trip_stop_occurrences_longitude_range_check",
  DROP CONSTRAINT IF EXISTS "trip_stop_occurrences_accuracy_check",
  DROP CONSTRAINT IF EXISTS "trip_stop_occurrences_location_state_check",
  DROP CONSTRAINT IF EXISTS "trip_stop_occurrences_location_state_consistency_check",
  DROP CONSTRAINT IF EXISTS "trip_stop_occurrences_coordinates_channel_check",
  DROP CONSTRAINT IF EXISTS "trip_stop_occurrences_location_state_channel_check";

ALTER TABLE "trip_document_occurrences"
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_coordinates_check",
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_latitude_range_check",
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_longitude_range_check",
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_accuracy_check",
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_location_state_check",
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_location_state_consistency_check",
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_coordinates_channel_check",
  DROP CONSTRAINT IF EXISTS "trip_document_occurrences_location_state_channel_check";

ALTER TABLE "trip_status_events"
  DROP COLUMN IF EXISTS "latitude",
  DROP COLUMN IF EXISTS "longitude",
  DROP COLUMN IF EXISTS "accuracy_meters",
  DROP COLUMN IF EXISTS "captured_at",
  DROP COLUMN IF EXISTS "location_state";

ALTER TABLE "trip_stop_occurrences"
  DROP COLUMN IF EXISTS "latitude",
  DROP COLUMN IF EXISTS "longitude",
  DROP COLUMN IF EXISTS "accuracy_meters",
  DROP COLUMN IF EXISTS "captured_at",
  DROP COLUMN IF EXISTS "location_state";

ALTER TABLE "trip_document_occurrences"
  DROP COLUMN IF EXISTS "latitude",
  DROP COLUMN IF EXISTS "longitude",
  DROP COLUMN IF EXISTS "accuracy_meters",
  DROP COLUMN IF EXISTS "captured_at",
  DROP COLUMN IF EXISTS "location_state";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261002033125_occurrence_location_stamp';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_location_stamp journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
