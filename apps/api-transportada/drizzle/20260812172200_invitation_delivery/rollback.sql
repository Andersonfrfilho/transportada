-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Desfaz o trilho de entrega do código de convite: a fila dedicada e as duas colunas do convite.
-- Perde as entregas ainda não publicadas e o código selado dos convites pendentes — depois deste
-- rollback nenhum convite pendente é entregável, e recuperá-los é reenviar.
BEGIN;

DROP TABLE IF EXISTS "invitation_delivery_outbox";

ALTER TABLE "user_invitations" DROP COLUMN IF EXISTS "delivered_at";
ALTER TABLE "user_invitations" DROP COLUMN IF EXISTS "sealed_code";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260812172200_invitation_delivery'
      AND "hash" = '38f60a9d4820a40137b8926cc99019406c3590aaa3b2b70168881ac3f83262b5';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one invitation_delivery migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
