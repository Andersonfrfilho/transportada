-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 252 T2.2: tira de `municipal_holidays` e `state_holidays` a coluna `provider_entry_id` com a
-- FK, o CHECK e o índice, apaga as seis tabelas da importação, o histórico e a linha do relógio da rotina
-- `holiday.provider.pull` e devolve as duas CHECK de `job` com a lista de antes.
--
-- ⚠️ Recusa rodar enquanto houver dado que a versão antiga não guarda: feriado importado (a coluna que
-- diz de onde ele veio some, e ele viraria data digitada sem ninguém ter decidido isso), supressão do
-- operador (o feriado que ele desligou voltaria sozinho), empresa que desligou a importação (o opt-out
-- `is_enabled = false` se perderia) ou execução aberta da rotina (o worker ainda está nela). O feriado
-- digitado e o gerado por regra não são tocados.
-- ⚠️ Passando a recusa, o rollback DESCARTA o cache do fornecedor (entradas, buscas e contador mensal) e a
-- demanda de cidades: refazer o que foi buscado custa cota da FeriadosAPI (Q3) e dias de ciclos de 100 pedidos.
-- Confira antes: select count(*) from municipal_holidays where provider_entry_id is not null;
--                select count(*) from state_holidays where provider_entry_id is not null;
--                select count(*) from holiday_import_suppressions;
--                select count(*) from company_holiday_import_settings where is_enabled = false;
-- Para seguir, o operador decide: apagar os importados (delete from municipal_holidays where
-- provider_entry_id is not null, e o mesmo em state_holidays) ou adotá-los (update ... set
-- provider_entry_id = null) — e exportar as supressões, que se perdem.
--
-- ⚠️ Reverter só com o worker também revertido — senão a batida publica um job que a CHECK recusa.
-- ⚠️ Reverta a API e o worker ANTES: com o código novo no ar e as tabelas fora, o calendário e a rotina
-- passam a falhar com 42P01.
BEGIN;

-- `DROP COLUMN` e `DROP CONSTRAINT` tomam ACCESS EXCLUSIVE nas duas tabelas até o COMMIT: aborta em vez de
-- enfileirar o roteirizador atrás de uma transação longa.
SET LOCAL lock_timeout = '3s';

-- A recusa lê estas tabelas e o resto do script as altera: travar antes fecha a janela em que uma linha
-- importada, uma supressão ou uma execução entra entre a contagem e o `DROP`.
LOCK TABLE "municipal_holidays", "state_holidays", "holiday_import_suppressions", "company_holiday_import_settings", "job_executions", "job_schedules" IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  imported_municipal integer;
  imported_state integer;
  suppressions integer;
  disabled_companies integer;
  open_executions integer;
BEGIN
  SELECT count(*) INTO imported_municipal FROM "municipal_holidays" WHERE "provider_entry_id" IS NOT NULL;
  SELECT count(*) INTO imported_state FROM "state_holidays" WHERE "provider_entry_id" IS NOT NULL;
  SELECT count(*) INTO suppressions FROM "holiday_import_suppressions";
  SELECT count(*) INTO disabled_companies FROM "company_holiday_import_settings"
    WHERE "is_enabled" = false;
  SELECT count(*) INTO open_executions FROM "job_executions"
    WHERE "job" = 'holiday.provider.pull' AND "finished_at" IS NULL;

  IF imported_municipal > 0 OR imported_state > 0 OR suppressions > 0 OR disabled_companies > 0
    OR open_executions > 0 THEN
    RAISE EXCEPTION 'Rollback recusado: % feriado(s) municipal(is) importado(s), % estadual(is) importado(s), % supressão(ões), % empresa(s) com a importação desligada e % execução(ões) aberta(s)',
      imported_municipal, imported_state, suppressions, disabled_companies, open_executions;
  END IF;
END
$$;

DELETE FROM "job_executions" WHERE "job" = 'holiday.provider.pull';
DELETE FROM "job_schedules" WHERE "job" = 'holiday.provider.pull';

ALTER TABLE "job_schedules" DROP CONSTRAINT "job_schedules_job_check",
  ADD CONSTRAINT "job_schedules_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill'));
ALTER TABLE "job_executions" DROP CONSTRAINT "job_executions_job_check",
  ADD CONSTRAINT "job_executions_job_check" CHECK ("job" in ('nfe.distribution.pull', 'fuel.price.pull', 'nfse.status.pull', 'notification.schedules.run', 'trip.location.purge', 'identity.document.backfill', 'geocoding.backfill', 'geocoding.refine', 'whatsapp.command.settle', 'trip.cargo-layout.purge', 'rate-limit.window.purge', 'trip.occurrence-attachment.purge', 'trip.occurrence-upload.expire', 'occurrence-conversation.upload.expire', 'trip.canhoto.read', 'cargo-preview.retention.apply', 'nfe.recipient-email.backfill'));

ALTER TABLE "municipal_holidays" DROP CONSTRAINT "municipal_holidays_rule_or_provider_check";
DROP INDEX "municipal_holidays_provider_entry_idx";
ALTER TABLE "municipal_holidays" DROP CONSTRAINT "municipal_holidays_provider_entry_fk";
ALTER TABLE "municipal_holidays" DROP COLUMN "provider_entry_id";

ALTER TABLE "state_holidays" DROP CONSTRAINT "state_holidays_provider_once_check";
DROP INDEX "state_holidays_provider_entry_idx";
ALTER TABLE "state_holidays" DROP CONSTRAINT "state_holidays_provider_entry_fk";
ALTER TABLE "state_holidays" DROP COLUMN "provider_entry_id";

DROP TABLE "holiday_import_suppressions";
DROP TABLE "company_holiday_import_settings";
DROP TABLE "holiday_import_cities";
DROP TABLE "holiday_provider_monthly_usage";
DROP TABLE "holiday_provider_entries";
DROP TABLE "holiday_provider_fetches";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261009040622_holiday_provider_import';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one holiday_provider_import journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
