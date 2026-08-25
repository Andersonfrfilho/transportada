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
