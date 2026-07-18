# Evidência — Feature 002

## T001 — Decisão arquitetural

- decisão explícita do mantenedor registrada na ADR 0001;
- revisão Codex Sol confirmou conflitos da fundação anterior;
- documentação oficial confirmou `Bun.serve` sobre uWebSockets;
- documentação oficial confirmou Drizzle com `drizzle-orm/bun-sql`;
- frontend auditado contra Vite, PWA, tokens, i18n e TanStack Query;
- nenhuma emissão real ou ação Railway executada.

## T002 — Contrato Bun do fiscal provider

Modelo executor: Codex Sol high. Revisão e gates executados pelo agente
principal.

Alterações em `@adatechnology/fiscal-provider`:

- suíte consumidora importa somente o entrypoint público `src/index.ts`;
- factory cria `SefazCteProvider` com `emit`, `cancel` e `testConnection`;
- mapeamento do TMS `homologation/production` para
  `homologacao/producao` é explícito;
- PFX ICP-Brasil sintético é criado e descartado em memória;
- emissão CT-e assina XML localmente e usa `fetch` mockado, sem rede;
- erros públicos `FiscalError`, `FiscalConnectionError`,
  `FiscalRejectionError` e `FiscalTimeoutError` mantêm hierarquia e códigos.

Gates locais:

| Comando                         | Resultado                                               |
| ------------------------------- | ------------------------------------------------------- |
| `bun run check`                 | aprovado                                                |
| `bun run test`                  | 13 locais + 5 contratos aprovados; testes reais pulados |
| `bun run build`                 | aprovado                                                |
| Prettier nos arquivos alterados | aprovado                                                |

Nenhum certificado, senha ou XML real foi persistido ou incluído no teste.
Nenhuma chamada à SEFAZ ou ação Railway foi executada.

Bloqueios mantidos para produção:

- `FiscalValidationError` existe internamente, mas não é exportado;
- transporte SEFAZ ainda permite TLS sem validar a cadeia;
- provider CT-e escreve diretamente em stdout/stderr;
- DACTE e consulta de CT-e não possuem contrato público confirmado.

Commit no repositório Ada: `eee0ec2`.

## T003 — Provider Drizzle/Bun SQL

Modelo executor: Codex Terra medium. Revisão independente: Codex Sol high.

Alterações em `@adatechnology/drizzle-provider`:

- factory pública sobre `drizzle-orm/bun-sql` e `Bun.SQL`;
- configuração restrita a PostgreSQL em tipos e validação de runtime;
- `EmptyRelations` como default, impedindo queries relacionais não configuradas;
- health check real, transações expostas pelo banco tipado e shutdown
  idempotente;
- Drizzle RC e tipos Bun fixados exatamente para reprodutibilidade;
- nenhum schema ou migration específica do TransportAdA.

Gates locais contra PostgreSQL do Compose em `localhost:55432`:

| Comando                                                  | Resultado                         |
| -------------------------------------------------------- | --------------------------------- |
| `bun run check`                                          | aprovado                          |
| `bun run test:integration` com URL local                 | 4 testes aprovados, nenhum pulado |
| `bun run build`                                          | ESM e declarações aprovados       |
| `pnpm exec eslint packages/backend/drizzle-provider/src` | aprovado                          |
| `bun run format:check`                                   | aprovado                          |

A suíte comprovou conexão/health, rollback transacional, rejeição de protocolo
incompatível e shutdown com query em voo, closes concorrentes e rejeição de
novas queries após o fechamento. O script de integração falha cedo quando
nenhuma URL de teste é fornecida.

Commit no repositório Ada: `64ffa52`.

Nenhuma publicação, ação Railway ou push foi executado.

## T004 — Provider RabbitMQ/Bun

Modelo executor: Codex Sol high. Revisão e repetição dos gates pelo agente
principal.

Alterações em `@adatechnology/rabbitmq-provider`:

- publicação persistente por `ConfirmChannel`;
- topologia durable com exchange/fila principal, retry por TTL/DLX e DLQ;
- ack manual somente após handler ou republicação confirmada;
- decoder obrigatório de `unknown` para payload tipado;
- prefetch e canal isolados por consumidor;
- retry limitado e DLQ para falha explícita ou exceção persistente;
- cancelamento, drain dos handlers, espera dos confirms e close idempotente;
- nenhum envelope ou schema específico do TransportAdA.

Infraestrutura local antecipada para o gate:

- RabbitMQ `4.3.2-management-alpine` fixado no Compose;
- portas locais `55672` (AMQP) e `55673` (management);
- recurso criado pelo Makefile com o projeto `transportada-local`;
- health confirmado por `rabbitmq-diagnostics`.

Gates locais contra RabbitMQ real:

| Comando                                  | Resultado                    |
| ---------------------------------------- | ---------------------------- |
| `make config && make up && make ps`      | RabbitMQ saudável            |
| `bun run check`                          | aprovado                     |
| `bun run test:integration` com URL local | 8 testes e 21 asserts verdes |
| `pnpm exec eslint src --max-warnings=0`  | aprovado                     |
| `bun run build`                          | ESM e declarações aprovados  |
| `bun run format:check`                   | aprovado                     |

A suíte comprovou persistência, confirmação, ack manual, prefetch, redelivery,
retry TTL/DLX, contagem e limite de tentativas, DLQ, validação de configuração
e shutdown com handler em voo. A topologia de teste é removida ao final.

Commit no repositório Ada: `8209d7f`.

Nenhuma publicação, ação Railway ou push foi executado.

## T005 — Empacotamento e instalação Bun limpa

Modelo executor: Codex Terra medium. Revisão e repetição dos gates pelo agente
principal.

Os manifests dos providers agora declaram:

- export raiz ESM com declarações TypeScript;
- `sideEffects: false`;
- Bun `>=1.3.0`, validado com Bun `1.3.14`;
- changeset patch para o fluxo de release existente.

Gates de empacotamento:

| Verificação                                     | Resultado                               |
| ----------------------------------------------- | --------------------------------------- |
| check e build dos dois providers                | aprovado                                |
| `pnpm pack --dry-run` e `npm pack --dry-run`    | somente JS, declarações e manifest      |
| instalação dos tarballs em projeto Bun limpo    | aprovado, sem workspace ou `file:`      |
| typecheck estrito e import ESM consumidor       | aprovado                                |
| smoke Drizzle em PostgreSQL local               | health e close aprovados                |
| smoke RabbitMQ em topologia única local         | publish, consume, ack e close aprovados |
| cleanup RabbitMQ consultado pela API management | topologia removida                      |
| `changeset status`                              | patch reconhecido para os dois          |

O Drizzle permanece fixado em `1.0.0-rc.4`; a versão não será avançada sem
nova validação de contrato.

Commit no repositório Ada: `f05b102`.

Nenhuma publicação npm, ação Railway ou push foi executado.

## T006 — Bun workspaces e CI

Modelo executor: Codex Terra medium. Revisão e repetição dos gates pelo agente
principal.

- Bun `1.3.14` fixado em `packageManager`, engines e CI;
- workspaces declarados na raiz e `bun.lock` versionado;
- scripts raiz e comandos `make dev`/`make check` executam por Bun;
- CI instala com lock congelado e roda cada gate por Bun;
- dependências com scripts nativos necessárias ao baseline foram declaradas em
  `trustedDependencies`.

Gates:

| Verificação                                 | Resultado                              |
| ------------------------------------------- | -------------------------------------- |
| `bun install --frozen-lockfile`             | aprovado, lock sem mudança             |
| instalação congelada em checkout temporário | 1176 packages instalados               |
| `bun run check` no checkout limpo           | todos os gates aprovados               |
| lint                                        | 8/8 unidades                           |
| typecheck                                   | 13/13 tarefas                          |
| testes                                      | API/worker/config/observability verdes |
| build                                       | 8/8 unidades                           |
| parse do workflow YAML                      | aprovado                               |
| `make config` e dry-run de `dev`/`check`    | aprovado, comandos Bun                 |

Turbo permanece apenas como orquestrador transitório. Nest, Next, Vitest,
Prisma, BullMQ/Redis e os arquivos pnpm legados continuam presentes para serem
substituídos e removidos nas T007–T012, mas não são mais o caminho ativo da
raiz ou da CI.

Nenhuma ação Railway ou push foi executado.
