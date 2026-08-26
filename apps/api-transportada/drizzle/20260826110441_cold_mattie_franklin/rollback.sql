-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 057, T010: o comprovante de entrega.
--
-- Perde-se **o vínculo**, não o arquivo: os objetos continuam no bucket, órfãos, e a chave deles não
-- se reconstrói de lugar nenhum depois que esta tabela some. Exportar `trip_delivery_proofs` antes é
-- o passo do runbook — sem ele, o canhoto fotografado vira byte sem dono.
--
-- O CHECK de `stored_objects.purpose` volta a recusar 'delivery_proof', então **objeto já gravado
-- com esse propósito impede o rollback**: a linha do DELETE abaixo o remove do registro, e é
-- deliberado que ela seja explícita em vez de silenciosa.
BEGIN;

DROP TABLE IF EXISTS "trip_delivery_proofs";

DELETE FROM "stored_objects" WHERE "purpose" = 'delivery_proof';

ALTER TABLE "stored_objects" DROP CONSTRAINT "stored_objects_purpose_check",
  ADD CONSTRAINT "stored_objects_purpose_check" CHECK ("purpose" in ('import_source', 'nfe_document', 'nfe_event', 'billing_document', 'cte_document', 'mdfe_document', 'nfse_document', 'aggregate_document'));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260826110441_cold_mattie_franklin'
      AND "hash" = '1fdefa86b69676cf4d55934662e6d9893d485a4e4e5d5a599d9bb409d7578bcc';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cold_mattie_franklin migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
