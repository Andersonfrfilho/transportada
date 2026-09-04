-- Derrubar perde a agenda de enderecos confirmados. Em base nova e vazio; em base com uso, cada
-- linha perdida e uma consulta paga a refazer ou um humano a perguntar de novo.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260904130000_client_delivery_addresses';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one client_delivery_addresses journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

DROP TABLE IF EXISTS "client_delivery_addresses";
