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

### Revisão Sol independente

A primeira revisão encontrou cinco inconsistências, todas corrigidas:

- uniques de outbox/mensagem agora incluem empresa;
- tenant/ator do envelope são claims não autoritativos e precisam coincidir com
  o agregado persistido;
- T019 depende do schema que contém a agenda de backoff;
- pack fiscal exige compatibilidade Bun real, sem presumir ESM inexistente;
- mudança no boundary do router recebe revisão Sol.

A revalidação encontrou três lacunas adicionais, também corrigidas:

- NSU/ambiente possuem persistência e unique parcial tenant-scoped, com testes
  de página sobreposta/replay;
- object storage exige create-only, conflito por hash e reconciliador com lease
  que nunca remove objeto final;
- T010 depende do contract fiscal empacotado e T024 depende da versão publicada
  e pinada.

A revisão Sol final declarou zero bloqueador ou achado alto remanescente.

### Delegação e revisão

- Codex Terra medium: inventários read-only delimitados de arquitetura e
  contrato público;
- Codex Sol high: cruzamento das evidências e decisões fiscal, tenant, storage,
  concorrência, filas e release;
- OpenCode/Luna ficam reservados a tarefas mecânicas futuras conforme
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

### Revisão Sol independente

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

Codex Terra medium produziu a primeira versão. A revisão do agente principal
encontrou falsos positivos de lifecycle, typecheck, descoberta do teste e
timeout, assumiu a implementação após a execução delegada ficar sem resposta e
fechou os gates. A revisão Sol encontrou um P1 de higiene porque o primeiro
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

### Revisão Sol independente

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

### Revisão Sol independente

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

### Revisão Sol independente

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

### Revisões Sol

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
