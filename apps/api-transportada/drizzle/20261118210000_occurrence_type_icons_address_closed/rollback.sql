-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
--
-- Só tira a migration do diário. Os ícones gravados ficam: depois dela o operador pode ter escolhido
-- ou trocado um ícone, e não há como separar o padrão do que foi escolha. Para limpar um tipo, use
-- "Sem ícone" na aba Tipos de Ocorrências.

BEGIN;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261118210000_occurrence_type_icons_address_closed';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_type_icons_address_closed journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
