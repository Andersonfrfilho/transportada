-- Rollback manual da 20260903182455_delivery_proof_settings.
-- Devolve o schema anterior; o conteudo das colunas de documento (envelope + mascara) se perde —
-- que e o comportamento desejado para dado pessoal colhido por engano.
ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT "trip_delivery_proofs_receiver_document_check";
ALTER TABLE "trip_delivery_proofs" DROP COLUMN "receiver_document_masked";
ALTER TABLE "trip_delivery_proofs" DROP COLUMN "receiver_document_envelope";
DROP TABLE "delivery_proof_setting_overrides";
DROP TABLE "company_delivery_proof_settings";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260903182455_delivery_proof_settings';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_proof_settings journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;
