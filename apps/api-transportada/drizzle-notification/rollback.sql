-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Rollback do schema de notificações (feature 034, T001). As migrations de ida vêm dentro de
-- `@adatechnology/notification-module` e são aplicadas por `db:migrate`; a volta é este arquivo,
-- aplicado à mão, como todo rollback desta base.
--
-- O schema é inteiro do módulo: nenhuma tabela do `public` referencia `notification.*`, então o
-- `cascade` não alcança dado de negócio. A tabela de controle das migrations do módulo mora no
-- schema `drizzle` (padrão do migrator, que só troca o *nome* da tabela) e some junto — sem ela o
-- `db:migrate` reaplicaria do zero, que é o estado anterior.
DROP SCHEMA IF EXISTS "notification" CASCADE;
DROP TABLE IF EXISTS "drizzle"."notification_migrations";
