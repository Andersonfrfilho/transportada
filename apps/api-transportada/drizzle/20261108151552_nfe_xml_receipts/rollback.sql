-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 301: remove a caixa de entrada de XML recebido por e-mail e WhatsApp.
--
-- ⚠️ Só com aprovação humana. Recusa-se a rodar com recibos gravados: eles são o registro de quem enviou o quê
-- e do motivo de cada recusa; depois de haver recibo em produção, prefira roll-forward.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  stored_receipts integer;
BEGIN
  SELECT count(*) INTO stored_receipts FROM "nfe_xml_receipts";
  IF stored_receipts > 0 THEN
    RAISE EXCEPTION 'nfe_xml_receipts has % rows; refusing to drop', stored_receipts;
  END IF;
END
$$;

DROP TABLE "nfe_xml_receipts";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261108151552_nfe_xml_receipts';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_xml_receipts journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
