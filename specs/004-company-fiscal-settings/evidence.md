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

## T014 — Repositórios e casos de uso de configurações

Executor principal e duas rodadas de revisão independente: Codex Sol high.

Implementação:

- porta de aplicação tipada para perfil, sequência, auditoria, idempotência e
  unidade de trabalho, sem dependência do schema Drizzle;
- HMAC-SHA-256 com domínio e framing canônicos, snapshot da chave do ambiente e
  limpeza best effort dos bytes após importar a `CryptoKey`;
- leitura e escrita derivam `companyId` exclusivamente do `CompanyContext`;
- replay concorrente é serializado por advisory lock derivado por SHA-256, sem
  nova mutação, auditoria ou gravação idempotente;
- perfil, sequência, auditoria e resposta idempotente são gravados na mesma
  transação PostgreSQL;
- versão otimista do perfil e constraints de CNPJ são convertidas em conflitos
  mínimos, sem enumerar tenant ou documento;
- resposta `bigint` é convertida para strings decimais somente no JSONB e
  validada estritamente ao ser recuperada;
- leitura usa um único `JOIN` tenant-scoped; o snapshot anterior da auditoria
  usa o mesmo lock da mutação;
- série e próximo número de uma sequência reservada são imutáveis;
- ambientes mantêm sequências independentes: selecionar produção não move nem
  altera a sequência reservada de homologação.

O contract T013 continha uma chamada direta de `JSON.stringify` sobre o DTO com
`bigint`, que falhava antes de testar a ausência de segredos. O teste recebeu
somente um replacer decimal; tipos, comportamento e asserções permaneceram
inalterados.

Evidência local final:

```text
bun test test/company-settings-application.contract.test.ts
15 pass, 0 fail, 67 assertions

bun run --cwd apps/api-transportada check
153 pass, 1 skip condicional de migration, 0 fail, 898 assertions
lint, typecheck e build verdes

bun run --cwd apps/api-transportada test:integration
26 pass, 1 skip condicional de migration, 0 fail, 238 assertions

integração T014 focalizada em PostgreSQL descartável
2 pass, 0 fail, 23 assertions

make postgres-up
PostgreSQL local healthy sob transportada-local

make down
containers e rede locais removidos

Prettier e git diff --check
exit 0
```

A primeira revisão encontrou um P1: a implementação inicial movia a mesma
sequência ao trocar ambiente e bloqueava produção após uma reserva em
homologação. A correção passou a resolver/criar a sequência do ambiente-alvo e
a preservar a origem. A re-revisão aprovou sem P0–P2.

Risco P3 deferido para T020/T021: os fluxos atuais mantêm uma sequência
operacional por ambiente. Se a reserva introduzir múltiplas séries históricas
no mesmo ambiente, a regra de seleção da sequência ativa deverá ser explicitada
nos contracts de concorrência.

Todos os dados de integração são sintéticos. Nenhum PFX, senha, XML fiscal,
SEFAZ, RabbitMQ, fila, exchange, Railway ou deploy participou da T014.

## T015 — Contracts HTTP de `/company-settings`

Executor principal e revisão independente: Codex Sol high. O OpenCode gratuito
não foi repetido porque as duas tentativas equivalentes da T013 já haviam
falhado; a política de economia exige escalonamento em vez de novo consumo.

Contracts:

- GET e PATCH exigem especificamente `settings.manage` antes de parser e
  handler, inclusive quando o contexto possui outra permissão válida;
- leitura e escrita usam exatamente o `CompanyContext` autenticado e ignoram
  seletores de tenant por query ou header;
- GET vazio e configurado usam envelope exato e convertem `bigint` somente em
  strings decimais, sem campos extras ou segredo;
- PATCH aceita um DTO estrito, versão otimista decimal canônica, chave
  idempotente ASCII e correlation ID validado;
- limites de tamanho, formatos exatos, tipos, campos desconhecidos e bordas
  críticas são rejeitados antes do caso de uso;
- o limite de 1 MiB é contratado tanto pelo `Content-Length` quanto por leitura
  incremental de stream sem esse header;
- conflitos de CNPJ, versão, sequência e chave idempotente usam respostas `409`
  mínimas; falhas inesperadas usam `500` sem detalhe interno;
- preflight permite somente origem local confiável, GET/PATCH e os headers
  previstos, sem credentials; respostas da rota usam `Cache-Control: no-store`.

Evidência RED e de não regressão:

```text
bun test test/company-settings-http.contract.test.ts
0 pass, 77 fail
todos os RED: somente company-settings.routes.js da T016 ausente

bun run typecheck
somente TS2307 para o mesmo módulo T016 ausente

suite anterior sem o novo agregador
153 pass, 1 skip condicional de migration, 0 fail, 898 assertions

bun run lint
exit 0

Prettier e git diff --check
exit 0
```

O agregador está registrado no script `test`. Todos os arquivos têm no máximo
191 linhas e as funções/callbacks no máximo 40. A revisão inicial encontrou
lacunas na policy específica, tenant exato, idempotência, correlação e limites;
os contracts foram ampliados e a revisão final aprovou sem P0–P2.

Risco P3 não bloqueante para futura ampliação: nem toda borda textual válida é
afirmada isoladamente, embora os fixtures positivos, as rejeições fora da faixa
e as bordas críticas deem cobertura proporcional à task.

Nenhum runtime da T016, banco, PFX, senha, XML fiscal, SEFAZ, RabbitMQ, fila,
exchange, Railway, deploy ou dado real participou da T015.

## T016 — Endpoints de configurações

Executor: Codex Terra medium. Revisão e correções de segurança: Codex Sol high.

Implementação:

- GET e PATCH `/company-settings` usam o router modular com policy company-
  scoped `settings.manage`, depois de autenticação e resolução do tenant;
- composition root instancia o repositório Drizzle, os casos de uso T014 e o
  HMAC vindo exclusivamente da configuração criptográfica validada;
- schema Zod estrito aceita somente strings decimais canônicas positivas até
  `9223372036854775807`, formatos e comprimentos definidos no plano;
- body JSON é lido incrementalmente depois do RBAC e interrompido ao exceder
  1 MiB, inclusive sem `Content-Length`;
- correlation ID validado atravessa o router explicitamente, sem mutar o
  `Request`, e permanece igual em caso de sucesso, erro, resposta e log;
- respostas usam allowlists explícitas, convertem `bigint` para decimal, não
  expõem campos runtime extras e mantêm `activeCertificate` como `null` até
  T018/T019;
- CORS exige a combinação exata de método e headers por rota, sem credentials;
  respostas da rota usam `Cache-Control: no-store`, inclusive em metadata
  inválido;
- logs reconhecem o pathname estático sem registrar query, token ou tenant.

A primeira implementação Terra deixou os 77 contracts originais verdes. A
revisão Sol encontrou correlação alterada em erros, overflow de `bigint`,
serialização por spread, log como `<unmatched>`, lacuna de `no-store`, CORS
permissivo e funções acima dos limites. Regressões reproduziram 13 falhas antes
da primeira correção. Uma segunda rodada reproduziu mais quatro falhas para
decimal não numérico e header CORS duplicado. A rodada final foi aprovada sem
P0–P3.

Evidência local final:

```text
bun test test/company-settings-http.contract.test.ts
87 pass, 0 fail, 313 assertions

bun run --cwd apps/api-transportada check
240 pass, 1 skip condicional de migration, 0 fail, 1211 assertions
lint, typecheck e build verdes

bun run --cwd apps/api-transportada test:integration
26 pass, 1 skip condicional de migration, 0 fail, 238 assertions

make check
API: 240 pass, 1 skip condicional de migration, 0 fail
worker: 22 pass, 0 fail
frontend: 17 pass, 0 fail
format, lint, typecheck, testes e builds verdes

Prettier e git diff --check
exit 0

make down
container PostgreSQL e rede local removidos
```

Uma execução intermediária da integração expirou no teste CORS do servidor
Bun. O teste passou imediatamente isolado (4/4) e o rerun agregado passou
completo; a revisão considerou a falha transitória não reproduzida.

Todos os arquivos alterados têm no máximo 199 linhas e as funções revisadas no
máximo 40. Nenhum PFX, senha, XML fiscal, SEFAZ, RabbitMQ, fila, exchange,
Railway, deploy ou dado real participou da T016.

## T017 — Contracts de validação e rotação do A1

Executor e revisão final: Codex Sol high. A execução delegada produziu o
rascunho; a revisão raiz corrigiu apenas os contracts e fixtures, sem
implementar a T018.

Os 19 contracts sintéticos definem:

- rejeição estável para PFX/senha inválidos, certificado expirado e CNPJ
  diferente do perfil autenticado, preservando a credencial ativa;
- escopo tenant derivado somente do `CompanyContext`, sem confiar em
  `companyId` livre;
- AAD canônico
  `transportada:certificate:v1:<companyId>:<certificateId>:cte`, plaintext
  estrito e falha fechada para adulteração ou troca de tenant;
- cifragem antes da transação, uma credencial ativa, versão monotônica e
  aposentadoria definitiva do envelope anterior;
- serialização de substituições concorrentes, auditoria allowlisted e
  idempotência HMAC sem request, senha, PFX ou envelope persistidos;
- replay sem nova validação, cifragem, mutação ou auditoria; payload divergente
  retorna conflito seguro;
- rollback integral quando validação, cifragem, auditoria ou persistência
  idempotente falham;
- limpeza best effort dos buffers mutáveis controlados pela aplicação.

Evidência RED e de não regressão:

```text
bun test test/digital-certificate-application.contract.test.ts
0 pass, 19 fail
todos os RED: somente replace-digital-certificate.use-case.js e
digital-certificate-secret.service.js da T018 ausentes

bun run typecheck
somente TS2307 para os mesmos dois módulos T018 ausentes

suite anterior sem o novo agregador
240 pass, 1 skip condicional de migration, 0 fail, 1211 assertions

bun run lint
exit 0

Prettier e git diff --check
exit 0
```

O agregador está registrado no script `test`. Todos os arquivos têm no máximo
193 linhas. Os testes usam somente bytes e senhas sentinela sintéticos; o PFX
real informado pelo usuário e sua senha não foram acessados, copiados ou
registrados. Nenhum SEFAZ, RabbitMQ, fila, exchange, S3, Railway ou deploy
participou da T017.

## T018 — Serviço e persistência do certificado

Executor: Codex Sol high. Revisão de segurança e re-revisão independente:
Codex Sol high.

Implementação:

- caso de uso deriva empresa e ator somente do `CompanyContext`, calcula HMAC
  sobre os bytes originais e resolve replay antes de validar ou cifrar;
- gateway fiscal T012 valida localmente o PFX; CNPJ, validade e resultado são
  rechecados sem expor detalhes do provider;
- serviço de segredo usa o AAD canônico, DTO plaintext estrito, base64
  canônico, senha UTF-8 de 1–256 bytes e envelope persistível allowlisted;
- cifragem ocorre antes da transação; buffers mutáveis, plaintext, AAD e
  framing HMAC são zerados em `finally` best effort;
- transação Drizzle bloqueia primeiro a chave idempotente e depois o perfil da
  empresa, revalida CNPJ, aposenta o envelope anterior e insere uma versão
  monotônica ativa;
- índices únicos permanecem como defesa adicional para versão e único ativo;
- auditoria e resposta idempotente allowlisted são gravadas na mesma transação;
- JSONB idempotente serializa datas e `bigint` explicitamente e faz parsing
  estrito no replay;
- repositório e queries usam predicados tenant-scoped e não foram ligados ao
  HTTP, que pertence às T018A/T019.

A implementação inicial passou os 19 contracts T017. A revisão encontrou dois
P2: a cópia framed do HMAC não era zerada e o envelope retornado pelo provider
podia conter campos extras antes do JSONB. Dois contracts regressivos falharam
primeiro; `finally` passou a zerar o framing e um schema estrito passou a
validar/copiar somente `version`, `algorithm`, `keyId`, `nonce` e `ciphertext`.
A re-revisão encerrou os dois P2 sem novos achados P0–P3.

O contract T017 de ausência de segredo também foi corrigido para serializar
`bigint` com replacer decimal; antes disso, `JSON.stringify` falhava antes da
asserção sem representar defeito na implementação.

Evidência local final:

```text
bun test test/digital-certificate-application.contract.test.ts
20 pass, 0 fail, 171 assertions

bun test test/company-settings-application.contract.test.ts
16 pass, 0 fail, 69 assertions

bun run --cwd apps/api-transportada check
261 pass, 1 skip condicional de migration, 0 fail, 1384 assertions
lint, typecheck e build verdes

bun run --cwd apps/api-transportada test:integration
27 pass, 1 skip condicional de migration, 0 fail, 254 assertions

integração T018 em PostgreSQL descartável
rotação concorrente 1/2, um ativo, replay sem efeito, rollback e isolamento

make postgres-up
PostgreSQL local healthy sob transportada-local

make down
container e rede locais removidos

Prettier e git diff --check
exit 0
```

Todos os arquivos têm no máximo 176 linhas. Nenhum PFX ou senha real, XML
fiscal, SEFAZ, RabbitMQ, fila, exchange, S3, Railway ou deploy participou da
T018.

## Regressão de infraestrutura local/CI

O run GitHub Actions `29753348887` aprovou o job de qualidade, mas o job de
integração falhou em `make up`: a primeira tentativa encontrou `58080` ocupada
e a segunda encontrou `59002` ocupada. Ambas estão na faixa efêmera do runner
Linux e o Compose publicava em `0.0.0.0`.

Um contract RED reproduziu que as nove portas de desenvolvimento não estavam
limitadas ao loopback. O Compose passou a publicar PostgreSQL, RabbitMQ, MinIO,
Mailpit e Keycloak explicitamente em `127.0.0.1`, sem mudar números, URLs,
variáveis, `Makefile` ou `COMPOSE_PROJECT_NAME`.

Evidência local:

```text
bun test test/keycloak-realm.contract.test.ts
6 pass, 0 fail, 46 assertions

docker compose config
as nove portas publicadas possuem host_ip 127.0.0.1

make up
PostgreSQL, RabbitMQ, MinIO, Mailpit e Keycloak healthy

make identity-bootstrap
migrations e seed local concluídos

make check
API 261 pass, 1 skip condicional; worker 22 pass; frontend 17 pass
format, lint, typecheck e builds verdes

make down
containers e rede locais removidos
```

Nenhum Railway ou deploy foi executado.

## T018A — Contracts HTTP de certificados

Executor e revisão independente: Codex Sol high. O OpenCode gratuito não foi
repetido após duas falhas equivalentes anteriores, conforme a política de
economia. A implementação da rota ficou reservada para a T019.

Os 27 contracts sintéticos definem:

- autenticação, tenant e `settings.manage` antes de qualquer leitura do
  multipart, sem aceitar header, query ou campo livre como autoridade;
- multipart estrito com um `certificate`, um `password` UTF-8 de 1–256 bytes e
  `purpose=cte`, incluindo duplicados, ausências e campos desconhecidos;
- limite de 1 MiB por `Content-Length` e por leitura incremental lazy, com
  cancelamento no 17º chunk de 64 KiB antes de `formData()`;
- primeiro POST `201` e replay sequencial `200`, ambos com o mesmo DTO seguro e
  resultado discriminado para a futura rota;
- idempotency key ASCII de 16–128 caracteres na allowlist `[A-Za-z0-9._:-]`;
- histórico tenant-scoped com limite padrão 25/máximo 100, cursor base64url
  canônico de `(createdAt,id)` e serialização allowlisted;
- erros estáveis `400`, `401`, `403`, `409` e `500`, correlação preservada,
  `no-store`, CORS exato por recurso e logs de todos os níveis sem segredo.

A revisão inicial encontrou leitura incremental não observável, teste de tenant
mascarado por multipart inválido, logger de erro descartado e replay fixado em
`201`. Também apontou bordas UTF-8, allowlist, cursor e função longa. Os
contracts passaram a usar stream lazy com contador/cancelamento, separar os
seletores de tenant, capturar `error`/`info`/`warn`, verificar sentinelas
raw/base64/senha e exigir replay `200`. A re-revisão aprovou sem P0–P3.

Evidência RED e de não regressão:

```text
bun test test/digital-certificates-http.contract.test.ts
0 pass, 27 fail
todos os RED: somente digital-certificates.routes.js da T019 ausente

bun run typecheck
somente TS2307 para o mesmo módulo T019 ausente

suite anterior sem o novo agregador
261 pass, 1 skip condicional de migration, 0 fail, 1384 assertions

bun run lint
exit 0

Prettier e git diff --check
exit 0
```

O agregador está registrado no script `test`. Todos os arquivos têm menos de
200 linhas e as funções revisadas no máximo 40. Foram usados apenas bytes e
senhas sentinela sintéticos. O PFX real e sua senha não foram acessados,
copiados ou registrados. Nenhum SEFAZ, RabbitMQ, fila, exchange, S3, Railway ou
deploy participou da T018A.

## T019 — POST/GET de certificados e CORS estrito

Executor: Codex Terra medium. Revisão raiz e duas revisões independentes de
segurança: Codex Sol high.

Implementação:

- `POST /digital-certificates` autentica, resolve o tenant e exige
  `settings.manage` antes de validar a idempotência e ler o corpo;
- parser multipart enquadrado por boundary aceita exatamente certificado,
  senha UTF-8 e `purpose=cte`, limita o stream a 1 MiB e limpa buffers mutáveis
  em sucesso ou falha;
- falha ao cancelar um stream excedente não mascara o erro estável `413`;
- primeiro POST retorna `201`; replay concorrente ou sequencial retorna `200`
  com o mesmo DTO seguro e sem repetir efeitos;
- `GET /digital-certificates` lista somente metadados do tenant autenticado,
  com cursor canônico e keyset `(createdAt,id)` descendente;
- a query Drizzle normaliza `created_at` para milissegundos antes de comparar o
  cursor JavaScript, evitando gaps ou duplicações causados por microssegundos;
- CORS permite apenas GET/POST e seus headers exatos, sem reflexão de origem,
  headers de resposta duplicados ou cache de respostas protegidas;
- o composition root liga os gateways fiscais e criptográficos públicos,
  repositório, casos de uso e rotas sem importar internals do provider.

A revisão raiz corrigiu cursor calculado a partir do item extra, propagação do
resultado de replay transacional, precisão PostgreSQL, offset multipart e
limpeza de buffers. A primeira revisão Sol adicionou três regressões RED:
idempotência inválida precisava falhar antes de puxar o corpo, a validação
UTF-8 não podia aceitar um marcador falso dentro do certificado e uma rejeição
de `reader.cancel()` não podia transformar `413` em `500`. As três foram
corrigidas e a segunda revisão não encontrou achados P0–P2. O P3 final de
nomenclatura foi encerrado renomeando os helpers multipart para
`*.service.ts`. A revisão final aprovou a T019 sem achados P0–P3.

Evidência local final:

```text
bun test test/digital-certificates-http.contract.test.ts \
  test/digital-certificate-application.contract.test.ts
50 pass, 0 fail, 512 assertions

bun run --cwd apps/api-transportada check
291 pass, 1 skip condicional de migration, 0 fail, 1725 assertions
lint, typecheck e build verdes

bun run --cwd apps/api-transportada test:integration
29 pass, 0 fail, 335 assertions

integração focal em PostgreSQL local
2 pass: rotação/isolamento e paginação tenant-scoped sem gaps ou duplicações

make check
API 291 pass e 1 skip condicional; worker 22 pass; frontend 17 pass
format, lint, typecheck e builds verdes

make postgres-up
PostgreSQL local healthy sob transportada-local

make down
container e rede locais removidos

Prettier e git diff --check
exit 0
```

Todos os arquivos novos têm menos de 200 linhas e as funções revisadas no
máximo 40. Foram usados somente bytes, senhas e certificados sentinela
sintéticos. O PFX real informado pelo usuário e sua senha não foram acessados,
copiados ou registrados. Nenhum XML fiscal real, SEFAZ, RabbitMQ, fila,
exchange, S3, Railway ou deploy participou da T019.

## T020 — Contracts concorrentes da sequência fiscal

Executor e duas revisões independentes: Codex Sol high. A implementação da
porta e do repositório ficou reservada para a T021.

Os sete contracts PostgreSQL sintéticos definem:

- 20 chaves distintas concorrentes recebem números únicos e monotônicos; os
  números são ordenados antes da asserção de contiguidade;
- cada `reservationKey` fica ligada ao `number` e `sequenceId` retornados, ao
  ledger persistido e ao estado final `lastReservedNumber/nextNumber`;
- 20 chamadas concorrentes da mesma chave produzem uma primeira reserva, 19
  replays, um número, uma sequência e uma única linha de ledger;
- intenção divergente para a mesma chave retorna conflito estável e reverte o
  incremento perdedor;
- falha sintética na inserção do ledger reverte o incremento, e o retry em nova
  transação reserva o número original sem lacuna;
- empresa, ambiente, modelo e série informada explicitamente permanecem
  isolados, sem seleção implícita de uma sequência “ativa”;
- o ledger é append-only, números confirmados não são reutilizados e uma
  violação `23505` da unique `(sequenceId,number)` não pode ser tratada como
  recovery da unique idempotente `(companyId,reservationKey)`.

A primeira revisão encontrou falsos positivos possíveis: destinos de sequência
podiam ser permutados, DTO e ledger não estavam ligados por chave, o estado
final da sequência não era conferido e não havia uma `23505` inesperada
determinística. Também encontrou um callback acima de 40 linhas e corrigiu o
comando Bun documentado para usar `./`. Os contratos passaram a comparar o
join ledger→sequência com cada intenção e DTO, conferir o estado final, injetar
a outra unique violation e dividir as asserções. A revisão final aprovou sem
achados P0–P3.

Evidência RED e de não regressão:

```text
bun test ./test/fiscal-sequence.integration.ts
0 pass, 1 fail, 1 erro
RED exclusivo: drizzle-fiscal-sequence-reservation.repository.js da T021 ausente

bun run typecheck
somente dois TS2307 para a porta e o repositório T021 ausentes

suíte de integração anterior em PostgreSQL local
29 pass, 0 fail, 335 assertions

bun run lint
exit 0

Prettier e git diff --check
exit 0

make postgres-up
PostgreSQL local healthy sob transportada-local

make down
container e rede locais removidos
```

O agregador está registrado em `test:integration`. Todos os arquivos têm no
máximo 186 linhas e as funções revisadas no máximo 40. A falha do ledger e os
dados são exclusivamente sintéticos e usam banco descartável. Nenhum PFX,
senha, XML fiscal, SEFAZ, RabbitMQ, fila, exchange, S3, Railway ou deploy
participou da T020.

## T021 — Porta interna de reserva e ledger

Executor e revisão independente: Codex Sol high.

Implementação:

- a porta interna recebe explicitamente
  `(companyId, environment, model, series, reservationKey)` e não seleciona uma
  sequência ativa implicitamente;
- uma transação procura replay tenant-scoped, atualiza atomicamente a sequência
  exata com `lastReservedNumber=nextNumber`, incrementa `nextNumber/version` e
  usa `RETURNING` para obter o número reservado;
- a linha append-only do ledger é inserida na mesma transação do incremento;
- replay compara ambiente, modelo e série completos antes de retornar o mesmo
  número e `sequenceId`;
- somente SQLSTATE `23505` da constraint
  `fiscal_sequence_reservations_company_id_reservation_key_unique`, inclusive
  quando encapsulada em `cause`, ativa recovery após o rollback;
- o recovery abre uma nova transação, relê ledger e sequência e retorna replay
  ou conflito `409` seguro para intenção divergente;
- qualquer outra unique violation ou erro de ledger é propagado e reverte o
  incremento; sequência ausente também retorna conflito sem detalhes internos;
- nenhuma rota HTTP, tabela, migration, auditoria genérica, fila ou serviço
  assíncrono foi adicionado.

Durante o primeiro GREEN, o contract append-only revelou um defeito no matcher:
o builder Drizzle é thenable, mas `expect(...).rejects` do Bun exige uma
`Promise` nativa. O teste passou a usar `Promise.resolve(builder)`, executando
de fato UPDATE/DELETE contra o trigger sem alterar sua intenção. A revisão
independente aprovou a implementação e essa correção sem achados P0–P3.

Evidência local final:

```text
bun test ./test/fiscal-sequence.integration.ts
7 pass, 0 fail, 39 assertions

bun run --cwd apps/api-transportada test:integration
36 pass, 0 fail, 374 assertions

bun run --cwd apps/api-transportada check
291 pass, 1 skip condicional de migration, 0 fail, 1725 assertions
lint, typecheck e build verdes

make postgres-up
PostgreSQL local healthy sob transportada-local

make down
container e rede locais removidos

Prettier e git diff --check
exit 0
```

Os três arquivos de produção têm 20, 67 e 136 linhas; as funções revisadas têm
no máximo 40. Foram usados somente dados sintéticos e bancos descartáveis.
Nenhum PFX, senha, XML fiscal, SEFAZ, RabbitMQ, fila, exchange, S3, Railway ou
deploy participou da T021.

## T022 — Contracts do módulo frontend

Executor e revisão independente: Codex Terra medium. O OpenCode econômico já
havia falhado duas vezes em critérios equivalentes nesta feature; conforme a
política de economia, a task foi escalada sem repetir a tentativa.

Os dezesseis contracts RED definem:

- tipos públicos fechados para o PATCH, sem `companyId`, e rejeição ou remoção
  defensiva de qualquer identidade de tenant fornecida pelo chamador;
- GET, PATCH e POST nos paths reais, bearer obtido somente em memória,
  idempotência nas mutações e `Request.cache = "no-store"`;
- nenhum header `Cache-Control` adicional no request, preservando o contrato
  CORS estrito da API;
- paginação do histórico com `limit`, cursor opaco recebido em `nextCursor` e
  reutilizado sem decodificação pelo cliente;
- multipart criado somente no submit, sem `Content-Type` manual, com exatamente
  `certificate`, `password` e `purpose=cte`;
- limpeza do `FormData`, referência do arquivo e senha em `finally`, tanto no
  sucesso quanto no erro;
- respostas validadas por allowlist: certificado expõe somente `id`, `status`,
  `purpose`, `validFrom`, `expiresAt` e `version`; qualquer campo extra,
  segredo, identidade de tenant ou detalhe interno vira erro estável;
- permissão `settings.manage`, ausência total de mutações sem permissão,
  estados loading/empty/error/success e produção exibida somente como
  configuração ainda não habilitada para emissão;
- boundaries React/i18n/design tokens e proibição de persistência sensível em
  `localStorage`, `sessionStorage`, IndexedDB ou Cache Storage.

A primeira revisão independente encontrou três lacunas P2: cursor/`nextCursor`
não contratado, DTO público ainda aceitando `unknown` e validação defensiva
limitada a `ciphertext`. A re-revisão encontrou um P1 adicional: o frontend
aceitava `test` e excluía `homologation`, divergindo do domínio exato da API.
Todos foram fechados antes do commit; não restaram achados P0–P3.

Evidência RED e de não regressão:

```text
bun test test/frontend-contract.test.ts test/keycloak-auth-provider.test.ts
17 pass, 0 fail, 65 assertions

bun test test/company-settings.contract.test.ts
0 pass, 16 fail
RED exclusivo: quatro módulos e a página da T023 ainda ausentes

bun run test
17 pass, 16 fail
prova que o novo agregador está registrado no script test

bun run typecheck
quatro TS2307 dos módulos T023 ausentes e uma asserção de tipo exato ainda RED

bun run lint
exit 0

Prettier e git diff --check
exit 0
```

Todos os arquivos têm menos de 200 linhas e as funções revisadas no máximo 40.
Foram usados somente tokens, senhas, bytes e metadados sentinela sintéticos. O
PFX real e sua senha não foram acessados, copiados ou registrados. Nenhum XML
fiscal real, SEFAZ, RabbitMQ, fila, exchange, S3, Railway ou deploy participou
da T022.

## T023 — Tela Vite de configurações fiscais

Executor: Codex Terra medium. Revisão raiz e revisão independente: Codex Terra
medium. A skill de frontend design orientou uma mesa operacional fiscal, com
faixa sequencial de prontidão, tipografia e tokens já presentes no projeto e
destaque controlado para o ambiente de produção.

Implementação:

- o entrypoint Vite renderiza a página de configurações dentro do
  `QueryClientProvider`, sem introduzir Next.js ou dependência compartilhada
  local;
- o cliente usa paths relativos reais, bearer obtido sob demanda apenas em
  memória, `cache: "no-store"`, idempotência nas mutações e multipart com
  boundary gerado automaticamente;
- erros HTTP, de rede e respostas inválidas são reduzidos a códigos estáveis;
  nenhum detalhe interno é propagado;
- validação defensiva exige DTOs com chaves exatas, UUID, ISO UTC canônico,
  decimal positivo dentro de `bigint`, cursor base64url e somente os seis
  metadados seguros do certificado;
- TanStack Query consulta settings e histórico de certificados, invalida ambos
  após rotação e separa o cache pelo `companyId` obtido da identidade
  autenticada; esse ID nunca entra no request;
- queries e mutações permanecem desabilitadas sem `settings.manage`, e dados
  anteriormente cacheados não são renderizados após perda da permissão;
- o formulário cobre todos os campos do perfil fiscal, série, próximo número,
  ambiente e `expectedVersion` otimista, inclusive `null` no primeiro cadastro;
- upload mantém PFX/senha somente no draft em memória, cria `FormData` no
  submit e limpa referências, DOM e body em sucesso, falha, build do multipart
  ou submit incompleto;
- a UI apresenta status, validade e versão do certificado, estados
  loading/empty/error/success, feedback de salvamento e produção explicitamente
  como configuração que não habilita emissão;
- CSS Modules usa os design tokens existentes, layout responsivo a partir de
  48 rem, foco global preservado e cópia completa em português e inglês.

A revisão raiz corrigiu cinco lacunas antes do primeiro gate final: remoção
indevida do `Content-Type` multipart, validação superficial de CT-e/perfil,
formulário incompleto, estado inicial assíncrono e ausência da query do
histórico. Também tornou o cache tenant-scoped e aplicou o uso real de CSS
Modules. A revisão independente encontrou limpeza ausente no submit incompleto,
validade não apresentada e valores não canônicos ainda aceitos pelos guards.
Todos os achados foram corrigidos e a revisão final aprovou a T023 sem P0–P3.

Evidência local final:

```text
bun run --cwd apps/frontend-transportada check
33 pass, 0 fail, 176 assertions
lint, typecheck e build Vite/PWA verdes

bunx eslint src/modules/company-settings \
  --rule 'max-lines-per-function:["error",{"max":40,"skipBlankLines":true,"skipComments":true}]'
exit 0

Prettier e git diff --check
exit 0
```

O maior arquivo de produção tem 190 linhas e todas as funções revisadas têm no
máximo 40. O smoke autenticado e a auditoria de DOM/storage/cache pertencem à
T024 e não foram antecipados. O PFX real e sua senha não foram acessados,
copiados ou registrados. Nenhum XML fiscal real, SEFAZ, RabbitMQ, fila,
exchange, S3, Railway, ambiente remoto ou deploy participou da T023.

## T024 — Jornada fiscal e ausência de segredo

Executor: Codex Terra medium. Revisão raiz e revisão independente de segurança:
Codex Sol high.

O Playwright autenticado agora comprova:

- renderização responsiva da tela fiscal em 375, 768 e 1280 px, sem overflow
  horizontal;
- login real no Keycloak local e identidade sintética elevada somente na visão
  da UI para exercitar os controles de `settings.manage`;
- service worker `ready` e controlador ativo antes dos uploads;
- substituição sintética bem-sucedida, seguida da limpeza do file input, senha
  e referências observáveis;
- tentativa com a UI burlada usando o token real do usuário local `viewer`;
  `route.fetch()` encaminha o POST à API local e o teste exige origem
  `http://localhost:53001`, status `403` e código seguro `FORBIDDEN`;
- ausência dos bytes, senha e nome sintéticos no DOM, nas chaves e valores de
  `localStorage`/`sessionStorage`, nos nomes, URLs e corpos de Cache Storage e
  nos nomes e registros de IndexedDB;
- varredura recursiva e fail-closed de IndexedDB para objetos, mapas, conjuntos,
  `Blob`/`File`, `ArrayBuffer` e views tipadas;
- teste negativo da própria auditoria, semeando `Blob`, `ArrayBuffer` e
  `Uint8Array` sintéticos e exigindo que o resíduo seja detectado;
- preservação dos smokes anteriores de PWA, reload offline e falha fechada no
  refresh de token.

O primeiro smoke real revelou `Illegal invocation`: o `fetch` global havia sido
armazenado como método e era chamado com `this` incorreto, lacuna que os mocks
unitários não reproduziam. O frontend passou a fornecer
`fetch: (request) => fetch(request)`, mantendo o contrato e o binding correto.

A primeira revisão Sol encontrou três lacunas: serialização IndexedDB incapaz de
ler material binário, upload sem prova de controle pelo service worker e 403
sem origem/código explicitamente afirmados. Todas foram corrigidas. A
re-revisão independente terminou com zero achados P0–P3.

Evidência local final:

```text
bun run --cwd apps/frontend-transportada check
33 pass, 0 fail, 176 assertions
lint, typecheck e build Vite/PWA verdes

bun run --cwd apps/frontend-transportada smoke
9 pass, 0 fail
3 viewports, sucesso, detector binário, 403 local, PWA, offline e refresh

make smoke
realm Keycloak 6 pass; health API/worker verde; Playwright 9 pass

bunx eslint test/certificate-residue-*.helper.ts \
  test/company-settings-smoke.helper.ts test/responsive.smoke.spec.ts \
  test/token-refresh-smoke.helper.ts \
  --rule 'max-lines-per-function:["error",{"max":40,"skipBlankLines":true,"skipComments":true}]'
exit 0

Prettier e git diff --check
exit 0

SIGTERM na sessão controlada de make dev; make down
frontend/API/worker encerrados; containers, rede e portas locais removidos
```

Todos os arquivos alterados têm menos de 200 linhas e as funções revisadas têm
no máximo 40. Somente bytes, senha, metadados e identidade sentinela sintéticos
foram usados. O PFX real e sua senha não foram acessados, copiados ou
registrados. Nenhum XML fiscal real, SEFAZ, S3, Railway, ambiente remoto, push
ou deploy participou da T024.
