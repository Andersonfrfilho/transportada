# Evidência — Feature 004

## Inventário e planejamento

Modelos:

- OpenCode gratuito: reservado para inventários e casos mecânicos;
- Codex Terra medium: implementação padrão e frontend;
- Codex Sol high: spec, desenho, criptografia, fiscal, tenant, concorrência e
  revisão de release.

Fontes confirmadas:

- constituição, arquitetura, domínio e plano de entrega do TransportAdA;
- contratos públicos instalados de
  `@adatechnology/fiscal-provider@0.1.0`;
- estrutura ESM/Bun dos packages `keycloak-jwt`, `drizzle-provider` e
  `rabbitmq-provider`;
- grafo local dos dois repositórios;
- regras globais e específicas de TypeScript, Bun, Drizzle, API, frontend e
  Makefile.

Decisões:

- frontend React + Vite;
- credencial A1 cifrada no PostgreSQL por package Ada compartilhado;
- uma credencial ativa por finalidade e CNPJ exatamente igual ao tenant;
- sequência CT-e com ledger idempotente e sem reutilização;
- nenhuma chamada SEFAZ, fila, exchange, S3 ou Railway nesta feature;
- PFX fornecido pelo usuário permanece fora do repositório e dos testes.

## T001 — ADRs e decomposição

Modelo executor e revisão independente: Codex Sol high.

Commits TransportAdA:

- `98723cf docs(spec): define company fiscal settings`;
- `9bfb6d6 docs(plan): design company fiscal settings`;
- `4fc417b docs(spec): plan company fiscal settings tasks`.

Artefatos:

- `docs/adr/0004-secret-envelope-and-a1-storage.md`;
- `docs/adr/0005-idempotent-fiscal-number-reservation.md`;
- `specs/004-company-fiscal-settings/spec.md`;
- `specs/004-company-fiscal-settings/plan.md`;
- `specs/004-company-fiscal-settings/tasks.md`.

A revisão final não encontrou P0/P1. Rastreabilidade cobre CFS-001–CFS-016 e
cada task declara dependência, verificação, critério de sucesso e modelo.

## T002 — Contracts do `secret-envelope`

Modelo executor e revisão: Codex Sol high.

Commit Ada local:

- `e0069bd test(crypto): define secret envelope contracts`.

Scaffold:

- package npm ESM público `@adatechnology/secret-envelope@0.0.0`;
- Bun `>=1.3`, TypeScript estrito, `tsup`, exports somente pela raiz e nenhuma
  dependência de runtime;
- API pública tipada e factory deliberadamente não implementada;
- nenhum changeset, lockfile, bump ou publicação.

Os 16 contracts cobrem:

- round-trip binário, nonce de 12 bytes e envelope imutável;
- snapshot das chaves fornecidas pelo chamador;
- AAD obrigatório e framing sem colisão por concatenação;
- adulteração de AAD, nonce, ciphertext e tag;
- rotação com leitura pela chave antiga e nenhuma tentativa de fallback;
- chave incorreta sob o mesmo `keyId`;
- keyrings inválidos e chave de tamanho diferente de 32 bytes;
- parser estrito de versão, algoritmo, `keyId`, campos extras e base64url;
- limites de plaintext, ciphertext, nonce e tag;
- erros tipados sem chave, plaintext, AAD ou envelope;
- ausência de escrita em `console`.

Evidência local:

```text
bun run format:check
All matched files use Prettier code style

bun run check
tsc --noEmit
exit 0

pre-commit lint-staged
eslint --fix + prettier --write
exit 0

bun test test/secret-envelope.contract.test.ts
0 pass, 16 fail
```

As 16 falhas são o estado RED esperado e nascem somente do stub
`Secret envelope provider is not implemented`. Nenhum AES foi implementado.
O commit Ada permanece local e não será enviado enquanto a T003 não restaurar
todos os gates verdes.

## T003 — Envelope AES-256-GCM versionado

Modelo executor e revisão independente: Codex Sol high.

Commit Ada local:

- `1cbbc00 feat(crypto): implement authenticated secret envelopes`.

Implementação:

- AES-256-GCM por Web Crypto, nonce aleatório de 12 bytes e tag de 128 bits;
- factory síncrona, snapshot do keyring e importação tardia de `CryptoKey` não
  extraível;
- envelope e base64url canônicos, parser estrito e limites antes da
  decodificação;
- seleção exclusiva por `keyId`, rotação e erros constantes sem payload
  sensível;
- AAD interno domain-separated e length-prefixed vinculando versão, algoritmo,
  `keyId` e AAD externo;
- limpeza best-effort das cópias temporárias e zero dependências de runtime.

A revisão encontrou adulteração possível do `keyId` quando duas IDs usavam o
mesmo material. Um contract regressivo reproduziu a falha antes da correção e
passou depois do framing autenticado. Entradas com getters hostis também foram
normalizadas para erros tipados sem vazamento. A revisão final aprovou sem
P0/P1.

Evidência local:

```text
bun run check
tsc --noEmit
exit 0

bun run test
20 pass, 0 fail, 79 assertions

pnpm exec eslint packages/backend/secret-envelope/src packages/backend/secret-envelope/test
ESLint: No issues found

bun run format:check
All matched files use Prettier code style

bun run build
ESM dist/index.js 11.91 KB
DTS dist/index.d.ts 1.63 KB
```

O build reutilizou temporariamente o `tsup@8.5.1` já instalado no monorepo,
sem manter symlink ou `dist`. Instalação Bun limpa, tarball, lockfile, bump,
publicação npm e push do package pertencem às T004/T005. O certificado PFX,
sua senha, Railway, S3 e SEFAZ não foram acessados.

## T004 — Empacotamento e consumo Bun isolado

Executor: Codex Terra medium. Revisão independente: Codex Sol high, aprovada
sem P0–P3 materiais.

Commit Ada local:

- `685d8b3 test(packaging): verify isolated Bun consumption`.

Implementação:

- `prepack` sempre produz ESM e declarações antes do tarball;
- teste agregado gera dois tarballs e exige bytes idênticos;
- allowlist exata permite somente `README.md`, `package.json`,
  `dist/index.js` e `dist/index.d.ts`;
- consumidor temporário instala o `.tgz` local com Bun, executa typecheck real
  contra as declarações instaladas e importa o módulo ESM em runtime;
- package instalado não possui dependências runtime nem referência ao logger;
- `pnpm-lock.yaml` recebeu somente o importer do novo workspace.

Evidência local:

```text
pnpm install --frozen-lockfile --offline
Lockfile is up to date
exit 0

bun run check
tsc --noEmit
exit 0

bun run test
21 pass, 0 fail, 90 assertions

bun test ./test/package.integration.ts
1 pass, 0 fail

npm pack --dry-run --json
4 entries: README.md, package.json, dist/index.js, dist/index.d.ts

prettier + eslint + git diff --check
exit 0
```

O comando da task foi corrigido para `bun test ./test/package.integration.ts`,
pois Bun 1.3.14 exige `./` para tratar um nome que não termina em `.test` ou
`.spec` como caminho explícito.

Os commits Ada continuam locais porque o push em `packages/**` dispara o
workflow de publicação. A T005 fará changeset, bump e pin antes desse push,
evitando publicar acidentalmente `0.0.0`. Nenhum npm publish, certificado,
Railway, S3 ou SEFAZ foi acessado.

## T005 — Publicação Ada e pins da API

Executor e revisões independentes: Codex Sol high.

Commits Ada:

- `65cbe33 chore(release): add secret envelope changeset`;
- `7206106 chore(release): version packages`, gerado pela pipeline;
- `e19aaad ci(release): install Bun before package publish`;
- `11f8a39 ci(release): expose secret envelope package`.

Release:

- o changeset minor promoveu somente `@adatechnology/secret-envelope` de
  `0.0.0` para `0.1.0`;
- a primeira execução publicou a versão no npm após a pipeline receber Bun
  1.3.14; a falha anterior ocorreu antes do upload porque `prepack` não
  encontrava `bun`;
- o passo final de acesso tornou explicitamente públicos os packages Bun;
- `npm view` público confirmou `secret-envelope@0.1.0` e
  `fiscal-provider@0.1.0`.

Workflows:

- CI `29703896208`: sucesso;
- publish inicial `29703896228`: falhou em `prepack` com `bun: not found`;
- publish corrigido `29704014549`: publicou `secret-envelope@0.1.0`;
- acesso público `29704125610`: sucesso.

Pins da API:

- `@adatechnology/fiscal-provider`: `0.1.0`;
- `@adatechnology/secret-envelope`: `0.1.0`;
- `bun.lock` resolve ambos pelo registry com integridade, sem `file:`,
  `workspace:` ou `link:`.

Evidência local:

```text
npm view @adatechnology/secret-envelope version
0.1.0

npm view @adatechnology/fiscal-provider version
0.1.0

bun install --frozen-lockfile
no changes

bun run --cwd apps/api-transportada check
94 pass, 1 conditional database skip, 0 fail, 455 assertions
lint + typecheck + build: exit 0
```

A revisão final aprovou package, pipeline, pins e lockfile sem P0–P3. Nenhum
Railway, certificado, PFX, senha, S3 ou SEFAZ foi acessado.

## T006 — Separação do schema de identidade

Executor: Codex Terra medium. Revisão e validação independentes: agente
principal.

Implementação:

- `identity.schema.ts` preserva integralmente as cinco tabelas, tipos,
  constantes, checks, índices, chaves e relacionamentos de identidade;
- `database.schema.ts` permanece como agregador compatível e reexporta os
  mesmos símbolos;
- o contrato comprova que o módulo direto e o agregador expõem as mesmas
  referências, inclusive no objeto `databaseSchema`;
- consumidores, `drizzle.config.ts`, migrations, rollbacks e snapshots não
  foram alterados.

Evidência RED:

```text
bun test test/identity-schema.contract.test.ts
Cannot find module '../src/database/identity.schema.js'
0 pass, 1 fail
```

Evidência local após implementação:

```text
bun run --cwd apps/api-transportada db:check
Everything's fine

bun run --cwd apps/api-transportada check
95 pass, 1 conditional database skip, 0 fail, 462 assertions
lint + typecheck + build: exit 0

git diff --check
exit 0
```

Os hashes SHA-256 dos cinco artefatos em `apps/api-transportada/drizzle`
permaneceram idênticos ao baseline anterior à extração. Nenhum Railway,
certificado, PFX, senha, S3 ou SEFAZ foi acessado.

## T007 — Contracts do schema fiscal e isolamento

Executor e revisão independente: Codex Sol high. O OpenCode foi reservado para
uma checklist mecânica, mas `north-mini-code-free` e
`deepseek-v4-flash-free` falharam no servidor antes de produzir resultado. A
tarefa foi escalada após as duas falhas equivalentes, sem repetir tentativas.

Contracts em `fiscal-schema.contract.test.ts`, com fixtures divididas por tabela:

- seis tabelas fiscais e exports compatíveis pelo agregador;
- tipos, nullability, PKs, uniques, checks e timestamps UTC;
- FKs tenant-scoped, incluindo a FK composta da reserva para a sequência;
- CNPJ canônico, ambiente/modelo/purpose fechados e números positivos;
- coerência entre próximo e último número reservado;
- um certificado ativo por empresa/finalidade por índice unique parcial;
- envelope obrigatório somente no ativo e removido no aposentado;
- validade sem defaults inventados e com `valid_from < expires_at`;
- índices de lookup tenant-scoped e ausência de colunas com formato de segredo;
- migration fiscal com trigger que rejeita `UPDATE` e `DELETE` em auditoria.

O contrato foi registrado nos scripts `test` e `test:integration`. Nenhum
schema, SQL ou migration foi implementado nesta task.

Evidência RED:

```text
bun test test/fiscal-schema.contract.test.ts
Cannot find module '../src/database/fiscal.schema.js'
0 pass, 1 fail

bun run test
95 pass, 1 conditional database skip
1 fail: somente fiscal.schema.js ausente

bun run typecheck
somente fiscal.schema.js e os seis exports fiscais ausentes

prettier + eslint + git diff --check
exit 0
```

O commit RED permanece local para não quebrar o `main`; T008 implementará
schema e migration e restaurará os gates antes do próximo push. Nenhum Railway,
certificado, PFX, senha, S3 ou SEFAZ foi acessado.

## T008 — Schema fiscal, migration aditiva e rollback

Executor e revisão independente: Codex Sol high.

Implementação:

- schema Drizzle estrito dividido por perfil, certificado, operação e sequência;
- seis tabelas fiscais reexportadas por `fiscal.schema.ts` e pelo agregador;
- `bigint` em modo nativo, `jsonb`, timestamps UTC e checks definidos na T007;
- FK composta da reserva para a sequência e índices/uniques tenant-scoped;
- índice unique parcial garantindo um certificado ativo por finalidade;
- triggers PostgreSQL impedindo `UPDATE` e `DELETE` em auditoria e no ledger de
  reservas;
- migration única aditiva `20260720003709_company_fiscal_settings`;
- snapshot gerado pelo Drizzle Kit e rollback manual transacional, sem
  `CASCADE`, validado por nome e SHA-256 no journal;
- migrations baseline e identidade preservadas byte a byte.

Hashes:

```text
migration.sql  839faaf37f9f4e4ed5bce93b1199573795bf9ad83920261efa0a5a4a05ff2222
rollback.sql   9296fc350da6e2d562d45f4809fc6f684509ac021be89dbc34a0ec4b594a28c7
snapshot.json  c05782c92caf1eac32c1f51bc4f967d9b487c7f0d461522231ae06550580273e
```

A primeira revisão encontrou o ledger mutável e ausência de provas reais das
uniques de concorrência. A correção adicionou o trigger append-only da reserva
e testes PostgreSQL `23505` para sequência, chave/número de reserva,
idempotência e versão do certificado. A re-revisão aprovou sem P0–P2.

Evidência local:

```text
bun run --cwd apps/api-transportada db:check
Everything's fine

bun run --cwd apps/api-transportada check
104 pass, 1 conditional database skip, 0 fail, 611 assertions
lint + typecheck + build: exit 0

make migration-test
9 pass, 0 fail, 129 assertions

DRIZZLE_TEST_DATABASE_URL="$DATABASE_URL" bun run --cwd apps/api-transportada test:integration
25 pass, 0 fail, 291 assertions

bun run format:check
All matched files use Prettier code style

make down
PostgreSQL e rede local removidos
```

O teste descartável provou aplicação sobre banco vazio, constraints, rollback
fiscal, reaplicação, rollback fiscal seguido do rollback de identidade e
limpeza do banco temporário. Nenhum Railway, certificado, PFX, senha, S3 ou
SEFAZ foi acessado.

## T009 — Contracts do router modular e deny-by-default

Executor e revisão independente: Codex Sol high. O Graphify foi usado somente
para localizar o boundary existente entre `request-handler.service.ts`,
autenticação e contexto da empresa.

O OpenCode foi usado apenas como test-writer mecânico read-only. Tanto
`north-mini-code-free` quanto `deepseek-v4-flash-free` falharam no provedor
antes de produzir resultado ou alterar arquivos. Após as duas falhas
equivalentes, a delegação econômica foi encerrada sem aumentar o contexto.

Contracts:

- rota protegida exige a ordem autenticação, tenant, RBAC, parser e handler;
- falhas de autenticação, tenant ou RBAC impedem parser e handler;
- rota registrada sem policy é negada por padrão antes do parser;
- health permanece público;
- `/auth/me` preserva autenticação, tenant e DTO allowlisted;
- rota desconhecida preserva autenticação antes do 404 seguro.

O contract foi registrado no script `test`. Nenhum router ou código de runtime
foi implementado nesta task.

Evidência RED:

```text
bun test test/router.contract.test.ts
Cannot find module '../../src/http/router.service'
0 pass, 1 fail

bun run test
104 pass, 1 conditional database skip
1 fail: somente router.service ausente

bun run typecheck
somente TS2307 para router.service ausente

bunx eslint test/router.contract.test.ts test/fixtures/router.fixture.ts --max-warnings=0
exit 0
```

A suíte anterior permaneceu verde com 104 testes, 1 skip condicional, 0 falhas
e 611 assertions. A T010 implementará o router e restaurará o gate agregado.

A primeira revisão encontrou dois P2: o contrato não exigia que parser e handler
recebessem o mesmo `CompanyContext` autenticado nem que o payload validado
chegasse ao handler, e o caminho do erro RED estava inexato. A fixture passou a
validar `Request`, contexto e payload tipados; a evidência foi corrigida. A
re-revisão aprovou sem novos P0–P2.

Nenhum Railway, certificado, PFX, senha, S3 ou SEFAZ foi acessado.

## T010 — Router modular, tipado e deny-by-default

Executor: Codex Terra medium. Revisão independente: Codex Sol high. O Graphify
confirmou o fluxo existente entre `Bun.serve`, handler, autenticação, contexto
de empresa e autorização antes da extração.

Implementação:

- `router.service.ts` centraliza health público, `/auth/me`, lookup de rota e
  dispatch protegido tipado; `defineRoute` preserva o tipo de input de cada
  rota e o encapsula somente no boundary interno;
- rotas protegidas resolvem `CompanyContext` e passam por RBAC antes de parser
  e handler; policy ausente permanece `403` antes de processar o payload;
- `request-handler.service.ts` preserva limite de body, abort, CORS,
  correlation ID e logging allowlisted de health/auth, delegando somente o
  dispatch;
- `main.ts` cria explicitamente autenticação, tenant, autorização e router;
- handler e servidor exigem o router composto, sem fallback ou construção
  implícita de autenticação, tenant ou autorização;
- fixtures HTTP usam uma factory explícita e o contract registra duas rotas com
  inputs distintos;
- erros e respostas foram extraídos para `response.service.ts`, mantendo cada
  arquivo HTTP abaixo de 200 linhas.

Evidência local:

```text
bun run --cwd apps/api-transportada check
111 pass, 1 conditional database skip, 0 fail, 644 assertions
lint + typecheck + build: exit 0

API_TEST_DATABASE_URL="$DATABASE_URL" DRIZZLE_TEST_DATABASE_URL="$DATABASE_URL" \
  bun run --cwd apps/api-transportada test:integration
25 pass, 0 fail, 291 assertions

bun run format:check
All matched files use Prettier code style

git diff --check
exit 0
```

A primeira revisão encontrou um P1 e dois P2: a tabela exigia o mesmo input em
todas as rotas, health perdeu os pathnames allowlisted nos logs e handler/server
mantinham fallbacks de composição divergentes do `main`. `defineRoute<TInput>`
passou a fechar parser e handler antes da erasure interna, um contract com
inputs heterogêneos foi adicionado, os logs de health foram restaurados e o
router tornou-se obrigatório abaixo do composition root. A re-revisão aprovou
sem novos P0–P2.

Nenhum endpoint fiscal, migration, frontend, package, Railway, certificado,
PFX, senha, S3 ou SEFAZ foi acessado.

## T011 — Contract do gateway fiscal público

Executor e revisão independente: Codex Sol high.

O artefato realmente instalado foi inspecionado em
`node_modules/.bun/@adatechnology+fiscal-provider@0.1.0`. Seu
`dist/index.d.ts` exporta `validateCertificate` e `CertificateValidation` pela
raiz pública; a função é síncrona e recebe somente base64 e senha. Nenhum
internal `src/sefaz/*` foi importado.

Contracts:

- a dependência da API permanece fixada exatamente em `0.1.0`;
- função e tipo do validator compilam a partir de
  `@adatechnology/fiscal-provider`;
- um `spyOn` restaurável no namespace público prova causalmente que a factory
  default chama `validateCertificate` com material sintético opaco somente em
  memória, sem substituir persistentemente o módulo;
- resultado aceito expõe apenas CNPJ, validade e datas;
- cada flag crítica é testada isoladamente e fecha a validação mesmo diante de
  um `valid=true` inconsistente;
- certificado expirado, ainda não válido, não ICP-Brasil, sem chave privada,
  sem CNPJ declarado/real ou incapaz de assinatura recebe somente seu código
  interno mínimo;
- errors, warnings, issuer, subject e diagnóstico lançado não atravessam o
  gateway nem chegam a `console` ou ao logger Ada.

O contract foi registrado no script `test` e suas fixtures sintéticas foram
separadas para manter os arquivos abaixo de 200 linhas. Nenhum port, adapter ou
código de runtime foi implementado nesta task.

Evidência RED:

```text
bun test test/certificate-validation-gateway.contract.test.ts
2 pass, 1 fail
única falha: fiscal-certificate-validation.gateway.js ausente

bun run test
113 pass, 1 skip condicional, 1 fail
única falha: fiscal-certificate-validation.gateway.js ausente

bun run typecheck
somente TS2307 para fiscal-certificate-validation.gateway.js ausente

eslint + prettier + git diff --check
exit 0
```

A T012 implementará o port e o adapter e restaurará os gates agregados. Os
testes usam apenas strings sintéticas; nenhum Railway, certificado, PFX, senha
real, S3 ou SEFAZ foi acessado.

A primeira revisão encontrou dois P1 e um P2: o import textual não provava o
binding público, diagnósticos ainda poderiam chegar aos logs e todas as flags
inválidas estavam combinadas. O contract passou a observar causalmente o export
público com `spyOn` restaurável, vigiar `console` e logger Ada e testar cada
flag crítica isoladamente. A revisão final validou o comportamento
CommonJS/ESM no Bun 1.3.14 e aprovou sem novos P0–P2.

## T012 — Gateway fiscal e configuração criptográfica

Executor e revisão independente: Codex Sol high.

Implementação:

- port interno expõe somente resultado seguro, datas, CNPJ e códigos de
  rejeição estáveis;
- o único adapter fiscal importa `validateCertificate` e seu tipo somente da
  raiz pública de `@adatechnology/fiscal-provider@0.1.0`;
- flags críticas, erro lançado, diagnóstico e resultado inconsistente falham
  fechados; metadados só existem no resultado aceito e datas são copiadas;
- configuração exige keyring JSON não vazio, IDs simples, chave ativa
  existente e chaves AES de exatamente 32 bytes em base64 canônico;
- `SecretKeyRing` vem do export raiz público de
  `@adatechnology/secret-envelope@0.1.0`, sem contrato duplicado;
- a chave HMAC também exige 32 bytes canônicos e não pode reutilizar nenhuma
  chave AES ativa ou anterior;
- qualquer falha criptográfica vira um erro tipado genérico, sem repetir nome
  de chave, JSON ou material secreto;
- `parseEnvironment` torna as três variáveis obrigatórias no startup; Makefile,
  `.env.example` e README documentam o contrato local fail-closed;
  `make config` sourceia o dotenv e executa o parser real sem imprimir valores.

Evidência TDD e local:

```text
bun test test/cryptographic-environment.contract.test.ts
0 pass, 1 fail
única falha RED: cryptographic-configuration.error ausente

bun test test/cryptographic-environment.contract.test.ts \
  test/certificate-validation-gateway.contract.test.ts
27 pass, 0 fail, 187 assertions

bun run --cwd apps/api-transportada check
138 pass, 1 conditional database skip, 0 fail, 831 assertions
lint + typecheck + build: exit 0

make check
API: 138 pass, 1 conditional database skip, 0 fail
worker: 22 pass, 0 fail
frontend: 17 pass, 0 fail
format + lint + typecheck + tests + builds: exit 0

bun run --cwd apps/api-transportada test:integration
25 pass, 0 fail, 291 assertions

bun run format:check && git diff --check
exit 0

make config
source do .env local + parseEnvironment: exit 0

make config ENV_FILE=.env.example
source dotenv + parseEnvironment, 5 realm contracts e Compose válidos

make down
5 realm contracts válidos; container e rede locais removidos
```

O contract de configuração integra o script agregado `test`. Todos os valores
versionados são fixtures públicas sintéticas. O `.env` local ignorado foi
migrado para o novo contrato com material exclusivamente local, sem imprimir
nem versionar seus valores. Railway, PFX, senha, SEFAZ, emissão, HMAC de
payload, persistência, endpoint, fila e exchange não foram acessados nem
implementados.

A revisão encontrou um P1 reproduzível: IDs ativos herdados de
`Object.prototype`, como `constructor` e `toString`, eram aceitos mesmo sem
existirem no keyring. Contracts regressivos falharam antes da correção; o lookup
passou a exigir `Object.hasOwn`.

Uma segunda revisão comparou as fixtures com o source do provider 0.1.0 e
encontrou dois P1. O provider real retorna `valid=false` e `errors` também para
expiração, vigência futura, ICP-Brasil, chave privada, CNPJ e assinatura; por
isso cada flag agora é testada tanto na forma inconsistente `valid=true` quanto
na forma realista. O adapter reconhece estruturalmente a falha de abertura pelo
sentinela de datas epoch e DN vazio, sem comparar texto do diagnóstico, e
preserva os códigos específicos após um parse real. O outro P1 mostrou que JSON
sem aspas externas perde suas aspas ao source do shell. O exemplo passou a usar
aspas simples externas, e tanto o source direto seguido de `parseEnvironment`
quanto `make config ENV_FILE=.env.example` ficaram verdes. Os gates acima foram
repetidos depois das correções.

A revisão final foi aprovada sem P0–P2. Como observação P3 não bloqueante para a
T013, o consumidor de HMAC deverá copiar o `Uint8Array` recebido e minimizar o
tempo de vida e as referências ao material secreto; o `SecretKeyRing` já
mantém seu próprio snapshot das chaves AES.

## T013 — Contracts de perfil, idempotência e auditoria

Executor principal e revisão independente: Codex Sol high. O primeiro executor
delegado foi interrompido por não produzir patch dentro do limite; a execução
foi retomada pelo agente principal sem ampliar o escopo.

Contracts:

- leitura e mutação recebem `CompanyContext` e ignoram qualquer `companyId`
  livre no input;
- HMAC-SHA-256 usa domínio `transportada:idempotency:v1`, operação e campos
  normalizados em ordem fixa, todos enquadrados por tamanho unsigned de 32 bits
  big-endian;
- o serviço HMAC copia a chave na criação e não retém o `Uint8Array` mutável do
  chamador;
- replay da mesma chave e fingerprint devolve a resposta segura persistida sem
  nova mutação, auditoria ou registro idempotente;
- mesma chave com intenção diferente retorna conflito genérico sem chave,
  empresa ou CNPJ;
- falha de auditoria ou de persistência idempotente reverte settings, auditoria
  e idempotência na mesma unidade de trabalho;
- auditoria e idempotência possuem allowlists estruturais exatas, sem request,
  segredo ou propriedade adicional;
- conflitos de CNPJ, versão obsoleta e sequência bloqueada usam erros `409`
  mínimos e não enumeráveis;
- leitura ausente retorna `null` sem consultar outro tenant.

Arquivos de runtime não foram criados. O agregador foi registrado no script
`test`; a T014 deverá implementar somente os quatro módulos contratados:

```text
companies/application/idempotency-fingerprint.service.ts
companies/application/get-company-settings.use-case.ts
companies/application/update-company-settings.use-case.ts
companies/domain/company-settings.error.ts
```

Evidência RED e de não regressão:

```text
bun test test/company-settings-application.contract.test.ts
0 pass, 15 fail
todos os RED: somente os quatro módulos T014 ausentes

bun run typecheck
somente TS2307 para os mesmos módulos T014 ausentes

suite anterior sem o novo agregador
138 pass, 1 skip condicional de banco, 0 fail, 831 assertions

bun run test
138 pass, 1 skip condicional de banco, 15 RED esperados

bun run lint
exit 0

prettier + git diff --check
exit 0
```

O OpenCode `north-mini-code-free` foi tentado apenas para ampliar casos
mecânicos: a primeira chamada foi rejeitada pelo parsing variádico do CLI e a
segunda pelo servidor remoto. A repetição foi encerrada para economizar tokens;
nenhuma decisão foi delegada ao modelo gratuito.

A primeira revisão Sol encontrou quatro lacunas: um erro TypeScript independente
do RED, ausência de leitura tenant-scoped, ausência de rollback na falha da
idempotência e allowlists frouxas. Todas foram corrigidas. A re-revisão
confirmou lint, formato e RED exclusivamente causal e aprovou sem P0–P2.

Todos os dados são sintéticos. Nenhum código de produção, banco, Railway, SEFAZ,
PFX, certificado real, XML fiscal, fila, exchange, commit remoto ou push foi
acessado nesta task.
