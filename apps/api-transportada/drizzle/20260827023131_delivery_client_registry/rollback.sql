-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 060 T002: o cadastro de cliente de entrega, de contratante, a janela semanal, a
-- excecao por data e o feriado do municipio.
--
-- Reverter **apaga** cadastro preenchido a mao: janela, taxa esperada e agendamento obrigatorio nao
-- estao em lugar nenhum alem destas tabelas. O que nasce sozinho da nota volta a nascer; o que
-- alguem digitou, nao. Quem reverter exporta antes.
BEGIN;

DROP TABLE IF EXISTS "municipal_holidays";
DROP TABLE IF EXISTS "delivery_client_exceptions";
DROP TABLE IF EXISTS "delivery_client_windows";
DROP TABLE IF EXISTS "contractors";
DROP TABLE IF EXISTS "delivery_clients";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260827023131_delivery_client_registry'
      AND "hash" = '61ace455ca06bea7057da3dc56323ca81ca854b61bde9d7a2a1c9ae3f6fc8ca2';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_client_registry migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
