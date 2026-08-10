# Evidências — Feature 026

Formato de cada registro: task, comando rodado, saída relevante e o que ela prova. Nenhuma senha,
código de ativação, segredo de client, contato em claro ou dado fiscal real entra aqui.

## T000a — contrato falhando do provisionamento

```
$ bun test ./test/environment-provisioning.contract.test.ts
error: Cannot find module '../../src/database/environment-provisioning.error'
 0 pass  1 fail  1 error
```

Prova o vermelho pelo motivo certo: o contrato existe e o comando não. Suítes registradas na cadeia
explícita — `test/environment-provisioning.contract.test.ts` no `test` do `package.json` da API e
`test/integration/environment-provisioning.integration.ts` no `test:integration`.

O contrato cobre: leitura da empresa e do primeiro admin **a partir da configuração**; recusa de
`DATABASE_URL` ausente ou não-PostgreSQL, de issuer fora da política de URL confiável, de
identificador de empresa que não é UUID e de sujeito em branco; recusa de chave sósia
(`companyId` / `company_id`) para provar que a empresa não vem de payload; ausência do valor
recusado na mensagem de erro; e validação **antes** de abrir o banco.

## T000b — comando idempotente na imagem da API

```
$ bun test ./test/environment-provisioning.contract.test.ts
 9 pass  0 fail

$ bun test ./test/integration/environment-provisioning.integration.ts
 5 pass  0 fail  21 expect() calls  [3.20s]
```

Os cinco casos de integração rodam contra Postgres descartável com as migrations aplicadas e provam:

1. primeira execução cria empresa, usuário de identidade, identidade externa, vínculo e o papel
   `company-admin` — e a segunda execução devolve `created: []`, sem duplicar nem sobrescrever;
2. três execuções concorrentes deixam exatamente uma linha de cada (lock consultivo por transação);
3. papel acrescentado à mão depois do provisionamento sobrevive, e empresa alheia desabilitada
   continua desabilitada;
4. vínculo desabilitado por decisão humana faz o comando recusar com
   `EnvironmentProvisioningConflictError`, sem reativar nada;
5. identidade que já existe para o mesmo `issuer` + `subject` é reaproveitada, sem criar um segundo
   usuário.

Gates:

```
$ bun run --cwd apps/api-transportada test   → 1486 pass  1 skip  0 fail
$ bun run lint                               → limpo nas quatro apps
$ bun run typecheck                          → limpo nas quatro apps
$ bun run format:check                       → limpo
$ bun test ./test/keycloak-realm.contract.test.ts        → 6 pass
$ bun run --cwd apps/frontend-transportada test          → 600 pass
```

Os dois últimos existem porque `.env.example` ganhou `PROVISION_COMPANY_ID` e
`PROVISION_ADMIN_SUBJECT`, e há contratos que leem esse arquivo.

Ligação com o deploy: `deploy/api/railway.json` roda o comando no `preDeployCommand`, depois da
migration. Ambiente que não declarou nenhuma das duas variáveis imprime `{"provisioning":"skipped"}`
e sai zero; declarar só uma delas é erro de configuração, não silêncio.

## T000c — a empresa do ambiente sozinha é configuração completa (ADR-0022)

Contrato primeiro. Com o contrato novo e a implementação antiga, a recusa aparece exatamente na
regra que a ADR-0022 remove:

```
$ bun test ./test/environment-provisioning.contract.test.ts
(fail) environment provisioning configuration > the environment company alone is complete
       configuration: the administrator comes from first access
EnvironmentProvisioningConfigurationError: ... PROVISION_ADMIN_SUBJECT_INVALID
  at assertConfiguration (src/database/environment-provisioning.service.ts:95)
 11 pass  1 fail
```

Depois da implementação, as três combinações que a task pede:

```
$ bun test ./test/environment-provisioning.contract.test.ts
 12 pass  0 fail  19 expect() calls
```

1. as duas variáveis declaradas continuam lendo empresa + administrador, como antes;
2. `PROVISION_COMPANY_ID` sozinho lê `adminSubject: undefined` — e `PROVISION_ADMIN_SUBJECT` em
   branco ou só com espaços cai no mesmo caso, porque branco é "não declarado";
3. `PROVISION_ADMIN_SUBJECT` sozinho continua recusando, agora em `PROVISION_COMPANY_ID_INVALID`:
   o erro passou a nomear o que de fato falta — a empresa a que vinculá-lo.

O critério de sucesso da task é de integração, contra Postgres descartável com migrations aplicadas:

```
$ bun test ./test/integration/environment-provisioning.integration.ts
 7 pass  0 fail  30 expect() calls  [3.40s]
```

Os dois casos novos:

- só a empresa declarada termina em
  `{ admin: undefined, companyId: …, created: ['company'] }`, com `identity_users`,
  `external_identities` e `user_company_memberships` **vazias** — nenhum administrador foi inventado;
  repetir devolve `created: []`;
- ambiente provisionado só com a empresa e depois com o administrador declarado promove sem
  duplicar a empresa: `created` traz apenas `identity-user`, `external-identity`, `membership` e
  `company-admin-role`. O caminho antigo continua íntegro enquanto a rota de primeiro acesso não
  existe.

`PROVISION_ADMIN_SUBJECT_INVALID` ficou sem produtor e saiu de
`ENVIRONMENT_PROVISIONING_CONFIGURATION_CODES`. `EnvironmentProvisioningState` deixou de ter
`adminUserId`/`adminMembershipId` no topo e passou a `admin: { membershipId, userId } | undefined` —
a ausência do administrador virou estado tipado, não string vazia.

Gates:

```
$ bun run --cwd apps/api-transportada test          → 1487 pass  1 skip  0 fail
$ bun run --cwd apps/api-transportada test:integration → 57 pass  1 skip  0 fail  [13.98s]
$ bun run lint                                      → limpo nas quatro apps
$ bun run typecheck                                 → limpo nas quatro apps
$ bun run format:check                              → limpo no código versionado
```

`docs/ops/keycloak-first-admin.md` perdeu a afirmação "as duas juntas ou nenhuma", que a mudança
tornou falsa, e a linha correspondente da tabela de erros comuns.

## T000d — contrato falhando da rota de primeiro acesso

```
$ bun test ./test/bootstrap-first-admin.contract.test.ts
error: Cannot find module '../../src/identity/domain/bootstrap.error'
 0 pass  1 fail  1 error
```

Vermelho pelo motivo pedido: o contrato existe e a rota não. Nada de `src/` foi tocado nesta task.
Suíte registrada na cadeia explícita — `test/bootstrap-first-admin.contract.test.ts` no `test` do
`package.json` da API, importando `test/bootstrap-first-admin/guard.contract.ts` e
`test/bootstrap-first-admin/http.contract.ts`, com o arreio em
`test/fixtures/bootstrap-http.fixture.ts`.

### O que o contrato fixa

Na fronteira HTTP (`http.contract.ts`, 12 casos):

- caminho feliz `201` devolvendo só `{ companyId, subject, userId }`;
- `events` vazio na chamada bem-sucedida — a rota **nunca** autentica nem resolve empresa, e é essa
  asserção que prova a porta anônima;
- token conferido **antes** de ler o corpo: corpo com JSON quebrado + token errado responde `404`,
  não `400`, e o caso de uso nunca é chamado. Sem isso a rota viraria oráculo de existência para
  quem não tem o token;
- as quatro recusas (`TOKEN_NOT_CONFIGURED`, `TOKEN_MISMATCH`, `ALREADY_PROVISIONED`,
  `COMPANY_MISSING`) comparadas entre si por `response.text()` — um único corpo distinto permitido —
  e comparadas byte a byte com a resposta de uma rota inexistente;
- corrida entre a guarda e a transação (`execute` recusando) também cai no mesmo `404`;
- payload inválido **com** token aceito responde `400` — a validação existe, só não é alcançável sem
  o token;
- método diferente de `POST` responde `404` sem sequer consultar a guarda;
- senha e token de arranque ausentes da resposta e de todos os logs capturados;
- preflight do frontend liberado para `POST` com `Authorization, Content-Type`, e recusado (`403`)
  para outra origem.

Na aplicação (`guard.contract.ts`, 11 casos):

- fail-closed com `BOOTSTRAP_TOKEN` ausente, vazio ou só espaços — recusa mesmo com o token certo
  apresentado, e sem tocar no banco;
- token divergente (incluindo ausente, vazio, com espaço à direita e truncado) recusado **antes** de
  qualquer consulta — sonda anônima não gera carga de banco;
- recusa com `company-admin` ativo já existente e com a empresa do ambiente inexistente;
- as quatro recusas com `status`, `code` e `message` idênticos (`404` / `NOT_FOUND` /
  `Resource not found`);
- `execute` cria o administrador no Keycloak e persiste numa **única** chamada de repositório, com o
  `subject` devolvido pelo gateway;
- repositório devolvendo `undefined` (o lock revelou administrador nascido no meio do caminho) vira o
  mesmo `404`;
- senha e token nunca chegam à chamada de persistência;
- asserção de fonte: o caso de uso compara por `timingSafeEqual` sobre `createHash`, e o repositório
  usa `ENVIRONMENT_PROVISIONING_LOCK_ID`, `pg_advisory_xact_lock`, `transaction` e as quatro tabelas
  (`identityUsers`, `externalIdentities`, `userCompanyMemberships`, `membershipRoles`).

### Decisões de desenho que o contrato congela para T000e

- **Rota anônima é porta explícita no router.** O `handle` autentica antes de casar a rota — health é
  a única exceção, tratada inline. O contrato exige `createRouter({ anonymousRoutes })` casado
  **antes** de `authentication.authenticate()`, e `defineAnonymousRoute` com parâmetros
  `{ correlationId, pathParameters, request }` — sem `context`, para o sistema de tipos manter rota
  anônima e autenticada separadas.
- **Sem `parse`/`handle` na rota anônima.** A ordem "guarda primeiro, corpo depois" não cabe no par
  `parse → handle` do `defineRoute`, que lê o corpo antes de qualquer dependência. A rota anônima tem
  só `handle`.
- **Token no `Authorization: Bearer`**, como manda o padrão de APIs do ecossistema (segredo nunca em
  query nem em corpo). Efeito colateral bom: `Authorization` já é liberado no CORS de todo caminho;
  só `Content-Type` precisa entrar para este.
- **Duas operações na porta**: `assertAvailable({ token })` (guarda) e `execute({ administrator,
correlationId })` (transação). A recusa por ausência de administrador é reconferida dentro do lock,
  então a corrida está coberta por construção.
- **`BootstrapUnavailableError extends ApiError`** com os valores exatos de `HTTP_ERROR.notFound`,
  como já fazem os erros de domínio de certificado digital. O corpo uniforme sai de graça pelo
  `createErrorResponse` global, sem `try/catch` em controller.

## T000e — rota e gateway do primeiro acesso implementados

Arquivos novos: `src/identity/domain/bootstrap.error.ts`,
`src/identity/application/bootstrap-first-admin.{port,use-case}.ts`,
`src/identity/infrastructure/{drizzle-bootstrap.repository,keycloak-admin.gateway}.ts`,
`src/identity/presentation/bootstrap.routes.ts`. Wiring em `src/http/router.service.ts` (rota
anônima casada antes de `authentication.authenticate`), `src/http/cors.service.ts`
(`isBootstrapPreflight` — só `Authorization` + `Content-Type`, sem `Idempotency-Key`, porque o
arranque não é um `POST` repetível) e `src/main.ts` (`createAnonymousRoutes`: `config.companyId ===
undefined` devolve `[]` — sem empresa de ambiente a rota nunca é registrada).

```
$ bun test apps/api-transportada/test/bootstrap-first-admin.contract.test.ts
 29 pass  0 fail  75 expect() calls
```

Os três contratos (`environment`, `guard`, `http`) cobrem: `BOOTSTRAP_TOKEN` ausente/branco recusa
antes de tocar o banco; token errado recusa em tempo constante (`timingSafeEqual` sobre digest de
tamanho fixo); `company-admin` já ativo e empresa do ambiente inexistente recusam com o mesmo `404`
byte-a-byte das outras causas; método diferente de `POST` nunca chama `assertAvailable`; senha e
token nunca aparecem no corpo da resposta nem em log; preflight CORS aceita só a origem do frontend
com `Authorization, Content-Type` e recusa qualquer outra origem.

### Trilha de auditoria — compromisso registrado, não pendência silenciosa

O `tasks.md` pede "trilha de auditoria com ator, IP, horário e o `sub` criado". O arranque **não**
grava em `audit_logs`. Decisão tomada e aqui registrada, não esquecimento:

- `audit_logs.actor_user_id` é `NOT NULL` com FK para `identity_users` — não existe ator anterior
  no arranque, porque o próprio administrador criado é o primeiro usuário do ambiente. A única
  semântica possível seria "ator = a própria pessoa criada", o que descreve o evento, não o audita.
- `audit_logs` **não tem coluna de IP** (`src/database/fiscal-operation.schema.ts`). O pedido do
  `tasks.md` não é satisfazível pelo schema atual sem migration nova — fora do escopo de uma task
  só, pela disciplina "uma task por vez".
- Correlação existe por outro canal: `correlationId` chega em `execute({ administrator,
correlationId })` e, por construção do `request-handler.service.ts`, todo log estruturado da
  requisição carrega o mesmo id — dá para reconstruir quem/quando pelo log, mesmo sem linha em
  `audit_logs`.
- Registro do evento (ator = `sub` criado, horário = `createdAt` da própria linha de
  `identity_users`) já existe pela própria persistência do T000e — o que falta é só a tabela
  `audit_logs` dedicada.

Se o produto exigir a coluna de IP e uma trilha formal para o arranque, é uma decisão de schema
(migration + ADR), não algo que se resolve dentro de T000e. **T011 não cobre esta lacuna** — está
escopado só para as rotas autenticadas de `users.manage` (Fase C), que têm ator prévio.

### Gate completo (regressão)

```
$ bun run --cwd apps/api-transportada lint       → limpo
$ bun run --cwd apps/api-transportada typecheck  → limpo, exceto os TS2307 pré-existentes de T010
                                                    (user-administration.routes, user-activation.routes,
                                                    company-user.error, activate-invitation.use-case —
                                                    contratos de T008/T009, ainda sem implementação)
$ bun run --cwd apps/api-transportada test       → 1550 pass  1 skip  36 fail
                                                    (os 36 são os mesmos vermelhos pré-existentes de T010,
                                                    "Cannot find module", nenhum novo)
$ bun run --cwd apps/api-transportada build      → dist/main.js 0.91 MB
```

Três testes precisaram de `KEYCLOAK_ADMIN_CLIENT_ID`/`KEYCLOAK_ADMIN_CLIENT_SECRET` (agora
obrigatórios no schema de env) e `companyId`/`keycloak.admin` (agora parte de `ApiEnvironment`) que
construíam a configuração à mão: `test/authentication.contract.test.ts`,
`test/cors.contract.test.ts`, `test/integration/auth-me.integration.ts`,
`test/integration/server.integration.ts`. Ajuste mecânico de fixture, sem mudança de
comportamento — os quatro já tinham o padrão usado em `test/fixtures/cryptographic-environment.fixture.ts`.

## T001 — teste falhando do cliente de `client_credentials`

Arquivo novo, no repositório de packages (`~/Documents/personal/adatechnology-packages`):
`packages/backend/keycloak-admin/src/keycloak-admin.test.ts`. Nenhum arquivo de implementação foi
criado — o pacote ainda não existe, que é exatamente o vermelho pedido.

```
$ bun test src/keycloak-admin.test.ts
error: Cannot find module '../src/index.js' from
  '.../packages/backend/keycloak-admin/src/keycloak-admin.test.ts'
 0 pass  1 fail  1 error
```

Os quatro casos fixam o que o T002 tem de implementar:

1. **Token de service account.** `POST` no endpoint de token do realm, corpo
   `application/x-www-form-urlencoded` com `grant_type=client_credentials`, `client_id` e
   `client_secret`.
2. **Nunca senha.** A varredura passa por _todas_ as requisições gravadas (token e admin) e exige
   ausência de `password`, de `username` e da string `grant_type=password`. É a diferença deliberada
   para o `@adatechnology/nestjs-keycloak-admin`, que usa `grant_type=password` com `admin-cli` e o
   usuário admin do realm master — inaceitável aqui.
3. **Cache dentro da validade.** Duas operações seguidas produzem uma única requisição de token, e a
   segunda chamada administrativa viaja com o mesmo `Bearer`.
4. **Renovação antes de expirar.** Com `expires_in: 120`, a chamada a 89s ainda reaproveita e a
   chamada a 91s renova — o que congela a janela de segurança em 30s, declarada no teste como
   `RENEWAL_SKEW_MS`.

Decisões de desenho que o contrato congela para o T002:

- **Fábrica `createKeycloakAdminClient({ config, fetch, now })`.** `fetch` e `now` são injetados;
  sem isso não há como observar a rede nem controlar o relógio de forma determinística. O pacote
  segue agnóstico (Bun/Node), no molde do vizinho `packages/backend/auth-keycloak`.
- **Config `{ baseUrl, realm, clientId, clientSecret }`** — sem `adminUser`/`adminPassword`.
- **`findUserByEmail({ email })`** é a operação usada para exercitar o fluxo de token; as demais do
  T002 (`createUser`, `updateUser`, `setEnabled`, `updateAttributes`, `deleteUser`,
  `setTemporaryPassword`) entram junto com a implementação.
- Teste colocado em `src/`, como manda a convenção do repositório de packages (o `auth-keycloak`
  tem `src/auth-keycloak.test.ts`), diferente do `test/` sem colocation da transportada.

## T002 — `@adatechnology/keycloak-admin` implementado

Pacote novo em `~/Documents/personal/adatechnology-packages/packages/backend/keycloak-admin`,
agnóstico de framework e de runtime — só `fetch` e `zod`.

```
$ bun test
 4 pass  0 fail  16 expect() calls

$ bunx tsc --noEmit
(sem saída)

$ bun run build
ESM dist/index.js 10.76 KB
DTS dist/index.d.ts 5.99 KB
```

T001 fica verde sem uma linha de teste alterada.

Arquivos, um papel por arquivo:

| Arquivo                       | Papel                                                                   |
| ----------------------------- | ----------------------------------------------------------------------- |
| `keycloak-admin.constant.ts`  | endpoints por realm, códigos de erro, janela de renovação               |
| `keycloak-admin.schema.ts`    | zod da config; a falha carrega o **caminho** do campo, nunca o valor    |
| `keycloak-admin.error.ts`     | `KeycloakAdminError` com `code` estável, `status`, `context` e `toJSON` |
| `keycloak-admin.redaction.ts` | redator que troca segredo conhecido por `[REDACTED]`                    |
| `keycloak-admin.response.ts`  | leitura do motivo devolvido pelo Keycloak, por allowlist e truncada     |
| `keycloak-admin.token.ts`     | `client_credentials`, cache, renovação e requisição única em voo        |
| `keycloak-admin.client.ts`    | as operações sobre usuário                                              |

Decisões que valem registro:

- **`setPassword` além do `setTemporaryPassword` da spec.** O arranque (T000e) e a ativação (T009)
  gravam a senha **definitiva** escolhida pela pessoa; só a senha de contingência é temporária. O
  nome da spec continua existindo, delegando com `temporary: true`.
- **`zod` como `peerDependency` `^3.24.1 || ^4.0.0`.** O repositório de packages está no zod 3 e a
  API da transportada no 4.4.3; o pacote usa só o subconjunto compatível com os dois
  (`z.object`, `z.string().min`, `.refine`, `safeParse`, `error.issues`). URL absoluta é validada
  por `new URL()` dentro de um `refine`, evitando a divergência do `z.string().url()` entre as
  versões.
- **Requisição de token única em voo.** Chamadas concorrentes compartilham a mesma promessa; o
  Keycloak recebe uma requisição, não N.
- **Redação em duas camadas.** O contexto do erro já é allowlist (`detail`, `method`, `realm`), e
  ainda assim passa pelo redator com `clientSecret`, access token e a senha da chamada. É a defesa
  em profundidade que o T003 vai travar por teste.
- **`fetch` e `now` injetáveis**, sem o que rede e relógio não seriam observáveis em teste.

## T003 — teste de redação

`packages/backend/keycloak-admin/src/keycloak-admin.redaction.test.ts`. O dublê é um Keycloak
hostil: devolve, no motivo do erro, tudo que recebeu — cabeçalho `authorization` e corpo inteiro.
Se qualquer segredo escapar para o erro, escapa por ali.

```
$ bun test
 9 pass  0 fail  137 expect() calls

$ bunx tsc --noEmit
typecheck ok
```

As oito operações (`createUser`, `deleteUser`, `findUserByEmail`, `setEnabled`, `setPassword`,
`setTemporaryPassword`, `updateAttributes`, `updateUser`) são varridas contra os três segredos
(`clientSecret`, access token, senha) em quatro superfícies: `error.message`, `String(error)`,
`JSON.stringify(error)` e `JSON.stringify(error.toJSON())`.

**Prova de que a asserção morde.** Mutação temporária removendo o redator do client e do provedor de
token (`callRedactor.value({…})` → `({…})`):

```
 6 pass  3 fail
error: expect(received).not.toContain(expected)
```

Restaurado o código, `9 pass  0 fail`. É exatamente o critério da task: o teste falha se alguém
reintroduzir o segredo no contexto do erro.

Casos além da varredura:

- Falha do **token** (401 ecoando o formulário com `client_secret`) → `TOKEN_REQUEST_FAILED` com o
  contexto redigido.
- **Configuração inválida** → `CONFIGURATION_INVALID` com `context` igual a
  `{ fields: ['baseUrl', 'realm'] }` — caminho do campo, nunca o valor.
- O redator alcança segredo **aninhado** em qualquer profundidade do contexto (array dentro de
  objeto dentro de objeto), não só no primeiro nível.

## T004 — publicação do pacote

Preparado para release, **ainda não publicado**. A publicação no monorepo de pacotes é do
GitHub Actions (`.github/workflows/publish.yml`, push em `main` → `changeset version` →
`changeset publish` com o `NPM_TOKEN` do repositório), nunca da máquina local.

Commit `939d89d` na branch `feat/keycloak-admin-agnostic`, criada a partir de `origin/main` para
não arrastar a feature de produtos que estava em curso. PR aberto:
<https://github.com/Andersonfrfilho/adatechnology-packages/pull/24> — o repositório não roda
workflow em `pull_request` (só em push para `main`), então os gates abaixo foram rodados local.

```
18 files changed, 1154 insertions(+), 3 deletions(-)
```

Gates rodados sobre o commit, já depois do `lint-staged` (eslint --fix + prettier --write):

| Gate    | Comando                                                 | Resultado                                                       |
| ------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| Testes  | `bun test`                                              | `9 pass · 0 fail · 137 expect() calls`                          |
| Tipos   | `pnpm run check`                                        | limpo                                                           |
| Build   | `pnpm --filter @adatechnology/keycloak-admin run build` | `ESM dist/index.js 10.76 KB · DTS dist/index.d.ts 5.99 KB`      |
| Release | `pnpm changeset status`                                 | `Packages to be bumped at major: @adatechnology/keycloak-admin` |

### Versão

`package.json` fica em `0.0.0` — quem bumpa é o `changeset version` no CI, então versão escrita
à mão seria sobrescrita. O monorepo está em **modo prerelease** (`.changeset/pre.json`,
`mode: pre`, `tag: rc`), então o changeset `major` resolve para **`1.0.0-rc.0`**, publicado sob
a tag `rc` — mesmo padrão de `meta-whatsapp-module` (`0.2.0-rc.16`), `object-storage-provider`
(`0.2.0-rc.0`) e `nestjs-keycloak-admin` (`0.1.23-rc.0`).

Isso não atrapalha o consumo: o TransportAdA já pina versão exata, inclusive `-rc`
(`fiscal-provider` `0.3.0-rc.3`, `object-storage-provider` `0.2.0-rc.0`). A dependência entra
como `"@adatechnology/keycloak-admin": "1.0.0-rc.0"`.

Efeito colateral conhecido: a tag `latest` do nome continua em `0.1.16`, que é a build NestJS.
Ela só passa a apontar para o pacote agnóstico no `changeset pre exit`, que é decisão de release
do monorepo inteiro e não cabe nesta spec.

### Movimentação de nome

O aviso pedido está no corpo do changeset, que vira a entrada de changelog e a descrição do
release: quem dependia de `@adatechnology/keycloak-admin@^0.1` troca para
`@adatechnology/nestjs-keycloak-admin@^0.1.22` (já em `latest`) e não muda mais nada.

O mesmo aviso vai ao registry: o `publish.yml` ganhou um step pós-publicação
(commit `a57536d`) que roda `npm deprecate` na linha `@adatechnology/keycloak-admin@<=0.1.16`,
para quem só executa `npm install` e nunca lê changelog. É idempotente — o registry guarda o
aviso por versão — e leva `|| true` para não derrubar um release já concluído.

### Escopo do release

Varredura do workspace contra o registry (versão local × versões publicadas, todo pacote público
de `packages/backend` e `packages/frontend`): **`@adatechnology/keycloak-admin` é o único** cuja
versão local ainda não existe no npm. O merge não arrasta release de nenhum outro pacote — os
changesets pendentes em `main` pertencem a pacotes já publicados na versão que está no
`package.json`, porque em modo `pre` eles ficam retidos até o `pre exit`.

### notification-contracts — bloqueio real da fase D

`@adatechnology/notification-contracts` **não existe em `main`** e **não está publicado** (404 no
registry). O pacote vive só na branch `feat/products-price-reference`, junto de
`notification-module`, `audio-transcription-provider`, `email-provider`, `meta-business` e
`push-provider`. Nenhum deles foi mergeado.

A fase D desta spec (entrega do convite por canal) depende dele. Enquanto a branch de produtos
não chegar em `main`, a fase D não tem contrato para importar — não é algo que o release do
keycloak-admin resolva. Decisão de quando mergear é externa a esta spec.

### O que falta para fechar T004

Merge do PR. Aí o `publish.yml` roda `changeset version` + `changeset publish` e a versão fica
instalável.

## T000f — service account da Admin API no realm

Feita fora da ordem do `tasks.md`: não depende do pacote npm, e o gateway de T000e não tem como
autenticar antes de o client existir.

### Contrato primeiro

`test/keycloak-realm.contract.test.ts` ganhou o bloco
`Keycloak Admin API service account contract`, com quatro testes que varrem **os dois realms
versionados** (`realm/transportada-local-realm.json` e `deploy/keycloak/realm.json`) — o local
existia sozinho no contrato, e divergência entre os dois é exatamente o defeito que passaria
despercebido:

1. o client `transportada-admin` só tem `serviceAccountsEnabled`; `standardFlow`, `implicitFlow` e
   **`directAccessGrants` desligados**, `publicClient: false`, `clientAuthenticatorType`
   `client-secret`, sem `redirectUris` nem `webOrigins`;
2. o usuário `service-account-transportada-admin` carrega exatamente
   `{ realm-management: [manage-users] }` — nenhum papel de realm, nenhuma credencial;
3. varredura recursiva de toda chave `secret` nos dois arquivos: o único valor encontrado é
   `${KEYCLOAK_ADMIN_CLIENT_SECRET}` e ele casa com `^\$\{[A-Z0-9_]+\}$`. Realm versionado vai para
   o git, então literal ali é segredo queimado — o contrato impede que apareça um;
4. `.env.example` declara `KEYCLOAK_ADMIN_CLIENT_ID` e `KEYCLOAK_ADMIN_CLIENT_SECRET`.

Vermelho antes da implementação, com os dois realms ainda sem o client:

```
6 pass · 4 fail · 51 expect() calls
error: Expected the transportada-admin client in the local realm
```

Verde depois:

```
10 pass · 0 fail · 72 expect() calls
```

### O que mudou

| Arquivo                                      | Mudança                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `deploy/keycloak/realm.json`                 | client `transportada-admin` + bloco `users` com o service account         |
| `realm/transportada-local-realm.json`        | o mesmo client e service account, ao lado do `local-user`                 |
| `compose.yaml`                               | `KEYCLOAK_ADMIN_CLIENT_SECRET` no serviço `keycloak`                      |
| `Makefile`                                   | variável lida do env, `test -n` no `config`, valor dummy no `postgres-up` |
| `.env.example` · `.env.test.example`         | `KEYCLOAK_ADMIN_CLIENT_ID` e `KEYCLOAK_ADMIN_CLIENT_SECRET`               |
| `docs/ops/keycloak-admin-service-account.md` | runbook novo                                                              |

### Verificação no Keycloak de verdade

`make identity-bootstrap` recriou o container (`--force-recreate keycloak`), o import rodou do
zero e aplicou o realm novo. Contra o Keycloak no ar:

| Verificação                                  | Resultado                                                                               |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `grant_type=client_credentials`              | token emitido, `azp: transportada-admin`                                                |
| Claims do access token                       | `resource_access.realm-management.roles: [manage-users]`, sem `realm_access` de negócio |
| `GET /admin/realms/transportada-local/users` | **HTTP 200**                                                                            |
| `grant_type=password` no mesmo client        | **HTTP 400** — `directAccessGrants` desligado                                           |

Nenhum segredo ou token foi ecoado: o valor saiu do `.env` para a variável do shell e o teste
imprimiu só o código HTTP.

### Ambiente já criado não recebe o client sozinho

O import do Keycloak ignora realm existente, e ignora o **realm inteiro** — não recurso a recurso.
Onde o realm `transportada` já foi criado, deploy novo não acrescenta o client. O runbook
`docs/ops/keycloak-admin-service-account.md` registra os dois caminhos: apagar o realm e deixar o
import rodar do zero (staging, que é descartável) ou criar o client pelo console com
`manage-users` (production, onde apagar o realm é indisponibilidade).

### O que falta para fechar T000f

Aplicar em staging. `make check` completo e o commit ficam para o fechamento da fase, junto de
T000e/T000g — a task é de configuração e o código que a consome ainda não existe.

## T000g — `BOOTSTRAP_TOKEN` no schema de env

Também fora de ordem, pelo mesmo motivo de T000f: é schema de ambiente, não depende do pacote npm
nem da rota.

### Contrato primeiro

`apps/api-transportada/test/bootstrap-first-admin/environment.contract.ts`, registrado no
entrypoint `test/bootstrap-first-admin.contract.test.ts`. Vermelho antes da implementação:

```
$ bun test ./test/bootstrap-first-admin/environment.contract.ts
 3 pass  3 fail  6 expect() calls
```

Verde depois:

```
 6 pass  0 fail  10 expect() calls
```

Os seis casos:

1. token declarado é lido em `bootstrapToken`;
2. variável ausente resolve para `undefined` — rota morta;
3. variável presente com valor `undefined` também resolve para `undefined`: **não existe default**;
4. `''`, `' '`, `'   '`, `'\t'` e `'\n'` **derrubam o boot**. Declarar em branco é engano de
   configuração, não recurso desligado — quem quer a rota morta não declara a linha;
5. a mensagem de falha do boot não carrega o valor recusado;
6. o token declarado sobrevive **byte a byte**, sem `.trim()`. Essa é a asserção que impede o
   defeito sutil: o guard de T000d já recusa `` `${VALID_TOKEN} ` ``, então normalizar espaço no
   schema faria o boot aceitar um segredo diferente do que o operador configurou.

### O que mudou

| Arquivo                                         | Mudança                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `src/config/environment.schema.ts`              | `BOOTSTRAP_TOKEN` opcional, `refine` recusando branco, sem `.default` |
| `src/shared/api.types.ts`                       | `ApiEnvironment.bootstrapToken: string \| undefined`, obrigatório     |
| `test/integration/{auth-me,server}.integration` | `bootstrapToken: undefined` explícito nos ambientes de teste          |
| `.env.example`                                  | linha comentada explicando ausente = rota morta                       |

O campo é **obrigatório** no tipo, ainda que possa valer `undefined`: com
`exactOptionalPropertyTypes`, torná-lo opcional deixaria passar um ambiente que simplesmente
esqueceu de decidir. Quem monta um `ApiEnvironment` é obrigado a escrever a ausência.

### Gates

```
$ bun run --cwd apps/api-transportada test  → 1487 pass  1 skip  1 fail
$ bun run lint                              → limpo nas quatro apps
$ bun run typecheck                         → nenhum erro novo
$ bun run format:check                      → limpo
```

O `1 fail` e os erros de tipo restantes são exclusivamente de `bootstrap-first-admin/http.contract`
e `fixtures/bootstrap-http.fixture` — o vermelho de T000d, que só fecha quando T000e criar
`src/identity/**` e `defineAnonymousRoute`. Nenhum arquivo fora desse conjunto ficou vermelho.

### Fronteira HTTP fechada por T000e

A segunda metade do critério — "a rota respondendo `404` sem a variável" — ficou observável quando
T000e criou `src/identity/presentation/bootstrap.routes.ts` e o wiring em `main.ts`. Cadeia provada
por composição, um teste real por elo, sem duplo (`mock`) do meio para o fim:

1. `environment.contract.ts` (`2. variável ausente resolve para undefined`) — `parseEnvironment` sem
   `BOOTSTRAP_TOKEN` no ambiente produz `bootstrapToken: undefined`, o boot não cai.
2. `main.ts`'s `createAnonymousRoutes` injeta esse `undefined` direto em `token` na fábrica do use
   case (`createBootstrapFirstAdminUseCase({ token: config.bootstrapToken, ... })`) — sem `??`, sem
   default no meio do caminho.
3. `guard.contract.ts` (`fails closed when the environment declares no arranque token`) — o use case
   real, construído com `token: undefined`, recusa em `assertAvailable` com
   `BootstrapUnavailableError('TOKEN_NOT_CONFIGURED')` antes de tocar o banco.
4. `http.contract.ts` (`REFUSAL_REASONS` incluindo `TOKEN_NOT_CONFIGURED`) — a rota traduz essa
   recusa para `404` com o mesmo corpo uniforme das outras três causas.

```
$ bun test apps/api-transportada/test/bootstrap-first-admin.contract.test.ts
 29 pass  0 fail  75 expect() calls
```

T000g fechada.

## T000h — tela de primeiro acesso e assistente da empresa no frontend

### Contrato antes da implementação

Três suítes novas em `apps/frontend-transportada/test/identity/`, registradas no entrypoint
`test/identity.contract.test.ts` (adicionado ao array de testes do `package.json` — teste que não
entra na lista explícita não roda neste repo). Todas vermelhas antes do código existir:

- `bootstrap-client.contract.ts` — tipos, validação de resposta e client HTTP do
  `POST /bootstrap/first-admin`. Vermelho: `import` de módulo inexistente.
- `first-access-page.contract.ts` — seis asserções sobre `FirstAccess.page.tsx`: wiring do hook e do
  client, cobertura dos seis campos do administrador, `role="alert"` no feedback, ausência de
  `CompanyProfileFields`/`taxRegime`/`cnpj` (nenhuma validação de perfil fiscal duplicada), ausência
  de qualquer razão de recusa do backend (`TOKEN_MISMATCH`, `ALREADY_PROVISIONED`,
  `TOKEN_NOT_CONFIGURED`, `COMPANY_MISSING`) vazando para a UI, ausência de `localStorage` /
  `sessionStorage` / `indexedDB` / `caches.` no boundary sensível (página + hook + client), uso dos
  tokens de campo (`var(--field-height)`, `var(--field-padding)`, `var(--field-font-size)`) no CSS
  module, e registro do locale nas duas línguas em `i18n.service.ts`.
- `public-route.contract.ts` — a rota `/primeiro-acesso` precisa renderizar `FirstAccessPage` **antes**
  de `initializeKeycloakAuth()` ser chamado em `bootstrapApplication()`, com `return` explícito.

```
$ bun test apps/frontend-transportada/test/identity.contract.test.ts   (antes do código)
error: Cannot find module '../../src/modules/identity/shared/bootstrapClient.service' from ...
 0 pass  3 fail
```

### O que foi implementado

| Arquivo                                                                 | Responsabilidade                                                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/modules/identity/shared/bootstrap.types.ts`                        | `BootstrapAdministratorInput`, `BootstrapFirstAdminResult`/`Response`                          |
| `src/modules/identity/shared/bootstrap.validation.ts`                   | type guards locais (`isRecord` duplicado — sem import cruzado de módulo)                       |
| `src/modules/identity/shared/bootstrapClient.service.ts`                | client DI (`{apiBaseUrl, fetch}`), mesmo padrão de `companySettingsClient`                     |
| `src/modules/identity/hooks/useBootstrapFirstAdmin.hook.ts`             | estado do formulário, `patch`/`submit`, sem teste unitário direto (padrão do repo p/ hooks)    |
| `src/modules/identity/pages/FirstAccess.page.tsx`                       | formulário dos 6 campos, `fieldset disabled` durante submit, feedback `role="alert"`           |
| `src/modules/identity/styles/identity.module.css`                       | tokens de cor/campo/espaçamento — nenhum valor hardcoded                                       |
| `src/modules/identity/locales/identity.locale.json` + `.en.locale.json` | pt-BR acentuado (passa `locale-accents.contract.ts`) + inglês                                  |
| `src/modules/shared/i18n/i18n.service.ts`                               | registro do namespace `identity` nas duas línguas                                              |
| `src/main.tsx`                                                          | `bootstrapApplication()` desvia para `FirstAccessPage` em `/primeiro-acesso` antes do Keycloak |

A rota é anônima por natureza (mesma anonimidade do backend `POST /bootstrap/first-admin`): o desvio
em `main.tsx` acontece **antes** de `initializeKeycloakAuth()`, então a tela nunca depende de sessão.
Refusal reason nunca chega à UI — o client traduz toda falha (rede, `!response.ok`, corpo inesperado)
para o mesmo `BootstrapRequestError`, e a página mostra sempre a mesma mensagem genérica
(`identity.unavailable`), espelhando o `404` uniforme do backend (T000d/T000e).

O assistente da empresa que aparece quando o perfil vem nulo, chamando `PATCH /company-settings`, foi
entregue antes deste fechamento (task local #4) e está coberto por
`test/company-settings/company-wizard.contract.ts` — não duplicado aqui.

### Gates

```
$ bun test test/identity.contract.test.ts       → 12 pass  0 fail  69 expect() calls
$ bun run typecheck                              → limpo
$ bun run lint                                   → limpo
$ bun run test                                   → 616 pass  0 fail  3401 expect() calls (15 arquivos)
$ bun run build                                  → 386 modules, PWA gerado, só o aviso pré-existente
                                                    de chunk > 500 kB (bundle já era grande antes
                                                    desta task; nenhum erro)
```

T000h fechada. T000i segue bloqueada por T000f (staging), fora do escopo autorizado nesta sessão.

## T005 — migration da tabela de convites

### Contrato antes da implementação

O contrato de migration foi escrito antes de a migration existir e falhou por ela não existir:

```
$ bun test ./test/database-migration.contract.test.ts
(fail) Drizzle migrations > versions the user invitations as an additive migration
       with a guarded rollback
  expect(directory).toBeString()   Received: undefined
 7 pass  1 skip  1 fail
```

Registro honesto de ordem: o schema Drizzle (`user-invitation.schema.ts`) foi escrito antes do
contrato de schema (`test/user-invitation-schema/`), então esse arquivo nasceu verde. O vermelho
real de T005 é o de cima — o que prova migration e rollback, que é o critério da task.

### O que a migration cria

| Objeto                                               | Papel                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `user_invitations`                                   | Convite: empresa, pessoa alvo, `code_hash`, situação, validade, tentativas |
| `user_invitation_roles`                              | Perfis pretendidos, uma linha por perfil, PK `(invitation_id, role)`       |
| `user_invitations_membership_fk`                     | FK composta `(user_id, company_id)` → `user_company_memberships`           |
| `user_invitations_company_id_user_id_pending_unique` | Índice único parcial `WHERE status = 'pending'`                            |
| `user_invitations_code_hash_unique`                  | Único global — a ativação não é autenticada e acha pelo hash               |
| `user_invitations_code_hash_check`                   | `~ '^[0-9a-f]{64}$'` — só o hash entra, nunca o código                     |
| `user_invitations_accepted_at_check`                 | `status = 'accepted'` e `accepted_at` preenchido andam juntos              |
| `user_invitations_expires_at_check`                  | Convite nasce com validade no futuro                                       |
| `user_invitations_attempt_count_check`               | Contador de tentativas nunca negativo                                      |

Decisões que valem registro:

- **Situação não guarda "expirado".** Expiração sai de `expires_at`; duplicá-la como situação
  abriria a chance de as duas discordarem. Os quatro valores são `pending`, `accepted`,
  `superseded` (o que um reenvio invalidou) e `revoked`.
- **`companyId` no índice único** é o parcial de pendentes: "reenvio invalida o anterior" passa a
  ser regra do banco, não só do domínio.
- **O alvo é um vínculo daquela empresa por construção.** A FK composta recusa convite para pessoa
  de outro tenant sem depender de a query lembrar do filtro.
- **Perfis pretendidos ficam em tabela filha**, espelhando `membership_roles`, com a mesma lista de
  seis perfis no `check`. Convite pendente não concede permissão nenhuma — os perfis só viram
  `membership_roles` quando a pessoa troca o código por senha (T009).

### Verde

```
$ make migration-test
 14 pass  0 fail  288 expect() calls    (migration + constraints + rollback + reaplicação)

$ bun test ./test/user-invitation-schema.contract.test.ts
 11 pass  0 fail  49 expect() calls
```

O `assertInvitationConstraints` roda no Postgres descartável e exercita cada regra pela recusa do
banco: `23505` no pendente duplicado e no hash repetido, `23503` no convite para pessoa de fora da
empresa (inclusive com empresa existente), `23514` em situação inválida, hash fora do formato,
tentativa negativa, validade no passado, aceite sem instante e perfil fora da lista — mais o
cascade que apaga os perfis pretendidos junto com o convite.

### Gates

```
$ bun run --cwd apps/api-transportada test       → 1499 pass  1 skip  1 fail
$ bun run --cwd apps/api-transportada lint       → limpo
$ bun run --cwd apps/api-transportada typecheck  → nenhum erro fora de bootstrap-first-admin
```

O `1 fail` continua sendo só o vermelho de T000d/T000e (`bootstrap-first-admin/http.contract`
importando `src/identity/domain/bootstrap.error`, que T000e cria). Nenhum arquivo de T005 falha.

## T006 — contrato falhando das regras de domínio do convite

Arquivos: `test/user-invitation-domain/invitation.contract.ts` (15 testes) e o entrypoint
`test/user-invitation-domain.contract.test.ts`, registrado na lista explícita do `package.json`.
Nenhum arquivo de `src/` foi criado — o domínio é T007.

### Vermelho

```
$ bun test ./test/user-invitation-domain.contract.test.ts
(fail) regra 1 — o código de ativação é de uso único > aceita o código correto uma vez, no instante em que ele foi apresentado
(fail) regra 1 — o código de ativação é de uso único > recusa o mesmo código depois que o convite já foi atendido
(fail) regra 2 — expirado, já usado e inexistente produzem a mesma recusa > responde de forma idêntica a expirado, usado, substituído, revogado, desconhecido e errado
(fail) regra 2 — expirado, já usado e inexistente produzem a mesma recusa > não leva código, hash nem identificador no que chega a quem chamou
(fail) regra 3 — o reenvio invalida o código anterior > substitui o convite pendente e conta a validade a partir do reenvio
(fail) regra 3 — o reenvio invalida o código anterior > não tem o que substituir no primeiro convite nem depois de um reenvio anterior
(fail) regra 3 — o reenvio invalida o código anterior > recusa reenviar código a quem já ativou o acesso
(fail) regra 4 — as tentativas são limitadas por pessoa > ainda aceita o código correto enquanto sobra tentativa
(fail) regra 4 — as tentativas são limitadas por pessoa > recusa até o código correto depois que as tentativas acabaram
(fail) regra 4 — as tentativas são limitadas por pessoa > mantém o limite baixo o bastante para ser um limite
(fail) regra 5 — a empresa nunca fica sem company-admin > recusa tirar o último company-admin, com erro de domínio próprio
(fail) regra 5 — a empresa nunca fica sem company-admin > recusa também a remoção do vínculo do último company-admin
(fail) regra 5 — a empresa nunca fica sem company-admin > deixa um administrador sair enquanto outro permanece
(fail) regra 5 — a empresa nunca fica sem company-admin > deixa o último administrador manter o papel enquanto troca os demais
(fail) regra 5 — a empresa nunca fica sem company-admin > não atrapalha quem nunca foi administrador

 0 pass  15 fail
error: Cannot find module '../../src/identity/domain/invitation.constant.js'
```

A primeira versão do contrato importava o domínio no topo do arquivo e o vermelho era **uma** linha:
`1 fail  1 error`, sem citar regra nenhuma. Trocado por `await import` dentro de cada teste, e o
vermelho passou a nomear as cinco regras — que é o critério de sucesso da task.

### Superfície que T007 tem de implementar

| Módulo                   | Exporta                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `invitation.constant.ts` | `INVITATION_MAX_ATTEMPTS`, `INVITATION_TTL_MINUTES`                                                                                       |
| `invitation.error.ts`    | `InvitationCodeRejectedError` (400), `InvitationAlreadyAcceptedError` (409), `LastCompanyAdminError` (409)                                |
| `invitation.policy.ts`   | `InvitationSnapshot`, `decideInvitationActivation`, `assertInvitationAccepted`, `planInvitationResend`, `assertCompanyKeepsAdministrator` |

### Decisões que o contrato fixa

1. **A recusa não tem variantes.** `decideInvitationActivation` devolve `{ outcome: 'accepted', … }`
   ou literalmente `{ outcome: 'rejected' }` — sem campo de motivo. O contrato prova isso por
   igualdade estrita entre as seis recusas (expirado, aceito, substituído, revogado, inexistente e
   hash errado): `new Set(decisions.map(JSON.stringify)).size === 1`. Não há como um handler
   distinguir os casos, nem por acidente.
2. **Tentativa esgotada é recusa comum, não erro próprio.** Um `429` distinto contaria a quem sonda
   códigos aleatórios que ali existe convite de verdade — convite inexistente não tem contador. A
   regra 4 fica observável por outro caminho: no limite, **até o código correto** é recusado.
3. **Expiração é comparação, não situação.** O contrato passa `now` explícito e compara com
   `expiresAt`; nenhum teste depende do relógio da máquina.
4. **`assertInvitationAccepted` faz o estreitamento.** O use case não pode ter try/catch (§7 do
   code-standart), então quem transforma a decisão recusada em `InvitationCodeRejectedError` é o
   domínio.
5. **`assertCompanyKeepsAdministrator` recebe a lista de administradores, não o repositório.** É
   função pura: quem consulta é o use case. Vale igual para troca de perfis (`nextRoles` sem
   `company-admin`) e para remoção de vínculo (`nextRoles: []`).

### Gates

```
$ bun run --cwd apps/api-transportada lint       → limpo
$ bun run --cwd apps/api-transportada test       → 1499 pass  1 skip  16 fail
```

Os 16 `fail` são os 15 vermelhos desta task mais o vermelho pré-existente de T000d/T000e. `typecheck`
também acusa os módulos ausentes de `src/identity/domain/invitation.*` — é o vermelho pedido, e
fecha em T007.

## T007 — domínio, repositório Drizzle e tenant safety do convite

Arquivos criados:

| Arquivo                                                        | Papel                                                                                                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/identity/domain/invitation.constant.ts`                   | `INVITATION_MAX_ATTEMPTS = 5`, `INVITATION_TTL_MINUTES = 2880`                                                                      |
| `src/identity/domain/invitation.error.ts`                      | as três classes estendendo `ApiError`                                                                                               |
| `src/identity/domain/invitation.policy.ts`                     | `decideInvitationActivation`, `assertInvitationAccepted`, `planInvitationResend`, `assertCompanyKeepsAdministrator` — puro, sem I/O |
| `src/identity/application/invitation.port.ts`                  | `InvitationRepositoryPort` e `InvitationRecord`                                                                                     |
| `src/identity/infrastructure/drizzle-invitation.repository.ts` | `DrizzleInvitationRepository` + os construtores de filtro exportados                                                                |
| `test/user-invitation-schema/tenant-safety.contract.ts`        | 7 casos sobre o SQL gerado                                                                                                          |

### Verde

```
$ bun test ./test/user-invitation-domain.contract.test.ts
 15 pass  0 fail  36 expect() calls

$ bun test ./test/user-invitation-schema.contract.test.ts
 18 pass  0 fail   (11 do schema + 7 de tenant safety)
```

### Como o tenant safety é provado

O repositório não esconde o `where` dentro dos métodos: cada filtro é uma função pura exportada
(`buildInvitationUserFilters`, `buildInvitationWriteFilters`, `buildInvitationRoleFilters`,
`buildCompanyAdministratorFilters`, `buildInvitationAttemptFilters`, `buildInvitationCodeFilters`),
e o contrato roda `PgDialect().sqlToQuery` em cima delas para inspecionar o SQL emitido — mesmo
padrão de `test/cte-issuance-schema/document-query-tenant-safety.contract.ts`. Consulta de reenvio,
escrita de substituição, escrita de aceite e leitura dos perfis pretendidos todas carregam
`company_id = $n`; a lista de administradores carrega `company_id`, `status = 'active'` e
`role = 'company-admin'`. Um caso a mais confere que nenhum identificador é interpolado no texto do
SQL — tudo vai como parâmetro ligado.

**A exceção está no contrato, não escondida.** `buildInvitationCodeFilters` gera exatamente
`"user_invitations"."code_hash" = $1`, sem empresa, e o teste que fixa isso diz por quê no nome: a
ativação não é autenticada e não tem empresa no contexto. O hash é único no banco inteiro (T005), e
é a linha encontrada que estabelece o tenant para o resto do fluxo.

`registerFailedAttempt` também não tem empresa — quem erra o código não está autenticado. Em troca,
o filtro é `id` **mais** `status = 'pending'`: um contador só sobe em convite que ainda vale, e
nunca em nome de uma empresa inteira.

### Decisões

1. **Comparação de hash em tempo constante.** `matchesCodeHash` usa `timingSafeEqual` sobre os dois
   digests em bytes, com guarda de tamanho antes — §2 das regras de segurança.
2. **`create` é uma transação só**: substituir o convite anterior, inserir o novo e gravar os perfis
   pretendidos não podem ficar meio feitos. O repositório abre a própria transação porque é chamado
   do topo; nenhum outro repositório o envolve.
3. **Nada foi ligado no `main.ts`.** O repositório ainda não tem consumidor — quem o injeta são os
   use cases de T008/T009/T010.

### Gates

```
$ bun run --cwd apps/api-transportada test       → 1521 pass  1 skip  1 fail
$ bun run --cwd apps/api-transportada typecheck  → nenhum erro fora de bootstrap-first-admin
$ bun run --cwd apps/api-transportada lint       → limpo
$ bun run format                                 → aplicado
```

O `1 fail` voltou a ser só o vermelho pré-existente de T000d/T000e.

## T008 — contrato falhando das rotas de administração de usuários

### Arquivos

| Arquivo                                              | Papel                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| `test/fixtures/user-administration-http.fixture.ts`  | roteador de teste, dublês dos use cases e carga das rotas   |
| `test/user-administration-http/routes.contract.ts`   | as seis rotas, seus códigos de status e o que sai no corpo  |
| `test/user-administration-http/security.contract.ts` | `users.manage`, escopo do token e as três recusas           |
| `test/user-administration-http.contract.test.ts`     | entrypoint, registrado na lista explícita do `package.json` |

### Vermelho

```
$ bun test ./test/user-administration-http.contract.test.ts

(fail) rotas … listagem > devolve a página de usuários da empresa do token
(fail) rotas … listagem > mostra contato mascarado e nunca o endereço em claro
(fail) rotas … convite > cria o convite e devolve 201 sem o código de ativação
(fail) rotas … convite > recusa o convite que tenta escolher a empresa pelo corpo
(fail) rotas … convite > recusa perfil que não existe em COMPANY_ROLES
(fail) rotas … reenvio de código > aceita o reenvio e devolve só a nova validade
(fail) rotas … situação e perfis > ativa e desativa o usuário pela rota de situação
(fail) rotas … situação e perfis > recusa situação fora do contrato
(fail) rotas … situação e perfis > substitui os perfis do usuário de uma vez
(fail) rotas … remoção de vínculo > remove o vínculo e devolve 204 sem corpo
(fail) rotas … remoção de vínculo > recusa identificador de usuário que não é UUID
(fail) segurança … permissão > recusa as seis rotas a quem administra a empresa sem users.manage
(fail) segurança … permissão > atende as seis rotas a quem tem users.manage
(fail) segurança … escopo do token > leva a empresa do token a todo use case, em toda rota
(fail) segurança … escopo do token > recusa a empresa vinda do cliente na query da listagem
(fail) segurança … recusas de domínio > responde 404 sobre usuário de outra empresa, sem confirmar que ele existe
(fail) segurança … recusas de domínio > recusa com 409 tirar o último company-admin da empresa
(fail) segurança … recusas de domínio > recusa com 409 o administrador remover o próprio vínculo

 0 pass
 18 fail
```

Cada teste falha na própria linha porque a carga das rotas é um `await import()` dentro da fixture,
e não um import estático de topo — a mesma lição de T006.

### Superfície que T010 tem de implementar

| Rota                                 | Status | Use case injetado  |
| ------------------------------------ | ------ | ------------------ |
| `GET /company-users`                 | 200    | `list`             |
| `POST /company-users`                | 201    | `invite`           |
| `POST /company-users/:id/invitation` | 202    | `resendCode`       |
| `PATCH /company-users/:id/status`    | 200    | `changeStatus`     |
| `PUT /company-users/:id/roles`       | 200    | `replaceRoles`     |
| `DELETE /company-users/:id`          | 204    | `removeMembership` |

Todas com `policy = { permission: 'users.manage', scope: 'company' }`. Além delas, o contrato exige
`src/identity/presentation/user-administration.routes.ts` exportando `createUserAdministrationRoutes`
e `src/identity/domain/company-user.error.ts` com `CompanyUserNotFoundError` (404,
`COMPANY_USER_NOT_FOUND`) e `SelfMembershipRemovalError` (409, `SELF_MEMBERSHIP_REMOVAL`).
`LastCompanyAdminError` já existe de T007 e é reaproveitado.

### Decisões

1. **Empresa de outra transportadora responde 404, não 403.** 403 confirmaria que aquele usuário
   existe em algum lugar; 404 é a única resposta que não vaza a existência. O contrato ainda checa
   que a mensagem não carrega nem o id do alvo nem o `companyId` do ator.
2. **Situação e perfis em rotas separadas.** Desativar bate no Keycloak; trocar perfil é só banco e
   passa pela guarda do último `company-admin`. Juntar as duas num `PATCH` só embaralharia efeito
   externo com regra de domínio — e a trilha de auditoria de T011 ficaria ambígua.
3. **`PUT` nos perfis, não `PATCH`.** A troca substitui o conjunto inteiro; repetir a chamada dá o
   mesmo resultado, que é o que `PUT` promete.
4. **A auto-remoção é recusa de domínio, não regra de rota.** A rota não compara `:id` com o usuário
   do token — quem decide é o use case, e a rota só devolve o `ApiError` que subiu.
5. **Contato sintético.** A fixture usa `convidado@example.test`; o contrato prova que esse endereço
   não aparece em resposta nenhuma, só a forma mascarada.

### Gates

```
$ bun test ./test/user-administration-http.contract.test.ts  → 0 pass  18 fail (esperado)
$ bun run --cwd apps/api-transportada lint                   → limpo
$ bun run format                                             → aplicado
$ bun run --cwd apps/api-transportada typecheck              → TS2307 nos dois módulos que T010 cria
```

O `TS2307` novo é o mesmo padrão já aceito no vermelho de T000d: o contrato nomeia o módulo antes de
ele existir.

---

## T009 — contrato falhando da rota de ativação

### Arquivos

| Arquivo                                             | Papel                                                         |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `test/fixtures/user-activation-http.fixture.ts`     | roteador com rota anônima, dublê do use case e captura de log |
| `test/user-activation/http.contract.ts`             | fronteira anônima, resposta uniforme e sigilo do que chegou   |
| `test/user-activation/password-handoff.contract.ts` | por onde a senha passa, ordem dos efeitos e tentativas        |
| `test/user-activation.contract.test.ts`             | entrypoint, registrado na lista explícita do `package.json`   |

### Vermelho

```
$ bun test ./test/user-activation.contract.test.ts

(fail) rota de ativação — fronteira anônima > troca código por senha e responde 204 sem devolver nada
(fail) rota de ativação — fronteira anônima > nunca autentica nem resolve empresa, mesmo com Bearer no cabeçalho
(fail) rota de ativação — fronteira anônima > não existe em método diferente de POST
(fail) rota de ativação — resposta uniforme > responde igual a expirado, já usado, inexistente, errado e tentativas esgotadas
(fail) rota de ativação — resposta uniforme > não devolve cabeçalho que denuncie o limite de tentativas
(fail) rota de ativação — resposta uniforme > a recusa não devolve o código nem a senha que chegaram
(fail) rota de ativação — validação e sigilo > recusa corpo sem código ou sem senha sem chamar o caso de uso
(fail) rota de ativação — validação e sigilo > a recusa de validação não ecoa o que o cliente mandou
(fail) rota de ativação — validação e sigilo > nem código nem senha aparecem em log algum, no sucesso ou na recusa
(fail) ativação — a senha não passa pelo domínio nem pelo banco > chega ao convite só pelo hash do código, nunca pelo código em claro
(fail) ativação — a senha não passa pelo domínio nem pelo banco > a senha só aparece na chamada ao provedor de identidade
(fail) ativação — a senha não passa pelo domínio nem pelo banco > o que é gravado no convite não tem senha, código nem hash
(fail) ativação — ordem dos efeitos > define a senha, habilita o usuário e só então conclui o convite
(fail) ativação — ordem dos efeitos > falha no provedor deixa o convite utilizável, sem habilitar ninguém
(fail) ativação — recusas e limite de tentativas > código errado conta a tentativa e recusa sem tocar no provedor
(fail) ativação — recusas e limite de tentativas > convite inexistente recusa igual, e não há contador para incrementar
(fail) ativação — recusas e limite de tentativas > esgotado o limite, nem o código certo habilita o usuário
(fail) ativação — recusas e limite de tentativas > convite expirado e convite já aceito recusam sem habilitar ninguém

 0 pass
 18 fail
```

Os nove primeiros falham em `Cannot find module '.../presentation/user-activation.routes.js'` e os
nove últimos em `Cannot find module '.../application/activate-invitation.use-case.js'` — um por
linha, porque a carga é `await import()` dentro da fábrica de cada caso.

### Superfície que T010 tem de implementar

| Rota                              | Status | Use case             |
| --------------------------------- | ------ | -------------------- |
| `POST /user-activation` (anônima) | 204    | `activateInvitation` |

Além dela, `src/identity/presentation/user-activation.routes.ts` exportando
`createUserActivationRoutes` e `src/identity/application/activate-invitation.use-case.ts` com
`createActivateInvitationUseCase({ identityProvider, invitations, now })`, onde `identityProvider`
expõe `setPassword({ password, userId })` e `setEnabled({ enabled, userId })`, e `invitations` expõe
`findByCodeHash`, `markAccepted` e `registerFailedAttempt`. `InvitationCodeRejectedError` e
`INVITATION_MAX_ATTEMPTS` já vêm de T006/T007.

⚠️ A metade HTTP só fica verde com `defineAnonymousRoute` e o parâmetro `anonymousRoutes` do
`createRouter` — entrega de **T000e**, a mesma superfície que o vermelho de T000d já espera. A
metade do caso de uso não depende disso e pode ficar verde antes.

### Decisões

1. **A recusa é uma só, byte a byte.** O contrato roda cinco motivos diferentes (expirado, já usado,
   inexistente, errado, tentativas esgotadas) e compara os corpos com `new Set(bodies).size === 1`.
   Comparar texto igual é o que impede uma diferença de mensagem virar oráculo de enumeração de
   convites.
2. **Nenhum cabeçalho denuncia o limite.** Sem `retry-after`, sem `x-ratelimit-remaining`: quem está
   tentando adivinhar não pode descobrir pelo cabeçalho que o contador chegou ao fim.
3. **A senha aparece em exatamente uma chamada.** O dublê grava toda chamada com `structuredClone` e
   o teste filtra quais payloads contêm a senha — o resultado tem de ser só `setPassword`. É a forma
   estrutural de provar "não transita pelo domínio nem é persistida", em vez de confiar em revisão.
4. **O banco só vê o hash.** `findByCodeHash` recebe `{ codeHash }` e o log inteiro de chamadas não
   pode conter o código em claro; `markAccepted` grava só `acceptedAt`, `companyId` e `invitationId`.
5. **Ordem: achar → senha → habilitar → concluir.** Se o provedor de identidade cair no meio, o
   convite continua pendente e o código continua valendo. Marcar como aceito antes queimaria o
   convite de quem não conseguiu entrar.
6. **Código e senha sintéticos.** `CODIGO-SINTETICO-DE-CONTRATO` e `Senha-sintetica-de-contrato-9` —
   nenhum segredo real entra em fixture, log ou evidência.

### Gates

```
$ bun test ./test/user-activation.contract.test.ts        → 0 pass  18 fail (esperado)
$ bun test (suíte da API)                                 → 1559 testes, 37 fail (1 pré-existente + 18 de T008 + 18 de T009)
$ bun run --cwd apps/api-transportada lint                → limpo
$ bun run format                                          → aplicado
$ bun run --cwd apps/api-transportada typecheck           → TS2305/TS2353/TS2307 nos módulos de T000e e T010
```

O `TS2305` (`defineAnonymousRoute`) e o `TS2353` (`anonymousRoutes`) são exatamente os mesmos que
`bootstrap-http.fixture.ts` já acusa desde T000d — o router anônimo é uma entrega só, consumida por
duas features.

---

## T004 — pacote publicado e versão registrada

### Publicação

`adatechnology-packages#24` estava `MERGEABLE` / `mergeStateStatus: CLEAN`, CI `build` verde e sem
review pendente. Mergeado por squash em `main` com `--delete-branch`; quem publicou foi o workflow
`Publish packages` do GitHub Actions, como manda a regra do monorepo — nada de `npm publish` local.

```
$ gh pr merge 24 --squash --delete-branch   → ok merged #24
$ gh run watch <publish>                    → ✓ Version packages · ✓ Publish packages
$ npm view @adatechnology/keycloak-admin dist-tags
{ "latest": "0.1.16", "rc": "1.0.0-rc.0" }
```

A tag `latest` continua em `0.1.16` porque o monorepo está em modo prerelease — o `1.0.0-rc.0` sai
pela tag `rc`, e é essa versão que a API fixa.

### Fase D deixou de estar bloqueada

```
$ npm view @adatechnology/notification-contracts dist-tags
{ "rc": "0.1.0-rc.1", "latest": "0.1.0-rc.1" }
$ npm view @adatechnology/notification-contracts time
"0.1.0-rc.1": "2026-08-04T14:13:31.766Z"
```

O pacote foi publicado hoje, antes deste merge — a branch `feat/products-price-reference` entrou em
`main` no intervalo. A nota de bloqueio da fase D em `tasks.md` estava desatualizada e foi corrigida.
A versão publicada é `0.1.0-rc.1`, à frente do `0.1.0-rc.0` que a spec pedia.

### Instalação

```
$ bun add @adatechnology/keycloak-admin@1.0.0-rc.0
installed @adatechnology/keycloak-admin@1.0.0-rc.0
```

Superfície que o `dist/index.d.ts` publicado expõe, e que T000e/T010 vão consumir:
`createKeycloakAdminClient`, `parseKeycloakAdminConfig`, `keycloakAdminConfigSchema`,
`buildKeycloakAdminEndpoints`, `KeycloakAdminError`, `isKeycloakAdminError`,
`KEYCLOAK_ADMIN_ERROR_CODE`, mais os tipos `CreateUserParams`, `FindUserByEmailParams`,
`SetEnabledParams`, `SetPasswordParams`, `SetTemporaryPasswordParams`, `UpdateAttributesParams`,
`UpdateUserParams`, `DeleteUserParams` e `FetchLike` — `fetch` é injetável, então o gateway da API
dá para testar sem rede.

`SetPasswordParams` casa com o que o contrato de T009 já espera do provedor de identidade
(`setPassword({ password, userId })` e `setEnabled({ enabled, userId })`).

### Gates

```
$ bun run --cwd apps/api-transportada typecheck → só os TS2305/TS2353/TS2307 já conhecidos,
                                                  dos módulos que T000e, T009 e T010 ainda criam
```

---

## T010 — use-cases, rotas e gateway de convite/ativação conectados na composition root

### Implementação

Seis use-cases em `src/identity/application/`: `invite-company-user`, `list-company-users`,
`resend-company-user-code`, `change-company-user-status`, `replace-company-user-roles`,
`remove-company-user-membership` — todos dependendo só de `CompanyUserRepositoryPort` (e de
`InvitationRepositoryPort`/`IdentityAccessGatewayPort` quando precisam de convite ou Keycloak).
Mais `activate-invitation`, já existente de T009, na fronteira anônima.

`createUserAdministrationRoutes` (seis rotas sob `users.manage`) e `createUserActivationRoutes`
(rota anônima) em `src/identity/presentation/`. `createIdentityAccessGateway`
(`src/identity/infrastructure/keycloak-admin.gateway.ts`) é o único ponto de contato com
`@adatechnology/keycloak-admin` — nenhum outro arquivo importa o pacote diretamente.

`main.ts` (composition root): `createApplicationRoutes` ganhou `keycloak: config.keycloak` e monta
`DrizzleCompanyUserRepository` + `DrizzleInvitationRepository` + `createIdentityAccessGateway` uma
vez, injetando nos seis use-cases; `createAnonymousRoutes` ganhou a rota de ativação ao lado da de
bootstrap, ambas atrás do guard `config.companyId !== undefined` do ADR-0022.

### Gates

```
$ bun run --cwd apps/api-transportada typecheck
→ 0 erros

$ bun test ./test/user-invitation-schema.contract.test.ts ./test/user-invitation-domain.contract.test.ts \
           ./test/user-administration-http.contract.test.ts ./test/user-activation.contract.test.ts
→ 69 pass, 0 fail

$ bun run --cwd apps/api-transportada test
→ 1647 pass, 3 skip, 0 fail, 7128 expect() calls, 77 files
```

T008 e T009 saíram do vermelho: `users.manage` tem seis rotas consumidoras
(`GET/POST /company-users`, `POST .../invitation`, `PATCH .../status`, `PUT .../roles`,
`DELETE /company-users/:id`) e a ativação anônima passou a existir de fato.

Duas correções fora do escopo direto de T010, necessárias para `make check` fechar:

- `apps/api-transportada/package.json`: o `script test` estava sem os quatro entrypoints de
  T006/T008/T009/T010 (`user-invitation-schema`, `user-invitation-domain`,
  `user-administration-http`, `user-activation`) — os contratos passavam isolados mas nunca rodavam
  no gate do projeto. Adicionados.
- `apps/api-transportada/test/database-migration/static-migration.contract.ts`: faltava
  `20260805165955_identity_user_profiles` na lista travada de migrations — a migration (aditiva,
  `identity_user_profiles` com FK para `identity_users`) já existia em disco de trabalho anterior
  mas nunca tinha sido registrada no contrato estático.

Uma terceira correção, de uma feature diferente (T000h, fase de bootstrap), estava impedindo
`make check` de fechar no repositório inteiro: `main.tsx` e `i18n.service.ts` nunca chegaram a
referenciar `FirstAccessPage`/`identityLocale` apesar do commit `13d6a1f` já ter adicionado a
página, os hooks e os contratos que exigem essa ligação — regressão pré-existente, sem relação com
T010, corrigida à parte (`main.tsx` passa a desviar para `/primeiro-acesso` antes de
`initializeKeycloakAuth()`; `i18n.service.ts` registra `identity`/`identityEnglishLocale`).

```
$ make check
→ format:check, lint, typecheck, test (api 1647 pass · worker 233 pass · cron 24 pass ·
  frontend 707 pass) e build das quatro apps — verde de ponta a ponta
```

Nenhum erro novo veio da dependência.

## T021 · T022 — sincronização com o Keycloak

R6 partia de um estado em que **nada** do ciclo de vida do usuário chegava ao provedor de
identidade: suspender e remover mexiam só no banco, o convite criava um usuário sem nome e sem
`company_id`, e a ativação endereçava o Admin API pelo `identity_users.id` — um identificador que
não existe do lado do Keycloak.

### T021 — contrato vermelho

`apps/api-transportada/test/user-administration-application/keycloak-sync.contract.ts`, com dublês
em `test/fixtures/keycloak-sync.fixture.ts` (nenhuma senha real trafega, e o dublê de
`setPassword` guarda só `temporary` e `userId`). Dez casos, cobrindo convite, ativação, mudança de
situação e remoção de vínculo.

### T022 — implementação

- `IdentityAccessGatewayPort` e `keycloak-admin.gateway.ts` ganharam `updateUser`,
  `updateAttributes`, `deleteUser`, `setTemporaryPassword` e `findUserByEmail`, e o `createUser`
  passou a repassar `attributes`, `firstName` e `lastName` — **antes ele descartava os três em
  silêncio**, o que o contrato de dublê sozinho não pegaria: o use-case entregava os dados e o
  gateway de produção os jogava fora. Daí o segundo contrato,
  `test/user-administration-application/identity-gateway.contract.ts`, que troca o cliente do
  Admin API por um dublê e afirma o repasse na fronteira real.
- Campo não informado é **omitido** da chamada em vez de ir como `undefined`: o Admin API
  sobrescreve o que recebe, e mandar `undefined` apagaria o que já está gravado.
- `resolveIdentitySubject` (`company-user-identity.service.ts`) é o ponto único de tradução do id da
  aplicação para o `subject`, apoiado em `findIdentitySubject` do repositório.
- A ordem das escritas é deliberada, e o comentário no use-case diz por quê: **desabilitar chama o
  provedor antes do banco; habilitar chama o banco antes do provedor**. Sem transação distribuída,
  é assim que qualquer falha no meio deixa o usuário sem acesso, nunca com acesso indevido.
- `shouldDisableIdentity` guarda o multiempresa: quem mantém vínculo ativo em outra empresa não é
  desabilitado no realm, porque o `enabled` é global e o vínculo é por empresa.

**Divergência com a spec:** o pacote `@adatechnology/keycloak-admin` não expõe busca por
`username`, só `findUserByEmail`. A colisão de `username` continua detectável pelo
`USER_ALREADY_EXISTS` que o Admin API devolve na escrita — e é de lá que o 409 da T024 vai sair.
Uma consulta prévia não resolveria a corrida de qualquer forma.

```
$ bun test ./test/user-administration-application.contract.test.ts   # antes da implementação
→ 11 pass, 4 fail

$ bun test ./test/user-administration-application.contract.test.ts   # depois
→ 15 pass, 0 fail

$ bun run --cwd apps/api-transportada test
→ 1780 pass, 3 skip, 0 fail, 7559 expect() calls, 80 files

$ bun run --cwd apps/api-transportada typecheck   # tsc --noEmit
$ bun run --cwd apps/api-transportada lint        # eslint --max-warnings=0
→ sem saída, verde
```

## T023 · T024 — edição de perfil com push para o Keycloak

### T023 — contrato vermelho

`test/user-administration-http/routes.contract.ts` ganhou a suíte do `PATCH /company-users/:id`:
altera os cinco campos de uma vez; aceita um campo só e manda **só ele** ao use-case; devolve o
contato mascarado (o endereço cru não aparece na resposta); recusa `companyId` e `roles` no corpo,
corpo vazio, nome em branco e canal fora do contrato; devolve `409 USERNAME_ALREADY_TAKEN` na
colisão de login. `security.contract.ts` passou a listar **sete** rotas de administração — a nova
entra na varredura de token ausente, permissão errada e escopo errado como as outras seis.

`DuplicateUsernameError` entrou em `company-user.error.ts` junto com o contrato: é o vocabulário de
domínio que o teste nomeia, não a implementação. Sem a classe o `tsc` reprovaria e o vermelho seria
estrutural em vez de comportamental.

```
$ bun test ./test/user-administration-http.contract.test.ts   # antes da implementação
→ 16 pass, 8 fail, 24 tests
```

### T024 — implementação

- **Migration aditiva** `20260806143116_identity_user_profile_username`: a coluna entra anulável,
  recebe `user_id::text` (que é o `username` com que o convite cria a pessoa no Keycloak) e só então
  vira `NOT NULL`. `ADD COLUMN ... NOT NULL` de uma vez, que foi o que o drizzle-kit gerou, quebra em
  tabela populada. `UNIQUE` no realm inteiro, não por empresa — é assim que o Keycloak trata login.
- **O 409 sai do índice único do banco**, atingido antes do provedor: `violatedUniqueConstraint`
  (`postgres-error.support.ts`) reconhece a constraint e o repositório converte em
  `DuplicateUsernameError`. Determinístico e sem consulta prévia, que não resolveria a corrida.
- **Ordem das escritas: banco primeiro, Keycloak depois.** Sem transação distribuída, é a ordem que
  deixa a falha no meio do caminho segura — o painel mostra um login que ainda não autentica, em vez
  de um login que autentica e ninguém vê. Repetir o mesmo `PATCH` converge.
- `email` só existe no provedor: a aplicação não tem coluna de e-mail, e `contact_address` é o
  endereço do canal de entrega, mantido independente.
- Nome que encurta não deixa sobrenome órfão no provedor: `toIdentityName` manda `lastName: ''`
  quando `splitPersonName` não devolve sobrenome.
- `USERNAME_PATTERN` no schema Zod restringe o login ao que o realm aceita sem normalizar
  (minúsculo, sem espaço e sem acento).

```
$ bun test ./test/user-administration-http.contract.test.ts   # depois
→ 24 pass, 0 fail, 95 expect() calls

$ bun run --cwd apps/api-transportada test
→ 1786 pass, 3 skip, 0 fail, 7579 expect() calls, 80 files

$ make migration-test
→ 18 pass, 0 fail, 379 expect() calls   # aplica, restringe, reverte e reaplica

$ bun run --cwd apps/api-transportada typecheck   # tsc --noEmit
$ bun run lint                                    # eslint --max-warnings=0 nas quatro apps
→ sem saída, verde
```

## Adendo (10/08/2026) — a tela de primeiro acesso precisa saber que a porta fechou

Fora do `tasks.md`: veio da observação em production de que `/primeiro-acesso` continuava servida
depois do arranque, oferecendo um formulário que já não tinha como concluir. Emenda registrada na
ADR-0022, §2.

### O que entrou

- **`GET /bootstrap/first-admin`**, anônima (`bootstrap.routes.ts`): `204` enquanto o arranque está
  aberto, o mesmo `404` uniforme depois. Uniforme entre as recusas do arranque, e o contrato compara
  byte a byte com um caminho não casado — mas o chamador sem token distingue os dois, porque caminho
  desconhecido cai na autenticação e volta `401`. O `POST` já se comportava assim; a sondagem não
  acrescenta divulgação nenhuma além do estado.
- `BootstrapFirstAdminUseCase.checkAvailability()` **não recebe entrada nenhuma**, de propósito: a
  resposta é sobre o ambiente, nunca sobre quem perguntou. Reusa o `readAvailability` do guarda, para
  a tela e o `POST` não contarem histórias diferentes, e devolve `false` sem tocar no banco quando
  `BOOTSTRAP_TOKEN` não está configurado — tirar a variável some com a tela junto (ADR-0022 §5).
- **Correção no roteador** (`http/router.service.ts`): a busca de rota anônima casava só por
  `pathname`, então uma segunda rota no mesmo caminho ficava inalcançável. Passou a casar
  `pathname` + `method`; método errado num caminho anônimo morre em `404` ali mesmo, sem custar
  autenticação a ninguém.
- **Frontend**: `bootstrapClient.checkAvailability()` (GET sem `authorization`, `cache: 'no-store'`),
  hook `useBootstrapAvailability` e portão dentro de `FirstAccess.page.tsx` — fechada, a página
  renderiza esqueleto e sai para o login em vez de mostrar o formulário.

### A linha de segurança, explícita

A sondagem **é** o oráculo de estado que a ADR-0022 §2 recusa, e a recusa continua valendo para o
`POST`. Os limites são o que torna a troca aceitável, e cada um é asserção de contrato:

- ela **não lê o cabeçalho de autorização** — aceitar o token trocaria um oráculo sobre o estado da
  instalação por um oráculo sobre o segredo, que é bem pior (`never reads the authorization header,
even when one is offered`);
- ela não cria nada e não autentica ninguém: `executeCalls` e a trilha de eventos ficam vazios;
- quem impede o segundo administrador continua sendo o `POST`: `timingSafeEqual`,
  `pg_advisory_xact_lock` com rechecagem dentro da transação, `404` uniforme. Qualquer `curl`
  ignora a página inteira — e deve mesmo;
- no cliente a sondagem **falha aberta**: erro de rede ou 5xx mantém o formulário de pé. Errar para
  o lado do formulário é reversível; errar para o lado do redirecionamento trancaria uma instalação
  nova fora do próprio arranque toda vez que a API oscilasse.

### Contratos antes da implementação

`test/bootstrap-first-admin/guard.contract.ts` (a sondagem acompanha o guarda nas quatro condições),
`test/bootstrap-first-admin/http.contract.ts` (204 aberto, 404 uniforme fechado, cego ao cabeçalho,
sem escrita, sem token no log; `PUT`/`PATCH`/`DELETE` em 404 sem autenticar) e, no frontend,
`test/identity/bootstrap-client.contract.ts` + `test/identity/first-access-page.contract.ts`.
Vermelho provado nas duas apps antes do verde.

```
$ bun run --cwd apps/api-transportada test
→ 1995 pass, 3 skip, 0 fail, 82 files

$ bun run --cwd apps/frontend-transportada test
→ 789 pass, 0 fail, 3933 expect() calls, 16 files

$ bun run typecheck      # tsc --noEmit nas quatro apps
$ bun run lint           # eslint --max-warnings=0 nas quatro apps
$ bun run format:check   # prettier --check .
→ verde
```

Nada foi commitado e nenhuma variável de ambiente ou serviço de production foi tocado.
