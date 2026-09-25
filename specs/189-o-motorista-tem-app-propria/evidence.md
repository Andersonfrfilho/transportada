# Evidence — Feature 189

## Fase 1 — A app existe, vazia e servida

### T1.1 — Contratos da app, antes do código

Arquivos em `apps/frontend-driver/test/`: o entrypoint `shared.contract.test.ts` importa
`content-security-policy`, `environment-banner`, `manifest`, `security-headers`, `service-worker` e
`vite-build-args`; `dist.contract.test.ts` fica fora da lista de `test`, porque roda depois do
`vite build`.

Vermelhos pela razão certa: o código da app ainda não existe.

```
cd apps/frontend-driver && bun test test/shared.contract.test.ts
error: Cannot find module '../../src/modules/shared/serviceWorker.constant' …
0 pass / 1 fail / 1 error

bun test test/dist.contract.test.ts
error: Cannot find module '../src/modules/shared/webManifest.constant' …
0 pass / 1 fail / 1 error
```

**Commit próprio, separado da T1.2.** Sem `apps/frontend-driver/package.json`, o diretório não é
membro do workspace `apps/*`: `dockerfile-workspace` e `pipeline-change-filter` só contam diretório
com `package.json`, e os scripts da raiz (`lint`, `typecheck`, `test`, `build`) não chegam à app. O
único gate que vê estes arquivos é o `format:check`. Conferido com a T1.1 sozinha na árvore:

```
cd apps/api-transportada && bun --env-file=../../.env.test test test/deploy.contract.test.ts --timeout 120000
178 pass / 0 fail / 630 expect() calls

bun run format:check   (raiz)
All matched files use Prettier code style!
```

### T1.2 — Esqueleto de `apps/frontend-driver` (commit único com as linhas "T1.2" da D9)

No mesmo commit: `package.json`, `tsconfig.json`, `eslint.config.mjs`, `index.html`, `vite.config.ts`
(`injectManifest` com `src/sw.ts`, `registerType: 'prompt'`), `src/sw.ts`, `server.ts` (HSTS e a
`Permissions-Policy` do painel), `Dockerfile`, os ícones 192, 512, maskable 512 e apple-touch 180,
`offline.html`, a tela provisória em `main.tsx` com `EnvironmentBanner`, a CSP e o
`environment.config.ts`; o `COPY apps/frontend-driver/package.json` nos seis `Dockerfile` de app e
no novo; o alvo `driver` em `changed-targets.sh` (e `apps/frontend-driver/` no alvo `api`); e
`pipeline-change-filter.contract.ts` com sete apps e o alvo `driver` nos dois sentidos da spec 078.
`bun install` gravou o workspace novo no `bun.lock` (29 linhas, nenhum pacote novo: o `workbox-*`
7.4.1 já vinha com o `vite-plugin-pwa` 1.3.0), que vai no mesmo commit.

O `icon-maskable-512.png` e o `apple-touch-icon-180.png` saíram do mesmo desenho do `icon.svg` pelo
`sharp` que já está no `node_modules`: o maskable com o desenho a 80% em volta do centro, dentro da
zona segura; o de 180 sem transparência.

Ajustes nos contratos da T1.1 feitos ao implementar, sem mudar o que eles cobram:

- `security-headers`: o padrão da linha aceita o valor sem aspas da CSP
  (`'Content-Security-Policy': contentSecurityPolicy`).
- `service-worker`: `event.data` é `any`, e o lint de tipos recusa `.type` sobre ele; o `sw.ts` lê
  por uma variável tipada, e o padrão aceita `data?.type`.
- `manifest`: `lang: 'pt-BR'` entrou no manifesto (sem ele o plugin emite `"lang":"en"`).
- `dist`: o `injectManifest` inlina o precache como JSON (`"url":"…"`). A primeira versão do padrão
  não achava nada, e o teste "o precache existe" reprovou o build, que é o papel dele.

Mutação conferida no `dist.contract.test.ts`: um `dist/assets/opencv-mutation.js` reprova "nada do
peso do painel" (5 pass / 1 fail); um `icon-512.png` de 1,7 MB reprova o orçamento (1.910.236 bytes,
5 pass / 1 fail); restaurado, 6 pass / 0 fail.

```
bun run --cwd apps/frontend-driver check
lint ok · typecheck ok · test 39 pass / 0 fail / 92 expect() · build ok
dist.contract.test.ts 6 pass / 0 fail
```

**Precache: 13 arquivos, 216.878 bytes (≈ 212 KiB) de 1.572.864 (1,5 MiB).** O plugin reporta
193,15 KiB por outra conta; o contrato soma o tamanho de cada arquivo do `dist` listado no `sw.js`.

`server.ts` servindo o `dist` na 53299: `/sw.js`, `/manifest.webmanifest` e `/` com
`Cache-Control: no-cache`; `/assets/index-*.js` com `public, max-age=31536000, immutable`; todos com
`Strict-Transport-Security: max-age=31536000` e `Permissions-Policy: camera=(self), geolocation=(self),
microphone=()`.

```
bun install --frozen-lockfile                       no changes
bash -n .github/scripts/changed-targets.sh          ok
BASELINE=HEAD~1 changed-targets.sh                  api=true · driver=true · client=false · landing=false

cd apps/api-transportada && bun --env-file=../../.env.test test test/deploy.contract.test.ts --timeout 120000
178 pass / 0 fail / 636 expect()   (dockerfile-workspace e pipeline-change-filter incluídos)

make check                                          exit 0
format:check ok · lint ok · typecheck ok
api 7309 pass / 0 fail · worker 1424 · cron 101 · frontend 5264 + 51 · client 55 · landing 111 · build ok
```

⚠️ O `make check` ainda **não** passa pela app nova: os scripts encadeados da raiz entram na T1.3.
Até lá a app é conferida pelo `check` dela, acima.

```
docker build -f apps/frontend-driver/Dockerfile .   exit 0
  bun install --frozen-lockfile com os sete manifestos · dist.contract.test.ts 6 pass / 0 fail
  precache: 13 arquivos, 216.814 bytes
docker run (PORT=8080) → GET /manifest.webmanifest
  200 · Strict-Transport-Security: max-age=31536000 · Cache-Control: no-cache · "name":"Minha viagem"
```

### T1.3 — Workspace e pipeline (linhas "T1.3" da D9)

Arquivos: `package.json` da raiz (os quatro scripts encadeados — `build`, `lint`, `test`,
`typecheck` — ganham `bun run --cwd apps/frontend-driver <script>` entre `frontend-client` e
`frontend-landing`); `Makefile` (`FRONTEND_DRIVER_PORT := $(or $(shell sed -n
's/^FRONTEND_DRIVER_PORT=//p' $(ENV_FILE) 2>/dev/null),53200)`; `dev` sobe `apps/frontend-driver` e
mata no `cleanup`; `smoke` confere `/` e `/manifest.webmanifest` da `53200`); `.env.example`
(`FRONTEND_DRIVER_PORT=53200`, `VITE_DRIVER_APP_URL=http://localhost:53200`, `53200` somada ao
`FRONTEND_ORIGIN`); `.github/workflows/ci.yml:109` (`53112,53200` em
`ip_local_reserved_ports`); `.github/workflows/deploy.yml` (saída `driver` no job `changes`;
`FRONTEND_DRIVER` → `"frontend-driver"` no passo `apps`; `DRIVER_CHANGED` no job `mark-deployed`,
**sem** `DRIVER_RESULT` — o job `deploy-driver` só nasce na T6.4); `.github/scripts/mark-deployed.sh`
(`driver` em `TARGETS`).

⚠️ **`.env` local não foi tocado** (link simbólico compartilhado entre worktrees, conforme o
briefing). `make dev`/`make check` seguem verdes porque o `Makefile` cai no padrão `53200`
(`$(or …)`) sem a variável no arquivo, e `main.tsx` desta fase (tela provisória da T1.2) ainda não lê
`VITE_DRIVER_APP_URL` — isso só entra em D4/T2.3+. Nomes e valores não secretos para o orquestrador
aplicar no `.env` real:

```
FRONTEND_DRIVER_PORT=53200
VITE_DRIVER_APP_URL=http://localhost:53200
FRONTEND_ORIGIN: somar ",http://localhost:53200" ao valor atual (sem apagar as origens existentes)
```

```
bash -n .github/scripts/changed-targets.sh    ok
bash -n .github/scripts/mark-deployed.sh      ok

bun install                                   no changes (bun.lock inalterado)

bun run typecheck   (raiz, 7 apps)            ok, frontend-driver incluída
bun run lint        (raiz, 7 apps)            ok, frontend-driver incluída

make check                                    exit 0
  format:check ok · lint ok · typecheck ok
  api 7309 pass · worker 1424 · cron 101 · frontend 5264+51 · client 55 · driver 39+6 · landing 111
  build ok (frontend-driver: dist.contract.test.ts 6 pass / 0 fail, precache 272 KiB)

cd apps/api-transportada && bun --env-file=../../.env.test test test/deploy.contract.test.ts --timeout 120000
  178 pass / 0 fail / 636 expect()   (dockerfile-workspace, pipeline-change-filter, mark-deployed sob a suíte)

make dev (stack completa) → GET http://localhost:53200/manifest.webmanifest
  200 · {"name":"Minha viagem","short_name":"Viagem","description":"A viagem do motorista: paradas,
  entregas e comprovantes.","start_url":"/","display":"standalone","background_color":"#0B1F2A",
  "theme_color":"#0B1F2A","lang":"pt-BR","scope":"/","id":"/","icons":[…192,512,maskable-512…]}
  painel (53000) e API (53001) também responderam durante o mesmo `make dev` — nada quebrou nas
  apps existentes.
```

## Fase 2 — Entrar e sair pelo Keycloak

### T2.1 — Contratos do pós-logout e do PUT completo do Keycloak

`test/keycloak-realm.contract.test.ts:246-266` ganhou a `53200` em `redirectUris`, `webOrigins` e
`post.logout.redirect.uris` do realm local. `apps/api-transportada/test/deploy/keycloak-realm.contract.ts`:
o harness `runReconcile` ganhou `spaClient.attributes` na entrada, `clientWrites[].attributes` e o
`GET` pós-`PUT` do duplo (`FakeKeycloak`) refletindo o que foi gravado (antes só `redirectUris`/
`webOrigins`). Quatro casos novos: o corpo do `PUT` preserva `pkce.code.challenge.method`; o corpo
contém o pós-logout novo; o pós-logout que já existia continua; a verificação pós-`PUT` reprova
quando `pkce.code.challenge.method` não é `S256`.

Vermelhos pela razão certa (script ainda sem a lógica):

```
cd apps/frontend-driver... (não aplicável)
bun test ./test/keycloak-realm.contract.test.ts
  17 pass / 1 fail — "imports separate SPA... PKCE S256 only" (post.logout.redirect.uris sem 53200)

cd apps/api-transportada && bun --env-file=../../.env.test test ./test/deploy.contract.test.ts --timeout 120000
  178 pass / 4 fail — os 4 casos novos de pkce/pós-logout (attributes sempre undefined)
```

**Commit próprio, T2.1.**

### T2.2 — `realm/transportada-local-realm.json` e `keycloak-reconcile.sh`

`realm/transportada-local-realm.json`: `http://localhost:53200` em `redirectUris`, `webOrigins` e
`post.logout.redirect.uris` do client `transportada-spa`. `spa-redirect-uris.json` **não** mudou
(fica para a T6.4).

`.github/scripts/keycloak-reconcile.sh`: o laço de reconciliação de callbacks ganhou
`wanted_post_logout` (cada `webOrigins` desejado vira `<origem>/*` e `<origem>`), `$merged.attributes`
soma `$current.attributes` (preservando `pkce.code.challenge.method` e qualquer outro atributo) com
o pós-logout unido, o cálculo de "o que falta" (`added`) passa a incluir o pós-logout, e a
verificação pós-`PUT` — feita sobre a **mesma** releitura do client — confere redirectUris, o
pós-logout **e** `pkce.code.challenge.method == "S256"`, com `exit 1` nomeado se qualquer um faltar.

```
bash -n .github/scripts/keycloak-reconcile.sh    ok

bun test ./test/keycloak-realm.contract.test.ts
  18 pass / 0 fail / 99 expect()

cd apps/api-transportada && bun --env-file=../../.env.test test ./test/deploy.contract.test.ts --timeout 120000
  182 pass / 0 fail / 650 expect()

cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
  7290 pass / 23 skip / 0 fail / 24475 expect()   (suíte inteira da API, contrato)

make config     exit 0 (realm-contract 18 pass)
make check      exit 0 — ver saída consolidada abaixo, junto da T2.3
```

**Commit próprio, T2.2.**

### T2.3 — Autenticação na app (plan D3 e D4)

Copiados por valor do portal (`apps/frontend-client/src/modules/shared/`), para
`apps/frontend-driver/src/modules/shared/`: `KeycloakAuthProvider.provider.ts` (adaptado para
`getDriverEnvironment`/`readTrustedUrl`, prefixo de erro `DRIVER_CONFIGURATION_*`, janela de retorno
`transportada-driver:return-to:`), `LoginIdentifier.page.tsx`, `loginHintClient.service.ts`. Testes
copiados e adaptados de `apps/frontend-client/test/{keycloak-auth-provider,login-hint-client}.test.ts`
para `apps/frontend-driver/test/identity/{keycloak-auth-provider,login-hint-client}.contract.ts`.

Copiado por valor de `apps/frontend-transportada/src/modules/identity/shared/smokeAuthBypass.service.ts`
para `apps/frontend-driver/src/modules/identity/shared/smokeAuthBypass.service.ts`, com as duas
travas (flag **e** hostname local) — contrato próprio em `test/identity/smoke-auth-bypass.contract.ts`.
⚠️ Não wireado no `KeycloakAuthProvider` nesta task: o bypass só ganha consumidor na T4.1
(Playwright), e wireá-lo agora seria código morto fora do que a task pede.

Novo (RF3, ADR-0075 §2): `src/modules/identity/shared/driverAuthorization.service.ts`
(`checkDriverAuthorization`, chama `GET /me/trips/current` com o token; `403` → `forbidden`; qualquer
outra resposta ou falha de rede → `authorized`, porque RF6/boot-sem-rede ainda não existe e barrar
aqui seria antecipar essa decisão) e `src/modules/identity/DriverForbidden.page.tsx` ("Sem acesso —
Esta conta não é de motorista; use o painel da transportadora"). `main.tsx` ganhou `PageFrame`
(molde do portal, para a faixa de ambiente continuar aparecendo **uma vez** em cada tela — o teste
`environment-banner.contract.ts` exige isso) e a sequência: `initializeKeycloakAuth` →
`checkDriverAuthorization` → `App` provisória ou `DriverForbiddenPage`. `package.json`: `test` ganhou
`test/identity.contract.test.ts`.

```
cd apps/frontend-driver && bun run typecheck && bun run lint
  ok

cd apps/frontend-driver && bun run test
  65 pass / 0 fail / 137 expect()   (shared.contract.test.ts + identity.contract.test.ts)

cd apps/frontend-driver && bun run build
  vite build ok · precache 13 arquivos, 248.829 bytes · dist.contract.test.ts 6 pass / 0 fail

bun run typecheck / bun run lint (raiz, 7 apps)   ok
```

**Verificação end-to-end de verdade** (`make dev`, stack local completa, Keycloak recriado com o
realm da T2.2 — os containers `transportada-local-*` já estavam de pé; só os processos de app foram
subidos e depois derrubados por este executor com `kill -TERM` no fim), pelo Browser pane:

- **Login local na `53200`** com a conta `local-user` (papel `driver`, entre outros, do seed
  `local-identity-seed.service.ts`; identificador `local-user` — o e-mail do seed
  `operador@local.test` não resolve login hint nenhum e produz "Usuário ou senha inválidos", porque o
  e-mail do ator do seed não é o e-mail da conta do Keycloak): a tela de identificação encaminhou para
  o Keycloak **real** (`http://localhost:58080`), PKCE `S256` aceito, login com a senha de
  `KEYCLOAK_LOCAL_USER_PASSWORD` (o valor no `.env` local ainda é o placeholder do `.env.example`) e
  volta para `53200` mostrando "Minha viagem" — prova o `checkDriverAuthorization` real contra
  `GET /me/trips/current` (`200`, autorizado, porque `local-user` tem o papel `driver`).
- **Logout volta à `53200`**: `GET http://localhost:58080/.../logout?client_id=transportada-spa&
post_logout_redirect_uri=http://localhost:53200` — Keycloak aceitou o `post_logout_redirect_uri`
  (mostrou a confirmação "Deseja sair?" em vez de recusar o parâmetro) e, confirmado, redirecionou
  para `53200`, que mostrou a tela de identificação (sessão encerrada). Prova viva de que a `53200`
  está em `post.logout.redirect.uris` do realm local (T2.2) — repetido duas vezes na sessão, as duas
  com o mesmo resultado.
- **Conta de escritório vê o `403`**: criado localmente via API (token do `local-user`, que tem
  `company-admin`/`users.manage`), sem passar pelo Keycloak à mão —
  `POST /company-users` (`channel: email`, `roles: ['operator']`, sem `driver`/`aggregate`) seguido de
  `POST /company-users/:id/activation` (senha imediata, ativação manual — o convite por e-mail exigiria
  Mailpit e a tela `/ativar` da spec 188, fora do escopo desta task). Login em `53200` com essa conta
  (`escritorio.local`) autenticou no Keycloak e a app mostrou **"SEM ACESSO — Esta conta não é de
  motorista; use o painel da transportadora"** — o texto exato da RF3.
- **SSO**: com a sessão do `local-user` ativa (aberta em `53200`), naveguei para `53000` (painel) e
  ele entrou **sem pedir senha** (workspace de NF-e direto) — confirma `check-sso` compartilhando a
  mesma sessão do Keycloak entre `app.` e `motorista.` (ADR-0075 §2).

```
make check                                    exit 0
  format:check ok · lint ok · typecheck ok
  api 7290 pass (+23 skip) · worker 1424 · cron 101 · frontend 5264+51 · client 55 ·
  driver 65+6 · landing 111 · build ok (driver precache 13 arquivos ~248 KiB)

cd apps/api-transportada && bun --env-file=../../.env.test test test/deploy.contract.test.ts --timeout 120000
  182 pass / 0 fail / 650 expect()

cd apps/api-transportada && bun --env-file=../../.env.test run test:integration
  (não roda nesta task — T2.3 não mexe em test/integration/**)
```

**Commit próprio, T2.3.**
