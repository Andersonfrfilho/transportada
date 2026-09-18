-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 156 T6 (ADR-0067 §5, emenda 2026-09-18): o relaxamento de
-- `trip_delivery_proofs_receiver_check` que passou a aceitar `receiver_name` em `kind = 'photo'`
-- quando `channel = 'office'` (o canhoto do escritório com o nome de quem recebeu, D8).
--
-- ⚠️ Este rollback FALHA se já existir uma linha `channel = 'office'`, `kind <> 'signature'` com
-- `receiver_name` preenchido: o CHECK antigo recusaria essa linha, e recriá-lo sem checar apagaria
-- a prova de quem recebeu em silêncio. Nesse caso não desfaz — nenhum dado é perdido.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "trip_delivery_proofs"
    WHERE "kind" <> 'signature'
      AND "channel" = 'office'
      AND length("receiver_name") > 0
  ) THEN
    RAISE EXCEPTION 'trip_delivery_proofs has office photo rows with receiver_name filled, refusing rollback';
  END IF;
END
$$;

ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_receiver_check";
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_receiver_check"
  CHECK ("kind" = 'signature' or length("receiver_name") = 0);

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260918070043_delivery_proof_office_receiver_name';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_proof_office_receiver_name journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
