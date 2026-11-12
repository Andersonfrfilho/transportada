-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 286 T2: tira a matriz "Retorno ao cliente" do tipo. Sem recusa: `client_channel`, `client_email_type`,
-- `client_email_send_mode` e o texto livre seguiram gravados no tipo o tempo todo, e quem le volta a eles. Os modelos
-- `occurrence.client-reply.*` que a migration criou no modulo de notificacao ficam: sao do modulo (podem ter versao
-- editada depois) e, sem a tabela, nada os escolhe.
BEGIN;

SET LOCAL lock_timeout = '3s';

DROP TABLE "company_occurrence_type_client_channels";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261029000937_occurrence_type_client_channels';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one occurrence_type_client_channels journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
