-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 183 T301 (RF5): as colunas novas de `contractor_contacts` — nome, setor, telefone,
-- tipos, grupos de ocorrência, aceite do WhatsApp e canal preferido —, com os CHECKs, a FK do autor
-- do aceite e o índice por telefone.
--
-- O que se perde: nome, setor, telefone, tipos e aceite digitados depois da 183. `email`,
-- `receives_occurrences` e `can_decide` ficam — a 143 e a 150 seguem lendo os dois campos antigos,
-- que a escrita da 183 mantém derivados dos tipos.

BEGIN;

ALTER TABLE "contractor_contacts" DROP CONSTRAINT "contractor_contacts_preferred_whatsapp_check";
ALTER TABLE "contractor_contacts" DROP CONSTRAINT "contractor_contacts_whatsapp_opt_in_phone_check";
ALTER TABLE "contractor_contacts" DROP CONSTRAINT "contractor_contacts_whatsapp_opt_in_pair_check";
ALTER TABLE "contractor_contacts" DROP CONSTRAINT "contractor_contacts_phone_check";
ALTER TABLE "contractor_contacts" DROP CONSTRAINT "contractor_contacts_preferred_channel_check";
ALTER TABLE "contractor_contacts" DROP CONSTRAINT "contractor_contacts_occurrence_stages_check";
ALTER TABLE "contractor_contacts" DROP CONSTRAINT "contractor_contacts_types_check";
ALTER TABLE "contractor_contacts" DROP CONSTRAINT "contractor_contacts_whatsapp_opt_in_by_user_fk";

DROP INDEX "contractor_contacts_company_phone_idx";

ALTER TABLE "contractor_contacts" DROP COLUMN "preferred_channel";
ALTER TABLE "contractor_contacts" DROP COLUMN "whatsapp_opt_in_by_user_id";
ALTER TABLE "contractor_contacts" DROP COLUMN "whatsapp_opt_in_at";
ALTER TABLE "contractor_contacts" DROP COLUMN "occurrence_stages";
ALTER TABLE "contractor_contacts" DROP COLUMN "types";
ALTER TABLE "contractor_contacts" DROP COLUMN "phone";
ALTER TABLE "contractor_contacts" DROP COLUMN "role_label";
ALTER TABLE "contractor_contacts" DROP COLUMN "name";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260924201711_contractor_contact_channels';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one contractor_contact_channels migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
