# Evidência — Feature 008 Homologação CT-e

## T001 — ADR e consolidar spec/plano

Data: 2026-07-22

Modelo executor recomendado: Opus, com revisão Opus para decisões fiscais.

Estado inicial: criação da estrutura de spec/plan/tasks para fase 6 do plano de
entrega.

Arquivos previstos:

- `specs/008-cte-homologation/spec.md`
- `specs/008-cte-homologation/plan.md`
- `specs/008-cte-homologation/tasks.md`
- `docs/adr/0010-cte-homologation-worker-gateway.md`

Decisões registradas:

- emissão CT-e em homologação será assíncrona via worker;
- gateway interno adapta apenas exports públicos do provider Ada;
- produção permanece bloqueada por gate manual futuro;
- XML/protocolo fiscal ficam em storage create-only, nunca em logs/listagens;
- retries usam backoff persistido, DLQ e idempotência persistente.

Comandos planejados:

```text
bunx prettier --check docs/adr specs/008-cte-homologation && git diff --check
```

Resultado:

```text
bunx prettier --check docs/adr specs/008-cte-homologation
Checking formatting...
All matched files use Prettier code style!

git diff --check
0 issues
```

Observação:

- A primeira execução do Prettier apontou ajuste de estilo em `spec.md` e
  `tasks.md`; a formatação foi aplicada e o gate documental passou.
- `T001` está concluída e libera a `T002` para contracts do gateway CT-e Ada.

## T007 — Casos de uso e repositórios de emissão

Data: 2026-07-23

Modelo executor recomendado: Opus (alto) para idempotência fiscal,
numeração, transação e persistência multiempresa.

Escopo entregue:

- caso de uso de emissão CT-e com issue, replay idempotente, retry,
  reprocessamento e lookup sanitizado;
- repositório Drizzle de emissão com unidade de trabalho transacional completa;
- reserva de número fiscal vinculada ao item/lote/tipo dentro da fronteira de
  persistência;
- persistência de tentativa, replay, evento append-only, retry schedule e outbox
  sem XML, certificado ou payload fiscal sensível;
- correções de tipagem estrita em filtros e contracts que bloqueavam o gate
  agregado da API;
- correção da constraint SQL do outbox CT-e para PostgreSQL real.

Comandos executados:

```text
bun test test/cte-issuance-application.contract.test.ts
```

Resultado:

```text
14 pass
0 fail
73 expect() calls
```

```text
bun run check
```

Resultado:

```text
lint OK
typecheck OK
bun test: 439 pass, 1 skip, 0 fail
build OK
```

```text
make test-up
set -a; . ../../.env.test; set +a; bun run test:integration
```

Resultado final:

```text
35 pass
1 skip
0 fail
298 expect() calls
```

Observações:

- A primeira execução de `test:integration` sem ambiente carregado falhou por
  ausência de `API_TEST_DATABASE_URL`/`DATABASE_URL`.
- Após subir `make test-up`, a primeira repetição revelou sintaxe inválida no
  `CHECK` de `cte_issuance_outbox`; a migration e o schema foram corrigidos.
- Houve um timeout isolado no teste HTTP autenticado; a repetição imediata do
  gate passou integralmente.
- `T007` está concluída e libera `T008` para contracts do worker de fila, retry
  e DLQ.

## T008 — Contracts worker de fila, retry e DLQ

Data: 2026-07-23

Modelo executor recomendado: Opus (alto) para ack pós-commit, redelivery,
backoff persistido e DLQ fiscal.

Contracts confirmados:

- worker só retorna ack depois do efeito fiscal e do marcador persistido;
- redelivery da mesma tentativa não duplica efeito externo;
- erro recuperável persiste backoff antes de solicitar retry;
- limite finito de tentativas envia para DLQ;
- idempotência é isolada por empresa, item e tentativa, não apenas por event id;
- falha fiscal permanente vai direto para DLQ;
- topology CT-e contém rotas main, retry e dead-letter;
- envelope CT-e v1 valida evento, versão, item e ator;
- relay publica envelopes em ordem e respeita claim lease.

Comando executado:

```text
bun test ./test/cte-issuance-worker.contract.test.ts ./test/cte-issuance-topology.contract.test.ts ./test/cte-processing-envelope.contract.test.ts ./test/cte-outbox-relay.contract.test.ts
```

Resultado:

```text
14 pass
0 fail
32 expect() calls
```

Observação:

- Os contracts já estavam presentes no worker e foram validados antes de avançar
  para `T009`.
- `T008` está concluída e libera `T009` para validação/implementação do consumer
  CT-e e lifecycle no worker.

## T009 — Consumer CT-e e lifecycle no worker

Data: 2026-07-23

Modelo executor recomendado: Opus (alto) para lifecycle de worker, RabbitMQ,
idempotência, retries e efeito fiscal externo.

Validações confirmadas:

- worker inicia o consumer CT-e junto do relay e dos consumers existentes;
- shutdown cancela synthetic, import, distribution e CT-e antes de fechar storage,
  providers, database e health server;
- contratos CT-e cobrem ack pós-efeito fiscal e marcador processado;
- redelivery não duplica efeito externo para a mesma tentativa;
- erro recuperável agenda backoff e erro permanente vai para DLQ;
- idempotência permanece isolada por empresa, item e tentativa;
- integração RabbitMQ cobre main, retry TTL, DLX e DLQ;
- SIGTERM drena efeito em andamento antes de encerrar.

Comandos executados:

```text
bun run check
```

Resultado:

```text
lint OK
typecheck OK
bun test: 77 pass, 0 fail
build OK
```

```text
set -a; . ../../.env.test; set +a; bun run test:integration
```

Resultado:

```text
4 pass
0 fail
9 expect() calls
```

Observações:

- O contrato de runtime foi atualizado para fornecer `ENCRYPTION_ACTIVE_KEY_ID`
  e `ENCRYPTION_KEYRING_JSON` sintéticos, preservando a exigência de keyring no
  startup em vez de adicionar fallback inseguro.
- O mesmo contrato passou a mockar `startCteIssuanceConsumer` no cenário de
  readiness, acompanhando o lifecycle novo do worker.
- `@adatechnology/secret-envelope@0.1.0` publicado no registry foi instalado sem
  `dist`; a validação local usou o pacote Ada local buildado via `bun link`.
  Correção permanente recomendada: republicar `0.1.0` com `dist` ou publicar
  `0.1.1` e atualizar o lockfile.
- `T009` está concluída e libera `T010` para contracts HTTP de
  emissão/reprocessamento.

## T010 — Contracts HTTP de emissão/reprocessamento CT-e

Data: 2026-07-23

Modelo executor recomendado: Opus (alto) para RBAC fiscal, anti-enumeração,
DTO strict, no-store e bloqueio de produção fiscal.

Contracts criados:

- segurança e CORS para emissão/reprocessamento CT-e;
- RBAC `cte.submit` antes do parse de bodies;
- emissão assíncrona por `POST /cte-batches/:id/issue`;
- reprocessamento por `POST /cte-batches/:id/items/:itemId/reprocess`;
- rejeição de `companyId`, campos desconhecidos e `environment: production`;
- consulta sanitizada por `GET /cte-batches/:id/items/:itemId/issuance`;
- documentos por `GET /cte-batches/:id/items/:itemId/documents` com URL
  temporária, sem XML e sem `storageKey`;
- anti-enumeração com 404 seguro para item inexistente ou cross-tenant;
- propagação segura de conflitos de reprocessamento.

Comando executado:

```text
bun test test/cte-issuance-http.contract.test.ts
```

Resultado esperado nesta fase:

```text
0 pass
10 fail
Cannot find module '../../src/cte-issuance/presentation/cte-issuance.routes.js'
```

Observação:

- A falha é intencional para `T010`: os contracts já documentam o comportamento
  esperado e a implementação da rota fica para `T011`.
- `T010` está concluída e libera `T011` para implementar endpoints HTTP de
  emissão CT-e.

## T011 — Endpoints HTTP de emissão CT-e

Data: 2026-07-23

Modelo executor recomendado: Opus (alto) para HTTP fiscal, RBAC, roteamento
multi-parametro, anti-enumeração e integração com worker assíncrono.

Implementação confirmada:

- `createCteIssuanceRoutes` em `apps/api-transportada/src/cte-issuance/presentation/`;
- `POST /cte-batches/:id/issue` agenda emissão com idempotência e responde 202;
- `POST /cte-batches/:id/items/:itemId/reprocess` agenda nova tentativa quando
  permitido;
- `GET /cte-batches/:id/items/:itemId/issuance` serializa status fiscal
  sanitizado;
- `GET /cte-batches/:id/items/:itemId/documents` serializa metadados seguros e
  URLs temporárias quando adapter for fornecido;
- router HTTP passou a aceitar múltiplos parâmetros UUID nomeados por rota,
  preservando compatibilidade com `:id`;
- `main.ts` registra `createCteIssuanceUseCase`,
  `DrizzleCteIssuanceRepository` e as rotas HTTP CT-e;
- respostas usam `Cache-Control: no-store` e não incluem XML, certificado,
  `storageKey` ou payload fiscal bruto.

Comandos executados:

```text
bun test test/cte-issuance-http.contract.test.ts
```

Resultado:

```text
10 pass
0 fail
51 expect() calls
```

```text
bun run check
```

Resultado:

```text
lint OK
typecheck OK
bun test: 449 pass, 1 skip, 0 fail
build OK
```

```text
set -a; . ../../.env.test; set +a; bun run test:integration
```

Resultado:

```text
35 pass
1 skip
0 fail
298 expect() calls
```

Observações:

- A listagem real de documentos CT-e ficou com adapter opcional e resposta vazia
  segura quando não configurado; os contracts preservam o formato com URL
  temporária para a próxima camada que ligar storage/assinatura.
- `T011` está concluída e libera `T012` para contracts frontend de status fiscal
  CT-e.

## T012 — Contracts frontend de status fiscal CT-e

Data: 2026-07-23

Modelo executor recomendado: Sonnet para matriz mecânica de contracts, com
revisão Opus quando integrar UI fiscal.

Contracts criados:

- client frontend para `issue`, `reprocess`, status e documentos CT-e;
- requests autenticadas, `cache: no-store`, idempotency key e URLs relativas ao
  BFF;
- adapters strict rejeitando `companyId`, XML bruto, `storageKey` e payloads
  fiscais sensíveis;
- controller de permissões bloqueando mutações sem `cte.submit`;
- view model para `authorized`, `rejected`, `retry_scheduled`, `forbidden`,
  `loading` e `error`;
- timeline fiscal por item sem XML, certificado ou material sensível;
- download usando apenas URL temporária recebida, sem armazenar XML em estado.

Comando executado:

```text
bun test test/cte-issuance.contract.test.ts
```

Resultado esperado nesta fase:

```text
0 pass
6 fail
Cannot find module '../../src/modules/cte-issuance/...'
```

Observação:

- A falha é intencional para `T012`: os contracts especificam os módulos que
  serão implementados na `T013`.
- `T012` está concluída e libera `T013` para implementar UI de homologação e
  timeline fiscal.

## T013 — UI de homologação e timeline fiscal CT-e

Data: 2026-07-23

Modelo executor recomendado: Sonnet para implementação frontend mecânica,
com revisão Opus por envolver status fiscal e ausência de payload sensível.

Implementação confirmada:

- client `cteIssuanceClient.service` para emissão, reprocessamento, consulta de
  status e metadados de documentos;
- adapters strict em `cteIssuanceResponse.validation` rejeitando XML bruto,
  `storageKey`, `companyId` e campos extras;
- hook/controller `useCteIssuanceStatus` com TanStack Query, polling apenas para
  estados ativos e mutações protegidas por `cte.submit`;
- view model de status fiscal com `authorized`, `rejected`, `retry_scheduled`,
  `failed`, `requested`, `forbidden`, `loading` e `error`;
- timeline fiscal por item baseada em chaves de i18n, sem material fiscal bruto;
- controller de download que abre apenas URL temporária recebida e não guarda XML
  em estado;
- script `test` do frontend passou a incluir `test/cte-issuance.contract.test.ts`.

Comandos executados:

```text
bun test test/cte-issuance.contract.test.ts
```

Resultado:

```text
6 pass
0 fail
47 expect() calls
```

```text
bun run check
```

Resultado:

```text
lint OK
typecheck OK
bun test: 49 pass, 0 fail
build OK
```

Observação:

- A implementação cobre a camada de client/hooks/view-model/timeline exigida
  pelos contracts; a validação visual responsiva fica para `T014`.
- `T013` está concluída e libera `T014` para validar jornada responsiva com
  Playwright.

## T014 — Validação responsiva da jornada de homologação CT-e

Data: 2026-07-23

Modelo executor recomendado: Sonnet, com revisão Opus.

Implementação confirmada:

- novo fluxo de smoke CT-e em `responsive.smoke.spec.ts` cobrindo viewport
  `375x812`, `768x1024` e `1280x900`;
- cobertura de estados simulados de lote para autorização/rejeição/retry do fluxo
  (`done`, `error`, `in_flight`);
- cenário de usuário sem permissão no workspace CT-e sem ações disponíveis;
- validação de filtros de `status`, `statusNe` e filtro avançado com valor;
- validação de overflow horizontal nos cenários críticos;
- mock de smoke CT-e ampliado para suportar os novos status do lote.

Comando de evidência previsto:

```text
bun run --cwd apps/frontend-transportada smoke
```

Resultado:

- Implementação aplicada; o gate de smoke ainda depende de execução manual no
  ambiente de teste para fechamento definitivo do critério.

## T015 — Integração local e revisão de release

Data: 2026-07-23

Modelo executor recomendado: Opus (alto) para revisão de release com impacto fiscal.

Comandos executados:

```text
bun install --frozen-lockfile
make check
make migration-test
make dev
make smoke
make down
git diff --check
```

Resultados:

- `bun install --frozen-lockfile`
  - OK (sem alterações instaladas)
- `make check`
  - ✅ Passou integralmente (prettier, lint, typecheck, testes agregados, build)
- `make migration-test`
  - ✅ Passou (9 pass, 0 fail; inclui rollback e reaplicação fiscal via migration)
- `make dev`
  - Requer limpeza prévia de processos; primeiro `EADDRINUSE` em `53001`; resolvido após encerrar processo residual.
  - Depois do `make down`, ambiente já havia subido com sucesso na última validação.
- `make smoke`
  - OK (frontend playright: `17 passed`)
- `make down`
  - OK (encerramento da stack local concluído)
- `git diff --check`
  - OK (sem inconsistências de whitespace)

Observações:

- Falha anterior de `make check` e `make migration-test` foi causada por:
  - um `await` indevido em teste de smoke (`expect(api.failures())`);
  - hash hardcoded de `rollback.sql` de `20260723090000_cte_issuance_outbox` incompatível com o conteúdo atual.
- Após ajuste desses pontos, `T015` fecha com sucesso.
