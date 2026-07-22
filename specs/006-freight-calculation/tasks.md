# Tasks — Regras e cálculo de frete

Uma task por vez, testes aplicáveis antes da implementação e um commit atômico
por task.

| ID   | Task                                                | Requisitos                                          | Dependência         | Verificação                                                                                                                                  | Critério de sucesso                                                                                   | Modelo recomendado                             |
| ---- | --------------------------------------------------- | --------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| T001 | Registrar ADR e consolidar spec/plano executável    | FRT-001–FRT-018                                     | autorização feature | `bunx prettier --check docs/adr specs/006-freight-calculation && git diff --check`                                                           | sem clarificação bloqueante; arredondamento, snapshots, escopo e modelos rastreáveis                  | Codex Sol high                                 |
| T002 | Escrever contracts do schema de frete e constraints | FRT-001, FRT-004–FRT-007, FRT-016                   | T001                | `(cd apps/api-transportada && bun test test/freight-schema.contract.test.ts)` falha esperado                                                 | regras, versões, cálculos, FKs compostas, idempotência, checks e sobreposição cobertos                | Codex Sol high                                 |
| T003 | Implementar schema, migration aditiva e rollback    | FRT-001, FRT-004–FRT-007, FRT-016                   | T002                | `bun run --cwd apps/api-transportada db:check && make migration-test`                                                                        | baseline/vazio aplicam sem drift; constraints fecham concorrência e rollback é ordenado               | Codex Sol high                                 |
| T004 | Escrever contracts do motor decimal de cálculo      | FRT-003, FRT-004, FRT-008–FRT-010, FRT-017, FRT-018 | T001                | `(cd apps/api-transportada && bun test test/freight-calculation-engine.contract.test.ts)` falha esperado                                     | percentual 3,5%, mínimo, máximo, arredondamento e entradas inválidas definidos sem `number` monetário | Codex Sol high                                 |
| T005 | Implementar motor de cálculo e snapshots puros      | FRT-003, FRT-004, FRT-008–FRT-010, FRT-017, FRT-018 | T004                | `bun run --cwd apps/api-transportada check`                                                                                                  | cálculo determinístico retorna strings decimais e snapshot canônico, sem dependência de HTTP/CT-e     | Codex Terra medium + revisão Sol               |
| T006 | Escrever contracts da aplicação de regras           | FRT-001–FRT-008, FRT-012–FRT-014                    | T003, T005          | `(cd apps/api-transportada && bun test test/freight-rules-application.contract.test.ts)` falha esperado                                      | create/update/version/activate/deactivate/list cobrem tenant, RBAC lógico, vigência e auditoria       | Codex Sol high                                 |
| T007 | Implementar repositórios e casos de uso de regras   | FRT-001–FRT-008, FRT-012–FRT-014                    | T006                | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                          | versionamento transacional, seleção vigente e bloqueio de sobreposição funcionam em PostgreSQL        | Codex Sol high                                 |
| T008 | Escrever contracts da aplicação de simulação        | FRT-001–FRT-004, FRT-008–FRT-014, FRT-017           | T003, T005          | `(cd apps/api-transportada && bun test test/freight-simulation-application.contract.test.ts)` falha esperado                                 | NF-e elegível, regra vigente, snapshot, idempotência, replay divergente e anti-enumeração cobertos    | Codex Sol high                                 |
| T009 | Implementar casos de uso de simulação e consulta    | FRT-001–FRT-004, FRT-008–FRT-014, FRT-017           | T007, T008          | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                          | simulação persistente cria no máximo um cálculo por idempotência e preserva histórico                 | Codex Sol high                                 |
| T010 | Escrever contracts HTTP de regras e simulações      | FRT-001–FRT-015                                     | T006, T008          | `(cd apps/api-transportada && bun test test/freight-http.contract.test.ts)` falha esperado                                                   | RBAC antes do body, DTOs strict, no-store, paginação, erros seguros e rotas contratadas               | Codex Sol high + OpenCode para matriz mecânica |
| T011 | Implementar endpoints HTTP de frete                 | FRT-001–FRT-015                                     | T009, T010          | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                          | rotas funcionam tenant-scoped sem aceitar `companyId`, XML ou dados calculáveis do cliente            | Codex Terra medium + revisão Sol               |
| T012 | Escrever contracts do frontend de frete             | FRT-002–FRT-005, FRT-010, FRT-015                   | T010                | `(cd apps/frontend-transportada && bun test test/freight.contract.test.ts)` falha esperado                                                   | client/query/permissions/DTOs/estados cobrem regra, simulação, mínimo/máximo e ausência de controles  | Codex Terra medium                             |
| T013 | Implementar UI Vite de regras e simulação           | FRT-002–FRT-005, FRT-010, FRT-015                   | T011, T012          | `bun run --cwd apps/frontend-transportada check`                                                                                             | admin configura regra; operador simula NF-e; UI usa i18n/tokens e não persiste payload fiscal         | Codex Terra medium                             |
| T014 | Validar jornada responsiva com Playwright           | FRT-002, FRT-013, FRT-015                           | T013                | `bun run --cwd apps/frontend-transportada smoke`                                                                                             | 375/768/1280 cobrem admin, operador e usuário sem permissão, incluindo mínimo/máximo                  | Codex Terra medium + revisão Sol               |
| T015 | Executar integração local e revisão de release      | FRT-001–FRT-018                                     | T001–T014           | `bun install --frozen-lockfile && make check && make migration-test && git diff --check`; `make dev` gerenciado + `make smoke` + `make down` | gates verdes, evidência registrada, nenhum Railway/SEFAZ e zero achado crítico                        | Codex Sol high + reviewer independente         |

## Gates por escopo

| Escopo      | Gates mínimos                                                                              |
| ----------- | ------------------------------------------------------------------------------------------ |
| API schema  | `db:check`, migration/rollback e contracts de constraints                                  |
| API domínio | contracts do motor decimal, aplicação e integração PostgreSQL                              |
| API HTTP    | contracts HTTP, integração, RBAC e anti-enumeração                                         |
| frontend    | contracts, `check` e Playwright responsivo                                                 |
| raiz        | frozen install, `make check`, `make migration-test`, smoke gerenciado e `git diff --check` |

Todo teste novo entra no script agregado da unidade na mesma task. Rodar apenas
o arquivo isolado registra o vermelho; concluir a task exige provar o gate
agregado.

## Estratégia de modelos e economia

- OpenCode gratuito: matrizes repetitivas de inputs HTTP/UI e revisão textual
  somente leitura.
- Codex Luna low: formatação, evidência e documentação curta depois que a
  decisão estiver fechada.
- Codex Terra medium: implementação reversível de endpoints e frontend.
- Codex Sol high: dinheiro, decimal, snapshots, schema/migration, idempotência,
  tenant, concorrência e revisão de release.

Depois de duas falhas equivalentes do modelo econômico, a task deve ser dividida
ou escalada para Sol sem repetir a mesma tentativa com contexto maior.

## Estado

- [x] T001 Registrar ADR e consolidar spec/plano executável.
- [x] T002 Escrever contracts do schema de frete e constraints.
- [x] T003 Implementar schema, migration aditiva e rollback.
- [ ] T004 Escrever contracts do motor decimal de cálculo.
- [ ] T005 Implementar motor de cálculo e snapshots puros.
- [ ] T006 Escrever contracts da aplicação de regras.
- [ ] T007 Implementar repositórios e casos de uso de regras.
- [ ] T008 Escrever contracts da aplicação de simulação.
- [ ] T009 Implementar casos de uso de simulação e consulta.
- [ ] T010 Escrever contracts HTTP de regras e simulações.
- [ ] T011 Implementar endpoints HTTP de frete.
- [ ] T012 Escrever contracts do frontend de frete.
- [ ] T013 Implementar UI Vite de regras e simulação.
- [ ] T014 Validar jornada responsiva com Playwright.
- [ ] T015 Executar integração local e revisão de release.
