# Evidência — Feature 003

## Inventário inicial

Modelos:

- OpenCode `deepseek-v4-flash-free`: primeiro rascunho de spec, plano e tasks;
- Codex Sol high: revisão de segurança, tenant, dados e contratos reais.

Fontes inspecionadas:

- constituição, arquitetura, domínio e plano de entrega do TransportAdA;
- grafo existente do repositório `adatechnology-packages`;
- manifest, source, testes e README do provider Bun local;
- tarball npm de `@adatechnology/auth-keycloak@0.1.18`;
- documentação atual de Keycloak 26.5.2 e `jose`.

Descobertas confirmadas:

- o tarball npm `0.1.18` contém implementação NestJS, peers
  `@nestjs/common`/`@nestjs/core` e não pode ser consumido pela API Bun;
- o checkout Ada contém outro provider Bun, versão `0.0.1`, sob o mesmo nome;
- o source Bun local não exige claims padrão, não valida a audience configurada,
  aceita fallback de algoritmo e pode escolher uma JWK sem `kid` inequívoco;
- o frontend deve usar Authorization Code + PKCE S256; o adapter Keycloak
  mantém access e refresh tokens em memória;
- `jose` suporta Bun, `createRemoteJWKSet`, `jwtVerify`, allowlist de algoritmo,
  issuer, audience, required claims, cache e cooldown;
- `company_id` e a matriz de permissões são regras do TransportAdA, não do
  package genérico.
- revisão Sol exigiu identidade por `(issuer, sub)`, roles locais por
  membership e contextos separados de plataforma e empresa;
- revisão Sol recomenda preservar o package NestJS publicado e adotar um novo
  nome para o provider Bun.

## T001 — Identidade do package e ADR

Decisão aceita:

- o provider Bun será `@adatechnology/keycloak-jwt`;
- o package publicado `@adatechnology/auth-keycloak` permanece compatível com
  seus consumidores NestJS e não é alterado;
- identidade externa usa `(issuer, subject)`;
- tenant, membership e autorização permanecem no TransportAdA;
- publicação depende de gate próprio e aprovação humana;
- rollback usa pin de versão e nova correção, nunca `unpublish`.

Arquivos:

- `docs/adr/0002-keycloak-jwt-package-and-tenant-context.md`;
- `specs/003-tenant-auth/spec.md`;
- `specs/003-tenant-auth/plan.md`;
- `specs/003-tenant-auth/tasks.md`;
- `specs/003-tenant-auth/evidence.md`.

Nenhuma implementação, publicação, ação Railway ou leitura de certificado foi
executada nesta task.

## T002 — Contract suite de segurança

Modelo executor e revisão: Codex Sol high. O grafo e os providers
`drizzle-provider`/`rabbitmq-provider` orientaram o formato ESM, exports
tipados, `tsup`, TypeScript estrito e testes Bun.

Commit Ada:

- `ea93e71 test(auth): define Keycloak JWT security contracts`

Contratos inicialmente vermelhos:

- token válido e audience simples ou em array;
- assinatura adulterada e token malformado;
- `iss`, `aud`, `exp`, `sub` e claims configuradas obrigatórias;
- issuer/audience incorretos e `azp` sem `aud`;
- expiração, `nbf` opcional e clock tolerance;
- `sub` vazio ou não textual;
- algoritmo fora da allowlist, `none`, `kid` ausente ou desconhecido;
- allowlist insegura e JWKS HTTP fora de loopback;
- erros tipados, mensagem constante e ausência de token ou `cause`.

Evidência local:

```text
bunx prettier --check .
All matched files use Prettier code style!

bunx tsc --noEmit -p tsconfig.json
exit 0

pnpm exec eslint src test
exit 0

bun test test/token-verification.contract.test.ts
0 pass, 23 fail
```

As 23 falhas são esperadas e causadas pelo stub `Not implemented`. Nenhuma
dependência JOSE ou lógica de verificação foi adicionada antes dos contratos.

## T003 — Verificação JWT/JWKS

Modelo executor e revisão independente: Codex Sol high.

Commit Ada:

- `d79b955 feat(auth): verify Keycloak JWTs with jose`

Implementação:

- `jose@6.2.3` ESM fixado como dependência;
- factory mantém uma instância `createRemoteJWKSet`;
- allowlist assimétrica, algoritmo e `kid` validados antes do fetch;
- issuer, audience, `exp`, `sub` e claims adicionais obrigatórios;
- `nbf` e clock tolerance explícitos;
- JWKS HTTP permitido somente em loopback local;
- erros de configuração e verificação têm tipos e mensagens seguras;
- JWKS 503/JSON inválido é separado de token inválido;
- configuração runtime inválida não escapa como `TypeError`;
- claims retornadas são congeladas.

Evidência local:

```text
pnpm exec tsc --noEmit -p tsconfig.json
exit 0

pnpm exec prettier --check package.json src test tsconfig.json tsup.config.ts
All matched files use Prettier code style!

pnpm exec eslint src test
exit 0

bun test
26 pass, 0 fail, 99 expect() calls

pnpm exec tsup
ESM dist/index.js 7.49 KB
DTS dist/index.d.ts 1.80 KB
```

A revisão não encontrou bypass restante de issuer, audience, `kid` ou
algoritmo, nem vazamento no erro público. Cache, cooldown, timeout, limite de
resposta e rotação permanecem na T004.

## T004 — Ciclo remoto JWKS

Modelo executor e revisão independente: Codex Sol high.

Commit Ada:

- `2259078 feat(auth): harden remote JWKS lifecycle`

Comportamentos:

- 10 verificações concorrentes iniciais usam um único fetch;
- cache fresco é reutilizado e cache vencido é atualizado;
- 10 tokens com `kid` rotacionado provocam somente um refetch após cooldown;
- tokens com `kid` desconhecido durante cooldown não causam rajada;
- cooldown mínimo é 1 segundo e `cacheMaxAge` não pode neutralizá-lo;
- timeout cobre espera por headers e corpo interrompido;
- limite de bytes cobre `Content-Length` e stream chunked;
- configuração remota inválida produz erro tipado;
- `getJwksStatus()` expõe apenas booleanos seguros para readiness, sem URL,
  chaves ou clone do JWKS.

Evidência local:

```text
pnpm exec tsc --noEmit -p tsconfig.json
exit 0

pnpm exec prettier --check package.json src test tsconfig.json tsup.config.ts
All matched files use Prettier code style!

pnpm exec eslint src test
exit 0

bun test
36 pass, 0 fail, 128 expect() calls

pnpm exec tsup
ESM dist/index.js 10.96 KB
DTS dist/index.d.ts 2.37 KB
```

A revisão final não encontrou race, bypass do limite, erro de classificação ou
resource leak bloqueante.

## T005 — Empacotamento e instalação Bun limpa

Modelo executor: Codex Terra medium. Revisão: Codex Sol high.

Commit Ada:

- `dc068cd docs(auth): prepare Keycloak JWT package release`

Artefato:

- changeset minor prepara a primeira versão sem alterar manualmente `0.0.0`;
- tarball final contém somente `README.md`, `dist/index.js`,
  `dist/index.d.ts` e `package.json`;
- tamanho final: 4,8 kB compactado e 16,8 kB descompactado;
- metadata não contém `workspace:`, `file:`, NestJS ou source interno;
- árvore do consumidor contém o package, `jose@6.2.3` e TypeScript usado
  apenas pelo teste.

Evidência local:

```text
npm pack --dry-run --json
4 arquivos; nenhum bundled dependency

bun install --force
3 packages installed

bun run check
exit 0

bun run test:runtime
esm-types-runtime-ok

bun install --frozen-lockfile
1 package installed

bun run check
exit 0

bun run test:runtime
esm-types-runtime-ok
```

O consumidor temporário usa o tarball local por `file:` somente para testar o
artefato ainda não publicado. Esse caminho existe no lock temporário, não no
package empacotado. Nenhuma publicação npm, ação Railway ou push foi executado.

## T006 — Publicação npm e pin exato

Modelo executor e revisão: Codex Sol high. A publicação ocorreu somente após
aprovação humana explícita.

Release Ada:

- versão pública `@adatechnology/keycloak-jwt@0.1.0`;
- commit de versão `4538039 chore(release): version packages`;
- commit de acesso público
  `25efb68 fix(release): enforce public Keycloak package access`;
- workflow de publicação inicial
  [29686827715](https://github.com/Andersonfrfilho/adatechnology-packages/actions/runs/29686827715)
  verde;
- workflow de correção/verificação de acesso
  [29686969381](https://github.com/Andersonfrfilho/adatechnology-packages/actions/runs/29686969381)
  verde;
- CI Ada
  [29686827726](https://github.com/Andersonfrfilho/adatechnology-packages/actions/runs/29686827726)
  verde.

O primeiro publish criou a versão, mas o pacote scoped ainda não estava
consultável anonimamente. O workflow foi endurecido com
`npm access set status=public`, executado com sucesso sem expor credenciais.
Depois da propagação, `npm view` e `npm pack` anônimos confirmaram:

```text
name=@adatechnology/keycloak-jwt
version=0.1.0
latest=0.1.0
integrity=sha512-ALHHWeB5VNEyYLyo1MhiyCj0i6Ir/UMikC/+1IhmdVJHM6bqE3Duu05wi6pYHA6Pc1n1XtidItzhtvmDFRCg+Q==
4 arquivos; 16,8 kB descompactados; nenhum bundled dependency
```

Consumo TransportAdA:

- a API fixa exatamente `0.1.0`, sem range, `file:` ou dependência reutilizável
  criada no monorepo;
- o lock Bun registra o mesmo integrity do registry e `jose@6.2.3`;
- import ESM runtime a partir da dependência instalada foi validado;
- `bun install --frozen-lockfile` não alterou o lock.

Evidência local:

```text
bun run check (apps/api-transportada)
19 pass, 1 integração PostgreSQL condicionada, 0 fail
lint, typecheck e build verdes

ENV_FILE=.env.example make check
realm 4 pass; API 19 pass; worker 22 pass; frontend 3 pass
format, lint, typecheck e builds verdes
```

Nenhuma ação Railway, leitura de certificado ou uso de segredo fiscal ocorreu.

## T007 — Keycloak local

Modelo executor: Codex Terra medium. Revisão: Codex Sol high.

Commit TransportAdA:

- `ed98fc1 feat(auth): add local Keycloak realm`

Fundação local:

- Keycloak 26.5.2 fixado por versão e digest;
- serviço saudável dentro do projeto Compose `transportada-local`;
- realm importado de JSON versionado;
- SPA pública com Authorization Code, callback exato e PKCE S256;
- implicit flow, password grant e service account desabilitados;
- client API bearer-only usado como audience separada;
- mapper `company_id` no access token;
- roles fixas existem como fixtures, mas nenhuma role tenant é atribuída ao
  usuário ou tratada como autoridade;
- placeholders do realm são substituídos por ambiente conforme suporte oficial
  do Keycloak 26.5.2;
- `make realm-contract`, `make config`, `make up`, `make ps` e o smoke de
  identidade usam o mesmo Makefile/nome de projeto.

Evidência local:

```text
ENV_FILE=.env.example make realm-contract
4 pass, 0 fail, 33 expect() calls

ENV_FILE=.env.example make up
transportada-local-keycloak-1 healthy

discovery issuer/JWKS
exit 0

Authorization Code + callback exato + S256
HTTP 200

ENV_FILE=.env.example make check
API 11 pass, 1 skip
worker 22 pass
frontend 3 pass
lint, typecheck e builds verdes
```

O Keycloak e os demais serviços de infraestrutura permanecem locais e
saudáveis. Os apps não foram iniciados, portanto o `make smoke` completo ficou
fora deste gate; discovery, JWKS e health do Keycloak foram validados
diretamente. Nenhuma ação Railway ou uso do certificado ocorreu.

## T008 — Schema de identidade e tenant

Modelo executor e duas revisões independentes: Codex Sol high.

Schema declarativo:

- cinco tabelas conforme o plano mínimo: usuários internos, identidades
  externas, empresas, memberships e roles por membership;
- unicidade global de `(issuer, subject)` e rejeição de ambos quando contêm
  somente whitespace reconhecido por JavaScript, incluindo espaços Unicode;
- FKs de usuário e empresa com remoção restrita; cascade somente dos papéis
  filhos quando a membership é removida;
- unique `(user_id, company_id)`, chave composta
  `(membership_id, role)` e índices de consulta por tenant/usuário;
- status e roles limitados por CHECKs PostgreSQL;
- UUIDs gerados e timestamps `timestamptz` obrigatórios.

Decisão de autoridade:

- a realm role exata `platform-admin` em JWT já validado é a atribuição de
  plataforma;
- ela somente poderá criar `PlatformContext` em rota platform-scoped;
- roles de empresa presentes no token nunca autorizam operações e continuam
  exclusivamente na membership ativa do PostgreSQL;
- o ADR 0002, a spec e o plano foram alinhados antes da migration.

Evidência local:

```text
bun test test/identity-schema.contract.test.ts
6 pass, 0 fail, 80 expect() calls

bun run check
17 pass, 1 integração PostgreSQL condicionada, 0 fail
lint, typecheck e build verdes

bun run db:check
Everything's fine

PostgreSQL local: regex de identidade
tab/newline=false; NBSP=false; texto não vazio=true
```

A primeira revisão encontrou a origem ainda ambígua de `platform-admin`,
`issuer/subject` vazios, um timestamp ausente e asserts insuficientes. Todos
foram corrigidos. A segunda revisão não encontrou bloqueio; seu endurecimento
de whitespace também foi aplicado e validado no PostgreSQL local. Nenhuma
migration foi gerada ou aplicada nesta task; inserts negativos e rollback
pertencem à T009.

## T009 — Migration, rollback e journal

Modelo executor e duas revisões independentes: Codex Sol high.

Artefatos e operação:

- migration Drizzle aditiva `20260719025322_tenant_identity`, sem `DROP`,
  `DELETE`, `TRUNCATE` ou alteração destrutiva;
- snapshot versionado e `drizzle-kit check` sem drift;
- rollback SQL manual remove primeiro roles/memberships e depois identidades e
  empresas, sem `CASCADE`;
- rollback remove exatamente o journal por nome e SHA-256 antes das tabelas,
  tudo na mesma transação, e falha fechado se não houver exatamente uma linha;
- schema do journal foi fixado em `drizzle` no serviço para não divergir do
  rollback versionado;
- startup da API não importa nem executa migrations;
- `make postgres-up` e `make migration-test` usam o projeto
  `transportada-local` e não sobem/recriam Keycloak, RabbitMQ, MinIO ou Mailpit.

Contrato PostgreSQL descartável:

- cria banco único e aplica baseline + migration;
- confirma cinco tabelas e duas entries no journal;
- aceita múltiplas roles por membership;
- valida SQLSTATE e nome da constraint para todas as FKs, uniques/PK e CHECKs
  de status, roles e identidade não vazia;
- executa rollback, confirma somente baseline no journal, reaplica a migration
  e executa rollback novamente;
- fecha conexões mesmo sob falha, remove o banco e confirma zero resíduos.

Evidência local:

```text
make migration-test
4 pass, 0 fail, 64 expect() calls

bun run db:check
Everything's fine

ENV_FILE=.env.example make check
API 19 pass, 1 integração PostgreSQL condicionada
worker 22 pass
frontend 3 pass
lint, typecheck e builds verdes

containers transportada-local
PostgreSQL, RabbitMQ, MinIO, Mailpit e Keycloak healthy

select count(*) from pg_database where datname like 'transportada_t009_%'
0
```

A primeira revisão encontrou journal inconsistente após rollback, acoplamento
do gate à stack inteira, cleanup frágil e negativos genéricos. A segunda pediu
as três constraints ainda não exercidas e alinhamento do schema do journal.
Todos os achados foram corrigidos e reexecutados localmente. Nenhuma migration
foi aplicada ao banco persistente, e nenhuma ação Railway, npm ou certificado
foi executada.

## T010 — Gateway JWT e identidade externa

Modelo executor e revisão independente: Codex Sol high.

Boundary de autenticação:

- o bootstrap da API instancia `@adatechnology/keycloak-jwt@0.1.0` com issuer,
  JWKS URI e audience vindos somente de configuração;
- o gateway fixa `RS256`, exige `company_id` e reduz os sete erros tipados do
  provider a uma rejeição interna sem `cause`;
- Bearer ausente ou malformado, token rejeitado e identidade local inexistente
  retornam o mesmo `401 UNAUTHENTICATED`;
- falhas inesperadas de verifier ou PostgreSQL permanecem `500 INTERNAL_ERROR`
  seguro e não são disfarçadas como credencial inválida;
- health continua público; toda outra rota autentica antes do roteamento;
- logs usam marcador para paths desconhecidos e nunca recebem token,
  Authorization header, erro interno ou payload de claims.

Identidade local:

- o repositório Drizzle consulta conjuntamente `issuer` e `subject`;
- somente `identity_users.status = 'active'` resolve uma identidade;
- `company_id` é validado como UUID e preservado apenas como seleção do token;
  ainda não existe `CompanyContext`, membership, role ou permissão;
- claims brutas `iss`/`sub` e qualquer tenant enviado pelo cliente não escolhem
  a identidade local.

Evidência local:

```text
bun test test/authentication.contract.test.ts
12 pass, 0 fail

bun run check (apps/api-transportada)
34 pass, 1 integração PostgreSQL condicionada, 0 fail
lint, typecheck e build verdes

integração PostgreSQL descartável
8 pass, 0 fail
par issuer/subject, usuário desativado, migration, rollback e shutdown verdes

ENV_FILE=.env.example make check
realm 4 pass; API 34 pass; worker 22 pass; frontend 3 pass
format, lint, typecheck e builds verdes
```

O teste do repositório cria um banco isolado, aplica as migrations e o remove
ao final. A revisão encontrou risco de vazamento por pathname desconhecido; o
log passou a usar `<unmatched>` e ganhou regressão específica. Nenhuma ação
Railway, uso de certificado ou contexto tenant foi executado.

## T011 — Membership e contextos company/platform

Modelo executor e duas revisões independentes: Codex Sol high.

Contextos:

- `CompanyContext` nasce exclusivamente de `userId` autenticado e
  `companyIdClaim` verificado, sem parâmetro tenant livre;
- uma única consulta filtra simultaneamente usuário, empresa, membership ativa
  e empresa ativa;
- roles empresariais são lidas somente de `membership_roles`, ordenadas e
  snapshotadas; roles tenant presentes no JWT são ignoradas;
- membership ativa sem roles produz `roles: []`; permissões permanecem fora do
  contexto até a T012;
- ausência, empresa desativada, membership desativada e tentativa cross-tenant
  colapsam no mesmo `403 FORBIDDEN`;
- `PlatformContext` exige somente a realm role exata `platform-admin` do token
  já verificado e nunca contém `companyId` ou membership;
- client role, lookalike, claim malformada e roles locais não criam contexto de
  plataforma;
- `platform-admin` continua obrigado a possuir membership ativa em toda
  operação company-scoped.

Imutabilidade:

- envelope, scope, identidade snapshotada e array de roles são congelados;
- mutar a identidade recebida depois da resolução não altera o contexto em
  voo.

Evidência local:

```text
bun test test/tenant-context.contract.test.ts test/authentication.contract.test.ts
19 pass, 0 fail

bun run test:integration
9 pass, 0 fail
duas empresas, seleção A/B, isolamento negativo, estados e roles vazias verdes

ENV_FILE=.env.example make check
realm 4 pass; API 41 pass; worker 22 pass; frontend 3 pass
format, lint, typecheck e builds verdes
```

A primeira revisão definiu os negativos de duas empresas, origem local das
roles e escopo explícito. A segunda encontrou a identidade ainda referenciada
no contexto; ela passou a ser copiada e congelada, com regressão de mutação.
Nenhuma permissão, `/auth/me`, Railway ou certificado entrou nesta task.

## T012 — RBAC tipado e deny-by-default

Modelo executor e duas revisões independentes: Codex Sol high.

Decisão:

- o ADR 0003 registra uma matriz conservadora de 15 permissões;
- `platform-admin` recebe somente `companies.manage` em `PlatformContext`;
- `company-admin` recebe gestão local, configurações, auditoria e leituras, mas
  não herda emissão, cancelamento, importação ou faturamento;
- `finance`, `fiscal`, `operator` e `viewer` recebem somente as capacidades
  explicitamente listadas para seu domínio;
- ambiguidades de `users.manage`, `invoices.*` e múltiplas permissões
  permanecem negadas até nova spec.

Implementação:

- tupla fechada deriva `TransportadaPermission`;
- a matriz usa cobertura exaustiva de todas as `CompanyRole`;
- múltiplas roles locais produzem união determinística sem duplicatas;
- membership sem roles produz zero permissões;
- `companies.manage` nunca entra em `CompanyContext`;
- ausência de política, escopo incompatível ou permissão ausente retorna o
  mesmo `403 FORBIDDEN`;
- o guard não revela role, permissão, usuário ou tenant e não permite executar
  o caso de uso depois da negação;
- arrays, matriz e conjunto de permissões são imutáveis em runtime.

Evidência local:

```text
bun test test/authorization.contract.test.ts
10 pass, 0 fail

bun run check (apps/api-transportada)
51 pass, 1 integração PostgreSQL condicionada, 0 fail
lint, typecheck e build verdes

ENV_FILE=.env.example make check
realm 4 pass; API 51 pass; worker 22 pass; frontend 3 pass
format, lint, typecheck e builds verdes
```

A revisão encontrou dois vazamentos do backing `Set`: o terceiro argumento de
`forEach` e `valueOf()` herdado. O wrapper passou a expor somente uma allowlist
fechada de `ReadonlySet`, com `forEach` encapsulado, e ganhou regressões para os
dois ataques. `/auth/me`, Railway e certificado permaneceram fora do escopo.

## T013 — `/auth/me` e observabilidade segura

Modelo executor: Codex Terra medium. Revisão e correções: Codex Sol high.

Endpoint:

- `GET /auth/me` executa autenticação e resolve `CompanyContext` pela
  membership ativa;
- resposta mínima usa envelope `data` e contém somente `userId`, `companyId`,
  roles locais e permissões tipadas/determinísticas;
- token, issuer, subject, external identity, `companyIdClaim`,
  `platformAdmin` e claims não são serializados;
- header, query e body não selecionam tenant; a integração prova isolamento
  negativo entre duas empresas;
- ausência/token inválido retorna 401, vínculo ausente retorna 403 e método não
  suportado autentica antes do 405;
- health continua público e rota desconhecida continua autenticada antes do
  404 seguro.

Observabilidade e cache:

- o log específico contém somente correlation ID e status; Authorization,
  query, claims, usuário, empresa, roles e permissões não entram em metadata;
- todas as respostas de `/auth/me`, inclusive 401, 403, 405 e 500, recebem
  `Cache-Control: no-store`;
- o DTO preserva os unions fechados `CompanyRole` e `CompanyPermission`.

Evidência local:

```text
bun test test/auth-me.contract.test.ts
6 pass, 0 fail

bun run test:integration
10 pass, 0 fail
duas empresas, cross-tenant, migration/rollback e shutdown verdes

ENV_FILE=.env.example make check
realm 4 pass; API 57 pass; worker 22 pass; frontend 3 pass
format, lint, typecheck e builds verdes
```

A revisão Sol encontrou cache autenticado sem `no-store` e DTOs que haviam
perdido os tipos fechados; ambos foram corrigidos e revalidados.

Readiness JWKS não foi inferido a partir de `getJwksStatus()`: o contrato atual
não distingue cache frio inicial de falha remota sem chave, e marcá-lo como
down no bootstrap impediria o primeiro tráfego capaz de preencher o cache.
Resolver isso exige uma operação explícita de warmup/probe em nova versão do
provider Ada; não houve publicação implícita nesta task.

Nenhuma ação Railway ou uso do certificado ocorreu.

## T014 — Frontend Keycloak com PKCE

Modelo executor: Codex Terra medium. Revisão de segurança: Codex Sol.

Implementação:

- `keycloak-js@26.2.4` está fixado; esta é a versão oficial disponível para o
  adapter, compatível com o servidor local Keycloak 26.5.2;
- a integração externa está encapsulada em
  `modules/identity/shared/KeycloakAuthProvider.provider.ts` e inicializa antes
  da montagem React com Authorization Code, `login-required` e PKCE `S256`;
- o callback é fixo em `${window.location.origin}/auth/callback`, compatível
  com o redirect URI estrito do realm local; não há origem de redirect por
  query, storage ou input do usuário;
- antes de `/auth/me`, a query TanStack chama `updateToken(30)` e envia somente
  o access token atual em `Authorization: Bearer`; a resposta é validada contra
  o DTO fechado de roles e permissões da API;
- refresh ausente ou falho limpa o estado em memória e reinicia o login; a
  aplicação não grava token em localStorage, sessionStorage, IndexedDB,
  service worker, cache ou logs;
- `.env.example` documenta `VITE_API_URL`, `VITE_KEYCLOAK_URL`,
  `VITE_KEYCLOAK_REALM` e `VITE_KEYCLOAK_CLIENT_ID`; o service worker mantém
  runtime cache apenas para health, portanto `/auth/me` não entra em cache;
- a revisão Sol restringiu as URLs públicas a HTTPS ou HTTP em `localhost`,
  sem credenciais, query ou fragment, e adicionou contratos comportamentais
  para inicialização, refresh e falha fechada.

Contratos adicionados antes da implementação:

- uso do adapter exato, `login-required`, PKCE S256, callback fixo e ausência
  de APIs de persistência;
- renovação antes de `/auth/me`, Bearer e validação do envelope;
- variáveis Vite necessárias e ausência de cache autenticado no Workbox.

Evidência local:

```text
bun test test/frontend-contract.test.ts test/keycloak-auth-provider.test.ts
16 pass, 0 fail

bun run check (apps/frontend-transportada)
lint, typecheck, 16 testes e build/PWA verdes

bun install --frozen-lockfile
509 installs verificados, sem mudanças

ENV_FILE=.env.example make check
realm 4 pass; API 57 pass e 1 integração condicional; worker 22 pass;
frontend 16 pass; format, lint, typecheck e builds verdes
```

Não foram executados Playwright/T015, Railway, certificado ou push.

Gap bloqueante para o fluxo local autenticado:

- a SPA configurada em `http://localhost:53000` chama a API em
  `http://localhost:53001`; por enviar `Authorization`, o navegador fará
  preflight `OPTIONS`;
- a API atual não declara CORS nem trata `OPTIONS`, portanto o browser bloqueará
  a chamada de `/auth/me` apesar do contrato do frontend;
- T014A foi adicionada como dependência explícita da T015 para implementar e
  testar CORS estrito. Não houve alteração do backend nesta task.

## T014A — CORS estrito da SPA para a API

Modelo executor e revisão: Codex Sol high.

Configuração confiável:

- `FRONTEND_ORIGIN` é obrigatória no schema e no Makefile;
- `.env.example` fixa a origem local em `http://localhost:53000`;
- a configuração aceita origin canônica HTTPS e permite HTTP somente quando o
  hostname é exatamente `localhost`;
- wildcard, credenciais, path, query, fragment, barra final, loopback por IP e
  representações não canônicas são rejeitados no startup;
- `make dev` continua exportando o arquivo selecionado com `set -a`, sem
  duplicar ou registrar o valor.

Contrato HTTP:

- o único preflight público é `OPTIONS /auth/me`, com origin exata, método
  solicitado `GET` e headers solicitados limitados a `Authorization`, com
  parsing case-insensitive e rejeição de tokens vazios ou headers adicionais;
- o sucesso retorna `204` vazio, allow-origin exata, métodos `GET`, headers
  `Authorization`, max-age de 300 segundos, `Vary` completo e
  `Cache-Control: no-store`;
- preflight inválido retorna o envelope seguro `403 FORBIDDEN`, não autentica,
  não resolve membership, não executa caso de uso e não reflete a origin;
- respostas reais da origin permitida recebem allow-origin em health e
  `/auth/me` para `200`, `401`, `403`, `405` e `500`;
- respostas sem origin ou com origin diferente preservam o comportamento
  existente, nunca recebem allow-origin e ainda variam por `Origin`;
- não existe wildcard nem `Access-Control-Allow-Credentials`;
- Origin e Authorization não entram nos logs.

Contratos foram escritos primeiro. O gate inicial confirmou 31 falhas e 2
passes antes da implementação; após o boundary CORS, os 33 casos passaram.

Evidência local:

```text
bun test test/cors.contract.test.ts
33 pass, 0 fail, 133 expect() calls

bun run check (apps/api-transportada)
90 pass, 1 integração PostgreSQL condicionada, 0 fail
lint, typecheck e build verdes

ENV_FILE=.env.example make check
realm 4 pass; API 90 pass e 1 integração condicional; worker 22 pass;
frontend 16 pass; format, lint, typecheck e builds verdes

set -a; . ./.env.example; set +a
bun run --cwd apps/api-transportada test:integration
10 pass, 1 skip, 0 fail, 50 expect() calls
preflight e chamada autenticada cross-origin atravessando Bun.serve verdes

make config
configuração local padrão via .env e realm contract verdes
```

O `.env` local ignorado pelo Git foi sincronizado com as variáveis públicas e
placeholders locais de Keycloak do `.env.example`; nenhum segredo real foi
adicionado.

Nenhum Playwright/T015, Railway, certificado ou push foi executado.

## T014B — Bootstrap da identidade local da aplicação

Modelo executor e revisão: Codex Sol high.

Contrato determinístico:

- o usuário `local-user` do realm versionado possui o UUID fixo
  `00000000-0000-4000-8000-000000000002`, que se torna o `subject` esperado;
- o shell de empresa ativo usa o UUID fixo
  `00000000-0000-4000-8000-000000000001`;
- usuário interno, identidade externa e membership usam UUIDs distintos e
  determinísticos;
- a identidade externa exige o issuer local exato e o subject do realm;
- a membership ativa recebe somente `viewer`, privilégio mínimo suficiente
  para resolver `/auth/me`; roles operacionais e `platform-admin` não são
  concedidas.

Seed e concorrência:

- o seed pertence somente à API TransportAdA e usa o schema Drizzle existente;
- toda a operação ocorre em uma transação PostgreSQL;
- `pg_advisory_xact_lock` estável serializa bootstraps concorrentes antes da
  leitura e inserção;
- a segunda aplicação e duas aplicações simultâneas preservam exatamente uma
  company, identidade, external identity, membership e role;
- linhas compatíveis são reutilizadas sem atualizar timestamps ou estado;
- colisão de ID, `(issuer, subject)`, membership, status ou role divergente
  lança erro tipado e reverte toda a transação;
- dados alheios permanecem intactos e não há delete, truncate ou overwrite;
- o entrypoint falha antes de abrir o banco fora de `APP_ENV=local|test`, com
  `PROJECT_NAME` diferente de `transportada` ou issuer diferente do realm
  versionado.

Operação:

- `db:seed:local` executa somente o seed;
- `make identity-bootstrap` depende de `postgres-up` e `realm-contract`,
  recria somente o container Keycloak local para garantir a reimportação do
  realm versionado, carrega `ENV_FILE`, preserva `PROJECT_NAME`/`APP_ENV`,
  aplica primeiro `db:migrate` e depois `db:seed:local`;
- a recriação encerra sessões Keycloak locais; não remove volumes nem toca
  PostgreSQL, outros serviços ou ambientes externos;
- migrations continuam explícitas e não foram adicionadas ao startup da API.

Evidência local:

```text
bun test test/keycloak-realm.contract.test.ts
5 pass, 0 fail, 43 expect() calls

bun test ./apps/api-transportada/test/integration/local-identity-seed.integration.ts
5 pass, 0 fail, 13 expect() calls
execuções concorrentes, repetição, preservação e rollback em conflito verdes

make identity-bootstrap (executado duas vezes)
migration e seed locais verdes nas duas aplicações

make migration-test
9 pass, 0 fail, 77 expect() calls
migration/rollback e seed em PostgreSQL descartável verdes

make check
realm 5 pass; API 90 pass e 1 integração condicional; worker 22 pass;
frontend 16 pass; format, lint, typecheck e builds verdes
```

Nenhum Playwright/T015, Railway, certificado ou push foi executado; nenhum
token, senha ou XML foi registrado.

## T014C — Perfil completo do usuário local do Keycloak

Modelo executor e revisão: Codex Sol high.

Contrato e correção:

- o contract test foi ampliado antes do realm e falhou somente porque o perfil
  do `local-user` não possuía os campos exigidos pelo Keycloak 26.5.2;
- o usuário local versionado recebeu o perfil fictício e determinístico
  `Local User`, com `local-user@example.test`, `emailVerified: true` e
  `requiredActions: []`;
- UUID/subject, `company_id`, credencial não temporária por
  `${KEYCLOAK_LOCAL_USER_PASSWORD}` e ausência de realm roles foram
  preservados;
- nenhuma required action ou proteção global do realm foi desabilitada.

Operação e validação:

- `make identity-bootstrap` recriou somente o container Keycloak; PostgreSQL
  apenas foi confirmado saudável antes da migration e do seed idempotentes;
- o login pelo navegador real chegou a `/auth/callback`, exibiu a aplicação
  autenticada e não apresentou `Update Account Information`;
- senha, token, cookie e código de autorização não foram registrados nesta
  evidência.

Evidência local:

```text
bun test test/keycloak-realm.contract.test.ts (antes do realm)
4 pass, 1 fail
falha exata: perfil local e requiredActions ausentes

bun test test/keycloak-realm.contract.test.ts (depois do realm)
5 pass, 0 fail, 45 expect() calls

make identity-bootstrap
Keycloak recriado e saudável; migration e seed locais verdes

browser real
/auth/callback autenticado; Update Account Information ausente

make check
realm 5 pass; gate interrompido no format:check somente pelos arquivos
authenticated-smoke.helper.ts e responsive.smoke.spec.ts da T015 pausada

bunx prettier --check (arquivos da T014C)
All matched files use Prettier code style!

bun run lint
exit 0

bun run typecheck
exit 0

bun run test
API 90 pass e 1 skip; worker 22 pass; frontend 16 pass

bun run build
API, worker e frontend verdes
```

Nenhum arquivo/status da T015, Railway, certificado, push ou configuração de
produção foi alterado nesta task.

## T015 — Frontend autenticado com Playwright

Modelo executor: Codex Terra medium. Diagnóstico de segurança e revisão do
fluxo de refresh: Codex Sol high.

Cobertura implementada:

- login real no Keycloak local com Authorization Code e PKCE S256;
- `/auth/me` autenticado e callback fixo na mesma origem;
- layouts de 375, 768 e 1280 pixels sem overflow horizontal;
- ausência de tokens em Local Storage, Session Storage, IndexedDB e Cache
  Storage;
- service worker local sem cache de `/auth/me` ou cabeçalho Authorization;
- reload offline sem exposição de conteúdo protegido;
- refresh expirado recusado uma vez, nova navegação PKCE observada e
  reautenticação concluída sem persistir token.

O teste de refresh inicialmente falhou porque interceptava também a troca do
novo `authorization_code` e observava por polling uma URL intermediária que a
sessão SSO atravessa rapidamente. A correção limita a falha ao
`grant_type=refresh_token`, observa a requisição de navegação segura e permite
que a troca posterior finalize.

O PWA foi habilitado no servidor Vite local por `devOptions.enabled`, permitindo
que o target oficial `make dev` seja validado por `make smoke`. `dev-dist/` foi
classificado como artefato gerado e excluído de versionamento, formatação e
lint.

Evidência local:

```text
bun run --cwd apps/frontend-transportada smoke
6 pass, 0 fail

make dev
Compose transportada-local: PostgreSQL, RabbitMQ, MinIO, Mailpit e Keycloak
saudáveis; frontend 53000, API 53001 e worker 53002 iniciados

make smoke
realm 5 pass; health frontend/API/worker/infra verde; Playwright 6 pass

make check
format, lint e typecheck verdes
API 90 pass e 1 skip condicional
worker 22 pass
frontend 16 pass
builds API, worker e frontend/PWA verdes
```

Os processos Bun locais foram encerrados após os gates. Nenhum Railway,
certificado, senha, token, cookie, código de autorização ou dado fiscal foi
usado, registrado ou publicado.

## T013A — Probe JWKS recuperável e readiness

Modelo executor e revisão: Codex Sol high.

Package Ada:

- `b343f1b feat(auth): add recoverable JWKS readiness probe`;
- `e30d427 chore(release): version packages`;
- `@adatechnology/keycloak-jwt@0.1.1` publicado com acesso público e fixado
  exatamente na API;
- pipeline GitHub `29695687475` concluiu instalação, build, versionamento,
  commit de release, publicação e confirmação de acesso público;
- `probeJwks()` permanece lazy, deduplica chamadas concorrentes, valida uma
  chave pública resolvível para algoritmo e `kid` permitidos, limita falhas por
  cooldown e retorna somente `{ ready: boolean }` congelado;
- a geração exata do cache validado impede readiness positiva após uma troca
  posterior para um JWKS inutilizável.

Integração da API:

- o mesmo gateway Keycloak implementa verificação de token e a porta local de
  readiness, sem importar internals do package;
- o bootstrap permanece síncrono e não acessa rede; o primeiro probe ocorre
  somente em `/health/ready`;
- liveness não consulta PostgreSQL nem identidade;
- readiness verifica PostgreSQL e identidade independentemente e expõe somente
  `database` e `identity` como `up` ou `down`;
- falha de qualquer dependência retorna `503 degraded`, sem URL, erro remoto,
  token, claim ou material JWKS;
- uma chamada posterior retorna `200 ok` quando a identidade se recupera.

Evidência:

```text
package @adatechnology/keycloak-jwt
typecheck, ESLint, Prettier e build ESM/DTS verdes
42 pass, 0 fail, 156 assertions
npm pack --dry-run verde

GitHub Actions 29695687475
publish: success em 1m03s

npm view @adatechnology/keycloak-jwt
latest 0.1.1
integrity sha512-KJFapj3c5RQKGx74zJN83KxKYqBTMOnVs8J1OBw1EeQ94fl3XEOi1JceFoqf9CZGnuxPDGd2MjdwtziPO5xXtg==

bun install --frozen-lockfile
509 instalações verificadas; nenhuma mudança

bun run --cwd apps/api-transportada check
94 pass, 1 migration integration condicional; lint, typecheck e build verdes

bun run --cwd apps/api-transportada test:integration
15 pass, 1 skip condicional; isolamento PostgreSQL e shutdown verdes

make dev && make smoke
Compose transportada-local saudável
API readiness: database up, identity up
Playwright 6 pass
```

Os processos Bun foram encerrados após o smoke. Nenhum Railway, certificado ou
dado fiscal foi utilizado.

## T016 — Gates finais e revisão independente

Modelos:

- OpenCode `nemotron-3-ultra-free` e `deepseek-v4-flash-free`: duas tentativas
  somente leitura falharam no serviço antes de iniciar a revisão e sem alterar
  o checkout; a task foi escalada conforme a política;
- Codex Sol high: revisão final somente leitura de segurança, tenant,
  autenticação/JWKS, frontend, filas, fiscal, separação dos apps e release.

A revisão Sol não encontrou achado crítico de runtime ou segurança. Confirmou
que o tenant nasce do token verificado e da membership ativa, `platform-admin`
não ignora vínculo tenant, JWKS readiness é lazy e recuperável, tokens
permanecem em memória, os apps são independentes e a topologia RabbitMQ possui
main, retry e dead-letter exchanges/queues.

Os desvios não críticos encontrados foram corrigidos antes do gate final:

- arquitetura e README da API agora documentam o package
  `@adatechnology/keycloak-jwt`, `/auth/me` e readiness PostgreSQL/JWKS;
- `exactOptionalPropertyTypes` foi habilitado nos três apps e os valores
  opcionais passaram a ser omitidos quando ausentes;
- o GitHub Actions ganhou job dependente para migration, integrações reais,
  bootstrap de identidade e smoke autenticado, com teardown garantido.

Evidência local final:

```text
bun install --frozen-lockfile
509 instalações verificadas; nenhuma mudança

make check
format, lint, typecheck estrito e builds verdes
realm 5 pass
API 94 pass, 1 migration integration condicional
worker 22 pass
frontend 16 pass

make migration-test
9 pass, 0 fail; apply, constraints, rollback, reaplicação e seed concorrente

bun run --cwd apps/api-transportada test:integration
15 pass, 1 migration integration condicional

RABBITMQ_TEST_URL="$RABBITMQ_URL" \
  bun run --cwd apps/worker-transportada test:integration
4 pass, 0 fail; exchanges/queues, retry TTL/DLX, DLQ e SIGTERM

make identity-bootstrap
migration e seed idempotentes; Keycloak saudável

make dev && make smoke
Compose transportada-local saudável
API readiness: database up, identity up
worker readiness: database up, rabbitmq up
Playwright autenticado: 6 pass
```

Uma execução paralela da integração HTTP atingiu uma vez o timeout de 5s; a
repetição isolada, igual à ordem sequencial do workflow, passou em menos de um
segundo. Não houve segunda falha equivalente.

Os processos Bun e a infraestrutura Compose foram encerrados após os gates.
Nenhum Railway, certificado, senha, token, cookie, XML ou dado fiscal foi
usado, registrado ou publicado.
