-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 193 (ADR-0079 Parte A): tira `received_by`/`received_by_detail` do comprovante e
-- `received_by` das duas tabelas de configuração, e volta o `receiver_check` para "assinatura, ou
-- canal office, ou sem nome".
--
-- ⚠️ Este rollback FALHA, sem desfazer nada, se já existir dado que ele apagaria ou que o CHECK
-- antigo recusaria:
--   * comprovante com relação ou detalhe gravados (quem recebeu, dado de contestação);
--   * foto do motorista (`photo` fora do canal `office`) com nome — o CHECK antigo a recusaria, e
--     recriá-lo sem checar apagaria em silêncio o nome que o motorista digitou;
--   * configuração (geral ou exceção) com `received_by` diferente do padrão `optional` — a escolha
--     do operador sumiria sem aviso.
-- Nesses casos a reversão é **só de código** (ADR-0079, Consequências): as colunas ficam e deixam de
-- ser escritas ou lidas. Apagar esses dados, se for a decisão, é passo manual à parte.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "trip_delivery_proofs"
    WHERE "received_by" IS NOT NULL OR "received_by_detail" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'trip_delivery_proofs has received_by data, refusing rollback';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "trip_delivery_proofs"
    WHERE "kind" <> 'signature' AND "channel" <> 'office' AND length("receiver_name") > 0
  ) THEN
    RAISE EXCEPTION 'trip_delivery_proofs has driver photos with receiver_name, refusing rollback';
  END IF;

  IF EXISTS (SELECT 1 FROM "company_delivery_proof_settings" WHERE "received_by" <> 'optional')
    OR EXISTS (SELECT 1 FROM "delivery_proof_setting_overrides" WHERE "received_by" <> 'optional')
  THEN
    RAISE EXCEPTION 'delivery proof settings have a received_by choice, refusing rollback';
  END IF;
END
$$;

ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_receiver_check";
ALTER TABLE "trip_delivery_proofs" ADD CONSTRAINT "trip_delivery_proofs_receiver_check"
  CHECK ("kind" = 'signature' or "channel" = 'office' or length("receiver_name") = 0);

ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_received_by_kind_check";
ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_received_by_detail_check";
ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_received_by_check";
ALTER TABLE "trip_delivery_proofs" DROP COLUMN "received_by_detail";
ALTER TABLE "trip_delivery_proofs" DROP COLUMN "received_by";

ALTER TABLE "delivery_proof_setting_overrides"
  DROP CONSTRAINT "delivery_proof_setting_overrides_received_by_check";
ALTER TABLE "delivery_proof_setting_overrides" DROP COLUMN "received_by";

ALTER TABLE "company_delivery_proof_settings"
  DROP CONSTRAINT "company_delivery_proof_settings_received_by_check";
ALTER TABLE "company_delivery_proof_settings" DROP COLUMN "received_by";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260926002743_delivery_proof_received_by';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_proof_received_by journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
