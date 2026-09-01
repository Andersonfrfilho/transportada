-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Rollback do schema de conta do agregado (feature 064, T1). As migrations de ida vêm dentro de
-- `@adatechnology/user-module` e são aplicadas por `db:migrate`; a volta é este arquivo, aplicado à
-- mão, como todo rollback desta base.
--
-- O schema é inteiro do módulo: nenhuma tabela do `public` referencia `user.*` diretamente (o
-- vínculo com `fleet_drivers` é por CPF normalizado, não FK — ver T2). A tabela de controle das
-- migrations do módulo mora no schema `drizzle` (padrão do migrator, que só troca o *nome* da
-- tabela) e some junto — sem ela o `db:migrate` reaplicaria do zero, que é o estado anterior.
DROP SCHEMA IF EXISTS "user" CASCADE;
DROP TABLE IF EXISTS "drizzle"."user_migrations";
