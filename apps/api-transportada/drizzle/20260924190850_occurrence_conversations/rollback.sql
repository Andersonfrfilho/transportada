-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Desfaz a spec 183 T401: as cinco tabelas da conversa da ocorrência e o unique
-- `(company_id, id)` de `contractor_contacts`, que só existe para as FKs compostas delas.
--
-- O que se perde: as conversas, as mensagens, os anexos (as linhas; os objetos do bucket ficam), as
-- leituras e a fila de não atribuídas. Nada anterior à 183 depende destas tabelas; o trilho de
-- e-mail da 143 (`contractor_mail_*`) fica intacto. Filhas primeiro, por causa das FKs.

BEGIN;

DROP TABLE "occurrence_conversation_attachments";
DROP TABLE "occurrence_conversation_reads";
DROP TABLE "occurrence_conversation_unassigned";
DROP TABLE "occurrence_conversation_messages";
DROP TABLE "occurrence_conversations";

ALTER TABLE "contractor_contacts" DROP CONSTRAINT "contractor_contacts_company_id_id_unique";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260924190850_occurrence_conversations';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_conversations migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
