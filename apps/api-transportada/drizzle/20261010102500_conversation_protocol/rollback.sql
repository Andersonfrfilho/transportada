-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz o protocolo da conversa (Spec 263 D8, ADR-0101). Sem CASCADE. Não recusa: recusar tornaria o
-- rollback impossível.
-- ⚠️ PERDA DECLARADA: todo protocolo `AAMMDD-XXXX` é apagado — os que já foram citados ao motorista, ao
-- escritório ou à contratante deixam de existir e não são recuperáveis. Reaplicar a migration gera outros.
-- Reverta esta ANTES da `conversation_subject`: aquela não a conhece.

BEGIN;

SET LOCAL lock_timeout = '3s';

DROP TRIGGER "occurrence_conversations_protocol_immutable_trigger" ON "occurrence_conversations";
DROP TRIGGER "occurrence_conversations_assign_protocol_trigger" ON "occurrence_conversations";

DROP FUNCTION "reject_occurrence_conversation_protocol_change"();
DROP FUNCTION "assign_occurrence_conversation_protocol"();
DROP FUNCTION "conversation_protocol_suffix"();

ALTER TABLE "occurrence_conversations" DROP CONSTRAINT "occurrence_conversations_company_protocol_unique";
ALTER TABLE "occurrence_conversations" DROP CONSTRAINT "occurrence_conversations_protocol_check";
ALTER TABLE "occurrence_conversations" DROP COLUMN "protocol";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261010102500_conversation_protocol';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one conversation_protocol journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
