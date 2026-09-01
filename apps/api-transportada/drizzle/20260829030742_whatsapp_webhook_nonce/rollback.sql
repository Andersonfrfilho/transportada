-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Reverte a spec 062 T006: o nonce anti-replay do webhook do WhatsApp.
--
-- Reverter aqui e barato e nao pede guarda de dado: a tabela guarda so a chave derivada da
-- assinatura de cada entrega, com validade de minutos, e nada de negocio a referencia. Perder as
-- linhas abre uma janela de replay do tamanho da propria janela — cinco minutos —, e so para
-- entregas ja capturadas antes do rollback.
--
-- O que **nao** pode voltar sem ela e a rota do webhook: sem o nonce compartilhado, a mesma entrega
-- assinada passa uma vez por replica.
BEGIN;

DROP TABLE IF EXISTS "whatsapp_webhook_nonces";

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260829030742_whatsapp_webhook_nonce'
      AND "hash" = 'ce7027072d480f9f602b44fb2210ad23ad374f53604a8f829af024109127b556';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one whatsapp_webhook_nonce migration journal entry, removed %',
      deleted_migrations;
  END IF;
END
$$;

COMMIT;
