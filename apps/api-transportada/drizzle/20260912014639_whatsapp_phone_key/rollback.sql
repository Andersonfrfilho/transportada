-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a chave sem o nono dígito (spec 144 T005b B3): o índice único do verificado volta a ser
-- sobre o número exato. Nenhum dado se perde — `phone_key` é coluna gerada, recalculável de `phone`.
-- ⚠️ Depois do rollback as duas grafias do mesmo celular podem voltar a ficar verificadas em donos
-- diferentes, e o `CREATE UNIQUE INDEX` falha se já houver o mesmo número exato verificado duas vezes
-- (não deveria: o índice novo é mais estrito que o antigo).
BEGIN;

DROP INDEX IF EXISTS "user_whatsapp_phones_phone_key_verified_unique";

ALTER TABLE "user_whatsapp_phones" DROP COLUMN IF EXISTS "phone_key";

CREATE UNIQUE INDEX "user_whatsapp_phones_phone_verified_unique"
  ON "user_whatsapp_phones" ("phone") WHERE "verified_at" is not null;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260912014639_whatsapp_phone_key'
      AND "hash" = 'be2a86a52a7a135927c03efd267f3879d0d76b9ecc7046c5f77d3fcc8084f1a0';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_phone_key migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
