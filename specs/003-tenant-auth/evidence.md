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
