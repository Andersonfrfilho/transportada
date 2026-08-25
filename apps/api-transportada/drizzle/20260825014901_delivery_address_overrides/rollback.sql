-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove delivery_address_overrides e o trigger append-only que a torna imutável.
-- Recusa rodar se algum desvio de endereço já foi registrado: a tabela é histórico (ADR-0043 §3,
-- D9), e apagá-la é perder a única prova de quem pediu a entrega em outro lugar.
-- Para prosseguir, decida o que fazer com a história primeiro:
-- select trip_document_id, requested_by, reason, created_at from delivery_address_overrides order by created_at;
BEGIN;

DO $$
DECLARE
  recorded_overrides integer;
BEGIN
  SELECT count(*) INTO recorded_overrides FROM "delivery_address_overrides";

  IF recorded_overrides > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % delivery address override(s) would lose who requested the detour',
      recorded_overrides;
  END IF;
END
$$;

DROP TRIGGER "delivery_address_overrides_append_only_trigger" ON "delivery_address_overrides";
DROP FUNCTION "reject_delivery_address_overrides_mutation"();

DROP TABLE "delivery_address_overrides";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260825014901_delivery_address_overrides'
      AND "hash" = '5818b5e7c4d94fdd91ea3d5ed3361b6dde8d2335874334a379b4e875c9db459f';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_address_overrides migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
