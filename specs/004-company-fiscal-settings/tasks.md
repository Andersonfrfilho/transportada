# Tasks — Empresa e configurações fiscais

Uma task por vez, testes aplicáveis antes da implementação e um commit atômico
por task.

| ID    | Task                                                     | Requisitos                                          | Dependência         | Verificação                                                                                                                              | Critério de sucesso                                                                                                           | Modelo                                         |
| ----- | -------------------------------------------------------- | --------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| T001  | Registrar ADRs e decomposição executável                 | CFS-009–CFS-012, CFS-016                            | spec/plan aprovados | `bunx prettier --check docs/adr specs/004-company-fiscal-settings && git diff --check`                                                   | decisões aceitas; todas as tasks possuem requisito, dependência, gate, sucesso e modelo                                       | Codex Sol high                                 |
| T002  | Escrever contracts do package `secret-envelope`          | CFS-009–CFS-011                                     | T001                | `(cd ../adatechnology-packages/packages/backend/secret-envelope && bun test test/secret-envelope.contract.test.ts)` falha esperado       | round-trip, framing, key snapshot, AAD, tamper, limites, rotação e erros seguros cobertos                                     | Codex Sol high                                 |
| T003  | Implementar o envelope AES-256-GCM versionado            | CFS-009–CFS-011                                     | T002                | `(cd ../adatechnology-packages/packages/backend/secret-envelope && bun run check && bun test)`                                           | API mínima, Web Crypto, parser/base64url estritos, zero runtime deps e contract incluído no script `test`                     | Codex Sol high                                 |
| T004  | Validar empacotamento e consumo Bun isolado              | CFS-009–CFS-011                                     | T003                | `(cd ../adatechnology-packages/packages/backend/secret-envelope && npm pack --dry-run --json && bun test ./test/package.integration.ts)` | tarball ESM/types reproduzível e instalação Bun limpa, sem fonte externa, logger ou dependência indevida                      | Codex Terra medium + revisão Sol               |
| T005  | Publicar versão Ada e fixar pins na API                  | CFS-007, CFS-009–CFS-011                            | T004                | `npm view @adatechnology/secret-envelope version && bun install --frozen-lockfile && bun run --cwd apps/api-transportada check`          | pipeline publica bump aprovado; API fixa versões exatas do envelope e fiscal-provider sem `file:`                             | Codex Sol high                                 |
| T006  | Separar schema de identidade sem alterar SQL             | CFS-001, CFS-004                                    | T001                | `bun run --cwd apps/api-transportada db:check && bun run --cwd apps/api-transportada check`                                              | `identity.schema.ts` preserva baseline e agregador exporta o mesmo schema sem drift                                           | Codex Terra medium                             |
| T007  | Escrever contracts do schema fiscal e isolamento         | CFS-001, CFS-004–CFS-006, CFS-011–CFS-013           | T006                | `(cd apps/api-transportada && bun test test/fiscal-schema.contract.test.ts)` falha esperado                                              | FKs compostas, checks, índices tenant, active unique e audit append-only; teste registrado em `test`/`test:integration`       | Codex Sol high + OpenCode para casos mecânicos |
| T008  | Implementar schema, migration aditiva e rollback         | CFS-001, CFS-004–CFS-006, CFS-011–CFS-013           | T007                | `bun run --cwd apps/api-transportada db:check && make migration-test`                                                                    | aplica em baseline/vazio sem drift; constraints fecham corridas e rollback segue a ordem definida                             | Codex Sol high                                 |
| T009  | Escrever contracts do router modular e deny-by-default   | CFS-001, CFS-003, CFS-014                           | T001                | `(cd apps/api-transportada && bun test test/router.contract.test.ts)` falha esperado                                                     | auth/tenant/RBAC antecedem parser; 404/health/auth-me preservados; teste registrado no script `test`                          | Codex Sol high + OpenCode para casos mecânicos |
| T010  | Extrair router modular sem mudar contratos existentes    | CFS-001, CFS-003, CFS-014                           | T009                | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                      | rotas tipadas, composition root explícito e nenhuma regressão em endpoints/CORS/shutdown                                      | Codex Terra medium                             |
| T011  | Escrever contract do gateway fiscal público 0.1.0        | CFS-007, CFS-008, CFS-014                           | T005                | `(cd apps/api-transportada && bun test test/certificate-validation-gateway.contract.test.ts)` falha esperado                             | somente package pinado e export `validateCertificate` compilam; teste registrado no script `test`                             | Codex Sol high                                 |
| T012  | Implementar gateway fiscal e configuração criptográfica  | CFS-007–CFS-010, CFS-014                            | T011                | `bun run --cwd apps/api-transportada check`                                                                                              | keyring/HMAC falham fechados; adapter retorna somente códigos internos e validação local                                      | Codex Sol high                                 |
| T013  | Escrever contracts de perfil, idempotência e auditoria   | CFS-001–CFS-006, CFS-012–CFS-014                    | T008, T012          | `(cd apps/api-transportada && bun test test/company-settings-application.contract.test.ts)` falha esperado                               | Sol cobre tenant/HMAC/rollback/CNPJ não enumerável; OpenCode amplia casos previsíveis; testes entram nos scripts              | Codex Sol high + OpenCode para ampliação       |
| T014  | Implementar repositórios e casos de uso de configurações | CFS-001–CFS-006, CFS-012–CFS-014                    | T013                | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                      | upsert tenant-scoped, transacional/idempotente e sequência bloqueada após reserva                                             | Codex Sol high                                 |
| T015  | Escrever contracts HTTP de `/company-settings`           | CFS-001–CFS-006, CFS-013, CFS-014                   | T010, T013          | `(cd apps/api-transportada && bun test test/company-settings-http.contract.test.ts)` falha esperado                                      | strings decimais, body strict, limites, CORS, no-store e CNPJ duplicado retornando conflito genérico; teste no script         | Codex Sol high + OpenCode para casos mecânicos |
| T016  | Implementar endpoints de configurações                   | CFS-001–CFS-006, CFS-013, CFS-014                   | T014, T015          | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                      | GET vazio/configurado e PATCH atendem contracts sem segredo, enumeração ou vazamento cross-tenant                             | Codex Terra medium + revisão Sol               |
| T017  | Escrever contracts de validação e rotação do A1          | CFS-002, CFS-007–CFS-011, CFS-013, CFS-014, CFS-016 | T008, T012          | `(cd apps/api-transportada && bun test test/digital-certificate-application.contract.test.ts)` falha esperado                            | inválido/expirado/CNPJ cruzado, corrida, tamper e anterior preservado; teste incluído nos scripts                             | Codex Sol high                                 |
| T018  | Implementar serviço e persistência de certificado        | CFS-002, CFS-007–CFS-011, CFS-013, CFS-014          | T014, T017          | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                      | um ativo, anterior sem envelope, AAD tenant-scoped e auditoria/idempotência atômicas                                          | Codex Sol high                                 |
| T018A | Escrever contracts HTTP de certificados                  | CFS-001–CFS-003, CFS-007–CFS-011, CFS-013–CFS-016   | T010, T017          | `(cd apps/api-transportada && bun test test/digital-certificates-http.contract.test.ts)` falha esperado                                  | auth antes do body, multipart normal/chunked, limites, paginação, replay, CORS/no-store; teste registrado no script           | Codex Sol high + OpenCode para casos mecânicos |
| T019  | Expor POST/GET de certificados e CORS estrito            | CFS-001–CFS-003, CFS-007–CFS-011, CFS-013–CFS-016   | T018, T018A         | `bun run --cwd apps/api-transportada check && bun run --cwd apps/api-transportada test:integration`                                      | streaming limita 1 MiB antes de formData; respostas só contêm metadados seguros                                               | Codex Terra medium + revisão Sol               |
| T020  | Escrever contracts concorrentes da sequência             | CFS-001, CFS-006, CFS-012                           | T008                | `(cd apps/api-transportada && bun test test/fiscal-sequence.integration.ts)` falha esperado                                              | ordenar números antes de afirmar contiguidade; mesma chave tem rollback/replay; intenção divergente conflita; teste no script | Codex Sol high                                 |
| T021  | Implementar porta interna de reserva e ledger            | CFS-001, CFS-006, CFS-012                           | T020                | `bun run --cwd apps/api-transportada test:integration && bun run --cwd apps/api-transportada check`                                      | incremento/ledger confirmam juntos; recovery abre nova transação; nenhum endpoint, RabbitMQ ou reuso                          | Codex Sol high                                 |
| T022  | Escrever contracts do módulo frontend                    | CFS-001–CFS-003, CFS-015, CFS-016                   | T015, T018A         | `(cd apps/frontend-transportada && bun test test/company-settings.contract.test.ts)` falha esperado                                      | permissões, estados, DTOs e limpeza de file/senha definidos; teste registrado no script `test`                                | Codex Terra medium + OpenCode test-writer      |
| T023  | Implementar tela Vite de configurações fiscais           | CFS-001–CFS-003, CFS-015, CFS-016                   | T016, T019, T022    | `bun run --cwd apps/frontend-transportada check`                                                                                         | React/TanStack Query/i18n/tokens, UX responsiva e produção apresentada apenas como configuração                               | Codex Terra medium                             |
| T024  | Validar jornada e ausência de segredo com Playwright     | CFS-001–CFS-003, CFS-015, CFS-016                   | T023                | `bun run --cwd apps/frontend-transportada smoke`                                                                                         | 375/768/1280; UI burlada recebe 403; senha/PFX ausentes de storages, cache e DOM após sucesso/erro                            | Codex Terra medium + revisão Codex Sol         |
| T025  | Executar gates finais, evidência e revisão independente  | CFS-001–CFS-016                                     | T001–T024, T018A    | `bun install --frozen-lockfile && make check && make migration-test`; `make dev` gerenciado + `make smoke` + `make down`                 | todos os gates locais verdes, processos encerrados, isolamento comprovado, nenhum Railway e nenhum achado crítico             | OpenCode reviewer + Codex Sol release review   |

## Comandos e gates previstos

| Escopo      | Comandos mínimos                                                                   |
| ----------- | ---------------------------------------------------------------------------------- |
| package Ada | `bun run check`, `bun test`, pack, instalação Bun limpa e pipeline de release      |
| API         | `bun run check`, `bun run test:integration`, `bun run db:check`, `bun run db:test` |
| frontend    | `bun run check`, `bun run smoke`                                                   |
| stack       | `make up`, `make ps`, `make check`, `make migration-test`, `make smoke`            |
| raiz        | `bun install --frozen-lockfile`, `git diff --check`                                |

Todo teste novo deve ser incluído no script `test`, `test:integration` ou
`smoke` da aplicação/package correspondente na mesma task que o cria. Executar
somente o arquivo isolado prova o estado vermelho; concluir a task exige provar
que o gate agregado realmente o executa.

O smoke final inicia `make dev` em uma sessão controlada, aguarda readiness,
executa `make smoke` em outra sessão, envia `SIGTERM`, confirma o encerramento
dos três apps e executa `make down`. `make up` isolado não satisfaz o smoke.

## Delegação econômica

- OpenCode `opencode/deepseek-v4-flash-free`: inventário e resumos delimitados.
- OpenCode `opencode/north-mini-code-free`: primeiros testes previsíveis de
  router, schema, HTTP e frontend.
- OpenCode `opencode/nemotron-3-ultra-free`: revisão final somente leitura.
- Codex Terra medium: refactors reversíveis, endpoints e frontend.
- Codex Sol high: criptografia, fiscal, migrations, tenant, concorrência,
  publicação e release review.

Um modelo gratuito nunca decide comportamento fiscal ou criptográfico. Depois
de duas falhas equivalentes, a task é dividida ou escalada; a mesma tentativa
não recebe contexto crescente indefinidamente.

## Estado

- [x] T001 Registrar ADRs e decomposição executável.
- [x] T002 Escrever contracts do package `secret-envelope`.
- [x] T003 Implementar o envelope AES-256-GCM versionado.
- [x] T004 Validar empacotamento e consumo Bun isolado.
- [x] T005 Publicar versão Ada e fixar pins na API.
- [x] T006 Separar schema de identidade sem alterar SQL.
- [x] T007 Escrever contracts do schema fiscal e isolamento.
- [x] T008 Implementar schema, migration aditiva e rollback.
- [x] T009 Escrever contracts do router modular e deny-by-default.
- [x] T010 Extrair router modular sem mudar contratos existentes.
- [ ] T011 Escrever contract do gateway fiscal público 0.1.0.
- [ ] T012 Implementar gateway fiscal e configuração criptográfica.
- [ ] T013 Escrever contracts de perfil, idempotência e auditoria.
- [ ] T014 Implementar repositórios e casos de uso de configurações.
- [ ] T015 Escrever contracts HTTP de `/company-settings`.
- [ ] T016 Implementar endpoints de configurações.
- [ ] T017 Escrever contracts de validação e rotação do A1.
- [ ] T018 Implementar serviço e persistência de certificado.
- [ ] T018A Escrever contracts HTTP de certificados.
- [ ] T019 Expor POST/GET de certificados e CORS estrito.
- [ ] T020 Escrever contracts concorrentes da sequência.
- [ ] T021 Implementar porta interna de reserva e ledger.
- [ ] T022 Escrever contracts do módulo frontend.
- [ ] T023 Implementar tela Vite de configurações fiscais.
- [ ] T024 Validar jornada e ausência de segredo com Playwright.
- [ ] T025 Executar gates finais, evidência e revisão independente.
