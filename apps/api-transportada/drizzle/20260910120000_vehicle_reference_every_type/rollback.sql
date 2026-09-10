-- Devolve o catálogo ao estado anterior. ⚠️ A ficha que **já** recebeu a sugestão continua com as
-- medidas: elas foram salvas por alguém e passaram a ser o que a ficha afirma — apagá-las aqui
-- desfaria trabalho humano por causa de uma linha de catálogo.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260910120000_vehicle_reference_every_type';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one vehicle_reference_every_type journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

DELETE FROM "vehicle_volume_references"
  WHERE ("vehicle_type", "body_type") IN (
    ('motorcycle', '05'), ('utility', '05'), ('van', '05'), ('vuc', '05'),
    ('three_quarter', '05'), ('toco', '05'), ('truck', '05'),
    ('car', '02'), ('car', '05')
  );
