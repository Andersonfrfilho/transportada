-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 156 T15 A2 (ADR-0067 §5): o relaxamento de
-- `trip_delivery_proofs_receiver_document_check` que passou a aceitar o documento do recebedor
-- selado em `kind = 'photo'` quando `channel = 'office'` (o canhoto do escritório, D8).
--
-- ⚠️ Este rollback FALHA se já existir uma linha `channel = 'office'`, `kind <> 'signature'` com
-- envelope preenchido: o CHECK antigo recusaria essa linha, e recriá-lo sem checar apagaria o
-- documento de quem recebeu em silêncio. Nesse caso não desfaz — nenhum dado é perdido.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "trip_delivery_proofs"
    WHERE "kind" <> 'signature'
      AND "channel" = 'office'
      AND "receiver_document_envelope" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'trip_delivery_proofs has office photo rows with a sealed receiver document, refusing rollback';
  END IF;
END
$$;

ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_receiver_document_check";
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_receiver_document_check"
  CHECK (("kind" = 'signature' or "receiver_document_envelope" is null) and (("receiver_document_envelope" is null) = (length("receiver_document_masked") = 0)));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260918170550_delivery_proof_office_receiver_document';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_proof_office_receiver_document journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
