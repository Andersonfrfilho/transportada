-- Rollback manual da 20260903191706_delivery_proof_attachment_key.
-- A coluna é só a chave de idempotência do anexo; derrubá-la volta ao comportamento anterior,
-- em que todo reenvio é correção.
ALTER TABLE "trip_delivery_proofs" DROP COLUMN "attachment_key";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260903191706_delivery_proof_attachment_key';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_proof_attachment_key journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;
