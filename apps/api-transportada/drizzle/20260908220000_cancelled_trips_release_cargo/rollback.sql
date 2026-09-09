-- ⚠️ **Não desfaz a soltura da carga, e não pode.** A migration marcou `released_at` com `now()`, e
-- nada distingue a linha que ela tocou da que já tinha sido liberada à mão antes — desfazer por
-- carimbo apagaria a hora real de liberações legítimas.
--
-- Reverter o esquema não é o problema aqui (não há esquema a reverter): o que este arquivo faz é
-- retirar a migration do diário para o histórico ficar coerente. A carga solta **permanece solta**,
-- e as notas já vinculadas a outras viagens desde então continuam onde estão — que é o
-- comportamento correto, porque desfazer teria de tirá-las de viagens vivas.
DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260908220000_cancelled_trips_release_cargo';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cancelled_trips_release_cargo journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;
