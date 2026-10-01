-- Devolve o catálogo ao estado anterior. ⚠️ A ficha que já recebeu a sugestão continua com as
-- medidas: elas foram salvas por alguém e passaram a ser o que a ficha afirma — apagá-las aqui
-- desfaria trabalho humano por causa de uma linha de catálogo.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260928140000_vehicle_reference_open_and_container';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one vehicle_reference_open_and_container journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

-- ⚠️ Só as três chaves que esta migration inseriu. Um `delete` amplo levaria junto linha que
-- alguém acrescentou depois, e o catálogo não guarda de onde cada linha veio.
DELETE FROM "vehicle_volume_references"
  WHERE ("vehicle_type", "body_type") IN (('toco', '01'), ('', '04'), ('truck', '04'));
