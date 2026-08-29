-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Rollback do schema de conversa do WhatsApp (spec 062, T006). As migrations de ida vêm dentro de
-- `@adatechnology/meta-whatsapp-module` e são aplicadas por `db:migrate`; a volta é este arquivo,
-- aplicado à mão, como todo rollback desta base.
--
-- ⚠️ **Isto apaga a conversa inteira**: sessões, mensagens, documentos recebidos e os grafos de
-- fluxo publicados. Nenhuma tabela do `public` referencia `meta_whatsapp.*`, então o `cascade` não
-- alcança dado fiscal nem de operação — mas o histórico do que o cliente escreveu não volta, e não
-- existe cópia dele em outro lugar. A mídia continua no bucket, órfã: o `DeleteConversationUseCase`
-- do módulo é quem sabe apagá-la, e ele não roda daqui.
--
-- A tabela de controle das migrations do módulo mora no schema `drizzle` (padrão do migrator, que só
-- troca o *nome* da tabela) e some junto — sem ela o `db:migrate` reaplicaria do zero, que é o
-- estado anterior. Derrubar só o schema deixaria o journal dizendo que já foi aplicado, e o banco
-- ficaria sem as tabelas e sem erro aparente.
DROP SCHEMA IF EXISTS "meta_whatsapp" CASCADE;
DROP TABLE IF EXISTS "drizzle"."meta_whatsapp_migrations";
