-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Spec 265: remove o estado do tratamento do comprovante (`processing_state`, `original_object_id`,
-- `processing_error`) e a tabela `delivery_proof_outbox`.
--
-- ⚠️ Recusa rodar enquanto houver trabalho pendente: comprovante em `received`/`processing` ainda espera a versão
-- leve, e o evento não publicado do outbox é o único pedido para o worker gerá-la. Derrubar qualquer um dos dois
-- deixaria o original sem tratamento e sem como saber. `ready` e `processing_failed` não perdem arquivo: `object_id`
-- continua apontando para o objeto que o painel mostra — só o rótulo do estado some.
-- Confira antes:
--   select processing_state, count(*) from trip_delivery_proofs where processing_state is not null group by 1;
--   select count(*) from delivery_proof_outbox where published_at is null;
-- Com `original_object_id` preenchido o objeto original continua no bucket e em `stored_objects`: o rollback só
-- solta o ponteiro, nunca apaga arquivo.
BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  unfinished_proofs integer;
  unpublished_events integer;
BEGIN
  SELECT count(*) INTO unfinished_proofs
    FROM "trip_delivery_proofs"
    WHERE "processing_state" IN ('received', 'processing');

  IF unfinished_proofs > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % delivery proof(s) still wait for processing',
      unfinished_proofs;
  END IF;

  SELECT count(*) INTO unpublished_events
    FROM "delivery_proof_outbox"
    WHERE "published_at" IS NULL;

  IF unpublished_events > 0 THEN
    RAISE EXCEPTION 'Refusing to roll back: % delivery proof outbox event(s) are not published',
      unpublished_events;
  END IF;
END
$$;

DROP TABLE IF EXISTS "delivery_proof_outbox";

ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_processing_state_check";
ALTER TABLE "trip_delivery_proofs" DROP CONSTRAINT IF EXISTS "trip_delivery_proofs_company_original_fk";
DROP INDEX IF EXISTS "trip_delivery_proofs_company_original_idx";
ALTER TABLE "trip_delivery_proofs" DROP COLUMN IF EXISTS "processing_error";
ALTER TABLE "trip_delivery_proofs" DROP COLUMN IF EXISTS "original_object_id";
ALTER TABLE "trip_delivery_proofs" DROP COLUMN IF EXISTS "processing_state";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20261014155700_delivery_proof_processing';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one delivery_proof_processing journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
