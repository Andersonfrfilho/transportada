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

Publicação autorizada pelo mantenedor e concluída pelo workflow Ada:

- `@adatechnology/drizzle-provider@0.1.1`;
- `@adatechnology/rabbitmq-provider@0.1.1`;
- commit automático de versão: `87f8f21`;
- workflow de build, versionamento e publish aprovado;
- manifests versionados confirmados no registry npm.

Nenhuma ação Railway foi executada.

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

## T007 — Drizzle no TransportAdA

Modelo executor: Codex Sol high. Revisão independente e gates finais executados
pelo agente principal.

- `packages/database` usa `@adatechnology/drizzle-provider@0.1.1`,
  `drizzle-orm@1.0.0-rc.4` e `drizzle-kit@1.0.0-rc.4`;
- `DatabaseConnection.health()` e `close()` foram preservados, com provider
  lazy para manter o import transitório dos testes Node de API e worker até as
  T008/T009;
- Prisma, `pg` e seus tipos foram removidos somente do package de banco;
- o schema exportado permanece vazio, sem tabela ou coluna de negócio;
- migration só ocorre pelo script `db:migrate`, nunca no startup;
- o baseline foi criado pelo comando oficial
  `drizzle-kit generate --custom --name baseline` no formato v3 da versão
  fixada: `migration.sql` contém somente o comentário gerado pelo Kit e o
  snapshot possui `ddl: []`.

Gates do package:

| Verificação                                     | Resultado                                  |
| ----------------------------------------------- | ------------------------------------------ |
| `bun run typecheck`, `lint` e `build`           | aprovados                                  |
| `bun run test:integration` com PostgreSQL local | 3 testes e 8 asserts aprovados             |
| `bun run db:check`                              | aprovado                                   |
| `bun run db:generate`                           | `no_changes`                               |
| `db:migrate` como processo separado             | somente `__drizzle_migrations` criada      |
| cleanup do schema descartável                   | schema removido e ausência confirmada      |
| Prettier dos arquivos do package                | aprovado                                   |
| `bun install --frozen-lockfile`                 | aprovado, sem mudança                      |
| lint, typecheck, testes e build da raiz         | 8/8, 13/13, 13/13 e 8/8 unidades aprovadas |
| `bun run check`                                 | aprovado                                   |

Os hashes SHA-256 permaneceram idênticos antes e depois de `db:generate` e
`db:check`:

- `migration.sql`:
  `b3cc75fa802f8a5b333c480eb0d77f3d2185602e108f36fb33d3ade3c6939413`;
- `snapshot.json`:
  `b7608eaa4a1ca9ddee5a5f7cc8f855a6ce1d825057eb1997f004b6f2dc4bb781`.

Nenhuma tabela ou coluna de negócio, operação destrutiva, migration no startup,
ação Railway ou push foi executado.

## T008 — API Bun

Modelo executor: Codex Terra medium, com checklist de revisão Sol aplicado pelo
agente principal.

- a aplicação foi renomeada para `apps/api-transportada` e tornou-se instalável
  isoladamente, sem importar código-fonte de outra aplicação ou package local;
- Nest, Express, `reflect-metadata`, RxJS e imports `@transportada/*` foram
  removidos da API;
- o servidor usa `Bun.serve` em `0.0.0.0`, com limite de aplicação de 1 MiB,
  hard limit nativo de 2 MiB, timeout por request, `error` callback seguro e
  inicialização protegida por `import.meta.main`;
- `GET /health/live` não acessa dependências externas e
  `GET /health/ready` retorna `503` degradado quando o PostgreSQL não está
  saudável;
- métodos inválidos retornam `405` com `Allow: GET`, rotas desconhecidas
  retornam `404` e metadados de request inválidos retornam `400`;
- `x-correlation-id` válido é propagado e um UUID é gerado para valor ausente
  ou inválido;
- logs estruturados não incluem query string, headers, body, credenciais, XML
  ou stack trace, e falhas do logger não alteram a resposta HTTP;
- `SIGTERM` e `SIGINT` acionam shutdown idempotente; o banco é fechado mesmo
  quando `server.stop()` falha, e rejeições do shutdown são tratadas;
- migrations permanecem exclusivamente em processo separado.

Desenvolvimento orientado por testes:

| Evidência inicial                                    | Resultado esperado                          |
| ---------------------------------------------------- | ------------------------------------------- |
| imports dos módulos desejados antes da implementação | 2 arquivos falharam                         |
| pathname inválido durante parsing                    | falhou com `404` antes do ajuste para `400` |
| logger lançando erro                                 | handler falhou antes do wrapper seguro      |
| `server.stop()` lançando erro                        | banco não fechou antes do `finally`         |
| hard limit nativo acima de 1 MiB                     | `413` sem correlation ID antes das camadas  |

Gates da aplicação:

| Verificação                                                     | Resultado                        |
| --------------------------------------------------------------- | -------------------------------- |
| `bun run test`                                                  | 10 testes, 26 asserts, aprovados |
| `bun run test:integration` com PostgreSQL local                 | 3 testes, 9 asserts, aprovados   |
| contrato real de corpo maior que 1 MiB                          | `413` tipado e correlacionado    |
| processo Bun real recebendo `SIGTERM`                           | saída graciosa com código `0`    |
| `bun run typecheck`, `bun run lint` e `bun run build`           | aprovados                        |
| instalação em diretório temporário contendo somente a aplicação | 117 packages instalados          |
| `bun install --frozen-lockfile` no diretório temporário         | aprovado                         |
| `bun run check` no diretório temporário                         | aprovado, 10 testes              |
| `bun run test:integration` no diretório temporário              | aprovado, 3 testes               |
| `bun install --frozen-lockfile` na raiz                         | aprovado, lock sem mudança       |
| `bun run check` na raiz                                         | aprovado                         |
| lint, typecheck, testes e build da raiz                         | 8/8, 13/13, 13/13 e 8/8 unidades |
| busca residual no código e testes da API                        | nenhum import legado/proibido    |

O teste isolado criou um `bun.lock` apenas dentro do diretório temporário para
então validar uma segunda instalação congelada. Esse lock temporário não faz
parte da aplicação e não foi copiado nem commitado no repositório. O lock
versionado do monorepo continua sendo o `bun.lock` da raiz.

As dependências publicadas foram fixadas em
`@adatechnology/drizzle-provider@0.1.1` e
`@adatechnology/logger@0.0.1`. O logger publicado não expõe lifecycle `close`;
por isso o shutdown fecha o servidor e o provider de banco, sem inventar API
inexistente. A ausência de `exports` no pacote do logger é um risco de
empacotamento conhecido, mitigado nesta task pela validação de import e build
em instalação Bun limpa.

Nenhuma migration de startup, ação Railway ou push foi executado.

## T009 — Worker Bun/RabbitMQ

Modelo executor: Codex Sol high, com revisão de ciclo de vida e repetição dos
gates pelo agente principal.

- a aplicação foi renomeada para `apps/worker-transportada` e tornou-se
  instalável isoladamente, sem importar código-fonte de outro app ou package
  local;
- Nest, `reflect-metadata`, RxJS, BullMQ e imports `@transportada/*` foram
  removidos do worker;
- o composition root usa Bun e os providers publicados
  `@adatechnology/drizzle-provider@0.1.1` e
  `@adatechnology/rabbitmq-provider@0.1.1`;
- a topologia isolada possui exchange e fila principal, exchange e fila de
  retry com TTL/DLX, e exchange e fila dead-letter, todas duráveis;
- envelopes sintéticos de contrato são estritos e versionados, com `eventId`,
  `type`, `version`, `occurredAt`, `companyId`, `correlationId` e payload
  tipado;
- o handler só retorna ack depois do efeito e da marca de idempotência; falhas
  transitórias retornam retry e falhas fatais retornam dead-letter;
- `GET /health/live` não consulta dependências e `GET /health/ready` verifica
  PostgreSQL e RabbitMQ, retornando `503` seguro quando degradado;
- `SIGTERM` e `SIGINT` cancelam novos consumos, drenam o handler em voo e
  fecham RabbitMQ, PostgreSQL e o health server;
- o shutdown é idempotente e tenta fechar todos os recursos mesmo quando uma
  etapa anterior falha; falhas parciais no bootstrap também fecham os recursos
  já iniciados;
- o consumidor sintético existe somente para testar a fundação, fica
  desabilitado por padrão e é rejeitado pela configuração em produção.

Desenvolvimento orientado por testes:

| Evidência inicial                                    | Resultado esperado                         |
| ---------------------------------------------------- | ------------------------------------------ |
| imports dos módulos desejados antes da implementação | contratos falharam                         |
| cancelamento do consumidor lançando erro             | recursos seguintes não eram fechados       |
| integração com topologia inexistente                 | provider declarou exchanges, filas e binds |

Gates da aplicação:

| Verificação                                                     | Resultado                        |
| --------------------------------------------------------------- | -------------------------------- |
| `bun run test`                                                  | 22 testes, 41 asserts, aprovados |
| `bun run test:integration` com PostgreSQL e RabbitMQ locais     | 4 testes, 9 asserts, aprovados   |
| declaração real de exchanges/filas principal, retry e DLQ       | aprovada                         |
| retry por TTL/DLX e falha fatal na DLQ                          | aprovados                        |
| processo Bun real recebendo `SIGTERM` com efeito em voo         | drain e saída `0` aprovados      |
| `bun run typecheck`, `bun run lint` e `bun run build`           | aprovados                        |
| instalação em diretório temporário contendo somente a aplicação | 119 packages instalados          |
| `bun install --frozen-lockfile` no diretório temporário         | aprovado                         |
| `bun run check` e integrações no diretório temporário           | aprovados                        |
| `bun install --frozen-lockfile` na raiz                         | aprovado, lock sem mudança       |
| `bun run check` na raiz                                         | aprovado                         |
| lint, typecheck, testes e build da raiz                         | 8/8 unidades aprovadas           |
| busca residual no código e testes do worker                     | nenhum import legado/proibido    |

Nenhum schema ou consumidor fiscal foi inventado nesta task. O contrato de
ack após efeito/marca de idempotência prepara o limite transacional, que será
ligado a uma transação real quando a spec de negócio definir tabelas e eventos.
Nenhum certificado, senha ou XML fiscal foi lido, persistido ou registrado.
Nenhuma migration de startup, emissão fiscal, ação Railway ou push foi
executado.

## T010 — Frontend React/Vite/PWA

Modelo executor: Codex Terra medium. Revisão de arquitetura, compatibilidade,
acessibilidade e layout executada pelo agente principal.

- `apps/frontend-transportada` é uma aplicação React/Vite independente, sem
  imports de código-fonte de outro app ou package local;
- React `19.2.0`, Vite `7.3.6`, TanStack Query `5.90.20`,
  `react-i18next` `16.5.0` e `vite-plugin-pwa` `1.3.0` foram fixados
  exatamente;
- Vite 8 foi recusado durante a revisão porque
  `@vitejs/plugin-react@5.1.1` ainda limita seu peer ao Vite 7; a instalação
  limpa final não apresenta conflito de peer;
- textos visíveis da aplicação usam locales pt-BR e en; a tela não contém
  documentos, valores, certificados, clientes ou indicadores fiscais
  fictícios;
- a consulta de health fica encapsulada em uma query TanStack, desabilitada
  quando nenhuma URL da API é fornecida;
- tokens semânticos centralizam cores, tipografia e espaçamento; focus visível,
  contraste e `prefers-reduced-motion` foram preservados;
- os breakpoints mobile-first cobrem 640, 768, 1024 e 1280 px, com smoke
  obrigatório em 375, 768 e 1280 px;
- o build gera manifest, service worker, app shell offline, ícones PNG opacos
  de 192 e 512 px e metatags de instalação;
- o service worker usa o app shell como fallback de navegação e a navegação
  offline foi comprovada em Chromium real.

Direção visual aplicada pela revisão `frontend-design`: o painel inicial usa um
“manifesto de despacho” como elemento característico do domínio de transporte.
O objetivo único da tela é comunicar prontidão da fundação e, ao mesmo tempo,
deixar explícito que nenhuma operação fiscal está habilitada.

Desenvolvimento orientado por testes:

| Evidência inicial                                     | Resultado esperado                     |
| ----------------------------------------------------- | -------------------------------------- |
| contratos antes da criação do novo app                | 3 falhas por arquivos ausentes         |
| service worker comprovado somente pelo build          | smoke passou a exigir controle real    |
| navegação sem rede ainda não exercitada               | app shell passou a ser testado offline |
| Vite 8 em instalação isolada com plugin React 5.1.1   | warning de peer detectado              |
| Vite fixado em `7.3.6`, compatível com o plugin React | warning removido                       |

Gates:

| Verificação                                                       | Resultado                       |
| ----------------------------------------------------------------- | ------------------------------- |
| `bun run test`                                                    | 3 testes, 16 asserts, aprovados |
| `bun run lint`, `typecheck` e `build`                             | aprovados                       |
| PWA build                                                         | 11 recursos em precache         |
| Playwright em 375, 768 e 1280 px                                  | sem overflow horizontal         |
| service worker após reload                                        | controle confirmado             |
| reload offline                                                    | app shell disponível            |
| inspeção visual em navegador nos três breakpoints                 | aprovada, sem erro de console   |
| instalação em diretório temporário contendo somente a aplicação   | 480 packages instalados         |
| `bun install --frozen-lockfile`, check e smoke no diretório limpo | aprovados, sem warning de peer  |
| `bun install --frozen-lockfile` e `bun run check` na raiz         | 9/9 unidades aprovadas          |
| busca por imports locais e dependências fiscais                   | nenhum uso encontrado           |

O app Next legado permanece temporariamente em `apps/web` para que a remoção
ocorra junto dos demais legados na T012, depois dos gates da stack local na
T011. Nenhuma operação fiscal, certificado, segredo, ação Railway ou push foi
executado.

## T011 — Compose e Makefile da stack Bun

Modelo planejado: Codex Terra medium. Após duas execuções sem produzir
alterações, a política de modelos foi aplicada e o agente principal assumiu a
implementação e a revisão.

- `make bootstrap` cria o `.env` quando necessário e instala pelo Bun `1.3.14`
  com lock congelado;
- `make config` exige projeto, ambiente, PostgreSQL, RabbitMQ e a versão exata
  do Bun antes de aceitar a configuração;
- o projeto Compose é sempre derivado como `<PROJECT_NAME>-<APP_ENV>`;
- `make up` sobe e aguarda PostgreSQL, RabbitMQ, MinIO e Mailpit saudáveis,
  removendo containers órfãos sem apagar volumes;
- as quatro imagens foram fixadas por digest para evitar mudança implícita de
  `latest` ou de tags móveis;
- Redis saiu da stack ativa porque não existe consumidor concreto depois da
  migração do worker para RabbitMQ; seu volume local não foi apagado;
- `make dev` filtra explicitamente somente `@transportada/api`,
  `@transportada/worker` e `@transportada/frontend`, portanto não inicia o Next
  legado;
- frontend, API e worker usam respectivamente as portas 53000, 53001 e 53002;
- `QUEUE_PREFIX` é derivado de projeto e ambiente no comando de
  desenvolvimento;
- `make smoke` valida frontend, manifest PWA, live/ready da API e do worker,
  MinIO e Mailpit;
- o README agora documenta Bun e a stack ativa, sem Corepack ou pnpm.

Desenvolvimento orientado por validação:

| Evidência inicial                             | Resultado esperado                         |
| --------------------------------------------- | ------------------------------------------ |
| `bun run dev` raiz sem filtros                | incluía Next legado e criava conflito      |
| `.env` local antigo sem `RABBITMQ_URL`        | worker falhava após `make config` aprovado |
| `FRONTEND_PORT` ausente do allowlist do Turbo | Vite usava a porta padrão 5173             |
| Compose ainda declarando Redis sem consumidor | container desnecessário era iniciado       |
| imagens MinIO e Mailpit usando `latest`       | build local não era reproduzível           |
| `make dev` após correções                     | somente três apps Bun iniciados            |

Gates locais:

| Verificação                                        | Resultado                               |
| -------------------------------------------------- | --------------------------------------- |
| `make bootstrap`                                   | frozen install aprovado                 |
| `make config`                                      | projeto `transportada-local` aprovado   |
| `make up` e `make ps`                              | 4/4 serviços saudáveis                  |
| nomes de containers e rede                         | prefixo `transportada-local` confirmado |
| `make dev`                                         | API, worker e Vite iniciados            |
| `make smoke`                                       | todos os endpoints aprovados            |
| readiness real                                     | PostgreSQL e RabbitMQ `up`              |
| `make check`                                       | 9/9 unidades aprovadas                  |
| integração worker após recriar a infraestrutura    | 4 testes, 9 asserts, aprovados          |
| retry/DLX, DLQ e drain após a alteração do Compose | aprovados                               |
| dry-run de `make dev`                              | filtros e prefixo confirmados           |

O `.env` local ignorado pelo Git foi atualizado somente com as variáveis
necessárias para executar a stack. Nenhum volume foi removido, nenhuma emissão
fiscal foi habilitada e nenhuma ação Railway ou push foi executado.

## T012 — Remoção do stack legado

Modelo planejado: Codex Luna low. Como Luna não estava disponível, a remoção
mecânica foi delegada ao Codex Terra low; o agente principal revisou o diff,
assumiu a transferência da migration e repetiu todos os gates.

- pnpm, Turbo, Next, Nest, Express, Prisma, BullMQ, ioredis e os packages
  locais foram removidos do código ativo, manifests e lock;
- a raiz mantém somente `apps/*` como workspace e orquestra explicitamente
  API, worker e frontend por seus scripts próprios;
- configs raiz não consumidos de ESLint e TypeScript foram removidos; cada app
  conserva sua própria toolchain e dependências;
- o baseline Drizzle foi transferido do package local removido para
  `apps/api-transportada`, que agora é dona do schema vazio, do config, do
  comando dedicado de migration e dos testes de contrato;
- migrations continuam fora do startup da API e o baseline continua sem SQL
  destrutivo ou de negócio;
- `make dev` deixou de depender do Turbo e encerra as três aplicações com um
  único Ctrl-C, sem deixar portas ou processos órfãos;
- padrões `.turbo/` e `.next/` permanecem apenas no `.gitignore` para impedir
  que caches antigos locais voltem ao versionamento; não são dependências ou
  caminhos executáveis.

Gates:

| Verificação                                                   | Resultado                                       |
| ------------------------------------------------------------- | ----------------------------------------------- |
| busca residual em código, manifests, CI e configuração ativos | nenhum stack ou import proibido                 |
| `bun install` e `bun install --frozen-lockfile` na raiz       | 506 installs, lock congelado sem mudança        |
| `make check`                                                  | lint, typecheck, 36 testes e 3 builds aprovados |
| API isolada: install, frozen install e `bun run check`        | 126 packages; 11 testes aprovados, 1 pulado     |
| worker isolado: install, frozen install e `bun run check`     | 119 packages; 22 testes aprovados               |
| frontend isolado: install, frozen install e `bun run check`   | 480 packages; 3 testes e build PWA aprovados    |
| API com PostgreSQL e baseline Drizzle                         | 5 testes, 14 asserts, nenhum pulado             |
| `db:check` e `db:generate`                                    | aprovado e `no_changes`                         |
| worker com PostgreSQL e RabbitMQ reais                        | 4 testes, 9 asserts, nenhum pulado              |
| exchanges e filas principal, retry/DLX e dead-letter          | declaradas e exercitadas                        |
| `make up`, `make dev` e `make smoke`                          | stack `transportada-local` aprovada             |
| encerramento do `make dev` e portas 53000/53001/53002         | um Ctrl-C; todas as portas fechadas             |

Hashes finais do baseline transferido:

- `migration.sql`:
  `49a0fa6e06db91f39903f070ad7a4ae2760463f8710ee67ee5848275d3ed7d53`;
- `snapshot.json`:
  `b7608eaa4a1ca9ddee5a5f7cc8f855a6ce1d825057eb1997f004b6f2dc4bb781`.

O SQL permaneceu semanticamente idêntico; somente o newline final foi
normalizado ao transferir o arquivo. O Docker Desktop local precisou de restart
forçado pelo comando oficial porque seu daemon não respondia nem ao `/_ping`;
os volumes foram preservados e os quatro serviços retornaram saudáveis.

Nenhum certificado, senha ou XML fiscal foi lido, persistido ou registrado.
Nenhuma emissão fiscal, ação Railway, deploy ou push foi executado.
