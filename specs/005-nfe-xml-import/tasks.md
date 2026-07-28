# Tasks — Importação e distribuição de NF-e

Uma task por vez, teste de aceite/contrato antes da implementação, evidência em
`evidence.md` e commit atômico por task. Publicação de package, Railway e SEFAZ
possuem gates distintos; nenhum é consequência automática de teste local.

| ID   | Task                                                          | Requisitos                                 | Dependência         | Verificação                                                                                                                                                  | Critério de sucesso                                                                                                              | Modelo recomendado                       |
| ---- | ------------------------------------------------------------- | ------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| T001 | Registrar ADRs, spec, plano e decomposição executável         | NFI-001–NFI-024                            | autorização feature | `bunx prettier --check docs/adr specs/005-nfe-xml-import && git diff --check`                                                                                | sem clarificação bloqueante; decisões, riscos, dependências, gates e modelos rastreáveis                                         | Opus (alto)                              |
| T002 | Escrever contracts públicos de normalização NF-e no Ada       | NFI-004, NFI-005, NFI-008                  | T001                | `(cd ../adatechnology-packages/packages/backend/fiscal-provider && bun test test/contract/nfe-import.contract.test.ts)` falha esperado                       | fixtures sintéticas cobrem nfeProc/NFe/evento, decimais, participantes, chave, DTD/ENTITY e limites; teste entra no script       | Opus (alto)                              |
| T003 | Implementar importação NF-e normalizada e aditiva             | NFI-004, NFI-005, NFI-008                  | T002                | `(cd ../adatechnology-packages/packages/backend/fiscal-provider && bun run check && bun test)`                                                               | `importarNfeXml`/novo contrato público preserva compatibilidade, strings decimais e zero rede/segredo                            | Opus (alto)                              |
| T004 | Validar pack e consumo Bun limpo do fiscal-provider           | NFI-005, NFI-018, NFI-023                  | T003                | `(cd ../adatechnology-packages/packages/backend/fiscal-provider && npm pack --dry-run --json && bun run test:package)`                                       | tarball contém JS/types públicos compatíveis com Bun, consumidor importa somente a raiz e não depende do checkout                | Sonnet (médio) + revisão Opus            |
| T005 | Escrever contracts do `object-storage-provider`               | NFI-006, NFI-019, NFI-023                  | T001                | `(cd ../adatechnology-packages/packages/backend/object-storage-provider && bun test test/object-storage.contract.test.ts)` falha esperado                    | create-only, replay/hash divergente, stream/limites/key/erro/redaction/health/signed URL definidos sem acoplar ao app            | Opus (alto)                              |
| T006 | Implementar provider S3 compatível Bun-first                  | NFI-006, NFI-019, NFI-023                  | T005                | `(cd ../adatechnology-packages/packages/backend/object-storage-provider && bun run check && bun test)`                                                       | MinIO prova create-only sem overwrite, put/get/head/delete/hash/path-style/erro/shutdown; nenhum segredo em saída                | Sonnet (médio) + revisão Opus            |
| T007 | Empacotar, versionar, publicar e fixar packages Ada           | NFI-005, NFI-006, NFI-018                  | T004, T006          | `npm view @adatechnology/fiscal-provider version && npm view @adatechnology/object-storage-provider version && bun install --frozen-lockfile`                | changesets/pipeline aprovados publicam bumps; API/worker usam pins exatos sem `file:`/`workspace:*`                              | Opus (alto)                              |
| T008 | Escrever contracts de parâmetros dinâmicos do router          | NFI-001, NFI-002, NFI-019                  | T001                | `(cd apps/api-transportada && bun test test/router-path-parameters.contract.test.ts)` falha esperado                                                         | precedência, decode, UUID, 404, auth/RBAC antes do parser/body e regressão das rotas exatas; teste agregado                      | Sonnet (médio) + revisão Opus            |
| T009 | Implementar matching tipado sem regressão HTTP                | NFI-001, NFI-002, NFI-019                  | T008                | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                                          | router aceita `:id` seguro, mantém composição explícita, CORS, health, auth-me e deny-by-default                                 | Sonnet (médio) + revisão Opus            |
| T010 | Escrever contracts do schema NF-e/outbox/storage              | NFI-001, NFI-006–NFI-016                   | T004                | `(cd apps/api-transportada && bun test test/nfe-schema.contract.test.ts)` falha esperado                                                                     | FKs/uniques/checks tenant-scoped, decimais, NSU, cursores, leases, outbox, processed messages e objetos cobertos; teste agregado | Opus (alto)                              |
| T011 | Implementar schema, migration aditiva e rollback              | NFI-001, NFI-006–NFI-016                   | T010                | `bun run --cwd apps/api-transportada db:check && make migration-test`                                                                                        | baseline/vazio aplicam sem drift; constraints fecham duplicidade/corrida; rollback manual ordenado                               | Opus (alto)                              |
| T012 | Escrever contracts dos gateways de storage dos apps           | NFI-006, NFI-019, NFI-023                  | T007, T011          | `bun test apps/api-transportada/test/nfe-storage-gateway.contract.test.ts apps/worker-transportada/test/nfe-storage-gateway.contract.test.ts` falha esperado | adapters cobrem create-only/replay/hash, keys/streams e reconciliador que nunca remove final; ambos os testes entram nos scripts | Opus (alto)                              |
| T013 | Implementar adapters S3 e reconciliador de staging            | NFI-006, NFI-019, NFI-023                  | T012                | `bun run --cwd apps/api-transportada check && bun run --cwd apps/worker-transportada check`                                                                  | apps independentes; MinIO/config/health funcionam; lease limpa órfão expirado e preserva staging ativo/objeto final              | Sonnet (médio) + revisão Opus            |
| T014 | Escrever contracts da aplicação de importação                 | NFI-001–NFI-015, NFI-021                   | T011, T013          | `(cd apps/api-transportada && bun test test/nfe-import-application.contract.test.ts)` falha esperado                                                         | create/finalize/compensate/status/list/detail/reprocess cobrem idempotência, outbox, contadores e tenant                         | Opus (alto)                              |
| T015 | Implementar repositórios, casos de uso e outbox               | NFI-001–NFI-015, NFI-021                   | T014                | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                                          | staging + transação + outbox, paginação, anti-enumeração e compensação funcionam contra PostgreSQL/MinIO                         | Opus (alto)                              |
| T016 | Escrever contracts HTTP de importações/documentos             | NFI-001–NFI-004, NFI-010–NFI-021           | T009, T014          | `(cd apps/api-transportada && bun test test/nfe-http.contract.test.ts)` falha esperado                                                                       | multipart, 202, idempotency, limites, paths, paginação, no-store, download, reprocess e erros seguros; teste agregado            | Opus (alto) + Haiku para matriz mecânica |
| T017 | Implementar rotas HTTP NF-e e streaming seguro                | NFI-001–NFI-004, NFI-010–NFI-021           | T015, T016          | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                                          | todas as rotas previstas funcionam tenant-scoped; XML não é bufferizado/logado nem incluído em listagens                         | Sonnet (médio) + revisão Opus            |
| T018 | Escrever contracts de envelope, topologias e backoff          | NFI-011–NFI-014, NFI-021                   | T001                | `(cd apps/worker-transportada && bun test test/nfe-messaging.contract.test.ts)` falha esperado                                                               | main/retry/DLX/DLQ, envelopes mínimos e rejeição de tenant/ator divergentes; backoff persistente definido e agregado             | Opus (alto)                              |
| T019 | Implementar topologias e backoff persistido                   | NFI-011–NFI-014, NFI-021                   | T011, T018          | `bun run --cwd apps/worker-transportada check && bun run --cwd apps/worker-transportada test:integration`                                                    | main/retry/DLX/DLQ usam provider pinado; agenda persistida oferece backoff gradual sem loop em memória ou mudança do package     | Opus (alto)                              |
| T020 | Escrever contracts do relay outbox e idempotência persistente | NFI-011–NFI-015, NFI-021                   | T011, T019          | `(cd apps/worker-transportada && bun test test/outbox-relay.contract.test.ts test/processed-message.contract.test.ts)` falha esperado                        | claim/lease, confirm, retry, duas instâncias, redelivery, commit-before-ack e recuperação de crash cobertos; testes agregados    | Opus (alto)                              |
| T021 | Implementar relay, repositories e lifecycle do worker         | NFI-011–NFI-015, NFI-021                   | T020                | `bun run --cwd apps/worker-transportada check && bun run --cwd apps/worker-transportada test:integration`                                                    | nenhum `Set` em memória decide efeito real; outbox/processed messages sobrevivem restart e escalam horizontalmente               | Opus (alto)                              |
| T022 | Escrever contracts do consumer XML/ZIP                        | NFI-003–NFI-015, NFI-021                   | T003, T013, T021    | `(cd apps/worker-transportada && bun test test/nfe-import-consumer.contract.test.ts)` falha esperado                                                         | ZIP adversarial, XML variants, CNPJ relacionado, storage, duplicidade, erro por item e resumo parcial cobertos; teste agregado   | Opus (alto) + Haiku para casos mecânicos |
| T023 | Implementar consumer de importação e normalização             | NFI-003–NFI-015, NFI-021                   | T022                | `bun run --cwd apps/worker-transportada check && bun run --cwd apps/worker-transportada test:integration`                                                    | lote misto processa independentemente, original/hash são preservados, efeitos são idempotentes e ack ocorre após commit          | Opus (alto)                              |
| T024 | Escrever contracts do gateway/consumer de distribuição        | NFI-005, NFI-008, NFI-014–NFI-018, NFI-021 | T007, T021          | `(cd apps/worker-transportada && bun test test/nfe-distribution.contract.test.ts)` falha esperado                                                            | package pinado, A1 em memória, 51 itens, páginas sobrepostas/mesmo NSU, cursor/lease, vazio/rate-limit e erros cobertos          | Opus (alto)                              |
| T025 | Implementar distribuição DFe e cursor persistente             | NFI-005, NFI-008, NFI-014–NFI-018, NFI-021 | T023, T024          | `bun run --cwd apps/worker-transportada check && bun run --cwd apps/worker-transportada test:integration`                                                    | tenant/ambiente/NSU unique absorve replay, cursor monotônico, janela anti-656 persistente e nenhum segredo em logs/fila          | Opus (alto)                              |
| T026 | Integrar bootstrap, readiness e shutdown do worker            | NFI-012–NFI-018, NFI-023                   | T021, T023, T025    | `(cd apps/worker-transportada && bun test test/nfe-runtime.contract.test.ts && bun run test:integration)`                                                    | relay e dois consumers iniciam/param independentemente, health cobre DB/Rabbit/S3 e mensagens em voo drenam                      | Sonnet (médio) + revisão Opus            |
| T027 | Escrever contracts do frontend NF-e                           | NFI-002, NFI-010, NFI-015, NFI-019–NFI-022 | T016                | `(cd apps/frontend-transportada && bun test test/nfe-workspace.contract.test.ts)` falha esperado                                                             | DTOs, permissões, queries, polling terminal, limpeza de arquivos, no-cache e estados de UI definidos; teste agregado             | Sonnet (médio)                           |
| T028 | Implementar workspace Vite de importações e NF-e              | NFI-002, NFI-010, NFI-015, NFI-019–NFI-023 | T017, T027          | `bun run --cwd apps/frontend-transportada check`                                                                                                             | upload/distribuição/progresso/lista/detalhe/download usam Query/i18n/tokens/PWA e nenhum conteúdo fiscal persiste                | Sonnet (médio)                           |
| T029 | Validar jornada responsiva e permissões com Playwright        | NFI-001, NFI-002, NFI-019, NFI-022         | T028                | `bun run --cwd apps/frontend-transportada smoke`                                                                                                             | 375/768/1280, operator/viewer/forbidden, parcial/reprocess/download e storages/cache sem XML cobertos                            | Sonnet (médio) + revisão Opus            |
| T030 | Executar integração real local de ponta a ponta               | NFI-001–NFI-024                            | T007–T029           | `make up && make migration-test`; `make dev` gerenciado + `make smoke`; `make down`                                                                          | PostgreSQL/RabbitMQ/MinIO/Keycloak locais provam outbox, filas/exchanges, retry/DLQ, importação e isolamento; processos encerram | Opus (alto)                              |
| T031 | Consolidar evidência e revisão independente de release        | NFI-001–NFI-024                            | T001–T030           | `bun install --frozen-lockfile && make check && make migration-test && git diff --check`                                                                     | gates verdes, dependências pinadas, exemplos/PFX/segredos ausentes do Git, nenhum Railway/SEFAZ e zero achado crítico            | Opus (alto) + reviewer independente      |

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

- Haiku (baixo): inventário read-only, matrizes repetitivas de inputs, casos
  mecânicos, primeira revisão textual, formatação, documentação curta,
  changesets e atualização de evidência depois que a decisão já está fechada;
  nunca decide fiscal, tenant, concorrência, certificado ou publicação.
- Sonnet (médio): implementação reversível de packages, adapters, router,
  endpoints e frontend.
- Opus (alto): contrato fiscal, XML/ZIP adversarial, storage security,
  schema/migration, outbox, RabbitMQ, idempotência, distribuição, certificado,
  integração final e release review.

O agente principal revisa toda entrega delegada e executa os gates. Depois de
duas falhas equivalentes do modelo econômico, a task é dividida ou escalada
para Sonnet/Opus sem repetir contexto crescente.

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
- [x] T010 Escrever contracts do schema NF-e/outbox/storage.
- [x] T011 Implementar schema, migration aditiva e rollback.
- [x] T012 Escrever contracts dos gateways de storage dos apps.
- [x] T013 Implementar adapters S3 e reconciliador de staging.
- [x] T014 Escrever contracts da aplicação de importação.
- [x] T015 Implementar repositórios, casos de uso e outbox.
- [x] T016 Escrever contracts HTTP de importações/documentos.
- [x] T017 Implementar rotas HTTP NF-e e streaming seguro.
- [x] T018 Escrever contracts de envelope, topologias e backoff.
- [x] T019 Implementar topologias e backoff persistido.
- [x] T020 Escrever contracts do relay outbox e idempotência persistente.
- [x] T021 Implementar relay, repositories e lifecycle do worker.
- [x] T022 Escrever contracts do consumer XML/ZIP.
- [x] T023 Implementar consumer de importação e normalização.
- [x] T024 Escrever contracts do gateway/consumer de distribuição.
- [x] T025 Implementar distribuição DFe e cursor persistente.
- [x] T026 Integrar bootstrap, readiness e shutdown do worker.
- [x] T027 Escrever contracts do frontend NF-e.
- [x] T028 Implementar workspace Vite de importações e NF-e.
- [x] T029 Validar jornada responsiva e permissões com Playwright.
- [x] T030 Executar integração real local de ponta a ponta.
- [x] T031 Consolidar evidência e revisão independente de release.

## Remediação — consumer de importação nunca conectado (reaberto 2026-07-24)

### Defeito observado

Em produção/local nenhum lote de NF-e sai de `Na fila · 0/N`: `importedCount`,
`invalidCount` e `failedCount` permanecem zerados. A mensagem publicada pela API
(`processing_outbox` → `nfe-import.v1`) chega ao worker, recebe `ack` e é
descartada **sem processar**.

### Causa raiz

O gate de aceite de T022–T026 foi cumprido apenas no nível de **contract test com
fakes em memória** (`test/nfe-import-consumer/*.contract.ts`, fixture com ports
falsos). A lógica pura existe e está verde, mas o caminho de produção nunca foi
fiado:

- `src/runtime/nfe-import-consumer.service.ts` é um stub de 58 linhas que só faz
  `ack` — **nunca** constrói nem invoca `createNfeImportConsumer`
  (`src/nfe-imports/application/nfe-import-consumer.service.ts`).
- Não há implementação concreta de nenhum dos 5 ports exigidos pelo factory
  (`repository`, `sourceStorage`, `finalStorage`, `archiveExpander`,
  `xmlImporter`).
- O worker não possui schema Drizzle de `nfe_imports`/`nfe_import_items`/
  `nfe_documents`/`nfe_participants`/`nfe_addresses`/`nfe_volumes`/`nfe_products`/
  `nfe_events` (só `cte-issuance-execution.schema.ts` e `processing.schema.ts`).
- `src/main.ts` não constrói nem injeta os adapters.
- Não existe teste de integração real do consumer (Postgres/RabbitMQ/MinIO) —
  por isso o contract verde escondeu a lacuna.

T023 e T026 ficam **reabertos**: a lógica pura está feita, a integração não.
Nenhum pacote novo é necessário — a normalização de XML já é
`@adatechnology/fiscal-provider@0.2.0` (`importXml`/`ImportedNfeXml`) e o storage
já é `@adatechnology/object-storage-provider@0.1.1`. O trabalho restante é
plumbing local do worker, seguindo o padrão já funcional do `cte-issuance`.

### Tasks de remediação

| ID  | Task                                                                  | Requisitos                | Dependência | Verificação                                                                                                      | Critério de sucesso                                                                                                                                                                          | Modelo recomendado    |
| --- | --------------------------------------------------------------------- | ------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| R01 | Duplicar schema Drizzle NF-e no worker (cópia por valor, como CT-e)   | NFI-006–NFI-013           | —           | `bun run --cwd apps/worker-transportada typecheck`                                                               | tabelas espelham colunas/constraints da API sem redeclarar FKs cross-app; `companyId` explícito em toda linha                                                                                | Opus (alto)           |
| R02 | Escrever contract test de integração do repository do consumer        | NFI-010–NFI-015, NFI-021  | R01         | `(cd apps/worker-transportada && bun test ./test/nfe-import-repository.integration.test.ts)` **vermelho**        | cobre `getPendingImport`, `findExistingDocument`, `completeItem` (grava documento+filhos), `finalizeImport` (contadores + status parcial)                                                    | Opus (alto)           |
| R03 | Implementar `DrizzleNfeImportConsumerRepository` espelhando a API     | NFI-010–NFI-015, NFI-021  | R02         | `bun run --cwd apps/worker-transportada check && bun test ./test/nfe-import-repository.integration.test.ts`      | grava `nfe_documents`+participantes/produtos/volumes/eventos e atualiza item+summary em transação; idempotente; tenant-scoped                                                                | Opus (alto)           |
| R04 | Implementar adapters de storage (source read + final create-only)     | NFI-006, NFI-019, NFI-023 | R01         | `bun run --cwd apps/worker-transportada check`                                                                   | `sourceStorage.readSource` lê staging via gateway; `finalStorage` grava documento/evento create-only, nunca sobrescreve nem loga XML                                                         | Opus (alto)           |
| R05 | Implementar archive expander (XML passthrough + ZIP seguro)           | NFI-003, NFI-021          | R01         | `bun run --cwd apps/worker-transportada check && bun test ./test/nfe-import-consumer.contract.test.ts`           | passa nos casos de `zip-safety.contract.ts` reais (zip-bomb, path traversal, entrada vazia); XML direto é passado sem alteração                                                              | Opus (alto)           |
| R06 | Implementar `NfeXmlImporterPort` sobre `fiscal-provider.importXml`    | NFI-004, NFI-005          | —           | `bun run --cwd apps/worker-transportada check`                                                                   | adapter fino sem regra própria; erros do pacote mapeados para `NfeXmlImportError`; zero rede/segredo                                                                                         | Sonnet + revisão Opus |
| R07 | Fiar handler idempotente + rewire do runtime consumer                 | NFI-011–NFI-015, NFI-021  | R03–R06     | `bun test ./test/nfe-import-consumer.contract.test.ts ./test/nfe-runtime.contract.test.ts`                       | runtime delega a `createNfeImportConsumer`; idempotência via `processed_messages` (`consumerName: nfe-import-worker`); retry/dead-letter/ack após commit, espelhando `cte-issuance-consumer` | Opus (alto)           |
| R08 | Injetar adapters no `main.ts` (bloco análogo ao `cteIssuanceStarter`) | NFI-012–NFI-018, NFI-023  | R07         | `bun run --cwd apps/worker-transportada check`                                                                   | `startImportConsumer` recebe effect+repository construídos; readiness/shutdown intactos                                                                                                      | Sonnet + revisão Opus |
| R09 | Teste de integração real ponta a ponta e evidência                    | NFI-001–NFI-024           | R08         | `make up && make worker-integration && make smoke`; conferir lote sai de `0/N` para contadores reais no Postgres | lote misto (válido/duplicado/inválido/CNPJ alheio) processa; original/hash preservados; contadores/status corretos; evidência em `evidence.md`                                               | Opus (alto)           |

Reprocessar os lotes já presos (`Reprocessar` na UI) só produz efeito após R07/R08
estarem em produção; antes disso o reprocess apenas republica no mesmo stub.

### Correção de escopo (2026-07-24) — a lógica pura não fecha com o schema real

Ao implementar R03 três lacunas fiscais/de schema apareceram; elas **precedem**
R02–R09 e ampliam o plano:

- **NF-e não assinada (`kind: 'unsigned-nfe'`)** é tratada como `imported` pelo
  contract aceito (chama `store-document`), mas `nfe_documents.status` só aceita
  `authorized|cancelled|denied` (CHECK `nfe_documents_status_check`) e
  `authorization_protocol` é `NOT NULL`. **Decisão do usuário (2026-07-24):
  expand na API** — adicionar `'unsigned'` ao status e tornar
  `authorization_protocol` nullable, via migration versionada + ADR.
- **`nfe_documents.xml_object_id` e `nfe_events.xml_object_id` têm FK para
  `stored_objects(company_id, id)`** — o id não pode ser um UUID solto; é preciso
  inserir a linha `stored_objects` (purpose `nfe_document`/`nfe_event`, status
  `final`, `size_bytes`, `mime_type`, `sha256`) na **mesma transação** e usar o id
  dela como `xml_object_id`. O worker ainda **não** possui cópia de
  `stored_objects` (R01 só cobriu as 8 tabelas NF-e).
- **O port `finalObject` do consumer** carrega apenas `{bucket,key,sha256}` —
  falta `objectId` e `sizeBytes` para registrar `stored_objects`. O contrato de
  port do consumer (service + fixture + fakes do `mixed-batch.contract.ts`)
  precisa ser estendido, mantendo o teste verde.

| ID   | Task                                                                                                                                                                                       | Dependência | Verificação                                                        | Modelo      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------ | ----------- |
| R00a | ADR: expand `nfe_documents` (`status` +`unsigned`, `authorization_protocol` nullable) — **rascunho pronto** `docs/adr/0011-unsigned-nfe-document-expand.md` (status: proposto)             | —           | ADR em `docs/adr/`                                                 | Opus (alto) |
| R00b | Migration API (drizzle) do R00a + regenerar; `make migration-test`; atualizar cópia worker (`NfeDocumentStatus` +`unsigned`, protocol nullable) e **adicionar `stored_objects`** ao worker | R00a        | `bun run db:generate` · `make migration-test` · worker `typecheck` | Opus (alto) |
| R00c | Estender port do consumer: `finalObject`/`storeImported*` ganham `objectId`+`sizeBytes`; atualizar service + fixture + fakes do contract mantendo verde                                    | —           | `bun test ./test/nfe-import-consumer.contract.test.ts`             | Opus (alto) |

R03 passa a inserir `stored_objects` + `nfe_documents` + filhos (ou `nfe_events`)
numa única transação tenant-scoped; `getPendingImport` lê o CNPJ da empresa em
`company_fiscal_profiles` e deriva `sourceKey`/`sourceContentType`.

### Bloqueio de modelo

R00a/R00b (migration fiscal) e R03 (persistência fiscal + concorrência) são
categoria **alta** (`model-economy`): exigem Opus. Antes de escrever a
migration e o repository, confirmar o modelo com o usuário.

### Estado da remediação

- [x] R01 Duplicar schema Drizzle NF-e no worker (`apps/worker-transportada/src/database/nfe.schema.ts`; typecheck verde).
- [x] R02 Contract test de integração do repository do consumer (`apps/worker-transportada/test/nfe-import-repository.integration.test.ts`, registrado em `test:integration`; `companyFiscalProfiles` adicionado à cópia do schema; vermelho — módulo `DrizzleNfeImportConsumerRepository` inexistente).
- [x] R03 Implementar `DrizzleNfeImportConsumerRepository`.
- [x] R04 Adapters de storage (source + final create-only).
- [x] R05 Archive expander (XML + ZIP seguro).
- [x] R06 `NfeXmlImporterPort` sobre `fiscal-provider`.
- [x] R07 Handler idempotente + rewire do runtime consumer.
- [x] R08 Injeção no `main.ts`.
- [x] R09 Integração real ponta a ponta + evidência.

## Remediação — distribuição DF-e nunca conectada (reaberto 2026-07-25)

T024/T025 estão `[x]` mas, como no import consumer, a **lógica pura foi
implementada e testada com fakes** (`test/nfe-distribution/consumer.contract.ts`,
`gateway.contract.ts`) enquanto a **camada de integração/wiring nunca foi
ligada**. Verificado no código em 2026-07-25:

- `apps/worker-transportada/src/runtime/nfe-distribution-consumer.service.ts` é um
  stub que só faz `safeLogInfo('nfe_distribution_consumer_received')` + `ack` —
  **nunca** constrói nem invoca `createNfeDistributionConsumer`
  (`src/nfe-distribution/application/nfe-distribution-consumer.service.ts`). O
  `main.ts` fia o stub (`startNfeDistributionConsumer`), não o use-case real.
- Não existem implementações Drizzle das portas do use-case: cursor
  (`acquireLease`/`releaseLease`/`saveCursor`), `persistPage` e `profile.loadConfig`.
- Não há factory de produção ligando o gateway ao `new NfeDistribuicaoProvider()`
  real (espelho de `adatechnology-cte-fiscal-provider.factory.ts`).
- A cópia do schema do worker (`src/database/`) **não tem** `nfe_distribution_cursors`.
- **Bug da API:** `request-nfe-import.use-case.ts:104` fixa
  `eventType: 'transportada.nfe.import.requested'`; a distribuição publica o evento
  errado e o stub descarta (dead-letter). A rota estagia zero arquivos.

### Requisitos adicionais do usuário (2026-07-25)

Sob demanda, **com visibilidade de execução**:

- Cada disparo é uma **execução** = uma linha `nfe_imports` com `source='distribution'`;
  a tela lista execuções com **quando rodou** e **quantas/quais notas** vieram
  (`fetched`/`persisted`/`duplicated`). O use-case hoje devolve esses contadores mas
  **não** atualiza a linha `nfe_imports` — precisa passar a atualizar.
- **Eventos por nota** preservados (`nfe_events`) para resumos/eventos sem NF-e completa.
- **Botão de emergência** de busca manual com aviso: **última busca em X** e
  **pode buscar de novo?** — derivado de `nfe_distribution_cursors.next_allowed_at`
  (janela anti-656 persistente). Sem endpoint de leitura do cursor hoje.
- Ambiente da prova ponta a ponta: **homologação primeiro**.

### Bloqueio de modelo

Persistência fiscal, concorrência (lease) e certificado A1 → categoria **alta**
(`model-economy`): Opus. Sessão atual em **Opus 4.8** (adequado).

| ID  | Task                                                                                                             | Dependência | Verificação                                                                                                                       | Modelo                |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| D01 | Copiar `nfe_distribution_cursors` para a cópia de schema do worker                                               | —           | `bun run --cwd apps/worker-transportada typecheck`                                                                                | Opus (alto)           |
| D02 | Contract test de integração do cursor repo (RED)                                                                 | D01         | `(cd apps/worker-transportada && bun test ./test/nfe-distribution-cursor-repository.integration.test.ts)` **vermelho**            | Opus (alto)           |
| D03 | Implementar `DrizzleNfeDistributionCursorRepository` (acquireLease/releaseLease/saveCursor)                      | D02         | mesmo teste **verde**; lease pareado, NSU monotônico, `next_allowed_at` persistido, tenant-scoped                                 | Opus (alto)           |
| D04 | Contract test de integração do `persistPage` + contadores da execução + eventos (RED)                            | D01, D03    | `(cd apps/worker-transportada && bun test ./test/nfe-distribution-repository.integration.test.ts)` **vermelho**                   | Opus (alto)           |
| D05 | Implementar `DrizzleNfeDistributionRepository.persistPage` + update de `nfe_imports` + `nfe_events`              | D04         | teste **verde**; `source='distribution'`+`source_nsu`+`environment`, unique parcial absorve replay, sem XML em log                | Opus (alto)           |
| D06 | Implementar `NfeDistributionProfilePort.loadConfig` (perfil fiscal + certificado A1 ativo)                       | D01         | `(cd apps/worker-transportada && bun test ./test/nfe-distribution-profile.integration.test.ts)` **verde**; falha fechado sem cert | Opus (alto)           |
| D07 | Factory de produção ligando gateway ao `NfeDistribuicaoProvider` real (espelho CT-e)                             | —           | `bun run --cwd apps/worker-transportada check`; `gateway.contract.ts` continua verde; zero vazamento de certificado               | Opus (alto)           |
| D08 | Handler idempotente + rewire do runtime consumer para `createNfeDistributionConsumer`                            | D03–D07     | `(cd apps/worker-transportada && bun test ./test/nfe-distribution.contract.test.ts ./test/nfe-runtime.contract.test.ts)`          | Opus (alto)           |
| D09 | Injetar adapters no `main.ts` (bloco análogo ao consumer de importação)                                          | D08         | `bun run --cwd apps/worker-transportada check`; readiness/shutdown intactos                                                       | Sonnet + revisão Opus |
| D10 | API: emitir `distribution.requested` para `source='distribution'` + persistir a execução (RED→GREEN)             | —           | `(cd apps/api-transportada && bun test test/nfe-imports*.contract.test.ts)`                                                       | Opus (alto)           |
| D11 | API: endpoint read do estado do cursor (última busca / `next_allowed_at` / pode-buscar) (RED→GREEN)              | D10         | `(cd apps/api-transportada && bun test test/nfe-distribution-status.contract.test.ts)`                                            | Opus (alto)           |
| D12 | Frontend: tela de execução (lista de execuções + contadores + eventos) + botão emergência com guarda de cooldown | D11         | `bun run --cwd apps/frontend-transportada check`                                                                                  | Sonnet (médio)        |
| D13 | Integração real ponta a ponta (homologação) + evidência                                                          | D09–D12     | `make up && make worker-integration && make smoke`; conferir execução gera `nfe_imports` com contadores reais                     | Opus (alto)           |

### Estado da remediação de distribuição

- [x] D01 Copiar `nfe_distribution_cursors` para o schema do worker (`apps/worker-transportada/src/database/nfe.schema.ts`; PK composta `(company_id, environment)`; `typecheck` verde).
- [x] D02 Contract test de integração do cursor repo (vermelho: módulo inexistente → `Cannot find module drizzle-nfe-distribution-cursor.repository.js`). Registrado em `package.json` `test:integration`.
- [x] D03 Implementar `DrizzleNfeDistributionCursorRepository` (acquireLease/releaseLease/saveCursor). Teste verde: 6 pass / 0 fail contra Postgres local (`55432`). Lease pareado (constraint `lease_check`), NSU monotônico, `next_allowed_at` persistido, tenant-scoped, roubo de lease expirada.
- [x] D04 Contract test do `persistPage` + contadores + eventos (vermelho).
- [x] D05 Implementar `DrizzleNfeDistributionRepository`.
- [x] D06 Implementar `NfeDistributionProfilePort`.
- [x] D07 Factory de produção do provider real.
- [x] D08 Handler idempotente + rewire do runtime.
- [x] D09 Injeção no `main.ts`.
- [x] D10 API emite `distribution.requested` + persiste execução.
- [x] D11 API endpoint de estado do cursor. GET `/nfe-imports/distribution` com `INVOICES_READ_POLICY` → `createGetNfeDistributionStatusUseCase` → `DrizzleNfeDistributionStatusRepository`, injetado no `main.ts`. Retorna `{ canPull, environment, lastPulledAt, maxNsu, nextAllowedAt, pullInProgress, ultNsu }` sem vazar identificadores. Gate verde: `bun test test/nfe-distribution-status.contract.test.ts test/nfe-http.contract.test.ts` (27 pass); typecheck + lint verdes.
- [x] D12 Frontend tela de execução + botão emergência. `useNfeWorkspace.hook.ts` expõe `distributionStatusQuery` (GET `/nfe-imports/distribution`, polling 5s enquanto `pullInProgress`, invalidação de imports+status no sucesso da distribuição). View-model puro `createNfeDistributionPullControl` (ready/busy/cooldown/unavailable + `retryAfterSeconds`). Novo `NfeDistributionControl.component.tsx` (botão de puxada de emergência + última puxada + guarda de cooldown SEFAZ), locales pt/en, CSS. Verde em isolamento: eslint `src/modules/nfe-workspace test/nfe-workspace` EXIT 0, typecheck (app) EXIT 0, `bun test test/nfe-workspace.contract.test.ts` 45 pass/150 expect, build EXIT 0. ⚠️ Gate app-wide `bun run check` permanece vermelho por 2 erros de lint pré-existentes e alheios à feat 005, no módulo `company-settings` (WIP não commitado do 62544d5): `CompanySettingsForm.component.tsx:118` no-misused-promises e `companySettingsClient.service.ts:12` no-unused-vars — não tocados por decisão de "uma task por vez / não editar WIP de outra feature".
- [ ] D13 Integração ponta a ponta (homologação) + evidência.
