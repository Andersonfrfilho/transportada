-- Derrubar perde TODA medida ja tirada com fita metrica no patio. Em base nova e vazio; com uso,
-- cada linha e uma volta ao galpao — e a NF-e nao traz dimensao para redescobrir nada.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260905130000_nfe_package_boxes';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one nfe_package_boxes journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

DROP TABLE IF EXISTS "nfe_package_boxes";
