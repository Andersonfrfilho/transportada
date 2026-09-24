-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 182: o tipo `cargo` (foto da mercadoria) e o índice único parcial que o deixava
-- somar — de volta ao `check` com dois tipos e à unicidade total por entrega e tipo.
--
-- ⚠️ Este rollback FALHA se já existir qualquer linha `kind = 'cargo'`: o CHECK antigo a recusaria,
-- e recriá-lo sem checar apagaria em silêncio a foto da carga que o operador anexou. Nesse caso não
-- desfaz — nenhum dado é perdido. Remover essas linhas, se for a decisão, é passo manual à parte.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "trip_delivery_proofs" WHERE "kind" = 'cargo') THEN
    RAISE EXCEPTION 'trip_delivery_proofs has cargo rows, refusing rollback';
  END IF;
END
$$;

ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_kind_check";
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_kind_check"
  CHECK ("kind" in ('photo', 'signature'));

DROP INDEX "trip_delivery_proofs_company_event_kind_unique";
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_company_event_kind_unique"
  UNIQUE ("company_id", "stop_event_id", "kind");

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260924142302_delivery_proof_cargo_kind';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_proof_cargo_kind journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
