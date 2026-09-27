-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 206 (ADR-0088): a saída para a parada, o cancelamento dela e o estado "a caminho".
--
-- ⚠️ DESTRUTIVO PARA O DADO DE TRAJETO, e é de propósito — ao contrário do rollback da 158, que recusa
-- enquanto houver histórico, este apaga. O que se perde:
--
--   * todo `trip_stop_events` de kind `departed` e `departure_cancelled` — a perna "saí → cheguei" de
--     cada parada, e o registro de quem desistiu de qual parada;
--   * `trip_stops.en_route_since` e `en_route_tapped_at` — qual parada estava a caminho agora;
--   * `trip_stop_events.tapped_at` — a hora do toque de TODO evento, não só dos dois kinds novos;
--   * `trip_field_reports.result_changed` — o desfecho registrado de cada toque.
--
-- Por isso ele só roda **antes de haver uso real** ou com **aprovação humana explícita**, e só depois de
-- a app e a API já terem voltado (ADR-0081 §9; o roteiro está em `specs/206-.../evidence.md`, T0.2).
-- A amostra de trajeto é derivada na leitura, nunca coluna, então não há nada a mais para apagar.
--
-- O que **sobrevive, e é inofensivo**: as linhas de `trip_field_reports` com
-- `operation in ('stop.depart', 'stop.cancel-departure')`. Elas não têm FK para o evento, e uma app
-- velha nunca reusa aquelas chaves de idempotência. Apagá-las abriria a porta para um reenvio antigo
-- ser processado como novo, o que é pior do que deixá-las.

BEGIN;

DROP INDEX IF EXISTS "trip_stops_one_en_route_per_trip_idx";

ALTER TABLE "trip_stops" DROP CONSTRAINT IF EXISTS "trip_stops_en_route_tapped_check";

ALTER TABLE "trip_stops" DROP CONSTRAINT IF EXISTS "trip_stops_en_route_open_check";

ALTER TABLE "trip_stops" DROP COLUMN IF EXISTS "en_route_tapped_at";

ALTER TABLE "trip_stops" DROP COLUMN IF EXISTS "en_route_since";

-- Antes de encolher o vocabulário: sem isto, o CHECK antigo recusaria a validação com as linhas no lugar
DELETE FROM "trip_stop_events" WHERE "kind" IN ('departed', 'departure_cancelled');

ALTER TABLE "trip_stop_events" DROP COLUMN IF EXISTS "tapped_at";

ALTER TABLE "trip_stop_events" DROP CONSTRAINT "trip_stop_events_kind_check";

ALTER TABLE "trip_stop_events" ADD CONSTRAINT "trip_stop_events_kind_check"
  CHECK ("kind" in ('arrived', 'delivered', 'returned', 'occurrence'));

ALTER TABLE "trip_field_reports" DROP COLUMN IF EXISTS "result_changed";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260926140647_stop_departure';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one stop_departure migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
