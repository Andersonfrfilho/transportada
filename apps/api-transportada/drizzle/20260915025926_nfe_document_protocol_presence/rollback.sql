-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Volta a exigir protocolo de autorização de toda nota que não seja `unsigned` (spec 149).
--
-- ⚠️ Este rollback FALHA (violação de CHECK) se já houver nota `cancelled` ou `denied` sem
-- protocolo — a nota `unsigned` que a SEFAZ cancelou ou denegou. Nesse caso não desfaça: siga em
-- roll-forward. Rebaixar a nota para `unsigned` apagaria o fato fiscal (princípio 5).
BEGIN;

ALTER TABLE "nfe_documents"
  DROP CONSTRAINT "nfe_documents_authorization_protocol_presence_check",
  ADD CONSTRAINT "nfe_documents_authorization_protocol_presence_check"
    CHECK (("status" = 'unsigned') or ("authorization_protocol" is not null));

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260915025926_nfe_document_protocol_presence';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_document_protocol_presence journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
