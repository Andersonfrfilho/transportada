# Tasks — Importação e distribuição de NF-e

Uma task por vez, teste de aceite/contrato antes da implementação, evidência em
`evidence.md` e commit atômico por task. Publicação de package, Railway e SEFAZ
possuem gates distintos; nenhum é consequência automática de teste local.

| ID   | Task                                                          | Requisitos                                 | Dependência         | Verificação                                                                                                                                                  | Critério de sucesso                                                                                                              | Modelo recomendado                             |
| ---- | ------------------------------------------------------------- | ------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| T001 | Registrar ADRs, spec, plano e decomposição executável         | NFI-001–NFI-024                            | autorização feature | `bunx prettier --check docs/adr specs/005-nfe-xml-import && git diff --check`                                                                                | sem clarificação bloqueante; decisões, riscos, dependências, gates e modelos rastreáveis                                         | Codex Sol high                                 |
| T002 | Escrever contracts públicos de normalização NF-e no Ada       | NFI-004, NFI-005, NFI-008                  | T001                | `(cd ../adatechnology-packages/packages/backend/fiscal-provider && bun test test/contract/nfe-import.contract.test.ts)` falha esperado                       | fixtures sintéticas cobrem nfeProc/NFe/evento, decimais, participantes, chave, DTD/ENTITY e limites; teste entra no script       | Codex Sol high                                 |
| T003 | Implementar importação NF-e normalizada e aditiva             | NFI-004, NFI-005, NFI-008                  | T002                | `(cd ../adatechnology-packages/packages/backend/fiscal-provider && bun run check && bun test)`                                                               | `importarNfeXml`/novo contrato público preserva compatibilidade, strings decimais e zero rede/segredo                            | Codex Sol high                                 |
| T004 | Validar pack e consumo Bun limpo do fiscal-provider           | NFI-005, NFI-018, NFI-023                  | T003                | `(cd ../adatechnology-packages/packages/backend/fiscal-provider && npm pack --dry-run --json && bun run test:package)`                                       | tarball contém JS/types públicos compatíveis com Bun, consumidor importa somente a raiz e não depende do checkout                | Codex Terra medium + revisão Sol               |
| T005 | Escrever contracts do `object-storage-provider`               | NFI-006, NFI-019, NFI-023                  | T001                | `(cd ../adatechnology-packages/packages/backend/object-storage-provider && bun test test/object-storage.contract.test.ts)` falha esperado                    | create-only, replay/hash divergente, stream/limites/key/erro/redaction/health/signed URL definidos sem acoplar ao app            | Codex Sol high                                 |
| T006 | Implementar provider S3 compatível Bun-first                  | NFI-006, NFI-019, NFI-023                  | T005                | `(cd ../adatechnology-packages/packages/backend/object-storage-provider && bun run check && bun test)`                                                       | MinIO prova create-only sem overwrite, put/get/head/delete/hash/path-style/erro/shutdown; nenhum segredo em saída                | Codex Terra medium + revisão Sol               |
| T007 | Empacotar, versionar, publicar e fixar packages Ada           | NFI-005, NFI-006, NFI-018                  | T004, T006          | `npm view @adatechnology/fiscal-provider version && npm view @adatechnology/object-storage-provider version && bun install --frozen-lockfile`                | changesets/pipeline aprovados publicam bumps; API/worker usam pins exatos sem `file:`/`workspace:*`                              | Codex Sol high                                 |
| T008 | Escrever contracts de parâmetros dinâmicos do router          | NFI-001, NFI-002, NFI-019                  | T001                | `(cd apps/api-transportada && bun test test/router-path-parameters.contract.test.ts)` falha esperado                                                         | precedência, decode, UUID, 404, auth/RBAC antes do parser/body e regressão das rotas exatas; teste agregado                      | Codex Terra medium + revisão Sol               |
| T009 | Implementar matching tipado sem regressão HTTP                | NFI-001, NFI-002, NFI-019                  | T008                | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                                          | router aceita `:id` seguro, mantém composição explícita, CORS, health, auth-me e deny-by-default                                 | Codex Terra medium + revisão Sol               |
| T010 | Escrever contracts do schema NF-e/outbox/storage              | NFI-001, NFI-006–NFI-016                   | T004                | `(cd apps/api-transportada && bun test test/nfe-schema.contract.test.ts)` falha esperado                                                                     | FKs/uniques/checks tenant-scoped, decimais, NSU, cursores, leases, outbox, processed messages e objetos cobertos; teste agregado | Codex Sol high                                 |
| T011 | Implementar schema, migration aditiva e rollback              | NFI-001, NFI-006–NFI-016                   | T010                | `bun run --cwd apps/api-transportada db:check && make migration-test`                                                                                        | baseline/vazio aplicam sem drift; constraints fecham duplicidade/corrida; rollback manual ordenado                               | Codex Sol high                                 |
| T012 | Escrever contracts dos gateways de storage dos apps           | NFI-006, NFI-019, NFI-023                  | T007, T011          | `bun test apps/api-transportada/test/nfe-storage-gateway.contract.test.ts apps/worker-transportada/test/nfe-storage-gateway.contract.test.ts` falha esperado | adapters cobrem create-only/replay/hash, keys/streams e reconciliador que nunca remove final; ambos os testes entram nos scripts | Codex Sol high                                 |
| T013 | Implementar adapters S3 e reconciliador de staging            | NFI-006, NFI-019, NFI-023                  | T012                | `bun run --cwd apps/api-transportada check && bun run --cwd apps/worker-transportada check`                                                                  | apps independentes; MinIO/config/health funcionam; lease limpa órfão expirado e preserva staging ativo/objeto final              | Codex Terra medium + revisão Sol               |
| T014 | Escrever contracts da aplicação de importação                 | NFI-001–NFI-015, NFI-021                   | T011, T013          | `(cd apps/api-transportada && bun test test/nfe-import-application.contract.test.ts)` falha esperado                                                         | create/finalize/compensate/status/list/detail/reprocess cobrem idempotência, outbox, contadores e tenant                         | Codex Sol high                                 |
| T015 | Implementar repositórios, casos de uso e outbox               | NFI-001–NFI-015, NFI-021                   | T014                | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                                          | staging + transação + outbox, paginação, anti-enumeração e compensação funcionam contra PostgreSQL/MinIO                         | Codex Sol high                                 |
| T016 | Escrever contracts HTTP de importações/documentos             | NFI-001–NFI-004, NFI-010–NFI-021           | T009, T014          | `(cd apps/api-transportada && bun test test/nfe-http.contract.test.ts)` falha esperado                                                                       | multipart, 202, idempotency, limites, paths, paginação, no-store, download, reprocess e erros seguros; teste agregado            | Codex Sol high + OpenCode para matriz mecânica |
| T017 | Implementar rotas HTTP NF-e e streaming seguro                | NFI-001–NFI-004, NFI-010–NFI-021           | T015, T016          | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                                          | todas as rotas previstas funcionam tenant-scoped; XML não é bufferizado/logado nem incluído em listagens                         | Codex Terra medium + revisão Sol               |
| T018 | Escrever contracts de envelope, topologias e backoff          | NFI-011–NFI-014, NFI-021                   | T001                | `(cd apps/worker-transportada && bun test test/nfe-messaging.contract.test.ts)` falha esperado                                                               | main/retry/DLX/DLQ, envelopes mínimos e rejeição de tenant/ator divergentes; backoff persistente definido e agregado             | Codex Sol high                                 |
| T019 | Implementar topologias e backoff persistido                   | NFI-011–NFI-014, NFI-021                   | T011, T018          | `bun run --cwd apps/worker-transportada check && bun run --cwd apps/worker-transportada test:integration`                                                    | main/retry/DLX/DLQ usam provider pinado; agenda persistida oferece backoff gradual sem loop em memória ou mudança do package     | Codex Sol high                                 |
| T020 | Escrever contracts do relay outbox e idempotência persistente | NFI-011–NFI-015, NFI-021                   | T011, T019          | `(cd apps/worker-transportada && bun test test/outbox-relay.contract.test.ts test/processed-message.contract.test.ts)` falha esperado                        | claim/lease, confirm, retry, duas instâncias, redelivery, commit-before-ack e recuperação de crash cobertos; testes agregados    | Codex Sol high                                 |
| T021 | Implementar relay, repositories e lifecycle do worker         | NFI-011–NFI-015, NFI-021                   | T020                | `bun run --cwd apps/worker-transportada check && bun run --cwd apps/worker-transportada test:integration`                                                    | nenhum `Set` em memória decide efeito real; outbox/processed messages sobrevivem restart e escalam horizontalmente               | Codex Sol high                                 |
| T022 | Escrever contracts do consumer XML/ZIP                        | NFI-003–NFI-015, NFI-021                   | T003, T013, T021    | `(cd apps/worker-transportada && bun test test/nfe-import-consumer.contract.test.ts)` falha esperado                                                         | ZIP adversarial, XML variants, CNPJ relacionado, storage, duplicidade, erro por item e resumo parcial cobertos; teste agregado   | Codex Sol high + OpenCode para casos mecânicos |
| T023 | Implementar consumer de importação e normalização             | NFI-003–NFI-015, NFI-021                   | T022                | `bun run --cwd apps/worker-transportada check && bun run --cwd apps/worker-transportada test:integration`                                                    | lote misto processa independentemente, original/hash são preservados, efeitos são idempotentes e ack ocorre após commit          | Codex Sol high                                 |
| T024 | Escrever contracts do gateway/consumer de distribuição        | NFI-005, NFI-008, NFI-014–NFI-018, NFI-021 | T007, T021          | `(cd apps/worker-transportada && bun test test/nfe-distribution.contract.test.ts)` falha esperado                                                            | package pinado, A1 em memória, 51 itens, páginas sobrepostas/mesmo NSU, cursor/lease, vazio/rate-limit e erros cobertos          | Codex Sol high                                 |
| T025 | Implementar distribuição DFe e cursor persistente             | NFI-005, NFI-008, NFI-014–NFI-018, NFI-021 | T023, T024          | `bun run --cwd apps/worker-transportada check && bun run --cwd apps/worker-transportada test:integration`                                                    | tenant/ambiente/NSU unique absorve replay, cursor monotônico, janela anti-656 persistente e nenhum segredo em logs/fila          | Codex Sol high                                 |
| T026 | Integrar bootstrap, readiness e shutdown do worker            | NFI-012–NFI-018, NFI-023                   | T021, T023, T025    | `(cd apps/worker-transportada && bun test test/nfe-runtime.contract.test.ts && bun run test:integration)`                                                    | relay e dois consumers iniciam/param independentemente, health cobre DB/Rabbit/S3 e mensagens em voo drenam                      | Codex Terra medium + revisão Sol               |
| T027 | Escrever contracts do frontend NF-e                           | NFI-002, NFI-010, NFI-015, NFI-019–NFI-022 | T016                | `(cd apps/frontend-transportada && bun test test/nfe-workspace.contract.test.ts)` falha esperado                                                             | DTOs, permissões, queries, polling terminal, limpeza de arquivos, no-cache e estados de UI definidos; teste agregado             | Codex Terra medium                             |
| T028 | Implementar workspace Vite de importações e NF-e              | NFI-002, NFI-010, NFI-015, NFI-019–NFI-023 | T017, T027          | `bun run --cwd apps/frontend-transportada check`                                                                                                             | upload/distribuição/progresso/lista/detalhe/download usam Query/i18n/tokens/PWA e nenhum conteúdo fiscal persiste                | Codex Terra medium                             |
| T029 | Validar jornada responsiva e permissões com Playwright        | NFI-001, NFI-002, NFI-019, NFI-022         | T028                | `bun run --cwd apps/frontend-transportada smoke`                                                                                                             | 375/768/1280, operator/viewer/forbidden, parcial/reprocess/download e storages/cache sem XML cobertos                            | Codex Terra medium + revisão Sol               |
| T030 | Executar integração real local de ponta a ponta               | NFI-001–NFI-024                            | T007–T029           | `make up && make migration-test`; `make dev` gerenciado + `make smoke`; `make down`                                                                          | PostgreSQL/RabbitMQ/MinIO/Keycloak locais provam outbox, filas/exchanges, retry/DLQ, importação e isolamento; processos encerram | Codex Sol high                                 |
| T031 | Consolidar evidência e revisão independente de release        | NFI-001–NFI-024                            | T001–T030           | `bun install --frozen-lockfile && make check && make migration-test && git diff --check`                                                                     | gates verdes, dependências pinadas, exemplos/PFX/segredos ausentes do Git, nenhum Railway/SEFAZ e zero achado crítico            | Codex Sol high + reviewer independente         |

## Gates por escopo

| Escopo                  | Gates mínimos                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| fiscal-provider         | contract NF-e, `bun run check`, `bun test`, pack e consumidor Bun limpo                                |
| object-storage-provider | contract, MinIO real, `bun run check`, `bun test`, pack e consumidor Bun limpo                         |
| rabbitmq-provider       | somente se evoluído: contracts existentes + novo backoff, integração RabbitMQ e pack                   |
| API                     | `check`, `test:integration`, `db:check`, migration/rollback, MinIO e isolamento negativo               |
| worker                  | `check`, `test:integration`, RabbitMQ/PostgreSQL/MinIO, restart, duas instâncias e shutdown            |
| frontend                | `check`, testes agregados e Playwright 375/768/1280                                                    |
| raiz                    | frozen install, `make check`, `make migration-test`, smoke gerenciado, `make down`, `git diff --check` |

Todo teste novo entra no script agregado da unidade na mesma task. Rodar apenas
o arquivo isolado registra o vermelho; concluir a task exige provar o gate
agregado.

## Estratégia de modelos e economia

- OpenCode gratuito: inventário, matrizes repetitivas de inputs, casos
  mecânicos e primeira revisão textual; nunca decide fiscal, tenant,
  concorrência, certificado ou publicação.
- Codex Luna low: formatação, documentação curta, changesets mecânicos e
  atualização de evidência depois que a decisão já está fechada.
- Codex Terra medium: implementação reversível de packages, adapters, router,
  endpoints e frontend.
- Codex Sol high: contrato fiscal, XML/ZIP adversarial, storage security,
  schema/migration, outbox, RabbitMQ, idempotência, distribuição, certificado,
  integração final e release review.

O agente principal revisa toda entrega delegada e executa os gates. Depois de
duas falhas equivalentes do modelo econômico, a task é dividida ou escalada
para Terra/Sol sem repetir contexto crescente.

## Estado

- [x] T001 Registrar ADRs, spec, plano e decomposição executável.
- [x] T002 Escrever contracts públicos de normalização NF-e no Ada.
- [x] T003 Implementar importação NF-e normalizada e aditiva.
- [x] T004 Validar pack e consumo Bun limpo do fiscal-provider.
- [x] T005 Escrever contracts do `object-storage-provider`.
- [x] T006 Implementar provider S3 compatível Bun-first.
- [x] T007 Empacotar, versionar, publicar e fixar packages Ada.
- [x] T008 Escrever contracts de parâmetros dinâmicos do router.
- [x] T009 Implementar matching tipado sem regressão HTTP.
- [ ] T010 Escrever contracts do schema NF-e/outbox/storage.
- [ ] T011 Implementar schema, migration aditiva e rollback.
- [ ] T012 Escrever contracts dos gateways de storage dos apps.
- [ ] T013 Implementar adapters S3 e reconciliador de staging.
- [ ] T014 Escrever contracts da aplicação de importação.
- [ ] T015 Implementar repositórios, casos de uso e outbox.
- [ ] T016 Escrever contracts HTTP de importações/documentos.
- [ ] T017 Implementar rotas HTTP NF-e e streaming seguro.
- [ ] T018 Escrever contracts de envelope, topologias e backoff.
- [ ] T019 Implementar topologias e backoff persistido.
- [ ] T020 Escrever contracts do relay outbox e idempotência persistente.
- [ ] T021 Implementar relay, repositories e lifecycle do worker.
- [ ] T022 Escrever contracts do consumer XML/ZIP.
- [ ] T023 Implementar consumer de importação e normalização.
- [ ] T024 Escrever contracts do gateway/consumer de distribuição.
- [ ] T025 Implementar distribuição DFe e cursor persistente.
- [ ] T026 Integrar bootstrap, readiness e shutdown do worker.
- [ ] T027 Escrever contracts do frontend NF-e.
- [ ] T028 Implementar workspace Vite de importações e NF-e.
- [ ] T029 Validar jornada responsiva e permissões com Playwright.
- [ ] T030 Executar integração real local de ponta a ponta.
- [ ] T031 Consolidar evidência e revisão independente de release.
