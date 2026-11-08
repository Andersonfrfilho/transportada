-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 302: o contato do contratante deixa de poder ter o tipo `nfe_xml` (enviar XML de NF-e).
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com contato que ainda tem o tipo: tirar o tipo à mão revoga a
-- autorização de envio, e isso é decisão de quem cuida do contratante, não do rollback.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  with_type integer;
BEGIN
  SELECT count(*) INTO with_type FROM "contractor_contacts" WHERE 'nfe_xml' = ANY ("types");
  IF with_type > 0 THEN
    RAISE EXCEPTION '% contractor contacts still have the nfe_xml type; refusing to roll back', with_type;
  END IF;
END
$$;

ALTER TABLE "contractor_contacts" DROP CONSTRAINT "contractor_contacts_types_check",
  ADD CONSTRAINT "contractor_contacts_types_check" CHECK ("types" <@ array['occurrences', 'approves_charges', 'scheduling', 'invoices', 'cte_xml']::text[]);

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261108161438_contractor_contact_nfe_xml';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_contact_nfe_xml journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
