# 053 — A landing genérica e o pré-cadastro do agregado · evidências

Uma entrada por task concluída: comando executado, saída relevante e o que ela prova.

| Task | Comando | Resultado |
| ---- | ------- | --------- |
| T002 | `bun run --cwd apps/api-transportada test` | 3048 pass, 0 fail (`landing_settings` schema + migration estática) |
| T002 | `bun run --cwd apps/api-transportada db:check` | `Everything's fine 🐶🔥` |
| T003 | `bun run --cwd apps/api-transportada test` | 3053 pass, 0 fail (`resolveCompanyGroupRoot` + ordenação matriz-primeiro) |
| T004 | `bun run --cwd apps/api-transportada test` | 3060 pass, 0 fail (`GET /public/landing-settings` anônima e cacheável, `GET/PUT /company-settings/landing` sob `settings.manage`) |
| T004 | `bunx tsc --noEmit` (api) | sem erros |
| T004 | redução consciente | `GET /public/landing-logo` da T004 foi adiada — reaproveitar `company_logos` (hoje chaveado por empresa, não por grupo) exige decidir qual unidade do grupo "é" a logo pública, e isso pertence à T012 (aba Site), onde o operador escolhe a marca. Registrado aqui para não silenciar o corte de escopo. |
| T005 | `bun run --cwd apps/api-transportada test` | 3063 pass, 0 fail (schema `aggregate_applications`, FKs para `fleet_drivers`/`companies`, unique parcial por pendente) |
| T005 | `bun run --cwd apps/api-transportada db:check` | `Everything's fine 🐶🔥` |
| T006 | `bun run --cwd apps/api-transportada test` | 3070 pass, 0 fail (reenvio não duplica linha, documento já motorista marca sem recusar, aprovar duplicado vincula, CNPJ sem match pede criação manual) |
| T006 | redução consciente | `approve` não reusa o use case completo de `POST /fleet/drivers` (que exige `FleetDriverAccountPort`/`ContactDirectoryPort` para criar membership) — cria a ficha mínima direto no repositório, na mesma transação do vínculo. Justificativa: o agregado aprovado por aqui ainda não tem conta (só a Fase 5 cria login), então a parte de membership não se aplica. `duas aprovações concorrentes perdem no INSERT` fica garantido pela constraint do banco (T005), não coberto por teste de use case com repositório fake. |
| T007 | `bun run --cwd apps/api-transportada test` | 3078 pass, 0 fail (`POST /public/aggregate-applications` 202 invariável, `GET/POST /aggregate-applications*` sob `fleet.manage`) |
| T007 | `docs/SECURITY.md` | achado aberto registrado: rota pública de candidatura sem limitador dedicado (mesmo item já aberto para landing-settings e password-reset) |
