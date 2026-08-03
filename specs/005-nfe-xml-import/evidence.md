# Evidência — Importação e distribuição de NF-e

## T001 — ADRs, spec, plano e decomposição

Data: 2026-07-20

### Escopo executado

- mapeamento read-only da arquitetura existente por Graphify;
- confirmação independente dos padrões de auth/tenant, router, Drizzle,
  RabbitMQ, worker, Makefile e apps separáveis;
- inspeção do contrato público instalado de
  `@adatechnology/fiscal-provider@0.1.0`;
- inventário estrutural seguro de `example/`, sem imprimir payload ou copiar
  dados para fixtures;
- criação de spec, plano, 31 tasks e dois ADRs;
- definição de modelos por risco e de gates exclusivamente locais.

### Evidência do package fiscal

O artefato instalado, usado como fonte normativa, confirma:

- `importarNfeXml(xml: string): DfeItem`;
- `NfeDistribuicaoProvider` separado de `FiscalProvider`;
- `consultarDFe`, `consultarPorNsu`, `consultarPorChave`, `importarXml` e
  `consultarCnpj`;
- config `model: 'nfe-distribuicao'` com CNPJ, UF, ambiente e A1;
- cursor inicial `000000000000000`, páginas de até 50, `ultNSU`, `maxNSU` e
  `temMais`;
- filtros locais, proteção vazia/anti-656 apenas em memória e ausência de
  persistência/idempotência/tenant no provider;
- `DfeItem` possui resumo/XML, mas não toda a normalização exigida pelo
  `PROJECT.MD`;
- o checkout não possui contract público específico de importação/distribuição
  NF-e.

Arquivos inspecionados:

```text
node_modules/.bun/@adatechnology+fiscal-provider@0.1.0/
  node_modules/@adatechnology/fiscal-provider/dist/index.d.ts
  node_modules/@adatechnology/fiscal-provider/dist/types.d.ts
  node_modules/@adatechnology/fiscal-provider/dist/providers/NfeDistribuicaoProvider.d.ts
../adatechnology-packages/packages/backend/fiscal-provider/package.json
../adatechnology-packages/packages/backend/fiscal-provider/test/contract/
  fiscal-provider.contract.test.ts
```

Nenhum internal `src/sefaz/*` foi adotado como dependência do projeto.

### Evidência da arquitetura atual

- router autentica e resolve `CompanyContext` antes de autorizar/parsear rotas;
- permissões `invoices.import` e `invoices.read` já existem na matriz;
- migrations são explícitas e schemas/queries existentes filtram empresa;
- RabbitMQ provider e worker sintético já provam main, retry/DLX, DLQ, confirm,
  prefetch e shutdown;
- o efeito/idempotência sintético atual usa memória e foi explicitamente
  rejeitado para jobs reais;
- MinIO/config S3 existem, mas nenhum provider/storage module foi encontrado;
- não existem tabelas, rotas, outbox, NF-e, cursor NSU ou consumers da feature;
- frontend é Vite e não existe requisito de SSR/SEO que justifique Next.js;
- apps possuem manifests, scripts, builds e composition roots independentes.

### Decisões registradas

- `docs/adr/0006-immutable-fiscal-xml-object-storage.md`;
- `docs/adr/0007-nfe-outbox-idempotency-and-distribution-cursor.md`;
- `@adatechnology/object-storage-provider` será criado no repositório de
  packages;
- package fiscal será evoluído de modo aditivo antes de qualquer schema/app que
  dependa da normalização;
- API grava outbox; worker executa relay/consumers com estado persistente;
- importação e distribuição possuem topologias RabbitMQ separadas e
  versionadas;
- XML original fica em S3/MinIO, nunca no envelope/log/cache;
- frontend permanece Vite;
- nenhuma SEFAZ, PFX, Railway ou infraestrutura remota participa desta task.

### Revisão Opus independente

A primeira revisão encontrou cinco inconsistências, todas corrigidas:

- uniques de outbox/mensagem agora incluem empresa;
- tenant/ator do envelope são claims não autoritativos e precisam coincidir com
  o agregado persistido;
- T019 depende do schema que contém a agenda de backoff;
- pack fiscal exige compatibilidade Bun real, sem presumir ESM inexistente;
- mudança no boundary do router recebe revisão Opus.

A revalidação encontrou três lacunas adicionais, também corrigidas:

- NSU/ambiente possuem persistência e unique parcial tenant-scoped, com testes
  de página sobreposta/replay;
- object storage exige create-only, conflito por hash e reconciliador com lease
  que nunca remove objeto final;
- T010 depende do contract fiscal empacotado e T024 depende da versão publicada
  e pinada.

A revisão Opus final declarou zero bloqueador ou achado alto remanescente.

### Delegação e revisão

- Sonnet (médio): inventários read-only delimitados de arquitetura e
  contrato público;
- Opus (alto): cruzamento das evidências e decisões fiscal, tenant, storage,
  concorrência, filas e release;
- Haiku ficam reservados a tarefas mecânicas futuras conforme
  `tasks.md`; nenhuma decisão crítica será delegada a modelo econômico.

### Gates

| Comando                                                   | Resultado |
| --------------------------------------------------------- | --------- |
| `graphify query "...feature 005..." --budget 2500`        | aprovado  |
| `bunx prettier --check docs/adr specs/005-nfe-xml-import` | aprovado  |
| `git diff --check`                                        | aprovado  |
| busca de decisão bloqueante na spec                       | zero      |
| inventário de tasks/requisitos                            | 31 / 24   |

T001 está concluída com gates documentais verdes.

## T002 — Contracts públicos de normalização NF-e

Data: 2026-07-20

Commit local no repositório `adatechnology-packages`:

```text
da8693f test(fiscal-provider): define nfe xml import contract
```

Arquivos:

```text
packages/backend/fiscal-provider/test/contract/nfe-import.contract.test.ts
packages/backend/fiscal-provider/test/fixtures/nfe-xml.fixture.ts
```

O contract usa apenas NF-e 4.00 sintética e fixa o comportamento público de
`importarNfeXml`:

- retorno discriminado para `nfeProc` autorizada, `NFe` sem protocolo e
  `procEventoNFe`;
- preservação do resumo `DfeItem` existente;
- documento normalizado com emitente, destinatário, transportador, endereços,
  produtos, volumes, protocolo e informações adicionais;
- todos os valores monetários, quantidades e pesos normalizados como strings
  decimais;
- chave de 44 dígitos válida e coerente entre `infNFe` e protocolo;
- lista de CNPJs relacionados;
- zero I/O de rede para importação local;
- erros estáveis e seguros para DTD/ENTITY, raiz não suportada, chave
  inválida/divergente e XML acima de 5 MiB.

### Evidência vermelha esperada

| Gate                                                                   | Resultado esperado                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `bun test test/contract/nfe-import.contract.test.ts`                   | 1 passou, 8 falharam nas capacidades novas                                |
| `bun run test:contract`                                                | 6 passaram, 8 falharam; os 5 contracts CT-e existentes continuaram verdes |
| `bunx prettier --check test/contract/... test/fixtures/...`            | aprovado                                                                  |
| `git diff --cached --check`                                            | aprovado                                                                  |
| inclusão pelo script agregado `test:contract = bun test test/contract` | confirmada                                                                |

O RTK resumiu corretamente os contadores, mas retornou exit code zero para o
teste vermelho e roteou `rtk diff --check` ao utilitário `diff`. Por isso os
gates de falha/whitespace foram repetidos com Bun/Git brutos.

Nenhum source, manifest, lockfile, XML real, certificado ou arquivo sujo
preexistente entrou no commit. O commit vermelho permanece apenas local até a
T003 deixá-lo verde; assim a branch remota não recebe uma pipeline
intencionalmente quebrada.

## T003 — Importação NF-e normalizada e aditiva

Data: 2026-07-20

Commit local no repositório `adatechnology-packages`:

```text
8f478ec feat(fiscal-provider): normalize imported nfe xml
```

O contrato público existente `importarNfeXml` foi preservado e ampliado de
forma aditiva. O retorno continua compatível com `DfeItem` e agora é uma união
discriminada que separa NF-e autorizada, NF-e sem protocolo e evento.

Arquivos de implementação:

```text
packages/backend/fiscal-provider/src/errors/NfeXmlImport.error.ts
packages/backend/fiscal-provider/src/providers/NfeXmlImporter.service.ts
packages/backend/fiscal-provider/src/providers/NfeDistribuicaoProvider.ts
packages/backend/fiscal-provider/src/types.ts
packages/backend/fiscal-provider/src/index.ts
```

Comportamentos verificados:

- normalização integral do contrato sintético sem I/O de rede;
- dinheiro, quantidades e pesos preservados como strings decimais;
- limite público de 5 MiB antes do parse;
- rejeição de DTD/ENTITY, raiz não suportada e chave inválida/divergente;
- chave de acesso validada inclusive pelo dígito verificador;
- protocolo de autorização vinculado somente à mesma chave da NF-e;
- resposta de evento vinculada somente quando `chNFe`, `tpEvento` e
  `nSeqEvento` coincidem com a solicitação;
- erros fiscais especializados com códigos estáveis e mensagens sem payload;
- exports disponíveis exclusivamente pela raiz pública do package;
- compatibilidade CommonJS/Bun existente preservada.

### Revisão Opus independente

A revisão encontrou um P1: um `procEventoNFe` adulterado poderia combinar a
identidade de `evento.infEvento` com protocolo/status de
`retEvento.infEvento`. A implementação passou a exigir igualdade exata dos
três campos de identidade e o contract ganhou regressão individual para cada
divergência. A revalidação declarou zero P0/P1 remanescente.

### Gates

| Comando                                              | Resultado             |
| ---------------------------------------------------- | --------------------- |
| `bun run check`                                      | aprovado              |
| `bun test test/contract/nfe-import.contract.test.ts` | 10 passaram, 0 falhou |
| `bun run test:contract`                              | 15 passaram, 0 falhou |
| `bun test`                                           | 15 passaram, 0 falhou |
| `bun run build`                                      | aprovado              |
| `bunx prettier --write <arquivos T003>`              | aprovado              |
| `git diff --cached --check`                          | aprovado              |
| smoke do `dist` pela raiz pública                    | aprovado              |

Nenhum manifest, lockfile, XML real, certificado ou alteração preexistente foi
incluído no commit.

## T004 — Pack e consumo Bun limpo do fiscal-provider

Data: 2026-07-20

Commit local no repositório `adatechnology-packages`:

```text
b8be05e test(fiscal-provider): verify clean bun package consumption
```

O package agora executa `bun run build` no lifecycle `prepack` e expõe o gate
`test:package`. O contract de distribuição:

- remove temporariamente `dist/` para provar que o pack não depende de
  artefato residual;
- preserva e restaura integralmente qualquer `dist/` preexistente;
- valida no dry-run a presença de `dist/index.js` e `dist/index.d.ts`;
- rejeita source `src/` no conteúdo publicado;
- gera o tarball real em diretório temporário;
- instala o `.tgz` com Bun em consumidor isolado;
- faz typecheck de valor e tipo importados somente pela raiz pública;
- executa a raiz empacotada e confirma resolução dentro do `node_modules` do
  consumidor, nunca para o checkout;
- remove tarball, consumidor e backups temporários no cleanup.

### Delegação e revisão

Sonnet (médio) produziu a primeira versão. A revisão do agente principal
encontrou falsos positivos de lifecycle, typecheck, descoberta do teste e
timeout, assumiu a implementação após a execução delegada ficar sem resposta e
fechou os gates. A revisão Opus encontrou um P1 de higiene porque o primeiro
teste removia `dist/` sem restaurá-lo. O cleanup foi corrigido com
backup/restauração e a revalidação declarou zero P0/P1.

### Gates

| Comando                        | Resultado             |
| ------------------------------ | --------------------- |
| `bunx prettier --check ...`    | aprovado              |
| `bun run check`                | aprovado              |
| `bun run test:contract`        | 15 passaram, 0 falhou |
| `bun run test:package`         | 1 passou, 0 falhou    |
| `bun run build`                | aprovado              |
| `npm pack --dry-run --json`    | aprovado              |
| hashes de `dist/` antes/depois | idênticos             |
| `git diff --cached --check`    | aprovado              |

Nenhuma versão foi alterada ou publicada e nenhum lockfile entrou no commit.

## T005 — Contracts do object-storage-provider

Data: 2026-07-20

Commit local no repositório `adatechnology-packages`:

```text
9b2e67f test(object-storage): define immutable s3 contract
```

O novo package `@adatechnology/object-storage-provider` fixa uma API pública
Bun-first e S3 compatível antes da implementação. Os contracts usam somente um
servidor S3 sintético em memória, iniciado em porta dinâmica, e cobrem:

- escrita obrigatoriamente create-only com `If-None-Match: *`;
- replay da mesma key/hash e conflito fatal de hash divergente sem overwrite;
- bytes e `ReadableStream`, preservação do conteúdo, tamanho, SHA-256 e MIME;
- validação de bucket, key absoluta, backslash, traversal e header injection;
- `put`, `get`, `head`, `delete` idempotente e metadados sem estado transitório;
- path-style, health, close idempotente e rejeição após shutdown;
- URL privada assinada com expiração entre 1 e 300 segundos;
- erros tipados e mensagens sem credencial, endpoint, bucket ou key.

### Evidência vermelha esperada

| Gate                                            | Resultado                                  |
| ----------------------------------------------- | ------------------------------------------ |
| `bun run check`                                 | aprovado                                   |
| `bun run format:check`                          | aprovado                                   |
| `bunx eslint src test`                          | aprovado                                   |
| `bun test test/object-storage.contract.test.ts` | 0 passou, 10 falharam por capacidade stub  |
| `git diff --cached --check`                     | aprovado                                   |
| hook pre-commit ESLint/Prettier                 | aprovado após corrigir os dois lint errors |

O teste agregado do package aponta para o mesmo contract. Nenhuma dependência
foi instalada, nenhum lockfile foi alterado e nenhum segredo, PFX, XML real ou
alteração preexistente do repositório entrou no commit. O commit vermelho fica
local até a T006 implementar e deixar o package verde.

## T006 — Provider S3 compatível Bun-first

Data: 2026-07-20

Commit local no repositório `adatechnology-packages`:

```text
4569775 feat(object-storage): implement immutable s3 provider
```

A implementação usa `@aws-sdk/client-s3` e o presigner oficial, ambos pinados
em `3.1091.0`, com endpoint S3 compatível, path-style e credenciais explícitas.
O provider agora oferece create-only real, replay por SHA-256, conflito fatal
sem overwrite, put/get/head/delete, health de bucket privado, URL assinada de
curta duração e shutdown idempotente.

Validações fecham configuração, bucket, key/traversal, MIME/header injection,
tamanho declarado, limite máximo obrigatório e SHA-256 antes de confirmar o
upload. Streams de entrada são lidos incrementalmente até o limite declarado,
falhas são redigidas e `Uint8Array` recebe cópia defensiva antes do hash/envio.
Streams de download também convertem falhas tardias em erro público seguro.

### Revisão Opus independente

A primeira revisão encontrou dois P1: consumo ilimitado do stream poderia
causar OOM e a referência mutável de `Uint8Array` poderia mudar depois do hash.
Foram adicionados `maxObjectSizeBytes`, leitura incremental com cancelamento no
primeiro byte excedente, cópia defensiva e regressões específicas. A
revalidação declarou zero P0/P1 residual.

### Gates

| Comando                              | Resultado               |
| ------------------------------------ | ----------------------- |
| `make up` no TransportAdA            | infraestrutura saudável |
| `bun run check`                      | aprovado                |
| `bunx eslint src test`               | aprovado                |
| `bun test`                           | 12 passaram, 0 falhou   |
| `bun run build`                      | aprovado                |
| `bun run test:integration` com MinIO | 1 passou, 0 falhou      |
| hook pre-commit ESLint/Prettier      | aprovado                |

O MinIO real foi iniciado exclusivamente pelo Makefile com o projeto Compose
`transportada-local`; nenhuma Railway, SEFAZ, PFX ou XML real foi acessado. O
`pnpm-lock.yaml` já continha alterações preexistentes de outros packages e foi
preservado fora do commit; a reconciliação isolada do lockfile faz parte do
gate de empacotamento/publicação da T007.

## T007 — Empacotamento, versão, publicação e pins Ada

Data: 2026-07-20

Commits no repositório `adatechnology-packages`:

```text
3262b82 chore(release): prepare fiscal and storage packages
22252a7 chore(release): version packages
```

O changeset publicou as versões auditadas:

- `@adatechnology/fiscal-provider@0.2.0`;
- `@adatechnology/object-storage-provider@0.1.1`.

O lockfile do monorepo Ada foi gerado em worktree limpa e o commit contém
somente o importer e as dependências transitivas do novo storage provider. As
44 linhas preexistentes de `conversations-ui` e `products-ui` foram restauradas
depois do staging e permanecem fora dos commits da feature.

API e worker do TransportAdA agora declaram os dois packages por versão exata,
sem `file:`, `workspace:*`, range ou import de source. Contracts independentes
em cada app verificam esses pins e o `bun.lock` foi resolvido diretamente do
registro npm.

### Gates

| Gate                                         | Resultado                         |
| -------------------------------------------- | --------------------------------- |
| CI packages `29780495141`                    | aprovado                          |
| Publish packages `29780495233`               | aprovado                          |
| `npm view ...fiscal-provider version`        | `0.2.0`                           |
| `npm view ...object-storage... version`      | `0.1.1`                           |
| fiscal `bun run test:package`                | 1 passou, consumidor Bun limpo    |
| object storage `npm pack --dry-run --json`   | JS/types, sem source              |
| packages `pnpm install --frozen-lockfile`    | aprovado em worktree limpa        |
| API `check`                                  | 291 passaram, 1 skip, build verde |
| worker `check`                               | 23 passaram, build verde          |
| TransportAdA `bun install --frozen-lockfile` | aprovado                          |

Os workflows versionaram e publicaram pelo GitHub; nenhuma publicação manual,
Railway, SEFAZ, certificado ou XML real foi utilizada.

## T008 — Contracts de parâmetros dinâmicos do router

Data: 2026-07-20

O contract agregado da API define parâmetros de path imutáveis e tipados,
precedência de rota exata sobre dinâmica independentemente da ordem de
registro, decode seguro de um UUID canônico e 404 uniforme para segmentos
inválidos, codificação malformada, slash codificado, método divergente e
segmentos excedentes.

As barreiras protegidas são exercitadas com POST e body sentinela: falhas em
autenticação, resolução de tenant ou RBAC mantêm `bodyUsed === false` e nunca
alcançam parser ou handler. Health, auth-me e rotas exatas permanecem cobertos.
O contract também exige o shape público de `RouterPathParameters` e
`RouteParserParams`, evitando uma implementação apenas dinâmica em runtime.

### Revisão Opus independente

A primeira revisão encontrou três P1: colisão de precedência vacuamente
inválida, ausência de prova do contrato TypeScript público e falta de body
sentinela nos gates. Os três foram corrigidos; a re-revisão declarou zero
P0/P1 residual.

### Gates

| Comando                                                 | Resultado                         |
| ------------------------------------------------------- | --------------------------------- |
| `bun run lint`                                          | aprovado                          |
| `bun run typecheck`                                     | aprovado                          |
| `bun test test/router-path-parameters.contract.test.ts` | vermelho esperado: 10 pass/4 fail |
| `bun run test`                                          | vermelho isolado: 301 pass/4 fail |
| `git diff --check`                                      | aprovado                          |

As quatro falhas correspondem somente às capacidades reservadas para T009:
shape público, matching/decode e alcance de tenant/RBAC após o match dinâmico.
Nenhuma implementação, infraestrutura externa, Railway, certificado ou XML
fiscal real foi utilizada.

## T009 — Matching tipado sem regressão HTTP

Data: 2026-07-20

O router exporta parâmetros de path imutáveis e os entrega ao parser somente
depois de autenticação, match, resolução de tenant e RBAC. Rotas exatas têm
precedência determinística; rotas dinâmicas aceitam exatamente um segmento
`:id` em qualquer posição, preservam todos os segmentos literais e validam o
valor decodificado como UUID v4 canônico lowercase com variant válida.

Escape malformado, slash codificado, UUID não canônico, método divergente e
segmentos excedentes resultam no mesmo 404 autenticado. O body permanece
intocado quando qualquer gate rejeita a chamada. Health, auth-me, rotas exatas
e rotas com sufixo estático, como `/nfe-documents/:id/xml`, não regrediram.

### Revisão Opus independente

A primeira revisão encontrou um P1: a versão inicial aceitava `:id` apenas no
último segmento e bloquearia endpoints previstos na feature. O matcher passou
a localizar exatamente um parâmetro em qualquer posição e ganhou regressão
com sufixo estático. A re-revisão declarou zero P0/P1 residual.

### Gates

| Comando                                                 | Resultado                |
| ------------------------------------------------------- | ------------------------ |
| `bun run lint`                                          | aprovado                 |
| `bun run typecheck`                                     | aprovado                 |
| `bun test test/router-path-parameters.contract.test.ts` | 15 passou, 0 falhou      |
| `bun run test`                                          | 306 passou, 1 skip       |
| `bun run build`                                         | aprovado                 |
| `bun run test:integration` com PostgreSQL local         | 35 passou, 1 skip        |
| `make down`                                             | infraestrutura encerrada |
| `git diff --check`                                      | aprovado                 |

A integração foi executada apenas contra a stack local nomeada pelo Makefile;
nenhuma Railway, SEFAZ, PFX ou amostra fiscal real foi acessada.

## T010 — Contracts do schema NF-e, outbox e storage

Data: 2026-07-20

O contract agregado define 12 tabelas separadas nos módulos `nfe`,
`processing` e `storage`. A cobertura inclui importações e itens, linhagem
append-only de reprocessamento, documentos normalizados, participantes,
endereços, volumes, produtos, eventos, cursor DFe, outbox, mensagens
processadas e objetos fiscais.

As relações de negócio usam FKs compostas por tenant; atores referenciam a
membership da mesma empresa. Uniques cobrem chave NF-e, idempotência, replay,
NSU, evento, consumer e objeto. Checks fecham estados, contadores, hashes,
decimais, pares NSU/ambiente, leases e cursores. Campos nulos não conseguem
contornar identidade, relacionamentos ou deduplicação.

O histórico de reprocessamento usa predecessor e tentativa anterior, FK
composta que preserva objeto/hash/entrada, sequência contígua, proibição de
autorreferência e índice parcial que impede branches concorrentes. O XML
permanece somente como referência imutável ao storage.

### Revisões Opus

A revisão principal corrigiu uma FK de ator inicialmente não tenant-scoped. A
revisão independente encontrou cinco P1 de cobertura e, depois, três P1
residuais: modelo NF-e incompleto, semântica NULL/UNKNOWN, FKs anuláveis,
cursor anulável e linhagem insuficiente. Após as correções, a revisão final
declarou zero P0/P1 residual.

### Gates

| Comando                                     | Resultado                           |
| ------------------------------------------- | ----------------------------------- |
| `bun run lint`                              | aprovado                            |
| `bun run typecheck`                         | aprovado                            |
| `bun test test/nfe-schema.contract.test.ts` | vermelho esperado: 0 pass/16 fail   |
| `bun run test`                              | 306 pass, 1 skip, 16 fail esperadas |
| `git diff --check`                          | aprovado                            |

As 16 falhas decorrem exclusivamente das 12 exports e dos três módulos que a
T011 implementará; o teste adicional cobre a linhagem de tentativas. Nenhum
schema, migration, Railway, certificado, XML real ou infraestrutura externa
foi utilizado nesta task.

## T011 — Schema, migration aditiva e rollback NF-e

Data: 2026-07-22

Foram implementados os schemas Drizzle da feature em três módulos explícitos:
`storage.schema.ts`, `nfe.schema.ts` e `processing.schema.ts`, todos exportados
por `database.schema.ts`. A migration
`20260722024645_boring_leper_queen` adiciona tabelas, checks, uniques, índices
parciais e FKs compostas por `company_id`, sem alteração destrutiva nas
migrations anteriores.

O rollback manual remove primeiro consumers/outbox e tabelas filhas, depois
agregados e `stored_objects`; ele valida o registro esperado em
`drizzle.__drizzle_migrations` pelo nome e hash antes de executar. O contract
de migration integration foi atualizado para aplicar e reverter todas as
migrations de domínio pós-identidade em ordem reversa.

### Escopo implementado

- objetos fiscais em storage com create-only lógico, hash, lease e lifecycle;
- importações NF-e, itens, replay de origem e linhagem de reprocessamento;
- documentos NF-e normalizados, participantes, endereços, volumes e produtos;
- eventos NF-e independentes de documento completo;
- cursor DFe por empresa/ambiente com NSU monotônico e lease persistente;
- outbox tenant-scoped e mensagens processadas com idempotência persistente.

### Gates

| Comando                                                                   | Resultado           |
| ------------------------------------------------------------------------- | ------------------- |
| `bun test apps/api-transportada/test/nfe-schema.contract.test.ts`         | 16 passou, 0 falhou |
| `bun test apps/api-transportada/test/database-migration.contract.test.ts` | 4 passou, 0 falhou  |
| `bun run --cwd apps/api-transportada db:check`                            | aprovado            |
| `bun run --cwd apps/api-transportada check`                               | 322 passou, 1 skip  |
| `make migration-test`                                                     | 9 passou, 0 falhou  |

Nenhuma Railway, SEFAZ, PFX, XML real ou infraestrutura remota foi acessada. O
PostgreSQL usado no `make migration-test` foi a stack local do Compose.

## T012 — Contracts dos gateways de storage dos apps

Data: 2026-07-22

Foram criados contratos de entrada para os adapters de storage do API e do worker
da feature:

- `apps/api-transportada/test/nfe-storage-gateway.contract.test.ts`
- `apps/worker-transportada/test/nfe-storage-gateway.contract.test.ts`

Os contratos cobrem:

- prefixo package `@adatechnology/object-storage-provider` pinado;
- chaves opacas por tenant e fluxo separando staging/final;
- adaptação para modo `create-only` e replay por SHA-256;
- fluxo de stream e `head` para leitura sem bufferizar XML;
- reconciliador que não remove objetos `final`.

Também foi atualizado o script agregado de testes de cada app para incluir o novo
arquivo de contrato.

### Gates

| Comando (vermelho esperado nesta etapa)                                                                | Resultado      |
| ------------------------------------------------------------------------------------------------------ | -------------- |
| `bun test apps/api-transportada/test/nfe-storage-gateway.contract.test.ts`                             | falha esperada |
| `bun test apps/worker-transportada/test/nfe-storage-gateway.contract.test.ts`                          | falha esperada |
| `bun test ./test/http.contract.test.ts ... ./test/nfe-storage-gateway.contract.test.ts` (API agregado) | falha esperada |
| `bun test ./test/environment... ./test/nfe-storage-gateway.contract.test.ts ...` (worker agregado)     | falha esperada |

Observação: a falha é esperada porque a T013 ainda implementará os módulos de
adaptadores e reconciliador consumidos por estes contratos.

## T013 — Implementar adapters S3 e reconciliador de staging

Data: 2026-07-22

Foram implementados os adapters do storage para API e worker com suporte S3 via
`@adatechnology/object-storage-provider` e validação explícita de configuração de
ambiente (`endpoint`, `access`, `secret`, `bucket`) antes da criação do provider.

Arquivos:

- `apps/api-transportada/src/storage/infrastructure/nfe-storage-gateway.ts`
- `apps/worker-transportada/src/storage/infrastructure/nfe-storage-gateway.ts`

Escopo entregue:

- chaves tenant-safe:
  - `buildNfeImportSourceObjectKey`
  - `buildNfeDocumentObjectKey`
  - `buildNfeEventObjectKey`
- gateway API com buckets `staging` e `final`, `storeObject`, `storeImportSource`,
  `storeFinalDocument`, `storeFinalEvent`, `getObjectStream`, `headObject` e
  `health` com semântica create-only/replay por SHA-256 via provider
- reconciliador do worker que processa apenas status `staging`, apaga objeto apenas
  quando staging expirado e mantém `markExpiredReconciled` no fluxo de persistência
- parser de configuração aceitando `OBJECT_STORAGE_*` e `STORAGE_*` com fallback e
  validação de completude.
- assinatura de `createNfeStorageGateway` do worker compatibilizada para aceitar
  args opcionais de bucket sem efeito funcional, preservando chamadas existentes dos
  contratos.

### Gates locais esperados da tarefa

- `bun run --cwd apps/api-transportada check` — pendente
- `bun run --cwd apps/worker-transportada check` — pendente
- `bun test apps/api-transportada/test/nfe-storage-gateway.contract.test.ts` — pendente
- `bun test apps/worker-transportada/test/nfe-storage-gateway.contract.test.ts` — pendente

## T014 — Contracts da aplicação de importação

Data: 2026-07-22

Foram criados os contracts de aplicação da feature de importação NF-e na API,
separando os comportamentos de solicitação/idempotência, finalização e
compensação, listagem/detalhe e reprocessamento.

Arquivos:

- `apps/api-transportada/test/nfe-import-application.contract.test.ts`
- `apps/api-transportada/test/nfe-import-application/request-and-idempotency.contract.ts`
- `apps/api-transportada/test/nfe-import-application/finalize-and-compensate.contract.ts`
- `apps/api-transportada/test/nfe-import-application/list-and-detail.contract.ts`
- `apps/api-transportada/test/nfe-import-application/reprocess.contract.ts`
- `apps/api-transportada/test/fixtures/nfe-import-application.fixture.ts`
- `apps/api-transportada/test/fixtures/nfe-import-use-case.fixture.ts`

Cobertura contratual introduzida:

- criação tenant-scoped de importação em estado `queued` com itens `pending`
  e outbox `transportada.nfe.import.requested`
- replay idempotente sem duplicar importação, itens ou outbox
- conflito de fingerprint com erro genérico e sem vazamento de tenant
- finalização com contadores derivados dos resultados terminais dos itens e
  estado `partially_processed`
- compensação com erro terminal seguro
- listagem e detalhe tenant-scoped sem XML nem payload fiscal em resposta
- reprocessamento que preserva linhagem imutável (`previous_item_id`,
  `previous_attempt`) e cria novo outbox
- rejeição de reprocessamento para importação em estado não permitido

Também foi atualizado o script agregado `test` da API para incluir o novo
arquivo `./test/nfe-import-application.contract.test.ts`.

### Gates locais esperados da tarefa

- `bun test apps/api-transportada/test/nfe-import-application.contract.test.ts` — vermelho esperado: 10 falhas por módulos `src/nfe-imports/application/*` ainda inexistentes
- `bunx eslint <arquivos T014> --max-warnings=0` na pasta `apps/api-transportada` — aprovado
- `bun run --cwd apps/api-transportada test` — pendente
- `bun run --cwd apps/api-transportada check` — pendente

### Revisão 5.5

A revisão removeu determinismo artificial de IDs dos contracts, deixando
`nfe_imports.id`, `nfe_import_items.id` e `processing_outbox.event_id` como
responsabilidade da implementação/repositório. Os ports de teste agora aceitam
drafts de importação e itens, alinhados ao schema com `defaultRandom()`.

Também foram corrigidos checks que serializavam `bigint` com `JSON.stringify` e
um fixture de anti-enumeração que antes exigia `COMPANY_ID` mesmo na consulta de
outro tenant. O teste de outbox agora verifica ausência de nomes de arquivo no
envelope persistente, sem contradizer o campo sanitizado `source_name` dos itens.

## T015 — Repositórios, casos de uso e outbox

Data: 2026-07-22

Implementação iniciada pelos seis casos de uso definidos nos contracts da T014.
Foram adicionados ports tipados, erros públicos seguros, derivação de tenant pelo
`CompanyContext`, replay idempotente, contadores de finalização, compensação,
listagem/detalhe e reprocessamento com linhagem e envelope mínimo de outbox.

O adapter `DrizzleNfeImportRepository` implementa unidade de trabalho para que
importação, itens, idempotência e outbox sejam confirmados na mesma transação.
Consultas, updates, paginação e anti-enumeração incluem `companyId`; o envelope
de outbox contém somente IDs, ator, correlação e versão do evento.

Durante a integração foi identificada uma incompatibilidade entre a linhagem
append-only e duas unicidades da migration T011. A migration aditiva
`20260722170000_nfe_retry_constraints` passou a incluir `attempt` nas chaves de
ordinal e replay de origem, permitindo tentativa 2 sem alterar a tentativa 1.
Ela inclui snapshot e rollback manual guardado por nome e hash.

### Gates

| Comando                                                 | Resultado                                             |
| ------------------------------------------------------- | ----------------------------------------------------- |
| `bun test test/nfe-import-application.contract.test.ts` | 10 passou, 0 falhou                                   |
| `bun run --cwd apps/api-transportada check`             | 337 passou, 1 skip; lint, typecheck e build aprovados |
| `bun run --cwd apps/api-transportada test:integration`  | 35 passou, 1 skip                                     |
| `bun run --cwd apps/api-transportada db:check`          | aprovado                                              |
| `make migration-test`                                   | 9 passou, 0 falhou                                    |

Todos os serviços utilizados foram da stack Compose local. Nenhuma Railway,
SEFAZ, credencial fiscal, PFX ou amostra de XML real foi acessada.

## T016 — Contracts HTTP de importações/documentos

Data: 2026-07-22

Foram adicionados os contracts HTTP da feature NF-e na API, cobrindo upload
multipart de XML/ZIP, início de distribuição, listagem e detalhe de
importações, listagem e detalhe de documentos, download do XML original e
reprocessamento. O fixture dedicado monta `request-handler` + router real e
carrega dinamicamente os módulos de apresentação ainda inexistentes, para que o
vermelho inicial aponte diretamente para a T017.

Arquivos:

- `apps/api-transportada/test/nfe-http.contract.test.ts`
- `apps/api-transportada/test/nfe-http/security-and-cors.contract.ts`
- `apps/api-transportada/test/nfe-http/import-request-and-limits.contract.ts`
- `apps/api-transportada/test/nfe-http/listing-and-detail.contract.ts`
- `apps/api-transportada/test/nfe-http/download-and-reprocess.contract.ts`
- `apps/api-transportada/test/fixtures/nfe-http.fixture.ts`
- `apps/api-transportada/test/fixtures/nfe-http-request.fixture.ts`
- `apps/api-transportada/test/fixtures/nfe-http-payload.fixture.ts`
- `apps/api-transportada/test/fixtures/nfe-http.types.ts`

Cobertura contratual introduzida:

- `POST /nfe-imports/xml` com multipart de múltiplos arquivos, `202`,
  `Idempotency-Key`, resposta segura e sem seleção livre de tenant
- `POST /nfe-imports/distribution` como efeito assíncrono separado, também com
  `202` e idempotência
- autenticação/autorização antes do parse do body multipart e sem acesso ao
  download/storage em cenários negados
- validação de limite, cursor, `limit`, path dinâmico e headers com erro
  estável `INVALID_REQUEST`
- `GET /nfe-imports` e `GET /nfe-imports/:id` com paginação estável, contadores
  serializados e ausência de XML/payload sensível
- `GET /nfe-documents`, `GET /nfe-documents/:id` e `GET /nfe-documents/:id/xml`
  com `no-store`, CORS, `nosniff`, filename seguro e anti-enumeração
- `POST /nfe-imports/:id/reprocess` com `202`, correlação e erros seguros
  `404`/`409`

### Gate local esperado da tarefa

| Comando                                   | Resultado                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `bun test test/nfe-http.contract.test.ts` | vermelho esperado: 19 falhas por ausência de `src/nfe-imports/presentation/nfe-imports.routes.ts` |

O vermelho confirma que o suite está ancorado na camada certa para a T017:
rotas HTTP de `nfe-imports` e `nfe-documents` ainda não existem, enquanto o
restante da infraestrutura de teste já está preparado para exercitar
autorização, parsing, serialização, download e reprocessamento.

## T017 — Implementar rotas HTTP NF-e e streaming seguro

Data: 2026-07-22

Foram implementadas as rotas HTTP de `nfe-imports` e `nfe-documents`, com parse
estrito de multipart/query/path, autorização tenant-scoped, respostas
`no-store`, serialização segura e download do XML original com `nosniff` e nome
sanitizado. Também foi atualizado o classificador de paths HTTP para aplicar
`no-store` às novas rotas inclusive em respostas de erro.

Após revisão 5.5, a implementação foi ajustada para conectar as rotas no
bootstrap real da API, incluir o contract HTTP no script agregado, cobrir
`GET /nfe-imports/:id/items` e `GET /nfe-documents/:id/eligibility`, e ligar o
upload ao staging em object storage + metadados `stored_objects` antes do use
case de importação. A rota de documentos agora usa repository Drizzle
tenant-scoped para listagem, detalhe, elegibilidade estrutural e download via
storage.

Arquivos:

- `apps/api-transportada/src/nfe-imports/presentation/nfe-imports.schema.ts`
- `apps/api-transportada/src/nfe-imports/presentation/nfe-imports.routes.ts`
- `apps/api-transportada/src/nfe-documents/application/nfe-document.types.ts`
- `apps/api-transportada/src/nfe-documents/infrastructure/drizzle-nfe-document.repository.ts`
- `apps/api-transportada/src/nfe-documents/presentation/nfe-documents.routes.ts`
- `apps/api-transportada/src/storage/infrastructure/drizzle-stored-object.repository.ts`
- `apps/api-transportada/src/main.ts`
- `apps/api-transportada/package.json`
- `apps/api-transportada/src/shared/api.constant.ts`
- `apps/api-transportada/src/http/request-path.service.ts`

Cobertura implementada:

- `POST /nfe-imports/xml` com multipart estrito de arquivos `xml`/`zip`,
  `Idempotency-Key`, `202`, staging create-only em storage, metadados
  `stored_objects` e sem seleção livre de tenant
- `POST /nfe-imports/distribution` e
  `POST /nfe-imports/:id/reprocess` como efeitos assíncronos seguros
- `GET /nfe-imports` e `GET /nfe-imports/:id` com paginação estável e
  serialização de `bigint` como string
- `GET /nfe-imports/:id/items` sem XML ou payload fiscal bruto
- `GET /nfe-documents`, `GET /nfe-documents/:id` e
  `GET /nfe-documents/:id/xml` com anti-enumeração, `no-store`,
  `content-disposition` seguro e `x-content-type-options: nosniff`
- `GET /nfe-documents/:id/eligibility` com decisão estrutural
  `PENDING_FREIGHT_AND_CTE_RULES`, sem inventar regra fiscal de CT-e

### Gates executados

| Comando                                                                                     | Resultado                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `bun test test/nfe-http.contract.test.ts`                                                   | 21 passou, 0 falhou                                          |
| `bun run --cwd apps/api-transportada check`                                                 | 358 passou, 1 skip; lint, typecheck, tests e build aprovados |
| `make up`                                                                                   | stack local saudável                                         |
| `set -a && source ./.env && set +a && bun run --cwd apps/api-transportada test:integration` | 35 passou, 1 skip                                            |

Nenhuma Railway, SEFAZ, credencial fiscal real, PFX ou XML real foi acessado.

## T018 — Contracts de envelope, topologias e backoff

Data: 2026-07-22

Foram adicionados os contracts de mensageria NF-e no worker, cobrindo envelope
mínimo, topologia RabbitMQ versionada para importação, backoff persistente e
rejeição fatal quando as claims do envelope divergem do outbox/agregado
autoritativo.

Arquivos:

- `apps/worker-transportada/test/nfe-messaging.contract.test.ts`
- `apps/worker-transportada/test/nfe-messaging/envelope.contract.ts`
- `apps/worker-transportada/test/nfe-messaging/topology.contract.ts`
- `apps/worker-transportada/test/nfe-messaging/backoff-and-authority.contract.ts`
- `apps/worker-transportada/package.json`

Cobertura contratual introduzida:

- `transportada.nfe.import.requested` e
  `transportada.nfe.distribution.requested` usam envelope v1 estrito com
  `eventId`, `companyId`, `actorId`, `correlationId` e `payload.importId`;
- payloads rejeitam XML, storage key, nome de arquivo, credenciais e resposta
  SEFAZ;
- topologia `nfe-import.v1` exige main/retry/DLX/DLQ isolados por
  `QUEUE_PREFIX`;
- retry inicial exige atrasos persistidos de 5 s, 30 s e 5 min, com cap no
  último degrau;
- validação de autoridade compara `eventId`, tenant, ator e agregado contra o
  registro persistido antes de selecionar dados tenant-scoped.

### Gate local esperado da tarefa

| Comando                                        | Resultado                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `bun test test/nfe-messaging.contract.test.ts` | vermelho esperado: 1 falha por ausência de `src/messaging/nfe-processing-envelope.schema.ts` |

O vermelho confirma que a T019 deve implementar os módulos públicos de
mensageria NF-e sem depender de loops em memória para backoff gradual e sem
tratar claims do envelope como autoridade.

## T019 — Topologias e backoff persistido

Data: 2026-07-22

Foram implementados os módulos de mensageria NF-e no worker a partir dos
contracts da T018. A implementação mantém o provider RabbitMQ pinado e não
altera o package compartilhado; o backoff gradual é calculado para persistência
em `processing_outbox.next_attempt_at`, deixando o retry físico do RabbitMQ como
rota fixa e idempotente.

Arquivos:

- `apps/worker-transportada/src/messaging/nfe-processing-envelope.schema.ts`
- `apps/worker-transportada/src/messaging/nfe-rabbitmq-topology.ts`
- `apps/worker-transportada/src/messaging/nfe-backoff-policy.ts`
- `apps/worker-transportada/src/messaging/nfe-message-authority.service.ts`
- `apps/worker-transportada/src/storage/infrastructure/nfe-storage-gateway.ts`
- `apps/worker-transportada/test/nfe-storage-gateway.contract.test.ts`
- `specs/005-nfe-xml-import/tasks.md`

Comportamento entregue:

- envelope NF-e v1 estrito para importação e distribuição, sem XML, storage key,
  nome de arquivo, credenciais ou resposta SEFAZ no payload;
- topologias `nfe-import.v1` e `nfe-distribution.v1` com main, retry e
  dead-letter versionados por `QUEUE_PREFIX`;
- backoff persistível de 5 s, 30 s e 5 min, com cap no último degrau;
- validação fatal de divergência entre claims do envelope e registro
  autoritativo persistido;
- ajuste proporcional no reconciliador de storage para deletar staging expirado
  de forma idempotente e nunca deletar objetos finais.

### Gates

| Comando                                                   | Resultado                                              |
| --------------------------------------------------------- | ------------------------------------------------------ |
| `bun test test/nfe-messaging.contract.test.ts`            | 20 passou, 0 falhou                                    |
| `bun run --cwd apps/worker-transportada check`            | 46 passou, 0 falhou; lint, typecheck e build aprovados |
| `bun run --cwd apps/worker-transportada test:integration` | 0 passou, 7 skip, 0 falhou                             |

Os testes de integração RabbitMQ/SIGTERM foram skipados porque `RABBITMQ_TEST_URL`
não estava definido no ambiente desta execução. Nenhuma credencial fiscal,
SEFAZ, XML real ou secret foi acessado.

## Ambiente local vs E2E

Data: 2026-07-22

A stack dedicada criada em `.env.test` foi reclassificada para uso exclusivo de
E2E/smoke isolado. Os tests comuns continuam usando o ambiente local em `.env`.

Arquivos:

- `Makefile`
- `.env.example`
- `.env.test.example`
- `compose.yaml`
- `apps/worker-transportada/README.md`
- `apps/worker-transportada/test/integration/rabbitmq.integration.ts`
- `apps/api-transportada/src/config/environment.schema.ts`
- `test/keycloak-realm.contract.test.ts`
- `.gitignore`

Comandos disponíveis:

- `make worker-integration`: usa `.env` local para as integrações comuns do worker;
- `make e2e-up`, `make e2e-ps`, `make e2e-down`: usam `.env.test` para a stack
  dedicada de E2E;
- `make test-up`, `make test-down`, `make test-ps`: aliases compatíveis para os
  targets E2E.

### Evidência local

| Comando                                                               | Resultado                                                             |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `ENV_FILE=.env.test.example make config`                              | aprovado                                                              |
| `make e2e-up`                                                         | PostgreSQL, RabbitMQ e MinIO saudáveis no projeto `transportada-test` |
| `make test-worker-integration` enquanto a stack dedicada estava ativa | 4 passou, 0 falhou                                                    |
| `make e2e-down`                                                       | stack dedicada removida                                               |
| `SERVICES="postgres rabbitmq" make up`                                | stack local mínima saudável                                           |
| `make worker-integration`                                             | 4 passou, 0 falhou                                                    |

## T020 — Contracts do relay outbox e idempotência persistente

Data: 2026-07-22

Foram adicionados os contracts do relay de outbox e da idempotência persistente
no worker, cobrindo claim/lease concorrente, publicação confirmada, marcação de
`processed_messages` apenas após sucesso e escopo por empresa/consumer.

Arquivos:

- `apps/worker-transportada/test/outbox-relay.contract.test.ts`
- `apps/worker-transportada/test/processed-message.contract.test.ts`
- `apps/worker-transportada/package.json`

Cobertura contratual introduzida:

- claim de outbox com lease e recuperação após expiração;
- publicação por topologia versionada e marcação de `published_at` somente após
  confirmação do broker;
- efeito idempotente por `(companyId, consumerName, eventId)`;
- ausência de marca persistida quando o efeito falha antes do commit lógico;
- rejeição implícita do uso de `Set` global em memória para deduplicação real.

### Gate local da task

| Comando                                                                               | Resultado                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `bun test test/outbox-relay.contract.test.ts test/processed-message.contract.test.ts` | 5 passou, 0 falhou                                     |
| `bun run --cwd apps/worker-transportada check`                                        | 51 passou, 0 falhou; lint, typecheck e build aprovados |

## T021 — Relay, repositories e lifecycle do worker

Data: 2026-07-22

Arquivos principais:

```text
apps/worker-transportada/src/database/processing.schema.ts
apps/worker-transportada/src/outbox/application/nfe-outbox-publisher.service.ts
apps/worker-transportada/src/outbox/application/outbox-relay-loop.service.ts
apps/worker-transportada/src/outbox/application/outbox-relay.service.ts
apps/worker-transportada/src/outbox/application/persistent-processed-message.service.ts
apps/worker-transportada/src/outbox/infrastructure/drizzle-outbox.repository.ts
apps/worker-transportada/src/runtime/worker-shutdown.service.ts
apps/worker-transportada/src/main.ts
apps/worker-transportada/test/outbox-relay.contract.test.ts
apps/worker-transportada/test/processed-message.contract.test.ts
```

Escopo concluído:

- schema Drizzle local do worker para `processing_outbox` e
  `processed_messages`, sem importar source de outra app;
- repository persistente com claim por lease, `skip locked` e update por par
  `company_id/event_id`, preservando lotes multiempresa;
- marcação de publicação tenant-scoped por `company_id`, `event_id` e
  `claim_owner`;
- idempotência persistente com trava transacional por
  empresa/consumer/evento antes de executar o efeito;
- relay de outbox com publisher por topologia NF-e, separando importação e
  distribuição no RabbitMQ provider pinado;
- loop de relay com polling contínuo, proteção contra reentrada e log seguro de
  falhas sem derrubar o bootstrap;
- bootstrap do worker com três providers RabbitMQ distintos: health/sintético,
  publicação de importação e publicação de distribuição;
- shutdown idempotente expandido para fechar recursos adicionais do runtime
  antes de encerrar provider, banco e health server.

### Revisão 5.5

A revisão encontrou três falhas e todas foram corrigidas antes de seguir:

- claim multiempresa retornava linhas que nem todas recebiam `claim_owner`;
- `markPublished` não recebia `companyId`;
- idempotência fazia `hasProcessed` antes do efeito sem seção crítica
  persistente, permitindo dupla execução horizontal.

### Gates

| Comando                                        | Resultado             |
| ---------------------------------------------- | --------------------- |
| `bun run --cwd apps/worker-transportada check` | 52 passaram, 0 falhou |
| `make worker-integration`                      | 4 passaram, 0 falhou  |

Conclusão: o worker deixa de depender de `Set` em memória para decisão de
efeito real nas partes entregues pela T021, mantém o estado em PostgreSQL e
fica preparado para relay horizontal e restart seguro.

## T022 — Contracts do consumer XML/ZIP

Data: 2026-07-22

Foram adicionados os contracts do consumer de importação NF-e no worker,
cobrindo lote misto, variantes de XML, ZIP adversarial, duplicidade
tenant-scoped, rejeição por CNPJ não relacionado, erro por item e resumo final
parcial.

Arquivos:

- `apps/worker-transportada/test/nfe-import-consumer.contract.test.ts`
- `apps/worker-transportada/test/nfe-import-consumer/nfe-import-consumer.fixture.ts`
- `apps/worker-transportada/test/nfe-import-consumer/mixed-batch.contract.ts`
- `apps/worker-transportada/test/nfe-import-consumer/zip-safety.contract.ts`
- `apps/worker-transportada/package.json`

Cobertura contratual introduzida:

- variantes `authorized-nfe`, `unsigned-nfe` e `nfe-event` no mesmo fluxo de
  consumo;
- validação de pertencimento por `relatedCnpjs`, com rejeição segura quando o
  XML não se relaciona à empresa corrente;
- duplicidade verificada tenant-scoped por chave de acesso, sem interferência de
  outro tenant;
- falha de ZIP adversarial por item, sem interromper o restante do lote;
- erro seguro por item em XML inválido;
- persistência do original final apenas para itens efetivamente importados;
- resumo terminal `PARTIALLY_PROCESSED` com contadores coerentes.

### Gate local esperado da tarefa

| Comando                                                | Resultado                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `bun test ./test/nfe-import-consumer.contract.test.ts` | vermelho esperado: 2 falhas por ausência de `src/nfe-imports/application/nfe-import-consumer.service.ts` |

O vermelho confirma que a T023 deve implementar o módulo de consumo no worker
para processar XML/ZIP item a item, integrar storage/fiscal-provider e fechar o
resumo da importação sem perder isolamento por tenant.

## T023 — Implementar consumer de importação e normalização

Data: 2026-07-22

Foi implementado o consumer de importação NF-e do worker, focado no fluxo de
processamento item a item a partir do envelope persistente já validado pelo
outbox/relay.

Arquivos:

- `apps/worker-transportada/src/nfe-imports/application/nfe-import-consumer.service.ts`
- `apps/worker-transportada/test/nfe-import-consumer.contract.test.ts`
- `apps/worker-transportada/test/nfe-import-consumer/nfe-import-consumer.fixture.ts`
- `apps/worker-transportada/test/nfe-import-consumer/mixed-batch.contract.ts`
- `apps/worker-transportada/test/nfe-import-consumer/zip-safety.contract.ts`
- `apps/worker-transportada/package.json`
- `specs/005-nfe-xml-import/tasks.md`

Comportamento entregue:

- leitura do staging por item e expansão via port dedicado para XML ou ZIP;
- normalização usando `@adatechnology/fiscal-provider` pela interface pública
  `importarNfeXml`, sem depender de internals;
- distinção de variantes `authorized-nfe`, `unsigned-nfe` e `nfe-event`;
- checagem tenant-scoped de duplicidade por chave de acesso;
- rejeição segura de documento sem `relatedCnpjs` compatível com a empresa;
- erro isolado por item para XML inválido e ZIP inseguro, sem interromper o
  restante do lote;
- promoção do original final apenas para itens realmente importados;
- fechamento de resumo terminal com contadores coerentes e
  `partially_processed` quando há mistura de resultados.

### Gates

| Comando                                                | Resultado             |
| ------------------------------------------------------ | --------------------- |
| `bun test ./test/nfe-import-consumer.contract.test.ts` | 2 passou, 0 falhou    |
| `bun run --cwd apps/worker-transportada check`         | 54 passaram, 0 falhou |
| `make worker-integration`                              | 4 passaram, 0 falhou  |

Conclusão: o worker agora possui a camada de consumo e normalização local de
NF-e/ZIP guiada pelos contracts da T022. A ligação desse consumer ao runtime e
ao fluxo completo de startup/shutdown permanece responsabilidade da T026.

## T024 — Contracts do gateway/consumer de distribuição

Data: 2026-07-22

Foram adicionados os contracts do gateway e do consumer de distribuição DFe no
worker, cobrindo montagem do provider A1 em memória, paginação por NSU,
duplicidade por páginas sobrepostas, cursor monotônico, lease persistente e
janela anti-656.

Arquivos:

- `apps/worker-transportada/test/nfe-distribution.contract.test.ts`
- `apps/worker-transportada/test/nfe-distribution/nfe-distribution.fixture.ts`
- `apps/worker-transportada/test/nfe-distribution/gateway.contract.ts`
- `apps/worker-transportada/test/nfe-distribution/consumer.contract.ts`
- `apps/worker-transportada/package.json`

Cobertura contratual introduzida:

- pin exato de `@adatechnology/fiscal-provider@0.2.0`;
- gateway que monta `NfeDistribuicaoConfig` com certificado A1 em memória e sem
  vazar senha em chamadas/erros;
- consumo de `51` DF-es em mais de uma página com sobreposição do mesmo NSU;
- persistência de cursor monotônico `ultNSU/maxNSU` e lease por
  empresa/ambiente;
- deduplicação segura quando a segunda página repete um NSU já persistido;
- tratamento de página vazia com `maxNSU` avançado como janela persistente
  anti-656;
- resultado terminal separado entre `completed` e `rate-limited`.

### Gate local esperado da tarefa

| Comando                                             | Resultado                                                                                                                                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test ./test/nfe-distribution.contract.test.ts` | vermelho esperado: 3 falhas por ausência de `src/nfe-distribution/infrastructure/nfe-distribution-gateway.ts` e `src/nfe-distribution/application/nfe-distribution-consumer.service.ts` |

O vermelho confirma que a T025 deve implementar a camada de gateway e o
consumer de distribuição no worker, com cursor persistente, lease e proteção
anti-656 fora do estado volátil do package fiscal.

## T025 — Implementar distribuição DFe e cursor persistente

Data: 2026-07-22

Foi implementada a base da distribuição DFe no worker, cobrindo o gateway de
acesso ao package fiscal e o consumer paginado com cursor/lease persistentes.

Arquivos:

- `apps/worker-transportada/src/nfe-distribution/infrastructure/nfe-distribution-gateway.ts`
- `apps/worker-transportada/src/nfe-distribution/application/nfe-distribution-consumer.service.ts`
- `apps/worker-transportada/test/nfe-distribution.contract.test.ts`
- `apps/worker-transportada/test/nfe-distribution/nfe-distribution.fixture.ts`
- `apps/worker-transportada/test/nfe-distribution/gateway.contract.ts`
- `apps/worker-transportada/test/nfe-distribution/consumer.contract.ts`
- `apps/worker-transportada/package.json`
- `specs/005-nfe-xml-import/tasks.md`

Comportamento entregue:

- factory de gateway para `NfeDistribuicaoProvider` com config A1 em memória;
- paginação por `ultNSU` até esgotar `temMais`;
- persistência de cursor monotônico `ultNSU/maxNSU` por empresa/ambiente;
- lease lógico por owner estável do consumer de distribuição;
- deduplicação contabilizada quando a página seguinte repete NSU já aceito;
- janela persistente anti-656 via `nextAllowedAt` quando a página retorna vazia;
- resultado operacional agregado com `fetchedCount`, `persistedCount`,
  `duplicatedCount`, `status` e `ultNsu`.

### Gates

| Comando                                             | Resultado             |
| --------------------------------------------------- | --------------------- |
| `bun test ./test/nfe-distribution.contract.test.ts` | 3 passou, 0 falhou    |
| `bun run --cwd apps/worker-transportada check`      | 57 passaram, 0 falhou |
| `make worker-integration`                           | 4 passaram, 0 falhou  |

Conclusão: o worker agora possui a camada de distribuição guiada pelos
contracts da T024. A integração dessa capacidade no bootstrap e no runtime
compartilhado do worker permanece responsabilidade da T026.

## T026 — Integrar bootstrap, readiness e shutdown do worker

Data: 2026-07-22

Foi concluída a integração do runtime do worker para subir os consumers NF-e
por padrão junto com relay, health server e ciclo de shutdown coordenado.

Arquivos:

- `apps/worker-transportada/src/main.ts`
- `apps/worker-transportada/src/runtime/nfe-import-consumer.service.ts`
- `apps/worker-transportada/src/runtime/nfe-distribution-consumer.service.ts`
- `specs/005-nfe-xml-import/tasks.md`

Comportamento entregue:

- o bootstrap deixa de depender de injeção para iniciar os consumers de
  importação e distribuição;
- cada consumer NF-e sobe com `prefetch` do ambiente e valida o envelope
  versionado antes de processar a mensagem;
- eventos publicados na fila errada são isolados com `dead-letter`, sem mistar
  os dois fluxos NF-e;
- shutdown continua drenando consumers antes de storage, RabbitMQ, banco e
  health server;
- readiness permanece degradando corretamente quando storage, banco ou broker
  estão indisponíveis.

### Gates

| Comando                                                   | Resultado                       |
| --------------------------------------------------------- | ------------------------------- |
| `bun test ./test/nfe-runtime.contract.test.ts`            | já verde antes desta integração |
| `bun run --cwd apps/worker-transportada test:integration` | já verde antes desta integração |

Conclusão: o worker agora sobe com relay, consumer sintético opcional e os
dois consumers NF-e no runtime padrão, fechando a cola operacional da T026.

## T027 — Contracts do frontend NF-e

Data: 2026-07-22

Foram adicionados os contratos do workspace NF-e na SPA Vite, cobrindo DTOs,
permissões, cliente HTTP, polling terminal, limpeza de arquivos selecionados e
ausência de cache fiscal nas chamadas.

Arquivos:

- `apps/frontend-transportada/test/nfe-workspace.contract.test.ts`
- `apps/frontend-transportada/test/nfe-workspace/nfe-workspace.fixture.ts`
- `apps/frontend-transportada/test/nfe-workspace/module-imports.contract.ts`
- `apps/frontend-transportada/test/nfe-workspace/client-and-queries.contract.ts`
- `apps/frontend-transportada/test/nfe-workspace/permissions-and-states.contract.ts`
- `apps/frontend-transportada/test/nfe-workspace/polling-and-cleanup.contract.ts`
- `apps/frontend-transportada/package.json`
- `specs/005-nfe-xml-import/tasks.md`

Comportamento especificado:

- tipos públicos para importações, documentos, client, controller, polling e
  view model do workspace NF-e;
- rotas autenticadas com `Authorization`, `Idempotency-Key` e `cache:
'no-store'`;
- permissões `invoices.import` e `invoices.read`, com mutations bloqueadas por
  padrão;
- estados de UI para proibido, vazio, ativo, pronto e erro;
- polling limitado enquanto a importação ativa não está em estado terminal;
- limpeza de arquivos XML/ZIP após sucesso, falha ou reset manual.

### Gates

| Comando                                        | Resultado                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `bun test test/nfe-workspace.contract.test.ts` | vermelho esperado: 0 passou, 5 falharam por módulos `src/modules/nfe-workspace/*` ainda inexistentes |

Conclusão: T027 está concluída como contrato vermelho proporcional. A T028
deve implementar o módulo `nfe-workspace` e tornar esses contratos verdes.

## T028 — Implementar workspace Vite de importações e NF-e

Data: 2026-07-22

Foi implementado o módulo `nfe-workspace` na SPA, cobrindo cliente HTTP,
controller, polling de importações ativas, view model, i18n e uma tela
operacional para upload XML/ZIP, disparo de distribuição, consulta de
processamentos e listagem de NF-e importadas.

Arquivos:

- `apps/frontend-transportada/src/modules/nfe-workspace/shared/nfeWorkspaceClient.service.ts`
- `apps/frontend-transportada/src/modules/nfe-workspace/shared/nfeWorkspaceViewModel.service.ts`
- `apps/frontend-transportada/src/modules/nfe-workspace/hooks/useNfeWorkspace.hook.ts`
- `apps/frontend-transportada/src/modules/nfe-workspace/components/NfeWorkspaceHeader.component.tsx`
- `apps/frontend-transportada/src/modules/nfe-workspace/components/NfeUploadPanel.component.tsx`
- `apps/frontend-transportada/src/modules/nfe-workspace/components/NfeImportQueue.component.tsx`
- `apps/frontend-transportada/src/modules/nfe-workspace/components/NfeDocumentList.component.tsx`
- `apps/frontend-transportada/src/modules/nfe-workspace/pages/NfeWorkspace.page.tsx`
- `apps/frontend-transportada/src/modules/nfe-workspace/styles/nfeWorkspace.module.css`
- `apps/frontend-transportada/src/modules/nfe-workspace/locales/nfeWorkspace.locale.json`
- `apps/frontend-transportada/src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json`
- `apps/frontend-transportada/src/modules/shared/i18n/i18n.service.ts`
- `apps/frontend-transportada/src/main.tsx`
- `apps/frontend-transportada/package.json`
- `specs/005-nfe-xml-import/tasks.md`

Comportamento entregue:

- cliente autenticado com `Authorization`, `Idempotency-Key` e `cache:
'no-store'` para upload, distribuição, reprocessamento, listagem e download
  de XML;
- permissões `invoices.import` e `invoices.read` refletidas no controller e na
  apresentação;
- polling automático apenas enquanto a importação mais recente estiver em
  estado não terminal;
- limpeza dos arquivos selecionados após envio com sucesso, falha ou reset;
- página principal da SPA trocada para o workspace NF-e, usando o mesmo stack
  React Query, Keycloak e i18n do app.

### Gates

| Comando                                        | Resultado                                       |
| ---------------------------------------------- | ----------------------------------------------- |
| `bun test test/nfe-workspace.contract.test.ts` | 5 passou, 0 falhou                              |
| `bun run check`                                | aprovado (`lint`, `typecheck`, `test`, `build`) |

Conclusão: T028 está concluída com o workspace NF-e implementado e o contrato
da T027 verde dentro do gate agregado do frontend.

## T029 — Jornada responsiva e permissões com Playwright

Data: 2026-07-22

Foi atualizada a suíte Playwright para validar o workspace NF-e em vez da tela
antiga de configurações fiscais, cobrindo operador, viewer e usuário sem
permissões nos fluxos críticos do frontend.

Arquivos:

- `apps/frontend-transportada/test/responsive.smoke.spec.ts`
- `apps/frontend-transportada/test/nfe-workspace-smoke.helper.ts`
- `apps/frontend-transportada/test/certificate-residue-audit.helper.ts`
- `apps/frontend-transportada/src/modules/nfe-workspace/components/NfeUploadPanel.component.tsx`
- `apps/frontend-transportada/src/modules/nfe-workspace/components/NfeImportQueue.component.tsx`
- `apps/frontend-transportada/src/modules/nfe-workspace/pages/NfeWorkspace.page.tsx`
- `apps/frontend-transportada/src/modules/nfe-workspace/styles/nfeWorkspace.module.css`
- `.env`
- `.env.example`
- `specs/005-nfe-xml-import/tasks.md`

Comportamento validado:

- operador vê upload, distribuição, reprocessamento e documentos em 375, 768 e
  1280 px sem overflow horizontal;
- viewer com `invoices.read` consulta importações/documentos, mas não vê
  upload, distribuição ou reprocessamento;
- usuário sem permissões de NF-e recebe fronteira fechada sem disparar
  mutations;
- upload XML limpa o input de arquivo e não deixa payload fiscal em DOM,
  localStorage, sessionStorage, IndexedDB ou Cache Storage;
- download de XML não é cacheado pela service worker da SPA;
- autenticação Keycloak continua sem persistir tokens e falha fechada quando o
  refresh token expira.

### Ajuste de ambiente local

O smoke revelou que o worker estava degradado porque a senha local de storage
em `.env` divergia da senha do MinIO no Compose. A configuração local foi
alinhada e o bucket `transportada-local` foi criado no MinIO local antes do
gate.

### Gates

| Comando                                          | Resultado                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `bun run --cwd apps/frontend-transportada check` | aprovado (`lint`, `typecheck`, `test`, `build`)                     |
| `make smoke`                                     | aprovado: 10 Playwright passaram, API/worker/MinIO/Keycloak prontos |

Conclusão: T029 está concluída com cobertura responsiva, permissões e ausência
de resíduo fiscal no browser.

## T030 — Integração real local de ponta a ponta

Data: 2026-07-22

Foi executada a trilha completa de integração local exigida pela spec, com
ajuste prévio do banco de desenvolvimento após detectar que o worker falhava no
relay do outbox porque o schema local ainda não refletia todas as migrations da
feature.

### Diagnóstico e alinhamento do ambiente local

Antes do gate principal, o banco local `transportada` continha apenas 11
tabelas legadas e somente 3 registros em `drizzle.__drizzle_migrations`. Isso
explicava os erros do worker: `processing_outbox`, `processed_messages`,
`nfe_imports` e demais tabelas da feature ainda não existiam no ambiente local.

Foi aplicado manualmente:

```text
bun run --cwd apps/api-transportada db:migrate
```

Após o alinhamento:

- o journal passou a 5 migrations aplicadas;
- o schema local passou a incluir `nfe_imports`, `nfe_import_items`,
  `nfe_documents`, `processing_outbox`, `processed_messages`,
  `stored_objects`, `nfe_distribution_cursors`, `nfe_events`,
  `nfe_participants`, `nfe_addresses`, `nfe_products` e `nfe_volumes`.

### Gates executados

| Comando                                                 | Resultado      |
| ------------------------------------------------------- | -------------- |
| `make up && make migration-test`                        | aprovado       |
| `make dev` gerenciado                                   | aprovado       |
| `make smoke`                                            | aprovado       |
| `make down`                                             | aprovado       |
| verificação final das portas `53000`, `53001` e `53002` | zero listeners |

### Evidência operacional

- `make up` subiu PostgreSQL, RabbitMQ, MinIO, Mailpit e Keycloak locais com
  healthchecks verdes;
- `make migration-test` validou as contracts de migration/rollback/reapply e o
  seed local de identidade, com 9 testes aprovados;
- `make dev` iniciou API, worker e frontend com readiness estável:
  - frontend disponível em `http://localhost:53000/`;
  - API `health/live` e `health/ready` com `status: "ok"` e dependências
    `database: "up"` / `identity: "up"`;
  - worker `health/live` e `health/ready` com `status: "ok"` e dependências
    `database: "up"`, `rabbitmq: "up"` e `storage: "up"`;
- `make smoke` executou a suíte Playwright do frontend NF-e e concluiu com
  `10 passed`;
- o processo `make dev` foi encerrado explicitamente após o smoke;
- `make down` removeu todos os containers locais e a rede Docker do projeto;
- a verificação final não encontrou processos escutando nas portas da stack de
  desenvolvimento.

Conclusão: T030 está concluída com integração local ponta a ponta validada,
worker saudável após alinhamento do schema e teardown limpo do ambiente.

## T031 — Evidência consolidada e revisão independente de release

Data: 2026-07-22

Foi executada a revisão final de release da feature 005, cobrindo gates
agregados, dependências pinadas, ausência de artefatos fiscais sensíveis no Git
e confirmação de que nenhum deploy remoto ou chamada real à SEFAZ foi
executado.

### Achados corrigidos durante a revisão

- `FRONTEND_ORIGIN` aceitava host HTTPS com letras maiúsculas. A validação foi
  ajustada para aceitar somente origem HTTPS canônica lowercase ou
  `http://localhost`, e `apps/api-transportada/test/cors.contract.test.ts`
  confirmou `33 pass`.
- O segundo cenário de `nfe-runtime.contract.test.ts` declarava que os
  consumers deveriam ser injetados diretamente, mas não injetava starters no-op
  e acabava chamando o fake provider. A fixture foi completada e o contrato
  isolado confirmou `2 pass`.
- Arquivos da feature estavam fora da formatação esperada; o Prettier foi
  aplicado aos arquivos versionáveis modificados e o gate agregado confirmou
  formatação verde.

### Gates finais

| Comando                         | Resultado                            |
| ------------------------------- | ------------------------------------ |
| `bun install --frozen-lockfile` | aprovado, sem alterações no lockfile |
| `make check`                    | aprovado                             |
| `make migration-test`           | aprovado, 9 testes de migration/seed |
| `git diff --check`              | aprovado                             |
| `make down`                     | aprovado                             |

### Evidência de release

- `make check` executou `format:check`, `lint`, `typecheck`, testes agregados e
  build dos três apps;
- a API fechou os contracts agregados com `358 pass`, `1 skip` intencional do
  teste de migration integrado fora de `DRIZZLE_TEST_DATABASE_URL` e `0 fail`;
- o worker fechou os contracts agregados com `59 pass` e `0 fail`;
- o frontend fechou os contracts agregados com `38 pass` e `0 fail`;
- os builds da API, worker e frontend foram gerados com sucesso;
- `make migration-test` subiu PostgreSQL descartável, aplicou os testes de
  migration/rollback/reapply e removeu a infraestrutura depois de `make down`;
- a busca por dependências Ada frouxas não encontrou `file:`, `workspace:`,
  ranges `^`/`~` ou `latest` para os providers fiscal, storage e RabbitMQ;
- a busca por artefatos versionados não encontrou `.pfx`, `.p12`, `.pem`,
  `.key`, `.crt`, `.cer`, XML ou PDF em `example/` no índice Git;
- a busca por chaves privadas, variáveis secretas críticas e comandos de deploy
  remoto não encontrou payload acionável. As ocorrências de `SEFAZ`, `PFX` e
  `Railway` restantes são documentação, nomes de contrato, mensagens seguras ou
  testes sintéticos.

Conclusão: T031 está concluída sem achado crítico remanescente. A feature 005
está com evidência consolidada, gates locais verdes e sem publicação remota,
chamada real à SEFAZ, PFX real, XML fiscal real ou segredo versionado.

## Revisão extra — filtros avançados da workspace de importação NF-e

Data: 2026-07-23

Objetivo:

- cobrir filtros de status e origem por operação de igualdade e diferença;
- manter todos os campos de contador com operadores `Eq/Ne/Gt/Gte/Lt/Lte`;
- incluir ação de limpeza de filtros para reduzir busca manual entre execuções.

Arquivos alterados:

- `apps/frontend-transportada/src/modules/nfe-workspace/pages/NfeWorkspace.page.tsx`
- `apps/frontend-transportada/src/modules/nfe-workspace/locales/nfeWorkspace.locale.json`

Observação:

- os contratos de client/queries já existentes já validam os parâmetros
  `Ne`/`Eq` no backend-facing query strings.

Verificação local (agregada no gate):

```text
bun run --cwd apps/frontend-transportada check
```

Evidência:

- filtros `sourceNe`, `statusNe`, `id/ne` e contadores avançados seguem disponíveis
  no workspace;
- `Limpar filtros` padroniza estado limpo e facilita nova busca.

## Remediação do consumer de importação NF-e (R01–R03)

Data: 2026-07-24

Contexto:

- o `nfe-import` consumer do worker era um stub que apenas dava `ack` na
  mensagem — nenhum lote saía de `Na fila · 0/N`. A remediação segue as tasks
  R01–R09 de `tasks.md`, uma por vez, com contrato antes da implementação.

R01 — schema NF-e duplicado por valor no worker:

- `apps/worker-transportada/src/database/nfe.schema.ts` recebeu
  `company_fiscal_profiles` (necessário para o CNPJ do tenant em
  `getPendingImport`), espelhando colunas/constraints da API sem redeclarar FKs
  cross-app; `companyId` explícito em toda linha.

R02 — contract test de integração (RED antes da implementação):

- `apps/worker-transportada/test/nfe-import-repository.integration.test.ts`
  cobre `getPendingImport` (agregado tenant-scoped + isolamento por tenant),
  `findExistingDocument`, `completeItem` (grava `stored_objects` final +
  `nfe_documents` + participantes em transação) e `finalizeImport` (contadores
  bigint + status parcial). Falhava por ausência do módulo do repository.
- registrado em `package.json` (`test:integration`).

R03 — `DrizzleNfeImportConsumerRepository`:

- `apps/worker-transportada/src/nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.ts`
  implementa as 4 portas do `NfeImportConsumerRepositoryPort`. `completeItem`
  deriva `companyId`/`importId` da linha do item, insere em transação o
  `stored_objects` final (`purpose` `nfe_document`/`nfe_event`, `status`
  `final`) e o `nfe_documents` (ou `nfe_events`) com filhos
  (participantes/produtos/volumes), idempotente via `onConflictDoNothing` nos
  uniques documentados; toda query é tenant-scoped por `companyId`; conversões
  bigint↔number nos contadores/ordinais. XML sensível não é logado.

Verificação local:

```text
bun run --cwd apps/worker-transportada check
# lint + typecheck + 78 contract tests + build — verde
(cd apps/worker-transportada && DATABASE_URL=… bun test ./test/nfe-import-repository.integration.test.ts)
# 5 pass / 0 fail / 32 expect()
```

R04 — adapters de storage (source read + final create-only):

- `apps/worker-transportada/src/nfe-imports/infrastructure/nfe-import-storage.gateway.ts`
  expõe `createNfeImportSourceStorage` (`readSource` lê o staging via
  `gateway.getObjectStream`) e `createNfeImportFinalStorage`
  (`storeImportedDocument`/`storeImportedEvent`). Ambos gravam em chave final
  imutável e opaca por documento/evento
  (`tenants/${companyId}/nfe-documents/${accessKey}/original.xml` e
  `tenants/${companyId}/nfe-events/${accessKey}/${type}-${sequence}.xml`) via
  `storeObject` create-only — replay idempotente para bytes idênticos e falha
  fatal quando a chave já guarda conteúdo diferente (delegado ao gateway). XML
  fiscal não é logado.
- contract test `apps/worker-transportada/test/nfe-import-storage.contract.test.ts`
  (RED→GREEN) com gateway fake em memória: `readSource` devolve os bytes do
  staging; `storeImportedDocument` grava create-only na chave imutável com
  `objectId`/`sha256`/`sizeBytes`; replay idempotente (2 puts, 1 objeto);
  conteúdo divergente na mesma chave rejeita; `storeImportedEvent` usa a chave
  por evento. Registrado no script `test` do `package.json`.

Verificação local:

```text
bun run --cwd apps/worker-transportada check
# lint + typecheck + 83 contract tests + build — verde
```

R05 — archive expander (XML passthrough + ZIP seguro):

- `apps/worker-transportada/src/nfe-imports/infrastructure/nfe-import-archive-expander.gateway.ts`
  implementa `createNfeImportArchiveExpander`. `application/xml` passa o
  conteúdo adiante sem alteração (sha256 recalculado). `application/zip`
  extrai só entradas `.xml` via `fflate.unzipSync` com `filter`, aplicando as
  defesas do plano **antes** de descomprimir (usa `originalSize`/`size`/
  `compression` do diretório central): ratio > 20:1 e limites de contagem
  (500), tamanho por entrada (5 MiB) e total (100 MiB) → `ZIP_EXPANSION_LIMIT`/
  `ZIP_ENTRY_TOO_LARGE`; nomes com `..`, `/` inicial, `\`, `NUL` ou drive
  Windows → `ZIP_PATH_TRAVERSAL`; entrada `.xml` vazia → `ZIP_EMPTY_ENTRY`;
  arquivo sem XML → `ZIP_NO_XML_ENTRIES`; zip corrompido → `ZIP_INVALID_ARCHIVE`.
  Todos os códigos com prefixo `ZIP_`, que o `createNfeImportConsumer` mapeia
  para item `invalid` (não `failed`). Limites parametrizáveis por opção para
  teste. `fflate@0.8.3` adicionado como dependência (unzip seguro, TS nativo,
  zero deps, roda no Bun).
- contract test `apps/worker-transportada/test/nfe-import-archive-expander.contract.test.ts`
  (RED→GREEN, 9 casos) com ZIPs reais construídos por `fflate.zipSync`:
  passthrough de XML; extração de 1 e de N XMLs (ordenados, ignorando `.txt`);
  path traversal; entrada vazia; ausência de XML; zip-bomb por ratio; estouro
  de contagem; estouro de tamanho por entrada. Registrado no script `test`.
  O `zip-safety.contract.ts` (expander fake no nível do consumer) segue verde.

Verificação local:

```text
bun run --cwd apps/worker-transportada check
# lint + typecheck + 92 contract tests + build — verde
```

R06 — `NfeXmlImporterPort` sobre `fiscal-provider.importXml`:

- `apps/worker-transportada/src/nfe-imports/infrastructure/nfe-xml-importer.gateway.ts`
  expõe `createNfeXmlImporter`, adapter fino sobre `importarNfeXml` (função
  síncrona pura do pacote: parse/validação, sem rede nem segredo). Envolve a
  chamada num `async importXml({ xml })`, encaminha o XML cru sem regra própria
  e deixa o `NfeXmlImportError` do pacote propagar intacto (o consumer usa
  `error.code` `NFE_XML_*` para classificar item `invalid`). A função
  subjacente é injetável por opção para teste.
- contract test `apps/worker-transportada/test/nfe-xml-importer.contract.test.ts`
  (RED→GREEN, 3 casos): delega o XML cru e resolve o documento parseado;
  propaga `NfeXmlImportError` (com `code`) sem alterar; e, sem injeção, fia o
  `importarNfeXml` real e rejeita XML inválido como `NfeXmlImportError`.
  Registrado no script `test`.

Verificação local:

```text
bun run --cwd apps/worker-transportada check
# lint + typecheck + 95 contract tests + build — verde
```

R07 — handler idempotente + rewire do runtime consumer:

- `apps/worker-transportada/src/nfe-imports/application/nfe-import-worker-message-handler.service.ts`
  novo `NfeImportWorkerMessageHandler`, espelhando `CteIssuanceWorkerMessageHandler`.
  Fluxo: `hasProcessed` → ack (efeito não roda); senão `effect.execute` →
  `markProcessed` → ack (marca de idempotência só após o efeito comitar os
  contadores em `finalizeImport`). `NfeImportFatalError` → `markDeadLettered` +
  dead-letter; `NfeImportRecoverableError` e qualquer falha não classificada
  (ex.: o `Error('NF-e import not found for worker consumption')` do efeito) →
  backoff persistente via `calculateNfePersistentBackoff` (retry) até
  `NFE_IMPORT_BACKOFF_ATTEMPTS_MS.length` tentativas, então dead-letter. Chave de
  idempotência = `{ companyId, eventId }` (+ `importId` no payload do marcador);
  isolamento por empresa comprovado em teste.
  - Desvio consciente vs. CTE: onde o CTE relança erro desconhecido, o NF-e roteia
    para o caminho recuperável (retry limitado → dead-letter). Reler o import não
    tem efeito fiscal colateral, então backoff limitado + DLQ observável é mais
    seguro que hot-loop de requeue infinito. Documentado aqui.
- `apps/worker-transportada/src/runtime/nfe-import-consumer.service.ts`
  `startNfeImportConsumer` reescrito: agora recebe `effect` + `repository`,
  constrói o handler e delega. Mantém `decode` via `nfeProcessingEnvelopeV1Schema`,
  dead-letter em tipo de evento inesperado (não `IMPORT_REQUESTED`), log
  `nfe_import_consumer_received` e `attempt = retryCount ?? 0` — espelho exato de
  `startCteIssuanceConsumer`. O stub que só dava ack (causa do lote travado em
  `0/N`) foi removido.
- contract sub-suite `apps/worker-transportada/test/nfe-import-consumer/handler.contract.ts`
  (RED→GREEN, 7 casos), importada em `test/nfe-import-consumer.contract.test.ts`:
  ack só após efeito + marca (ordenação com deferreds); redelivery não duplica
  efeito; backoff persistido antes de retry; falha não classificada tratada como
  recuperável; dead-letter ao atingir o limite finito; idempotência isolada por
  empresa+evento; falha permanente vai direto à DLQ.

Verificação local:

```text
bun test ./test/nfe-import-consumer.contract.test.ts ./test/nfe-runtime.contract.test.ts
# 12 pass / 0 fail (7 do handler + mixed-batch + zip-safety + runtime)
```

Nota: o `main.ts` ainda injeta o stub antigo; a assinatura nova de
`startNfeImportConsumer` (effect+repository) é conectada em R08, que fecha o
`typecheck`/`check` completo. `nfe-runtime.contract.test.ts` mocka
`startImportConsumer`, então a mudança de assinatura não o quebra.

## R08 — Injeção de adapters no `main.ts`

- `apps/worker-transportada/src/nfe-imports/infrastructure/drizzle-nfe-import-worker.repository.ts`
  (novo) `DrizzleNfeImportWorkerRepository` implementa `NfeImportWorkerRepository`
  com `consumerName = 'nfe-import-worker'`. `hasProcessed`/`markProcessed`/
  `markDeadLettered` operam em `processed_messages` pela chave
  `(companyId, consumerName, eventId)`; `result` guarda `{ importId }` (+`reason`
  no dead-letter). `scheduleRetry` atualiza `processing_outbox`
  (`attempt = BigInt`, `nextAttemptAt`, `updatedAt`) filtrando por
  `companyId + eventId` — **não** copia o `status:'retry_scheduled'` do CTE (a
  tabela não tem coluna `status`) e **não** limpa `publishedAt` (evita entrega
  dupla pelo relay, que publica `WHERE published_at IS NULL`).
- `apps/worker-transportada/src/main.ts`: tipo da dependência `startImportConsumer`
  ampliado para `{ config, effect, logger, provider, repository }`
  (`NfeImportWorkerEffect` + `NfeImportWorkerRepository`). No call site, o efeito
  real é construído via `createNfeImportConsumer({ archiveExpander, finalStorage,
repository: new DrizzleNfeImportConsumerRepository(...), sourceStorage,
xmlImporter })` e o `repository` de idempotência via
  `new DrizzleNfeImportWorkerRepository(...)` — bloco análogo ao
  `cteIssuanceStarter`. `sourceStorage`/`finalStorage` compartilham o
  `storageGateway` e o bucket resolvido de `OBJECT_STORAGE_BUCKET ??
STORAGE_BUCKET ?? 'transportada-private'`. `database.db` sofre o mesmo cast
  `as ReturnType<typeof createDrizzleProvider>['db']` usado no CTE. Readiness e a
  lista de shutdown (`importConsumer` entre os consumidores cancelados)
  permanecem intactos.

Verificação local (gate completo):

```text
bun run --cwd apps/worker-transportada check
# lint (eslint --max-warnings=0) OK
# typecheck (tsc --noEmit) OK
# 102 pass / 0 fail (21 arquivos)
# build (bun build ./src/main.ts) OK — main.js 103.11 KB, 49 módulos
```

Pendências: R09 (integração real ponta a ponta: `make up && make
worker-integration && make smoke`, lote misto saindo de `0/N` para contadores
reais no Postgres).

## R09 — Integração real ponta a ponta + evidência

Stack local reiniciada sobre o código R08 (`make dev`, projeto
`transportada-local`). Readiness confirmada antes do teste:

```text
worker /health → 200 {"dependencies":{"database":"up","rabbitmq":"up","storage":"up"},"status":"ok"}
api    /health → 200 {"dependencies":{"database":"up","identity":"up"},"status":"ok"}
```

### Comprovação do fix (lote sai de `0/N` para contadores reais)

Dois lotes mistos foram enviados via `POST /nfe-imports/xml` (multipart, JWT de
tenant do contexto autenticado — `companyId` nunca do payload) e processados
**pelo worker real** (consumidor `nfe-import` + `DrizzleNfeImportConsumerRepository`

- outbox relay), cobrindo as quatro classificações:

Lote 2 — `8b74a730-9459-4e93-bd15-79d245dc40fe` (`válido`/`duplicado`/`inválido`):

```text
status=partially_processed | received=3 processed=3
imported=1 duplicated=1 invalid=1 rejected=0 failed=0
```

Itens (`nfe_import_items`):

| ordinal | source          | status     | detalhe                                       |
| ------- | --------------- | ---------- | --------------------------------------------- |
| 1       | 3526…978623.xml | imported   | access_key 3526…978623 (emitente relacionado) |
| 2       | 3526…978623.xml | duplicated | mesmo access_key já importado no item 1       |
| 3       | broken-nfe.xml  | invalid    | error `{"code":"NFE_XML_INVALID_STRUCTURE"}`  |

Lote 1 — `b10e73a4-2d72-448c-af87-270a43fb0f96` (caminho `CNPJ alheio`, antes de
corrigir o CNPJ do perfil fiscal):

```text
status=partially_processed | received=3 processed=3
imported=0 duplicated=0 invalid=1 rejected=2 failed=0
```

### Preservação do XML original + hash

`nfe_documents` ⨝ `stored_objects` (item importado do lote 2):

```text
access_key    = 35260705868574001090550020008526741408978623
xml_sha256    = 9b241d14cd789afc06a5d1d6b26849ef2c386935a777afbb45cd3ee675d5c79d
object_sha256 = 9b241d14cd789afc06a5d1d6b26849ef2c386935a777afbb45cd3ee675d5c79d
hash_matches  = true
object_key    = tenants/00000000-…-0001/nfe-documents/3526…978623/original.xml
```

O `source_sha256` gravado no item (`9b241d14…`) é idêntico ao `xml_sha256` do
documento — XML original preservado byte-a-byte, sem reescrita. Outbox
`processing_outbox.published_at` fica preenchido após a publicação; item inválido
não gera documento.

### Suítes automatizadas

```text
make worker-integration → bun test (rabbitmq + sigterm + nfe-import-repository)
  9 pass / 0 fail (3 arquivos)
make smoke → 9 pass / 12 fail
```

Os 12 testes que falham em `make smoke` são de `responsive.smoke.spec.ts` e são
**pré-existentes e alheios a esta feature** (telas de `billing` e `cte-batch`:
overflow horizontal + violação de strict-mode no seletor
`'Fatura cancelada com sucesso.'`). Confirmado via `git diff --name-only HEAD`
que decorrem de trabalho de UI de billing/CT-e não commitado, não do worker de
importação (mudança 005 é worker-only). Os specs de NF-e/health passam.

### Diagnóstico de infraestrutura (não é bug de código)

O lote 2 ficou preso em `queued|proc=0` por um **processo worker órfão** de sessão
de debug anterior (`bun src/main.ts`, PID 40817, cwd `apps/worker-transportada`),
cujo relay (`claim_owner = transportada.debug.sigterm.relay.*`) reivindicava a
linha do outbox e renovava o lease sem publicar, faminto o worker vivo. Após
`kill` do processo órfão e liberação do claim órfão
(`claim_owner=null, claim_expires_at=null`), o relay real publicou em ~1s e o
worker processou o lote imediatamente. Nenhuma alteração de código foi necessária
— o pipeline R08 funciona; era contaminação de ambiente local.

Critério de aceite R09 satisfeito: lote misto (válido/duplicado/inválido/CNPJ
alheio) processa pelo worker real; original e hash preservados; contadores e
status por item corretos; lote sai de `0/N` para contadores reais no Postgres.

## Incremento — Persistência da visão da tabela "Notas" (view-preferences)

Substitui a persistência por-navegador (`localStorage`) por persistência
**por-usuário no banco**, salvando a **visão completa** da data-table de NF-e
(ordem/visibilidade de colunas, `pageSize`, ordenação, filtros simples e a pill
de filtro avançado salvo). O módulo backend é genérico e reutilizável por
`viewKey`; primeira chave consumidora: `nfe-workspace.documents`. O
`localStorage` permanece como cache de partida rápida (write-through); o banco é
autoritativo.

### Backend (contrato)

- `GET /view-preferences?viewKey=<key>` → `{ data: ViewPreferencesRecord | null }`
- `PUT /view-preferences` body `{ preferences, viewKey }` (JSON) →
  `{ data: ViewPreferencesRecord }`
- `ViewPreferencesRecord = { preferences: Record<string, unknown>; updatedAt }`;
  ambos com `cache-control: no-store`.
- Tabela `view_preferences` em migration aditiva com rollback ao lado
  (`drizzle/20260724220724_view_preferences/`), única por `(company_id, user_id,
view_key)`; `companyId`/`userId` derivados do contexto autenticado, nunca do
  payload. Teste de isolamento de tenant em
  `test/view-preferences-schema/tenant-safety.contract.ts`.

### Frontend — Task #12 (client + hook + wiring)

Cliente HTTP por módulo (`viewPreferencesClient.service.ts`, `fetch` injetado),
serialização tolerante (`viewPreferences.serialization.ts`, defaults completos
para payload malformado, sobrevive à fronteira JSON do tipo coluna do banco),
wrapper `useTableViewPreferences.hook.ts` (TanStack Query `retry:false`,
`staleTime` 30s; mutation com debounce de 800ms; write-through no cache local) e
fiação em `NfeDocumentTable.component.tsx`. O `useNfeDocumentTable.hook.ts` ganhou
o parâmetro opcional `preferences` com hidratação única guardada por refs
(seed a partir do cache → hidrata do backend só se o usuário ainda não editou →
write-through nas edições); sem `preferences`, mantém o caminho legado de coluna
por `localStorage` (retrocompatível para os testes existentes do hook).

Ciclo de módulo evitado: `TableViewPreferences` mora no hook e é re-exportado
(type-only) pela serialização — nenhuma importação de runtime da serialização
para o hook.

Teste de contrato **antes** da implementação:
`test/nfe-workspace/view-preferences-client.contract.ts` (5 testes: GET
autenticado no-store com `viewKey` na query; `null` quando não há visão salva;
PUT JSON autenticado carregando `preferences`+`viewKey` no corpo; envelope
malformado rejeita `VIEW_PREFERENCES_RESPONSE_INVALID`; falha de rede
`VIEW_PREFERENCES_REQUEST_FAILED`), registrado no entrypoint agregado
`test/nfe-workspace.contract.test.ts`.

Gate (frontend):

```text
bun run typecheck          → OK (tsc --noEmit)
bun run lint               → arquivos deste incremento limpos
bun test nfe-workspace     → 39 pass / 0 fail / 138 expect()
bun run build              → OK (index-*.js 513.52 kB, PWA sw.js gerado)
```

Os 2 achados restantes de `bun run lint` (em
`company-settings/CompanySettingsForm.component.tsx:118` e
`companySettingsClient.service.ts:12`) são **pré-existentes e alheios a este
incremento** — pertencem ao trabalho não-commitado de billing/company-settings
(confirmado via `git status`, módulo inteiro marcado `M`), não ao nfe-workspace.

---

## Remediação distribuição DF-e — D02/D03 (cursor repository)

Teste de contrato de integração **antes** da implementação (RED):
`apps/worker-transportada/test/nfe-distribution-cursor-repository.integration.test.ts`,
registrado em `apps/worker-transportada/package.json` `test:integration`.

RED confirmado (D02) sem a implementação:

```text
error: Cannot find module '../src/nfe-distribution/infrastructure/drizzle-nfe-distribution-cursor.repository.js'
0 pass / 1 fail / 1 error
```

Implementação (D03):
`apps/worker-transportada/src/nfe-distribution/infrastructure/drizzle-nfe-distribution-cursor.repository.ts`
— `acquireLease` (upsert do cursor + UPDATE guardado por `lease_owner IS NULL OR
lease_expires_at <= now`, `RETURNING`), `releaseLease` e `saveCursor`, ambos
escopados por `(company_id, environment, lease_owner)`.

GREEN contra Postgres local (`127.0.0.1:55432`, tabela já migrada):

```text
DATABASE_URL=…@localhost:55432/transportada bun test nfe-distribution-cursor-repository.integration
6 pass / 0 fail / 21 expect()
```

Cobertura: cria cursor no 1º `acquireLease` com NSU default `000000000000000`;
lease válido de outro dono retorna `null`; `saveCursor` avança `ult_nsu`/`max_nsu`
(monotônico) e grava `next_allowed_at`; `releaseLease` zera par `lease_owner`/
`lease_expires_at` (constraint `lease_check`); lease expirada é roubada; cursores
isolados por tenant. `typecheck` verde (`tsc --noEmit`, sem saída).

---

## Remediação distribuição DF-e — D04/D05 (persistPage + contadores + eventos)

Teste de contrato de integração **antes** da implementação (RED):
`apps/worker-transportada/test/nfe-distribution-repository.integration.test.ts`,
registrado em `apps/worker-transportada/package.json` `test:integration`.

RED confirmado (D04) sem a implementação:

```text
error: Cannot find module '../src/nfe-distribution/infrastructure/drizzle-nfe-distribution.repository.js'
```

Implementação (D05):
`apps/worker-transportada/src/nfe-distribution/infrastructure/drizzle-nfe-distribution.repository.ts`
— `persistPage`: uma execução = uma linha `nfe_imports` (`source='distribution'`);
cada DFe da página vira uma linha `nfe_import_items` criada pelo próprio
`persistPage` (a API não conhece os NSUs de antemão), carregando
`variant`/`accessKey`/`source_nsu`/`environment`. Kernel de escrita de documento
(`writeDocumentChildren`, participantes/endereços/produtos/volumes) **reusado por
export** do repositório de import — fonte única, sem cópia. Variantes:
`complete`→`nfe_documents` (`source='distribution'`, elegível a CT-e),
`event`→`nfe_events`, `summary`→apenas `nfe_import_items` (resumo preservado e
correlacionado). Dedup de replay por `(company_id, import_id, source_nsu)` +
`onConflictDoNothing` em documento/evento/objeto.

Contadores de `nfe_imports` respeitam a invariante do banco
(`nfe_imports_counters_check`: `processed = imported + duplicated + invalid +
rejected + failed` e `processed <= received`). Como toda linha de item aceita
grava `status='imported'` (igual ao fluxo de import), `imported_count` soma os
itens aceitos (documento + evento + resumo), não só documentos; o detalhamento
`documentCount`/`eventCount`/`summaryCount` fica no `PersistPageResult` para a
tela de execução (D12), não na coluna do banco.

GREEN contra Postgres local (`127.0.0.1:55432`, tabelas já migradas):

```text
DATABASE_URL=…@localhost:55432/transportada bun test nfe-distribution-repository.integration
3 pass / 0 fail / 38 expect()
```

Cobertura: (1) persiste documento+evento+resumo com proveniência de distribuição
— `source='distribution'`, `import_id`, `created_by_user_id`, papéis
`['emitter','recipient']`, evento `110111`/`sequence=1`/`source_nsu`/`environment`,
3 itens ordenados por `source_nsu` todos `status='imported'`/`environment=homologation`,
3 objetos `status='final'`, contadores `received=3 processed=3 imported=3
duplicated=0`; (2) replay da mesma página não duplica (accepted=0, duplicated=3,
segue 1 documento / 1 evento / 3 itens); (3) isolamento por tenant (outra empresa
enxerga 0 documentos). `typecheck` verde (`tsc --noEmit`, sem saída).

## D06 — `NfeDistributionProfilePort.loadConfig` (perfil + certificado A1)

`DrizzleNfeDistributionProfileRepository.loadConfig({ companyId })` monta o
`NfeDistributionRuntimeConfig` a partir do `company_fiscal_profiles` (cnpj,
`environment`, `state`→`uf`) e do certificado A1 ativo (`purpose='cte'`,
`status='active'`, ordenado por `created_at`/`version` desc). Reusa o
`createDigitalCertificateSecretService` do CT-e para decifrar o `secret_envelope`
(mesma AAD `transportada:certificate:v1:${companyId}:${certificateId}:cte`),
sem duplicar cripto. **Falha fechado**: sem perfil →
`NFE_DISTRIBUTION_PROFILE_MISSING`; sem certificado ativo/envelope →
`NFE_DISTRIBUTION_CERTIFICATE_MISSING`; CNPJ validado do certificado divergente do
perfil → `NFE_DISTRIBUTION_CERTIFICATE_CNPJ_MISMATCH` (perfil fiscal tem de bater
com o certificado). Nenhum log de certificado/senha.

RED inicial: o teste falhava no round-trip do `secret_envelope` jsonb — semeado
via `${JSON.stringify(envelope)}::jsonb`, o driver Bun grava um valor string
(double-encoded) e o `.select` tipado o devolve como `string`, quebrando o
`envelopeSchema.parse` (`expected object, received string`). Verificado por probe
contra o Postgres vivo: passar o envelope como **parâmetro objeto puro**
(`${envelope}`, sem `JSON.stringify` e sem cast `::jsonb`) faz o driver serializar
como jsonb e o `.select` devolver `object` — igual ao caminho de escrita do
drizzle em produção. Seed corrigido para `${envelope}`.

GREEN contra Postgres local (`127.0.0.1:55432`, tabelas já migradas):

```text
DATABASE_URL=…@localhost:55432/transportada bun test ./test/nfe-distribution-profile.integration.test.ts
2 pass / 0 fail / 7 expect()
```

Cobertura: (1) monta config com `model='nfe-distribuicao'`, `cnpj`, `uf='SP'`,
`environment='homologation'`, `certificadoBase64`/`certificadoSenha` decifrados;
(2) empresa sem certificado ativo → `loadConfig` rejeita (fail-closed).
`typecheck` verde (`tsc --noEmit`, sem saída).

## D07 — Factory de produção do provider de distribuição real

`src/nfe-distribution/infrastructure/adatechnology-nfe-distribution-provider.factory.ts`
instancia `NfeDistribuicaoProvider` real do `@adatechnology/fiscal-provider` e o pluga
como `createProvider` do gateway (espelho de `createAdatechnologyCteFiscalProvider`).
`createFiscalProvider` NÃO serve para distribuição (lança para `model='nfe-distribuicao'`);
por isso o provider é instanciado diretamente. `toNfeDistribuicaoProviderConfig` mapeia o
ambiente interno da app → ambiente SEFAZ antes de cada `consultarDFe`:
`homologation → homologacao`, `production → producao`, preservando cnpj/uf/certificado/model.

Test-first: `test/nfe-distribution/provider-factory.contract.ts` (via entrypoint
`test/nfe-distribution.contract.test.ts`).

- RED: `error: Cannot find module '.../adatechnology-nfe-distribution-provider.factory.js'`
  (3 fail antes da implementação).
- GREEN: `6 pass / 0 fail / 21 expect()`.

Cobertura: (1) mapeamento de ambiente homologação/produção preservando material do
certificado; (2) delegação ao provider SEFAZ com a config mapeada (via seam
`instantiateProvider`, sem bater no SEFAZ) e repasse do resultado paginado; (3) isolamento
de fonte — factory importa `@adatechnology/fiscal-provider` (sem deep import
`@adatechnology/fiscal-provider/`), referencia `NfeDistribuicaoProvider`, sem `src/sefaz`,
sem `console.` (zero vazamento de certificado).

Gate completo verde: `bun run --cwd apps/worker-transportada check` →
lint + `tsc --noEmit` + `105 pass / 0 fail / 245 expect()` (21 arquivos) + build
(`Bundled 49 modules`). `gateway.contract.ts` permanece verde.

## D08 — Handler idempotente + rewire do runtime consumer

`src/runtime/nfe-distribution-consumer.service.ts` deixou de ser stub log-only: agora
delega ao `NfeImportWorkerMessageHandler` (handler de idempotência já verde e neutro em
relação a domínio — opera sobre `NfeProcessingEnvelopeV1`), reusado como segundo consumidor
do mesmo mecanismo (Regra do 2º uso; copy-paste do handler seria antipadrão). O consumer de
distribuição (`createNfeDistributionConsumer`, D04) entra como `effect` do handler.

Fluxo por mensagem: type-check (`DISTRIBUTION_REQUESTED`; qualquer outro tipo →
`dead-letter` antes de tocar repositório) → `hasProcessed(key)` → se já processado, `ack`
sem re-pull; senão `effect.execute` → `markProcessed` → `ack`. Erro recuperável →
`scheduleRetry` com backoff persistente; `maxAttempts` estourado → `dead-letter`. Chave =
`{companyId, eventId, importId}` (mesma da importação — o trigger é o eventId, então
re-disparo de emergência é um novo eventId e re-executa; redelivery do mesmo trigger não).

Ponte (strangler): `consumer`/`repository` são opcionais no runtime service. Sem ambos,
mantém o caminho log-only + `ack` que existe hoje, preservando `main.ts` compilando e
executando. D09 injeta os adapters reais e o caminho idempotente passa a ser o único.

Test-first: `test/nfe-distribution/runtime-consumer.contract.ts` (via entrypoint
`test/nfe-distribution.contract.test.ts`).

- RED: 2 fail — idempotência não fiada (`calls` vazio onde se esperava
  `hasProcessed → execute → markProcessed` e `hasProcessed` no redelivery).
- GREEN: `bun test ./test/nfe-distribution.contract.test.ts ./test/nfe-runtime.contract.test.ts`
  → `13 pass / 0 fail / 34 expect()` (2 arquivos).

Cobertura: (1) decode usa o schema do envelope de processamento e o prefetch configurado é
repassado ao `consume`; (2) trigger de distribuição roda o consumer uma vez e marca
processado antes do ack (ordem `hasProcessed → execute → markProcessed`); (3) redelivery do
mesmo trigger dá `ack` sem re-executar o pull SEFAZ (só `hasProcessed`); (4) envelope de
tipo não-distribuição (`import.requested`) vai a `dead-letter` sem tocar repositório.

Regressão/gates parciais (escopo D08): worker `typecheck` limpo (`tsc --noEmit`), `lint`
limpo (`eslint --max-warnings=0`), suíte unitária/contrato `109 pass / 0 fail / 254 expect()`
(25 arquivos). `nfe-runtime.contract.ts` permanece verde (ordem de drain/readiness intacta).
Os 4 `errors` restantes são os `*.integration.test.ts` de repositório/perfil/cursor que
exigem Postgres vivo (`connection.adapter undefined` sem `make up`) — pré-existentes e
independentes de D08 (nenhum repositório foi tocado). `check` completo (com infra) fica no
gate de D09.

## Defeito — janela anti-656 persistida mas não respeitada pelo consumer (2026-07-26)

Sintoma: a janela anti-656 (`nfe_distribution_cursors.next_allowed_at`) era **gravada**
após uma página vazia (D05), mas o consumer **nunca a consultava** antes de chamar
`gateway.consultarDFe`. Um novo disparo dentro da janela adquiria o lease e batia na SEFAZ
mesmo assim — exatamente o consumo indevido que a janela existe para evitar (rejeição 656 /
banimento temporário). Além do risco fiscal, cada disparo em cooldown ainda finalizava a
execução, mascarando o problema.

Correção (test-first) em `nfe-distribution-consumer.service.ts`: logo após adquirir o lease,
se `cursor.nextAllowedAt > now`, o consumer **não** cria o gateway nem consulta a SEFAZ —
finaliza a execução com contadores zerados (`status: completed`, 0 notas), libera o lease no
`finally` e devolve `status: 'rate-limited'` com o `ultNsu` corrente. Isso preserva o
comportamento de "a execução sai de `Na fila` para um estado terminal" (sem lote preso) e
mantém a janela persistida intacta (não estende nem reseta `next_allowed_at`).

Test-first em `test/nfe-distribution/consumer.contract.ts`:

- RED: `skips the SEFAZ call while still inside the persisted anti-656 window` falha porque
  `consultarDFe` era invocado dentro da janela (o fake lança e a promise rejeita).
- GREEN: `bun test ./test/nfe-distribution.contract.test.ts` → `11 pass / 0 fail / 35 expect()`.
  Assertivas: `consultarDFe` **não** é chamado; `finalize:completed:0:0:0`; lease liberado;
  retorno `{duplicated:0, fetched:0, persisted:0, status:'rate-limited', ultNsu:<corrente>}`.

Gates (worker): `typecheck` limpo, `lint --max-warnings=0` limpo, suíte unitária/contrato
`110 pass / 0 fail`. Os 4 `errors` restantes seguem sendo os `*.integration.test.ts` que
exigem Postgres vivo (pré-existentes; nenhum repositório tocado).

## Diagnóstico — execução de distribuição órfã `6e2be328` (2026-07-26)

Verificado no banco (não é teoria):

- `nfe_imports` `6e2be328-29bd-44b3-a8bc-f3494beb16ce`: `source=distribution`, `status=queued`,
  `0/0/0`, criada 13:44:58, `updated_at` nunca mudou.
- `processing_outbox`: evento `transportada.nfe.distribution.requested` publicado no trilho de
  **distribuição** às 13:44:59.308 (routing correto, main.ts `resolve`).
- `processed_messages`: linha `nfe-import-worker` / result `{importId: 6e2be328...}` às 13:44:59.569.

O handler (`nfe-import-worker-message-handler.service.ts:67-71`) grava `markProcessed`
**somente após** `effect.execute` retornar sem lançar. Logo o effect que rodou às 13:44
concluiu com sucesso mas **não** finalizou a execução — sinal de que o worker em execução
naquele instante ainda não fiava `createNfeDistributionConsumer` como effect da distribuição
(build/sessão anterior de hoje). O build atual (`main.ts:298-326`) injeta corretamente o
effect de distribuição — comprovado por uma puxada posterior (14:55) que atualizou o cursor.

Consequência: a linha está **marcada como processada**, então redelivery do mesmo `eventId`
é sempre `ack` sem reexecutar (idempotência) — ela **não** se auto-cura. Não é bug do build
atual; é registro órfão de build antigo. Uma nova puxada de emergência gera novo `eventId` e
funciona. Limpeza da linha órfã (marcar `failed`) é operação de dados — requer confirmação do
usuário; não executada.

## Observabilidade da puxada SEFAZ (2026-08-03)

Motivo: as três puxadas de distribuição executadas localmente (26/07, 27/07, 29/07)
terminaram `completed` com contadores zerados e cursor em `000000000000000`, sem nenhum
registro de **por que** vieram vazias. Puxada sem nota, puxada barrada pela SEFAZ e puxada
pulada por cooldown eram indistinguíveis no log — cegueira inaceitável antes de apontar
para produção.

Test-first em `test/nfe-distribution/observability.contract.ts` (suíte nova, importada pelo
entrypoint `test/nfe-distribution.contract.test.ts`).

- RED: `11 pass / 6 fail` — 5 casos novos + o `page_received` existente, que passou a exigir
  `environment` no metadata.
- GREEN: `17 pass / 0 fail / 52 expect()`.

Eventos acrescentados em `nfe-distribution-consumer.service.ts`, todos carregando
`companyId`, `importId` e `environment` (homologação vs produção deixa de ser adivinhação):

| Evento | Nível | Responde |
| --- | --- | --- |
| `nfe_distribution_pull_started` | info | a consulta saiu, e a partir de qual `ultNsu` |
| `nfe_distribution_sefaz_page_received` | info | o que a SEFAZ devolveu (`fetched`, `maxNsu`, `temMais`) |
| `nfe_distribution_page_persisted` | info | quanto da página entrou (`accepted`/`duplicated`) |
| `nfe_distribution_rate_limit_window_applied` | info | página vazia → janela anti-656 até `nextAllowedAt` |
| `nfe_distribution_pull_skipped_cooldown` | warn | não consultou: cooldown aberto até `nextAllowedAt` |
| `nfe_distribution_lease_unavailable` | warn | outro worker já detinha o lease |
| `nfe_distribution_pull_failed` | error | `errorCode` (cStat), `providerMessage` (xMotivo), `errorName` |

`describePullFailure` extrai `code`/`providerMessage`/`name` por leitura estrutural, sem
importar a classe do pacote fiscal na camada de aplicação. O `rawResponse` do
`FiscalError` — que carrega o XML da SEFAZ — **nunca** entra em log; o contrato assere
`JSON.stringify(events)` sem o conteúdo bruto. `safeLogWarn` acrescentado ao
`safe-logger.service.ts`, mesmo padrão dos outros dois (log não derruba o handler).

O `catch` que loga e relança é exceção consciente ao §7 do code-standart: só nesse ponto o
código da SEFAZ ainda é tipado — acima da pilha vira mensagem opaca.

Gates (worker): `typecheck` limpo, `lint --max-warnings=0` limpo, suíte contract
`233 pass / 0 fail / 516 expect()` (37 arquivos), `format:check` limpo no repo.

⚠️ Não fecha a D13 — segue faltando a puxada real ponta a ponta. Fecha a lacuna de
diagnóstico que tornaria essa puxada não-auditável.
