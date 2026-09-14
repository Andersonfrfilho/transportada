-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte o recuo da liquidação dos pedidos de WhatsApp (spec 144 T020, B2): somem a contagem de
-- tentativas, a hora da próxima e o desfecho `settlement_failed`.
--
-- O pedido encerrado como `settlement_failed` continua `settled_partial`; o desfecho volta a
-- `billing_failed`, o mais próximo do vocabulário anterior, para o CHECK antigo aceitar a linha.
-- Nada é apagado: a trilha em `audit_logs` fica.
BEGIN;

UPDATE "whatsapp_command_requests"
  SET "settlement_outcome" = 'billing_failed'
  WHERE "settlement_outcome" = 'settlement_failed';

ALTER TABLE "whatsapp_command_requests" DROP CONSTRAINT "whatsapp_command_requests_settlement_outcome_check",
  ADD CONSTRAINT "whatsapp_command_requests_settlement_outcome_check" CHECK ("settlement_outcome" is null or "settlement_outcome" in ('completed', 'timed_out', 'actor_not_authorized', 'billing_failed'));
ALTER TABLE "whatsapp_command_requests"
  DROP CONSTRAINT IF EXISTS "whatsapp_command_requests_settlement_attempts_check";
ALTER TABLE "whatsapp_command_requests" DROP COLUMN IF EXISTS "next_settlement_at";
ALTER TABLE "whatsapp_command_requests" DROP COLUMN IF EXISTS "settlement_attempts";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260913032201_whatsapp_command_settlement_retry'
      AND "hash" = '66b3e6f540169c8858a24ce0ccc109773188b55dfa2f26f3c67da3e869da8b2a';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_command_settlement_retry migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
