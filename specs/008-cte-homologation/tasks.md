# Tasks — Homologação CT-e

Uma task por vez, testes aplicáveis antes da implementação e um commit atômico por task.

| ID   | Task                                               | Requisitos               | Dependência         | Verificação                                                                                                                                  | Critério de sucesso                                                                                       | Modelo recomendado                        |
| ---- | -------------------------------------------------- | ------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| T001 | Registrar ADR e consolidar spec/plano executável   | CTH-001–CTH-012          | autorização feature | `bunx prettier --check docs/adr specs/008-cte-homologation && git diff --check`                                                              | sem clarificação bloqueante; gateway, worker, storage, retries, rollback e modelos rastreáveis            | Codex 5.4 + revisão Sol                   |
| T002 | Escrever contracts do gateway CT-e Ada             | CTH-002, CTH-005         | T001                | `(cd apps/worker-transportada && bun test test/cte-fiscal-gateway.contract.test.ts)` falha esperado                                          | exports públicos do provider, mapeamento de sucesso/rejeição/timeout e redaction cobertos                 | Codex Sol high                            |
| T003 | Implementar gateway CT-e no worker                 | CTH-002, CTH-005         | T002                | `bun run --cwd apps/worker-transportada check && bun run --cwd apps/worker-transportada test`                                                | adapter usa somente contrato público, preserva `cause`, não loga XML/certificado e suporta fake em testes | Codex 5.3 + revisão Sol                   |
| T004 | Escrever contracts de schema de emissão CT-e       | CTH-003–CTH-010          | T001                | `(cd apps/api-transportada && bun test test/cte-issuance-schema.contract.test.ts)` falha esperado                                            | attempts, documents, events, retries, uniques tenant-scoped, estados terminais e rollback cobertos        | Codex Sol high                            |
| T005 | Implementar schema, migration aditiva e rollback   | CTH-003–CTH-010          | T004                | `bun run --cwd apps/api-transportada db:check && make migration-test`                                                                        | migration aplica sem drift em baseline/vazio; rollback manual preserva objetos fiscais finais             | Codex Sol high                            |
| T006 | Escrever contracts da aplicação de emissão         | CTH-001, CTH-003–CTH-010 | T003, T005          | `(cd apps/api-transportada && bun test test/cte-issuance-application.contract.test.ts)` falha esperado                                       | issue/replay/rejeição/retry/falha/reprocessamento e anti-enumeração cobertos                              | Codex Sol high                            |
| T007 | Implementar casos de uso e repositórios de emissão | CTH-001, CTH-003–CTH-010 | T006                | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                          | comando fiscal, reserva de número, idempotência, storage metadata e eventos funcionam em transação        | Codex Sol high                            |
| T008 | Escrever contracts worker de fila, retry e DLQ     | CTH-001, CTH-007–CTH-009 | T006                | `(cd apps/worker-transportada && bun test test/cte-issuance-worker.contract.test.ts)` falha esperado                                         | ack pós-commit, redelivery, backoff persistido, DLQ e item isolado cobertos                               | Codex Sol high                            |
| T009 | Implementar consumer CT-e e lifecycle no worker    | CTH-001, CTH-007–CTH-009 | T007, T008          | `bun run --cwd apps/worker-transportada check && bun run --cwd apps/worker-transportada test:integration`                                    | worker processa item a item, reinicia sem duplicar efeito e classifica retries/rejeições                  | Codex Sol high                            |
| T010 | Escrever contracts HTTP de emissão/reprocessamento | CTH-001, CTH-010–CTH-012 | T006                | `(cd apps/api-transportada && bun test test/cte-issuance-http.contract.test.ts)` falha esperado                                              | RBAC antes do body, DTO strict, no-store, URLs temporárias, bloqueio de produção e erros seguros          | Codex Sol high + 5.3 para matriz mecânica |
| T011 | Implementar endpoints HTTP de emissão CT-e         | CTH-001, CTH-010–CTH-012 | T007, T010          | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                          | rotas tenant-scoped agendam emissão, reprocessam quando permitido e expõem metadados seguros              | Codex 5.3 + revisão Sol                   |
| T012 | Escrever contracts frontend de status fiscal CT-e  | CTH-010–CTH-012          | T010                | `(cd apps/frontend-transportada && bun test test/cte-issuance.contract.test.ts)` falha esperado                                              | client/query/permissões/DTOs/status/download seguro e ausência de XML em storage cobertos                 | Codex 5.3                                 |
| T013 | Implementar UI de homologação e timeline fiscal    | CTH-010–CTH-012          | T011, T012          | `bun run --cwd apps/frontend-transportada check`                                                                                             | operador acompanha autorização/rejeição/retry, reprocessa item permitido e não persiste XML sensível      | Codex 5.3 + revisão Sol                   |
| T014 | Validar jornada responsiva com Playwright          | CTH-010–CTH-012          | T013                | `bun run --cwd apps/frontend-transportada smoke`                                                                                             | 375/768/1280 cobrem autorizado, rejeitado, retry/reprocessamento e usuário sem permissão                  | Codex 5.3 + revisão Sol                   |
| T015 | Executar integração local e revisão de release     | CTH-001–CTH-012          | T001–T014           | `bun install --frozen-lockfile && make check && make migration-test`; `make dev` gerenciado + `make smoke` + `make down`; `git diff --check` | gates verdes, evidência registrada, nenhum SEFAZ produção/Railway e zero achado crítico                   | Codex Sol high + reviewer independente    |

## Gates por escopo

| Escopo   | Gates mínimos                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------- |
| fiscal   | contracts do gateway, fake provider, redaction, erro com `cause` e nenhum import interno       |
| schema   | `db:check`, migration/rollback, constraints tenant-scoped e estados terminais                  |
| API      | contracts HTTP, integração, RBAC, anti-enumeração, no-store e URLs temporárias                 |
| worker   | contracts de fila, `test:integration`, redelivery, ack pós-commit, backoff persistido e DLQ    |
| frontend | contracts, `check` e Playwright responsivo sem XML em storage/cache/DOM                        |
| raiz     | frozen install, `make check`, `make migration-test`, smoke gerenciado, `make down` e diffcheck |

Todo teste novo entra no script agregado da unidade na mesma task. Rodar apenas
o arquivo isolado registra o vermelho; concluir a task exige provar o gate
agregado.

## Estratégia de modelos e economia

- Codex 5.4: especificação inicial, decomposição e decisões reversíveis de
  planejamento quando a feature ainda está sendo formada.
- Codex 5.3: execução mecânica após contrato fechado, UI, DTOs e matrizes
  previsíveis.
- Codex Sol high: fiscal real, certificados, numeração, idempotência externa,
  concorrência, storage fiscal, migrations críticas e revisão de release.

Depois de duas falhas equivalentes em 5.3, a task deve escalar para Sol ou ser
dividida antes de repetir a mesma tentativa.

## Estado

- [x] T001 Registrar ADR e consolidar spec/plano executável.
- [x] T002 Escrever contracts do gateway CT-e Ada.
- [x] T003 Implementar gateway CT-e no worker.
- [x] T004 Escrever contracts de schema de emissão CT-e.
- [x] T005 Implementar schema, migration aditiva e rollback.
- [x] T006 Escrever contracts da aplicação de emissão.
- [x] T007 Implementar casos de uso e repositórios de emissão.
- [x] T008 Escrever contracts worker de fila, retry e DLQ.
- [x] T009 Implementar consumer CT-e e lifecycle no worker.
- [x] T010 Escrever contracts HTTP de emissão/reprocessamento.
- [x] T011 Implementar endpoints HTTP de emissão CT-e.
- [x] T012 Escrever contracts frontend de status fiscal CT-e.
- [x] T013 Implementar UI de homologação e timeline fiscal.
- [x] T014 Validar jornada responsiva com Playwright.
- [x] T015 Executar integração local e revisão de release.
