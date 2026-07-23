# Tasks — Lotes e emissão de CT-e

Uma task por vez, testes aplicáveis antes da implementação e um commit atômico por task.

| ID   | Task                                                     | Requisitos                                  | Dependência         | Verificação                                                                                         | Critério de sucesso                                                                                            | Modelo recomendado                             |
| ---- | -------------------------------------------------------- | ------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| T001 | Registrar ADR e consolidar spec/plano executável         | CTE-001–CTE-008                             | autorização feature | `bunx prettier --check docs/adr specs/007-cte-batch && git diff --check`                            | sem clarificação bloqueante; estados, idempotência e permissões rastreáveis; nome e rollback inicial definidos | Codex Sol high                                 |
| T002 | Escrever contracts do schema de lote e constraints       | CTE-001–CTE-007, CTE-004                    | T001                | `(cd apps/api-transportada && bun test test/cte-batch-schema.contract.test.ts)` falha esperado      | lote/itens/eventos/idempotência cobertos com FKs tenant-scoped, checks e transições válidas                    | Codex Sol high                                 |
| T003 | Implementar schema de lote, migration aditiva e rollback | CTE-001–CTE-007, CTE-004                    | T002                | `bun run --cwd apps/api-transportada db:check && make migration-test`                               | migration sem drift em base vazio/baseline e rollback reverso definido                                         | Codex Sol high                                 |
| T004 | Escrever contratos de domínio e snapshot de submissão    | CTE-001–CTE-006, CTE-004                    | T003                | `(cd apps/api-transportada && bun test test/cte-batch-application.contract.test.ts)` falha esperado | transições, validação de elegibilidade, idempotência de submissão e anti-enumeração cobertas                   | Codex Sol high                                 |
| T005 | Implementar casos de uso de lote e estado                | CTE-001–CTE-007                             | T004                | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration` | seleção de itens elegíveis, transições seguras, idempotência e auditoria em transação                          | Codex Sol high                                 |
| T006 | Escrever contracts HTTP de lotes de CT-e                 | CTE-001–CTE-008                             | T004                | `(cd apps/api-transportada && bun test test/cte-batch-http.contract.test.ts)` falha esperado        | RBAC antes do body, DTOs estritos, no-store, paginação e erros seguros                                         | Codex Sol high + OpenCode para matriz mecânica |
| T007 | Implementar endpoints HTTP de lote e submit/cancel       | CTE-001–CTE-008                             | T005, T006          | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration` | rotas funcionais tenant-scoped sem `companyId`, submissão idempotente e consulta de eventos                    | Codex Terra medium + revisão Sol               |
| T008 | Escrever contracts frontend de lotes                     | CTE-001, CTE-002, CTE-003, CTE-007, CTE-008 | T007                | `(cd apps/frontend-transportada && bun test test/cte-batch.contract.test.ts)` falha esperado        | client/query/permissions/DTOs cobrem criação, itens, submissão, estados e ausência de controles indevidos      | Codex Terra medium                             |
| T009 | Implementar UI Vite de lotes                             | CTE-001, CTE-002, CTE-003, CTE-007, CTE-008 | T007, T008          | `bun run --cwd apps/frontend-transportada check`                                                    | operador cria/revisa/submete lote com estados consistentes; UI sem persistir XML sensível                      | Codex Terra medium                             |
| T010 | Validar jornada e permissões com Playwright              | CTE-003, CTE-008                            | T009                | `bun run --cwd apps/frontend-transportada smoke`                                                    | 375/768/1280 cobrem create/submit/cancel em permissões divergentes                                             | Codex Terra medium + revisão Sol               |
| T011 | Executar integração local e revisão de release           | CTE-001–CTE-008                             | T001–T010           | `bun install --frozen-lockfile && make check && make migration-test && git diff --check`            | gates verdes, evidência registrada, nenhum Railway/SEFAZ real e zero achado crítico                            | Codex Sol high + reviewer independente         |

## Estado

- [x] T001 Registrar ADR e consolidar spec/plano executável.
- [x] T002 Escrever contracts do schema de lote e constraints.
- [x] T003 Implementar schema de lote, migration aditiva e rollback.
- [x] T004 Escrever contratos de domínio e snapshot de submissão.
- [x] T005 Implementar casos de uso de lote e estado.
- [x] T006 Escrever contracts HTTP de lotes de CT-e.
- [x] T007 Implementar endpoints HTTP de lote e submit/cancel.
- [x] T008 Escrever contracts frontend de lotes.
- [x] T009 Implementar UI Vite de lotes.
- [x] T010 Validar jornada e permissões com Playwright.
- [x] T011 Executar integração local e revisão de release.
