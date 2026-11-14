-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 325 T7.2: remove o schema dos lembretes de vencimento e da baixa por resposta.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar quando houver dado que só existe aqui: responsável de conta, avisos ou
-- resumos já enviados, link de "Já paguei", configuração de lembretes ou baixa por resposta. Perder o registro de avisos
-- reenviaria o aviso do dia; perder a marca da baixa por resposta impediria o desfazer. Trate cada caso antes.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  responsibles integer;
  reminder_settings integer;
  reminders integer;
  summaries integer;
  links integer;
  reply_settlements integer;
BEGIN
  SELECT count(*) INTO responsibles FROM "company_expenses" WHERE "responsible_user_id" IS NOT NULL;
  SELECT count(*) INTO reminder_settings FROM "company_expense_reminder_settings";
  SELECT count(*) INTO reminders FROM "company_expense_reminders_sent";
  SELECT count(*) INTO summaries FROM "company_expense_summaries_sent";
  SELECT count(*) INTO links FROM "company_expense_reply_links";
  SELECT count(*) INTO reply_settlements FROM "company_expense_occurrences" WHERE "settled_via_channel" IS NOT NULL;
  IF responsibles > 0 OR reminder_settings > 0 OR reminders > 0 OR summaries > 0 OR links > 0 OR reply_settlements > 0 THEN
    RAISE EXCEPTION 'reminder data exists (% responsibles, % settings, % reminders, % summaries, % links, % reply settlements); refusing to drop the spec 325 T7.2 schema',
      responsibles, reminder_settings, reminders, summaries, links, reply_settlements;
  END IF;
END
$$;

DROP TABLE "company_expense_reply_links";
DROP TABLE "company_expense_summaries_sent";
DROP TABLE "company_expense_reminders_sent";
DROP TABLE "company_expense_reminder_settings";

ALTER TABLE "company_expense_occurrences" DROP CONSTRAINT "company_expense_occurrences_reply_check";
ALTER TABLE "company_expense_occurrences" DROP COLUMN "settled_by_reply_at";
ALTER TABLE "company_expense_occurrences" DROP COLUMN "settled_via_channel";

ALTER TABLE "company_expenses" DROP CONSTRAINT "company_expenses_responsible_user_fk";
ALTER TABLE "company_expenses" DROP COLUMN "responsible_user_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261114001611_company_expense_reminders';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_expense_reminders journal entry, removed %', deleted_migrations;
  END IF;
END
$$;

COMMIT;
