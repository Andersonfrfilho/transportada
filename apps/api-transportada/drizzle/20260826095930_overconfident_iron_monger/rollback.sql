-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 057 (ADR-0045): as três tabelas da execução de campo.
--
-- Perde-se o que aconteceu na rua: chegada, entrega, retorno e ocorrência, com a coordenada que
-- carimbou cada confirmação. `trip_stops.arrived_at` e `completed_at` **permanecem** — quem escreve
-- neles é o caso de uso, não estas tabelas —, então a viagem continua legível depois do rollback;
-- o que some é o detalhe de campo e a medição de tempo de atendimento que a 058 e a 060 leem.
--
-- Exportar `trip_stop_occurrences` antes é o passo do runbook: ela é relato de campo digitado uma
-- vez, e não se reconstrói de lugar nenhum.
BEGIN;

DROP TABLE IF EXISTS "trip_stop_occurrences";
DROP TABLE IF EXISTS "trip_stop_events";
DROP TABLE IF EXISTS "trip_field_reports";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260826095930_overconfident_iron_monger'
      AND "hash" = 'f12edccf04bb7d2546410599fcf2a5a35ec5e8191de08233ba57f8c85da790ec';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one overconfident_iron_monger migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
