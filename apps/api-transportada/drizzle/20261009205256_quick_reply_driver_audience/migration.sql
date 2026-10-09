-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 260 T5.1 (D11): o público `driver_reply` das respostas rápidas — as respostas prontas DO MOTORISTA ao
-- escritório. Aditiva: só alarga o CHECK de `audience`; nenhuma linha existente muda, e as consultas do
-- escritório (públicos `contractor` e `driver`) filtram por público e seguem idênticas.
ALTER TABLE "company_quick_replies" DROP CONSTRAINT "company_quick_replies_audience_check", ADD CONSTRAINT "company_quick_replies_audience_check" CHECK ("audience" in ('contractor', 'driver', 'driver_reply'));
