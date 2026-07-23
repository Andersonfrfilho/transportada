# Tasks — Painel operacional e auditoria

Uma task por vez, contracts antes da implementacao e evidencia registrada ao
concluir.

| ID   | Task                                                | Requisitos      | Dependencia      | Verificacao                                                                                                                                  | Criterio de sucesso                                                                                      | Modelo recomendado               |
| ---- | --------------------------------------------------- | --------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------- |
| T001 | Consolidar spec/plano executavel                    | OPA-001–OPA-010 | fase 7 concluida | `bunx prettier --check specs/010-operations-audit && git diff --check`                                                                       | escopo, APIs, dados, permissoes, polling, seguranca e gates rastreaveis                                  | Codex 5.4 + revisao Sol          |
| T002 | Escrever contracts de schema de operations/audit    | OPA-003–OPA-008 | T001             | `(cd apps/api-transportada && bun test test/operations-schema.contract.test.ts)` falha esperado                                              | `processing_jobs` e `audit_logs` tenant-scoped, indexados e sem payload sensivel cobertos                | Codex Sol high                   |
| T003 | Implementar schema, migration aditiva e rollback    | OPA-003–OPA-008 | T002             | `bun run --cwd apps/api-transportada db:check && make migration-test`                                                                        | migration aplica/reverte; indices e checks protegem tenant, status, cursor e dados sensiveis             | Codex Sol high                   |
| T004 | Escrever contracts da aplicacao de operations/audit | OPA-001–OPA-005 | T003             | `(cd apps/api-transportada && bun test test/operations-application.contract.test.ts)` falha esperado                                         | resumo, timeline, jobs, auditoria, filtros e anti-enumeracao cobertos                                    | Codex Sol high                   |
| T005 | Implementar casos de uso e repositorios             | OPA-001–OPA-005 | T004             | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                          | consultas tenant-scoped, paginadas, sanitizadas e com agregacoes eficientes                              | Codex Sol high                   |
| T006 | Escrever contracts HTTP                             | OPA-001–OPA-008 | T004             | `(cd apps/api-transportada && bun test test/operations-http.contract.test.ts)` falha esperado                                                | RBAC antes de parse pesado, DTO strict, no-store, cursores e erros seguros                               | Codex Sol high + 5.3 para matriz |
| T007 | Implementar endpoints HTTP                          | OPA-001–OPA-008 | T005, T006       | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                          | `/operations/*` e `/audit/events` funcionando com permissao, filtros e ausencia segura                   | Codex 5.4 + revisao Sol          |
| T008 | Escrever contracts frontend                         | OPA-006–OPA-009 | T006             | `(cd apps/frontend-transportada && bun test test/operations.contract.test.ts)` falha esperado                                                | client, hooks, view models, polling, boundaries e limpeza de estado sensivel cobertos                    | Codex 5.4                        |
| T009 | Implementar UI operacional                          | OPA-001–OPA-009 | T007, T008       | `bun run --cwd apps/frontend-transportada check`                                                                                             | dashboard, jobs, timeline e auditoria responsivos, densos e consistentes com o frontend atual            | Codex 5.4 + revisao Sol          |
| T010 | Validar smoke responsivo                            | OPA-001–OPA-009 | T009             | `bun run --cwd apps/frontend-transportada smoke`                                                                                             | 375/768/1280 cobrem dashboard, timeline, auditoria, jobs e usuario sem permissao sem overflow horizontal | Codex 5.4 + revisao Sol          |
| T011 | Executar integracao local e revisao de release      | OPA-001–OPA-010 | T001–T010        | `bun install --frozen-lockfile && make check && make migration-test`; `make dev` gerenciado + `make smoke` + `make down`; `git diff --check` | gates verdes, evidencia registrada, sem segredos/XML em responses/logs e zero achado critico de release  | Codex Sol high + reviewer        |

## Gates por escopo

| Escopo   | Gates minimos                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------- |
| schema   | `db:check`, migration/rollback, indices tenant-scoped, checks de status e metadata segura      |
| API      | contracts HTTP, integracao, RBAC antes de parse pesado, anti-enumeracao, no-store e cursores   |
| dominio  | agregacao, timeline, jobs, auditoria append-only, polling seguro e sanitizacao                 |
| frontend | contracts, `check`, Playwright responsivo, polling cancelavel e limpeza de estado sensivel     |
| release  | frozen install, `make check`, `make migration-test`, smoke gerenciado, `make down` e diffcheck |

Todo teste novo entra no script agregado da unidade na mesma task. Rodar apenas
o arquivo isolado registra o vermelho; concluir a task exige provar o gate
agregado proporcional.

## Estrategia de modelos

- Codex 5.4: especificacao, contracts previsiveis, UI e integracao mecanica.
- Codex Sol high: schema transversal, auditoria, seguranca, tenant, migrations e
  revisao de release.
- Codex 5.3: tarefas mecanicas pequenas apos contracts fechados.

Depois de duas falhas equivalentes em modelo economico, escalar ou dividir a
task.

## Estado

- [x] T001 Consolidar spec/plano executavel.
- [x] T002 Escrever contracts de schema de operations/audit.
- [x] T003 Implementar schema, migration aditiva e rollback.
- [x] T004 Escrever contracts da aplicacao de operations/audit.
- [x] T005 Implementar casos de uso e repositorios.
- [x] T006 Escrever contracts HTTP.
- [x] T007 Implementar endpoints HTTP.
- [x] T008 Escrever contracts frontend.
- [x] T009 Implementar UI operacional.
- [x] T010 Validar smoke responsivo.
- [x] T011 Executar integracao local e revisao de release.
