# Tasks — Faturamento

Uma task por vez, testes aplicaveis antes da implementacao e um commit atomico
por task.

| ID   | Task                                                   | Requisitos      | Dependencia        | Verificacao                                                                                                                                  | Criterio de sucesso                                                                                     | Modelo recomendado                     |
| ---- | ------------------------------------------------------ | --------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| T001 | Consolidar spec/plano executavel                       | BIL-001–BIL-012 | feature autorizada | `bunx prettier --check specs/009-billing && git diff --check`                                                                                | sem clarificacao bloqueante; escopo, dados, rollback, seguranca e modelos rastreaveis                   | Codex 5.4 + revisao Sol                |
| T002 | Escrever contracts de schema de faturamento            | BIL-001–BIL-007 | T001               | `(cd apps/api-transportada && bun test test/billing-schema.contract.test.ts)` falha esperado                                                 | invoices, items, events, documents, decimal, FKs tenant-scoped e unicidade ativa cobertos               | Codex Sol high                         |
| T003 | Implementar schema, migration aditiva e rollback       | BIL-001–BIL-007 | T002               | `bun run --cwd apps/api-transportada db:check && make migration-test`                                                                        | migration aplica/reverte; constraints impedem refaturamento ativo e total incoerente                    | Codex Sol high                         |
| T004 | Escrever contracts da aplicacao de faturamento         | BIL-001–BIL-008 | T003               | `(cd apps/api-transportada && bun test test/billing-application.contract.test.ts)` falha esperado                                            | elegibilidade, criacao, replay, conflito, concorrencia, cancelamento e anti-enumeracao cobertos         | Codex Sol high                         |
| T005 | Implementar casos de uso e repositorios de faturamento | BIL-001–BIL-008 | T004               | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                          | fatura transacional, decimal, idempotencia, eventos e isolamento multiempresa funcionando               | Codex Sol high                         |
| T006 | Escrever contracts HTTP de faturamento                 | BIL-001–BIL-011 | T004               | `(cd apps/api-transportada && bun test test/billing-http.contract.test.ts)` falha esperado                                                   | RBAC antes do body, DTO strict, no-store, cursores, documentos seguros e cancelamento cobertos          | Codex Sol high + 5.3 para matriz       |
| T007 | Implementar endpoints HTTP de faturamento              | BIL-001–BIL-011 | T005, T006         | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                          | rotas tenant-scoped listam elegiveis/faturas, criam, cancelam e retornam documentos seguros             | Codex 5.3 + revisao Sol                |
| T008 | Escrever contracts frontend de faturamento             | BIL-001–BIL-010 | T006               | `(cd apps/frontend-transportada && bun test test/billing.contract.test.ts)` falha esperado                                                   | client/query/permissoes/DTOs/selecao/view-model/download sem dados sensiveis cobertos                   | Codex 5.3                              |
| T009 | Implementar UI de faturamento                          | BIL-001–BIL-010 | T007, T008         | `bun run --cwd apps/frontend-transportada check`                                                                                             | usuario seleciona CT-e, revisa totais, gera fatura, consulta detalhe, baixa documento e cancela         | Codex 5.3 + revisao Sol                |
| T010 | Validar jornada responsiva com Playwright              | BIL-001–BIL-010 | T009               | `bun run --cwd apps/frontend-transportada smoke`                                                                                             | 375/768/1280 cobrem criar fatura, lista vazia, detalhe, cancelamento e usuario sem permissao            | Codex 5.3 + revisao Sol                |
| T011 | Executar integracao local e revisao de release         | BIL-001–BIL-012 | T001–T010          | `bun install --frozen-lockfile && make check && make migration-test`; `make dev` gerenciado + `make smoke` + `make down`; `git diff --check` | gates verdes, evidencia registrada, sem XML/segredos em responses/logs e zero achado critico de release | Codex Sol high + reviewer independente |

## Gates por escopo

| Escopo   | Gates minimos                                                                                  |
| -------- | ---------------------------------------------------------------------------------------------- |
| schema   | `db:check`, migration/rollback, decimal, constraints tenant-scoped e bloqueio de refaturamento |
| API      | contracts HTTP, integracao, RBAC antes do body, anti-enumeracao, no-store e cursores seguros   |
| dominio  | idempotencia, concorrencia, cancelamento append-only, totais coerentes e snapshots imutaveis   |
| docs     | PDF/exportacao sem XML, storage key, certificado, token ou payload fiscal bruto                |
| frontend | contracts, `check`, Playwright responsivo e limpeza de estado sensivel                         |
| raiz     | frozen install, `make check`, `make migration-test`, smoke gerenciado, `make down` e diffcheck |

Todo teste novo entra no script agregado da unidade na mesma task. Rodar apenas
o arquivo isolado registra o vermelho; concluir a task exige provar o gate
agregado.

## Estrategia de modelos e economia

- Codex 5.4: especificacao, decomposicao e ajustes documentais.
- Codex 5.3: execucao mecanica apos contracts fechados, UI e DTOs previsiveis.
- Codex Sol high: schema financeiro, dinheiro, concorrencia, idempotencia,
  migrations criticas e revisao de release.

Depois de duas falhas equivalentes em 5.3, escalar para Sol ou dividir a task.

## Estado

- [x] T001 Consolidar spec/plano executavel.
- [x] T002 Escrever contracts de schema de faturamento.
- [x] T003 Implementar schema, migration aditiva e rollback.
- [x] T004 Escrever contracts da aplicacao de faturamento.
- [x] T005 Implementar casos de uso e repositorios de faturamento.
- [ ] T006 Escrever contracts HTTP de faturamento.
- [ ] T007 Implementar endpoints HTTP de faturamento.
- [ ] T008 Escrever contracts frontend de faturamento.
- [ ] T009 Implementar UI de faturamento.
- [ ] T010 Validar jornada responsiva com Playwright.
- [ ] T011 Executar integracao local e revisao de release.
