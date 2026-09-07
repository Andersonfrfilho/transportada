-- Devolve o esquema anterior. ⚠️ A tabela sai com os ajustes: eles são digitados por gente, e
-- reverter esta migration é o preço aceito de reverter uma correção manual.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260907190000_company_toll_booth_charges';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one company_toll_booth_charges journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

DROP TABLE IF EXISTS "company_toll_booth_charges";
