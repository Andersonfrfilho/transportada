-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz o trilho de recuperação de senha: os pedidos e a fila dedicada de entrega.
-- Perde os pedidos ainda não consumidos e as entregas não publicadas — depois deste rollback
-- nenhum código em trânsito é resgatável, e recuperá-lo é pedir de novo.
BEGIN;

-- A outbox cai primeiro: ela tem FK para a tabela de pedidos.
DROP TABLE IF EXISTS "password_reset_delivery_outbox";

DROP TABLE IF EXISTS "password_reset_requests";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260813024255_password_reset_requests'
      AND "hash" = 'f69136c5eed9b2921b7c88eed772bc330f27bbd6060549d127e6f91a0b557bc1';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one password_reset_requests migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
