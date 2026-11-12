# Evidência — 322

- Contrato da API: `test/companies/driver-occurrence-email-settings.contract.ts` e `test/trip-occurrence/driver-notification.contract.ts` (283 pass, 0 fail com `companies.contract.test.ts`).
- Migration: `test/database-migration.contract.test.ts` (207 pass, 0 fail).
- Painel: `test/occurrence-conversation/driver-occurrence-email-settings.contract.ts` (398 pass no entrypoint); typecheck e eslint limpos.
- Smoke com API dublada, sem falha de rota: `test/driver-occurrence-email.smoke.spec.ts` (5 passed). Prints em `prints/`: `aviso-{desktop,mobile}-{light,dark}.png`.
- Integração com Postgres (`test/integration/driver-occurrence-email-settings.integration.ts`): **não rodou aqui** (sem Docker); roda na CI.
