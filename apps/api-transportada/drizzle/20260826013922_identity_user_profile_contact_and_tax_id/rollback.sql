-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove email, phone e tax_id de identity_user_profiles.
-- Recusa rodar se algum perfil já tem qualquer um dos três preenchido: são dados da pessoa
-- digitados por um operador, e não há de onde reconstruí-los depois do DROP COLUMN.
-- Para prosseguir, decida o que fazer com o que já foi cadastrado primeiro:
-- select user_id, name, email, phone, tax_id from identity_user_profiles
--   where length(email) > 0 or length(phone) > 0 or length(tax_id) > 0;
BEGIN;

DO $$
DECLARE
  filled bigint;
BEGIN
  IF to_regclass('public.identity_user_profiles') IS NULL THEN
    RAISE NOTICE 'identity_user_profiles nao existe; nada a reverter';
    RETURN;
  END IF;

  SELECT count(*) INTO filled
  FROM identity_user_profiles
  WHERE length(email) > 0 OR length(phone) > 0 OR length(tax_id) > 0;

  IF filled > 0 THEN
    RAISE EXCEPTION
      'rollback recusado: % perfil(is) com email, telefone ou CPF preenchido', filled
      USING ERRCODE = '55000';
  END IF;

  ALTER TABLE identity_user_profiles
    DROP CONSTRAINT IF EXISTS identity_user_profiles_tax_id_check;
  DROP INDEX IF EXISTS identity_user_profiles_tax_id_unique;
  ALTER TABLE identity_user_profiles
    DROP COLUMN IF EXISTS tax_id,
    DROP COLUMN IF EXISTS phone,
    DROP COLUMN IF EXISTS email;
END $$;

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260826013922_identity_user_profile_contact_and_tax_id'
      AND "hash" = '83f0c1ace3e9d59b1f08d89fa795110101ffcd794927d852ae387595c78b256b';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one identity_user_profile_contact_and_tax_id migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
