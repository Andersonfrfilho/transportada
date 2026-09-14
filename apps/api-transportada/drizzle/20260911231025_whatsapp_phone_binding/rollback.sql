-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz o vínculo do WhatsApp (spec 144 T003): o número verificado e os pedidos de verificação.
-- Perde os números já verificados e os pedidos vivos — depois deste rollback ninguém comanda pelo
-- WhatsApp até verificar de novo, e nenhum código em trânsito é resgatável.
BEGIN;

DROP TABLE IF EXISTS "whatsapp_phone_verification_requests";

DROP TABLE IF EXISTS "user_whatsapp_phones";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260911231025_whatsapp_phone_binding'
      AND "hash" = '56ddf9bace65cc825b9d88a8075e62d6de573d7025f43a7315812332db0750cd';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_phone_binding migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
