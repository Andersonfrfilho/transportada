-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 281 T6: remove as colunas do webhook do Evolution. Sem recusa: o segredo do cabecalho e gerado pela API e e
-- refeito no proximo QR; a unica perda e o horario da ultima entrega. O webhook no Evolution passa a ser recusado (401)
-- ate a API voltar e apontar de novo.
BEGIN;

SET LOCAL lock_timeout = '3s';

ALTER TABLE "whatsapp_evolution_settings" DROP CONSTRAINT "whatsapp_evolution_settings_webhook_id_unique";
ALTER TABLE "whatsapp_evolution_settings" DROP COLUMN "last_webhook_at";
ALTER TABLE "whatsapp_evolution_settings" DROP COLUMN "webhook_registered_at";
ALTER TABLE "whatsapp_evolution_settings" DROP COLUMN "webhook_secret_envelope";
ALTER TABLE "whatsapp_evolution_settings" DROP COLUMN "webhook_id";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261027190515_whatsapp_evolution_webhook';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_evolution_webhook journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
