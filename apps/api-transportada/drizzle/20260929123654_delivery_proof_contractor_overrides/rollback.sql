-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 218 RF-C1/RF-C2: tira a FK nova de `delivery_proof_setting_overrides` e apaga a
-- tabela de exceção por contratante.
--
-- ⚠️ As linhas de `delivery_clients` que o backfill da migration criou para os overrides "órfãos"
-- NÃO são apagadas aqui, de propósito: são cadastros legítimos (mesmo que "vazios"), e um cliente
-- de entrega pode ter passado a ter uso real (nota importada, cobrança lançada) entre o deploy e um
-- rollback tardio — apagar arriscaria derrubar dado que não tem nada a ver com este rollback.
BEGIN;

ALTER TABLE "delivery_proof_setting_overrides"
  DROP CONSTRAINT IF EXISTS "delivery_proof_setting_overrides_company_id_tax_id_delivery_clients_company_id_tax_id_fk";

DROP TABLE IF EXISTS "delivery_proof_setting_contractor_overrides";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260929123654_delivery_proof_contractor_overrides';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_proof_contractor_overrides journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
