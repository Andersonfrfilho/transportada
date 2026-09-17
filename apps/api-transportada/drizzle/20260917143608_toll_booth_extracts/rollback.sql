-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz a spec 154 T101 (o registro dos extratos do catálogo de praças).
--
-- ⚠️ Este rollback FALHA com qualquer linha dentro. A tabela nasce vazia, mas depois do primeiro
-- upload ela é a única trilha de auditoria desta ação em toda a API — quem subiu o extrato, quando,
-- e quem mandou recarregar o catálogo com ele. Nenhum histórico reconstrói isso, e o bucket não
-- sabe listar. Quem operar esvazia antes de rodar, de propósito e por escrito.
--
-- O rollback não toca "toll_booths": a D7 proíbe apagar praça, e esta migration não criou nenhuma.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "toll_booth_extracts") THEN
    RAISE EXCEPTION 'toll_booth_extracts has rows, refusing rollback';
  END IF;
END
$$;

DROP TABLE "toll_booth_extracts";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260917143608_toll_booth_extracts';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one toll_booth_extracts journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
