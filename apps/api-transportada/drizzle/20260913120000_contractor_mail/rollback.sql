-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 143 (ADR-0063): as tabelas do e-mail com contratantes, a coluna de autoria em
-- `delivery_charge_events` e o envio automático por tipo de ocorrência.
--
-- ⚠️ **Seguro só antes de existir decisão por e-mail.** Enquanto `decided_by_message_id` estiver
-- vazio em toda linha de `delivery_charge_events`, apagar a coluna não perde nada — nenhuma taxa foi
-- aprovada ou recusada por e-mail ainda. Depois da primeira decisão por essa via, a coluna É a
-- autoria daquele evento: apagá-la junto com `contractor_mail_messages` (que guarda a mensagem que
-- decidiu) transforma "quem decidiu isso?" numa pergunta sem resposta. Rode este rollback só se
-- `select count(*) from delivery_charge_events where decided_by_message_id is not null` for zero.
--
-- ⚠️ O CHECK que este rollback derruba (`delivery_charge_events_authorship_check`) é o único que já
-- existiu para "ator xor token xor mensagem" — a tabela nunca teve um CHECK de autoria antes desta
-- migration (só `delivery_charge_events_name_check`). Não há CHECK antigo para restaurar.
BEGIN;

ALTER TABLE "delivery_charge_events"
  DROP CONSTRAINT IF EXISTS "delivery_charge_events_decided_by_message_fk";

ALTER TABLE "delivery_charge_events"
  DROP CONSTRAINT IF EXISTS "delivery_charge_events_authorship_check";

ALTER TABLE "delivery_charge_events"
  DROP COLUMN IF EXISTS "decided_by_message_id";

ALTER TABLE "company_occurrence_types"
  DROP COLUMN IF EXISTS "emails_contractor";

DROP TABLE IF EXISTS "contractor_mail_outbox";
DROP TABLE IF EXISTS "contractor_inbound_email_outbox";
DROP TABLE IF EXISTS "contractor_mail_messages";
DROP TABLE IF EXISTS "contractor_mail_threads";
DROP TABLE IF EXISTS "contractor_contacts";
DROP TABLE IF EXISTS "contractor_mail_settings";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260913120000_contractor_mail';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_mail journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
