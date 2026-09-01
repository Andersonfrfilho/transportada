-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a exigencia de nota na sugestao (spec 060 T010).
--
-- Reverter e barato: o CHECK nao guarda dado. O que volta a ser possivel e a sugestao sem nota
-- escapar do indice parcial de dedupe — no Postgres dois `null` nao colidem —, e o operador
-- conferir duas linhas que sao a mesma cobranca.
BEGIN;

ALTER TABLE "delivery_charges" DROP CONSTRAINT IF EXISTS "delivery_charges_suggested_document_check";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260827104939_delivery_charge_suggestion_needs_document'
      AND "hash" = 'a83cbbbef64bf328c4efe2a4e40ebbd21d90e5d8eb1977d243fb029754bbdf94';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_charge_suggestion_needs_document migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
