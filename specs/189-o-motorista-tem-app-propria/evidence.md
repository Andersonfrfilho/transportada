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

## Fase 3 — O módulo muda de casa, com o campo seguro

### T3.1 — Contratos do módulo da viagem, antes do código

Os 20 contratos de `apps/frontend-transportada/test/driver-trip/` (os 21 menos
`office-execution.contract.ts`, que fica no painel — spec 179 T302/T303 continuam lá até a emenda da
T8.3) copiados sem alteração para `apps/frontend-driver/test/driver-trip/`: mesma profundidade de
diretório, os imports relativos (`../../src/modules/driver-trip/...`) e por `@/` resolvem igual.
`catalog-parity.contract.ts` também não muda — o caminho relativo até
`apps/api-transportada/src/trips/domain/driver-return-reason.policy.ts` sobe o mesmo número de
níveis a partir de `apps/frontend-driver/test/driver-trip/`.

Entram também `test/driver-trip.contract.test.ts` (entrypoint) e
`test/driver-trip/copy-by-value-header.contract.ts`: um contrato novo, que varre os arquivos que a
T3.2 vai trazer para dentro da app e confere que cada um começa com
`/* Cópia por valor de <origem> (ADR-0075 §7). */` apontando para a origem certa. `package.json`
ganha `test/driver-trip.contract.test.ts` no script `test`.

```
cd apps/frontend-driver && bun test test/driver-trip.contract.test.ts
  0 pass / 1 fail / 1 error
  error: Cannot find module '@/modules/driver-trip/shared/driverTrip.types'
    from 'test/driver-trip/catalog-parity.contract.ts'
```

Vermelho pela razão certa: falha por import ausente, com o módulo da viagem ainda fora da app (foi
movido apenas na T3.2, adiante).

**Commit próprio, T3.1.**

### T3.2 — Código da tabela da ADR §7 (sem o sino)

Copiado por valor (cabeçalho em cada arquivo, cópia por valor conferida pelo contrato da T3.1):

- o módulo inteiro `apps/frontend-transportada/src/modules/driver-trip/` (34 arquivos). Dois ajustes
  de import, porque esta app já tinha o próprio `environment.config.ts`/`KeycloakAuthProvider.
provider.ts` (molde do portal, da T1.2/T2.3) em `modules/shared/`, e não em `modules/identity/
shared/` como no painel: `getIdentityEnvironment()` → `getDriverEnvironment()` em
  `driverTripClient.service.ts`, e o caminho do `KeycloakAuthProvider` em `driverTripClient.service.ts`,
  `DriverShellHeader.component.tsx` e `DriverProfile.page.tsx`. O comentário de
  `driverLocation.service.ts` já chegou da origem citando a ADR-0075 §8 (RF15/I9): "uma leitura por
  confirmação; posição contínua só com consentimento (ADR-0050 §5, ADR-0075 §8)" — nenhuma edição
  precisou;
- o design system caseiro do painel, só os primitivos que o módulo usa (conferido por
  `grep` dos imports do módulo, não a lista inteira da ADR): `button`, `icon` (14 nomes usados, não o
  catálogo de ~90 do painel — `alert camera check clock close copy document download link logout
message refresh save trash upload workspace-driver-trip workspace-users`), `skeleton`, `barcode` +
  `code128.service`, `file-field`, `copy-button` (dependência do `WhatsAppPhonePanel`), `cn`
  (`src/lib/utils.ts`);
- `InstallationBrandMark`, `useInstallationBrandView`, `useInstallationBrand.query`,
  `installationBrand.service`, `installationBrandCache.service` (marca da transportadora no
  cabeçalho da viagem); `WhatsAppPhonePanel` e as dependências dele (`useWhatsAppPhone.hook`,
  `whatsappPhone.constant/types/validation/client/viewModel.service`, `whatsappPhone.module.css`,
  `phone.service`, `useCountdown.hook` — todos em `modules/shared/`, com os mesmos dois ajustes de
  import do item acima); `taxId.service` (CPF/CNPJ alfanumérico da prova de entrega);
- `useAuthMe.query.ts` e `i18n.service.ts`, os dois **reduzidos** (cabeçalho "Cópia por valor,
  reduzida, de ..."): o painel valida `roles`/`permissions` contra um catálogo fechado de dezenas de
  papéis e permissões de escritório que este app não usa — só `data.roles` (o Perfil lê isso, e
  `trip.read` já é a API que decide, via `checkDriverAuthorization`); o painel registra vinte e
  poucos namespaces de locale, este app só usa `driverTrip` e `identity` (a chave `whatsappPhone`
  reduzida em `identity.locale.json`/`identity.en.locale.json`, só com o que o `WhatsAppPhonePanel`
  lê).

Fora da tabela, dois ajustes que a T3.1 e a varredura de CSP acusaram:

- `NON_FETCH_ORIGIN` (vazia desde a T1.1, com o comentário "entra quando o módulo da viagem chegar")
  ganha `https://maps.google.com` — `DriverStopCard.component.tsx` abre o mapa por `window.open`,
  nunca `fetch`;
- `eslint.config.mjs` ganha `no-restricted-imports` contra `**/frontend-*/**`, para barrar import
  relativo de outra app (o `@/` que não resolva já falha o `tsc`, mas o relativo escaparia da árvore
  desta app sem essa regra).

`package.json`: `i18next`/`react-i18next` como dependência, na versão que o painel usa
(`25.7.4`/`16.5.0`); `bun install` sem mudança de resolução (o workspace Bun já tinha os pacotes
hoisted pela app do painel) — `bun.lock` mudou mesmo assim.

⚠️ **Achado de processo**: ao inserir o cabeçalho de cópia num lote de arquivos com
`{ printf; cat "$origem"; } > "$destino"` (agrupamento de comandos com redirecionamento único), o
shell desta sessão perdeu, de forma silenciosa e reproduzível, a linha de comentário original de doze
arquivos (a de copyright e, num deles, um comentário no meio do corpo) — confirmado com `Read`
(autoritativo) contra o `cat`/`diff` do Bash, que também mostrou o problema mas de forma menos
confiável para depurar. A forma com `printf > tmp; cat >> tmp; mv tmp destino` (comandos separados,
sem agrupamento) não tem esse defeito, e foi o padrão usado para corrigir os doze arquivos e para
todo o resto da cópia. Registrado aqui porque não é atribuível ao conteúdo copiado — reproduziu-se
até com um arquivo de teste solto em `/tmp`.

```
cd apps/frontend-driver && bun test test/driver-trip.contract.test.ts
  231 pass / 0 fail / 432 expect()   (21 contratos, T3.1 verde)

cd apps/frontend-driver && bun run test
  296 pass / 0 fail / 569 expect()   (shared + identity + driver-trip)

cd apps/frontend-driver && bun run typecheck
  ok

cd apps/frontend-driver && bun run lint
  ok

cd apps/frontend-driver && bun run build
  vite build ok · precache 13 arquivos, 225,91 KiB (231.395 bytes) · dist.contract.test.ts 6 pass / 0 fail
```

**Commit próprio, T3.2.**

### T3.3 — Casca (plan D4)

- `driverRoute.service.ts` (novo, `modules/shared/`, não é cópia — é código próprio desta app):
  `resolveDriverRouteSection`/`buildDriverRoutePath` para as cinco seções
  (`/`, `/perfil`, `/fila`, `/fotos`, `/notificacoes`), `navigateToDriverSection`
  (`pushState` + `popstate` sintético) e `subscribeDriverRoute` (`addEventListener('popstate', …)`,
  devolve a função de cancelamento). Contrato em `test/shared/driver-route.contract.ts`: as cinco
  seções, caminho desconhecido cai em `trip`, o inverso `buildDriverRoutePath ∘ resolveDriverRouteSection`
  fecha para as cinco, e `subscribeDriverRoute` com um `target` falso (sem DOM) prova a chamada e o
  cancelamento.
- `installPrompt.service.ts` (novo, mesmo motivo): `resolveInstallGuidance` (`android-prompt` com
  `beforeinstallprompt`, `ios-instructions` sem ele em iOS, `unavailable` já instalado ou nenhum dos
  dois), `detectIsIos` (user agent) e `detectIsStandalone` (media query ou `navigator.standalone`).
  Contrato em `test/shared/install-prompt.contract.ts`, seis casos. ⚠️ Só o serviço — o botão que
  aciona o prompt do Android e o texto "Compartilhar → Adicionar à Tela de Início" do iOS ficam para
  a T147 ("a área de Instalar no Perfil", ADR-0075 "o que a 189 deixa pronto para a 147"); a T3.3
  só pede o contrato.
- `DriverTripWorkspace.page.tsx`: os três `useState` locais (`section`, `isQueueOpen`,
  `isPendingProofsOpen`) viraram derivados de `resolveDriverRouteSection(window.location.pathname)`
  mais `subscribeDriverRoute` num `useEffect`. `onSelect` do `DriverBottomBar` e os botões que abrem
  fila/fotos chamam `navigateToDriverSection`; os `onBack` das duas telas viraram
  `window.history.back()` — desfaz exatamente o `pushState` que abriu a tela, e volta para onde a
  pessoa estava (viagem ou perfil), sem precisar guardar essa informação à parte.
- **O sino**: `notificationClient.service.ts` copiado por valor para `modules/notification/shared/`
  (mesmos dois ajustes de import da T3.2); `notificationTheme.constant.ts` copiado; `notification.
module.css` copiado **reduzido** — o painel tem ~80 variáveis `--adn-preview-*` do editor de
  template com prévia (aparelho retratado), que esta app não tem; ficam só as ~25 que
  `NotificationBell`/`NotificationList` leem, mais `min-width`/`min-height: var(--touch-target)` em
  `.notificationBell` (RF9, 44 px — o painel não precisa disso, é mouse).
  `DriverShellHeader.component.tsx` ganha `<NotificationBell>` entre a marca e o avatar, com
  `onClick={() => navigateToDriverSection('notifications')}` — diferença registrada da origem em
  comentário no arquivo (o painel não tem o sino _neste_ componente, ele mora no shell inteiro).
  `DriverNotificationsPage` (novo, `modules/notification/pages/`) monta `<NotificationList />` sem
  props — lê do `NotificationProvider` que a casca já monta — com um botão de voltar
  (`window.history.back()`) e o título traduzido (`nav.notifications`, chave nova em
  `driverTrip.locale.json`/`.en.locale.json`, dentro do bloco `nav` que a T3.2 já tinha copiado).
  `main.tsx` reescrito: a tela provisória da T1.2 sai; entram `QueryClientProvider` (não existia
  ainda — `useDriverTrip`/`useAuthMeQuery`/`useWhatsAppPhone` precisam dele),
  `import '@/modules/shared/i18n/i18n.service'`, e `NotificationProvider` com
  `client={getNotificationClient()}` e `theme={{ rootClassName: NOTIFICATION_THEME_CLASS }}` — o
  mesmo padrão do painel (`main.tsx:855-871` de lá). Dentro do provider, a leitura de
  `driverRoute.service` decide entre `DriverNotificationsPage` e `DriverTripWorkspacePage` (que por
  sua vez decide entre viagem/fila/fotos/perfil, internamente, pela mesma leitura de rota).
  `isRegisteredDriver: false` continua mostrando a tela que o módulo já tinha (nenhuma mudança —
  `DriverTripWorkspace.page.tsx:355/370` já tratava isso desde a origem).

O que o pacote exporta (conferido em `node_modules/@adatechnology/notification-ui/dist/index.d.ts`):
`NotificationProvider`, `NotificationBell` (`onClick`, `className`, `maxBadgeCount`),
`NotificationList` (`category?`, `onSelect?`, `className?`, `renderEmpty?`, `components?` — nenhuma
prop obrigatória, lê tudo do contexto do provider), mais `NotificationItem`,
`NotificationSettingsWorkspace`/`NotificationsWorkspace` (as telas compostas do painel, não usadas
aqui) e os hooks headless. Versão instalada: `@adatechnology/notification-client` `0.1.0-rc.3` e
`@adatechnology/notification-ui` `0.1.0-rc.9` — as mesmas do painel (`package.json` do painel,
conferido antes de fixar a versão nesta app).

Ajuste num contrato da T1.1, feito ao implementar (mesmo padrão de "ajuste sem mudar o que ele
cobra" da T1.2): `environment-banner.contract.ts` conferia a faixa de ambiente acima da string
literal `<main` em `main.tsx` — que só existia por acaso, na tela provisória da T1.2. Sem tela
provisória, a asserção passa a comparar contra `{children}`, que é onde `PageFrame` (o mesmo
componente de antes) insere o conteúdo — o que o contrato prova (a faixa antes do conteúdo, uma
vez só) não mudou.

```
cd apps/frontend-driver && bun run test
  307 pass / 0 fail / 595 expect()   (shared + identity + driver-trip, os dois contratos novos inclusos)

cd apps/frontend-driver && bun run typecheck && bun run lint
  ok

cd apps/frontend-driver && bun run build
  vite build ok · precache 13 arquivos, 550,02 KiB (582.316 bytes) — o salto de 225,91 KiB (T3.2) vem
  do main.tsx agora importar de verdade o módulo inteiro e o pacote do sino, que antes não eram
  alcançados por nenhum import; segue bem abaixo do teto de 1,5 MiB.
  dist.contract.test.ts 6 pass / 0 fail
```

**Verificação no navegador** (Browser pane, contra um `bun run --cwd apps/frontend-driver dev` e um
`bun run --cwd apps/api-transportada dev` próprios deste executor, subidos e derrubados por ele —
a `53200`/`53001` já estavam ocupadas por processo de outra sessão nesta mesma árvore, então o
`vite` desta verificação subiu sozinho na `53201` e foi encerrado logo depois; a leitura real ficou
contra a **`53200` já em pé**, que é a mesma árvore e reflete o código atual por HMR do Vite):

- `http://localhost:53200` carrega sem quebrar, título "Minha viagem", e mostra a
  `LoginIdentifierPage` (sem sessão) — prova que `main.tsx` novo monta a árvore, `i18n.service` está
  registrado (os textos saem traduzidos, não chaves cruas) e nada no boot lança exceção não tratada
  antes da autenticação.
- ⚠️ **Não foi possível logar** para ver o sino de verdade: o processo da API em `53001` (de outra
  sessão) recusa `/login-hints` por CORS (`FORBIDDEN`, sem `Access-Control-Allow-Origin`) — o `.env`
  desta árvore **tem** `http://localhost:53200` em `FRONTEND_ORIGIN` (conferido: `sed -n '8p' .env`),
  então o processo em pé deve ter subido antes dessa entrada existir, ou com outro `.env`. Reiniciar
  esse processo não é deste executor: ele pertence a outra sessão ativa na mesma árvore (o aviso do
  briefing), e derrubá-lo arriscaria o trabalho dela. Evidência do sino em tela fica pendente de uma
  verificação com stack própria — não é bloqueio de `make check`, que não sobe servidor nenhum.

```
make check                                    exit 0
  format:check ok · lint ok (7 apps) · typecheck ok (7 apps)
  api/worker/cron/frontend-transportada/frontend-client/frontend-driver/frontend-landing: todos os
  testes verdes, nenhum "fail" acima de zero em nenhuma suíte; build das 7 apps ok, incluindo
  driver (dist.contract.test.ts 6 pass / 0 fail) e frontend-transportada (opencv/pdf.worker/maplibre
  fora do orçamento do motorista, como sempre — são do painel, não desta app)
```

**Commit próprio, T3.3.**

### T3.3a — Boot sem rede, com o snapshot e a fila com dono (plan D4 e D5)

**Contratos antes do código.** Três suítes novas em `apps/frontend-driver/test/driver-trip/`, na lista
do entrypoint `test/driver-trip.contract.test.ts`:

- `boot-mode.contract.ts` — `probeIdentityProvider` (URL do `openid-configuration` do realm,
  `cache: 'no-store'`, `AbortSignal`, prazo de 5 s; rede fora, resposta não-`ok` e sonda abortada
  pelo prazo dão `false`, nunca exceção); `resolveBootMode({ isReachable, snapshot, now })` nos três
  modos, mais snapshot de 25 h e snapshot só com viagens concluídas caindo em `offline-empty`;
  `scheduleAuthenticationOnReconnect` (no `online` sonda e autentica com o registro vazio; sem
  Keycloak continua esperando; **com captura aberta espera o `close`** e sonda de novo; temporizador
  de sinal fraco; autentica uma vez só; cancelar desliga ouvinte e temporizador); e leitura de fonte:
  no `start()` do `main.tsx` a sonda e a decisão vêm antes de `startAuthenticated`, o
  `initializeKeycloakAuth()` só existe uma vez e fora do boot, e `navigator.onLine` não aparece.
- `trip-snapshot.contract.ts` — `hashSubject` é SHA-256 hex (vetor `abc`); gravar aponta `last`;
  outro `sub` autentica e o snapshot do anterior sai; o mesmo `sub` mantém o dele como dado inicial;
  24 h descarta na leitura e no claim; todas as viagens concluídas (ou lista vazia) apaga em vez de
  gravar; "Sair" limpa tudo, inclusive o ponteiro; o valor do IndexedDB passa por type guard; e
  leitura de fonte: base na versão 3 com `trip-snapshot` e `last`, e `discardTripSnapshots(` antes
  do `.logout()` no Perfil.
- `queue-owner.contract.ts` — o item enfileirado leva o `subHash`; a drenagem só envia evento e anexo
  do dono; nem o envio manual (`only`) manda item de outra conta; item sem dono conta como de outra
  conta; a recusa do servidor preserva o dono; `partitionPendingByOwner` separa e conta; "Descartar"
  apaga só os de outra conta, com o blob junto.

Vistos falhando antes da implementação:

```
cd apps/frontend-driver && bun test test/driver-trip.contract.test.ts
  error: Cannot find module '@/modules/driver-trip/shared/tripSnapshot.service'
  0 pass / 1 fail / 1 error                                  (nenhum serviço existia)
# depois dos serviços puros, antes de main.tsx/hook/Perfil:
  263 pass / 3 fail   (as três leituras de fonte: boot, hook e "Sair")
```

**Implementação** (`apps/frontend-driver/src/`):

- `modules/driver-trip/shared/bootMode.service.ts` — `probeIdentityProvider`, `resolveBootMode`,
  `scheduleAuthenticationOnReconnect`.
- `modules/driver-trip/shared/tripSnapshot.service.ts` — dono (`SHA-256(sub)`), prazo de 24 h,
  "todas concluídas" (`completed`/`cancelled`, lista vazia conta), claim, gravação e descarte.
- `modules/driver-trip/shared/queueOwner.service.ts` — partição e "Descartar".
- `modules/driver-trip/shared/captureRegistry.service.ts` — **o mínimo** (`open`, `close`, `isIdle`,
  `onIdle`) que a volta da rede precisa. Ninguém chama `open` ainda: ligar câmera, recorte,
  assinatura e diálogo de ocorrência, e o contrato próprio do registro, **ficam para a T3.5**.
- `indexedDbQueue.service.ts` na versão 3, com o store `trip-snapshot` (chave `subHash` →
  `{ savedAt, snapshot }`, e `last` → `subHash`); `retainOnly` e `write` numa transação só.
- `offlineQueue.service.ts`/`offlineAttachments.service.ts`: `subHash?` em `QueuedReport` e
  `QueuedAttachment`, `enqueueReport({ subHash })` e `drainQueueWithAttachments({ ownerSubHash })`.
  O campo é opcional para os 20 contratos copiados do painel seguirem intactos; com `ownerSubHash`
  informado (sempre, pelo hook), item sem dono não sai.
- `hooks/useDriverSession.hook.ts` (contexto `{ canSync, initialSnapshot, subHash }`) e
  `useDriverTrip.hook.ts`: `useQuery` com `enabled: session.canSync`, `initialData` e
  `initialDataUpdatedAt` do snapshot; o `queryFn` grava o snapshot (react-query 5 não tem `onSuccess`
  em consulta); drenagem suspensa sem token; fila da tela só do dono; `foreignPendingCount`,
  `discardForeignPending` e `offlineSnapshotSavedAt` no controlador.
- `main.tsx`: sonda + leitura do último snapshot em paralelo → `resolveBootMode` →
  `startAuthenticated` (init, `getSubject()` novo no provedor, `hashSubject`, `claimTripSnapshot`,
  `trip.read`, `queryClient.clear()`) ou `startOffline` (casca com `canSync: false`, ou
  `DriverOfflineEmptyPage`, e `scheduleAuthenticationOnReconnect` com o `captureRegistry`).
- Tela: faixa "Sem conexão — dados de HH:MM" na viagem, `DriverForeignPendingNotice` com
  "Descartar" em dois passos (aviso + "Descartar de vez"), `DriverOfflineEmpty.page.tsx`
  ("Sem viagem salva; conecte-se…"), chaves `offline.*` e `foreignPending.*` nos dois locales;
  "Sair" apaga o snapshot antes do `logout()`.
- `docs/SECURITY.md`: entrada de 2026-09-25 (o que fica no aparelho, a chave, o prazo e o descarte).

**Decisões que o texto não fixava** (registradas para a revisão):

1. **Sonda também por temporizador (30 s)**, além do `online`. Com sinal fraco (CA05-b: `onLine`
   verdadeiro e `/realms/**` abortado) o evento `online` nunca dispara; sem o temporizador a
   autenticação nunca voltaria. O intervalo é o mesmo do temporizador de drenagem (plan D5).
2. **"Todas as viagens concluídas"** = todo status em `completed`/`cancelled`, e lista vazia conta
   (plan D5: "resposta sem viagem apaga"). A API hoje só devolve viagens abertas, então na prática é
   a lista vazia.
3. **Item de fila sem `subHash` é de outra conta**, nunca enviado — a origem é nova, então isso só
   protege contra dado que não deveria existir.
4. Com Keycloak alcançável e sessão ativa, o snapshot do mesmo `sub` vira `initialData`: a viagem
   aparece antes da primeira resposta da API, e a consulta refaz a leitura logo em seguida.

**Não verificado aqui (fica para a T4.1, CA05/CA06):** o fluxo em navegador. Em `offline-snapshot`
o sino e a leitura dos tipos de ocorrência chamam `getAccessToken()` sem token e falham (o cliente
dos tipos vira estado `failed`, como já fazia sem rede); "Iniciar trajeto" não é enfileirável e mostra
a falha de sempre. Nenhum dos dois quebra a tela, mas o Playwright da T4.1 deve olhar.

```
cd apps/frontend-driver && bun run test
  342 pass / 0 fail   (307 da T3.3 + 35 novos)

cd apps/frontend-driver && bun run lint && bun run typecheck
  ok

cd apps/frontend-driver && bun run build
  precache 13 entries (558.21 KiB, 590.705 bytes) — abaixo do teto de 1,5 MiB
  dist.contract.test.ts 6 pass / 0 fail

make check                                    exit 0
  format:check ok · lint ok (7 apps) · typecheck ok (7 apps)
  testes: 18 · 7281 · 1424 · 101 · 5264 · 51 · 55 · 342 · 111 — todos com 0 fail
  build das 7 apps ok (driver: dist.contract 6 pass / 0 fail)
```

**Commit próprio, T3.3a.**

### T3.4 — Pendência e drenagem (plan D5)

**Contrato antes do código.** `test/driver-trip/pending-queue.contract.ts`, na lista do entrypoint
`test/driver-trip.contract.test.ts`:

- `countPending`: `drainable` soma eventos e anexos não recusados e não vencidos; `rejected` soma os
  recusados ainda na fila; `total = drainable + rejected`; anexo com mais de 7 dias não entra em
  nenhuma contagem; anexo vencido **e** de outra conta (`ownerSubHash`) fica fora pelos dois motivos,
  nunca contado; item de outra conta não entra em nenhuma contagem quando `ownerSubHash` é informado.
- `scheduleQueueDrainTriggers`: `online`, `pageshow` e `visibilitychange` visível chamam `drain`;
  `visibilitychange` invisível não chama; o temporizador só existe com `drainable > 0`, liga já na
  montagem quando a fila já tem pendência, liga de novo quando um gatilho encontra `drainable > 0`
  depois de ter começado em zero, e se desliga sozinho quando a fila zera; cancelar desliga os três
  ouvintes e o temporizador — disparar os eventos depois não religa nada.

**Implementação** (`apps/frontend-driver/src/modules/driver-trip/shared/pendingQueue.service.ts`):
`countPending` e `scheduleQueueDrainTriggers` (a mesma dupla `setInterval`/`clearInterval` do
`bootMode.service.ts`, plan D5 — mesmo intervalo de 30 s). `useDriverTrip.hook.ts` passa a calcular
`drainableCountRef` a cada `refreshQueueView` (a mesma leitura de `store`/`attachmentStore` que já
existia) e troca o `useEffect` de um único ouvinte `online` por `scheduleQueueDrainTriggers`, com um
alvo que roteia `visibilitychange` para `document` e o resto para `window`. "Abertura" continua sendo
a chamada direta de `drain()` na montagem, antes de agendar os outros gatilhos.

```
cd apps/frontend-driver && bun run lint && bun run typecheck
  ok

cd apps/frontend-driver && bun run test
  355 pass / 0 fail   (279 do driver-trip.contract.test.ts, incluindo os 24 novos de pending-queue)
```

**Commit próprio, T3.4.**

### T3.5 — Atualização em ponto seguro (plan D2)

**Contrato antes do código.** `test/driver-trip/capture-registry.contract.ts`, na lista do
entrypoint:

- `captureRegistry`: abre/fecha por `kind`, com contagem (fechar sem abrir não derruba nada);
  `isIdle()` exige **todos** os kinds fechados, não só um; `onIdle` dispara só quando a última
  captura aberta fecha, e o cancelamento da inscrição funciona; `hasOpened()` começa falso, vira
  verdadeiro na primeira abertura e nunca volta.
- A regra de aplicação (`serviceWorkerUpdate.service.ts`): antes da primeira captura, aplica
  sozinho; depois de uma captura (já fechada), mostra o aviso em vez de aplicar; o toque aplica na
  hora com o registro ocioso; com captura aberta, o toque espera o `close`.
- Leitura de fonte: o hook da câmera liga `click`/`change`/`cancel` ao registro;
  `DriverStopCard.component.tsx` usa o hook nos dois seletores de foto (nota e ocorrência), e abre
  e fecha `'occurrence-dialog'` no montar/desmontar do formulário de ocorrência; `ProofCrop` e
  `SignaturePad` abrem e fecham `'crop'`/`'signature'` no próprio montar/desmontar (a tela já os
  monta e desmonta condicionalmente, então o ciclo de vida do componente **é** o ciclo da captura);
  `main.tsx` importa `registerSW` de `virtual:pwa-register` e liga o `onNeedRefresh` a
  `handleServiceWorkerUpdateAvailable`.

**Implementação:**

- `captureRegistry.service.ts` ganha `hasOpened()`.
- `serviceWorkerUpdate.service.ts` (novo): `handleServiceWorkerUpdateAvailable` e
  `requestServiceWorkerUpdate`, as duas pontas da regra.
- `useCameraCaptureFieldRef.hook.ts` (novo): usa o `inputRef` que `FileField` já aceitava — nenhuma
  mudança no primitivo genérico de `components/ui/`. O `click` no `<input type=file>` abre antes de
  qualquer resposta do seletor nativo chegar; `change` e `cancel` fecham, escolhido ou não.
- `DriverStopCard.component.tsx`: os dois `FileField` de foto (comprovante e ocorrência) recebem o
  `inputRef` do hook da câmera; `OccurrenceForm` abre/fecha `'occurrence-dialog'` num `useEffect` de
  montagem.
- `ProofCrop.component.tsx` e `SignaturePad.component.tsx`: `useEffect` de montagem abre a captura,
  o cleanup fecha.
- `main.tsx`: `registerSW({ immediate: true, onNeedRefresh })` fora do bypass de smoke (o mesmo
  guarda do painel), com um `Set` de assinantes no módulo — o mesmo padrão do `onIdle` do
  `captureRegistry` — para o `PageFrame` mostrar `DriverServiceWorkerUpdateNotice` sem prop
  drilling por toda a árvore. `DriverServiceWorkerUpdateNotice.component.tsx` (novo): "Nova versão
  disponível." + botão "Atualizar", chaves `serviceWorkerUpdate.*` nos dois locales.
- `workbox-window` entra como dependência direta (`package.json`, `bun.lock`): é quem
  `virtual:pwa-register` importa, e faltava — o `build` quebrava com `Rollup failed to resolve
import "workbox-window"` até essa linha entrar.

```
cd apps/frontend-driver && bun run lint && bun run typecheck
  ok

cd apps/frontend-driver && bun run test
  369 pass / 0 fail   (355 + 14 de capture-registry.contract, incluindo os 5 de leitura de fonte)

cd apps/frontend-driver && bun run build
  precache 13 entries (568.58 KiB) — abaixo do teto de 1,5 MiB
  dist.contract.test.ts 6 pass / 0 fail
```

**Commit próprio, T3.5.**

### T3.6 — Alvo de toque: contrato de CSS

**Contrato antes do código.** `test/shared/touch-target.contract.ts`, na lista do entrypoint
`test/shared.contract.test.ts`, varre todo `.css`/`.module.css` de `src/` (parser de regras no
molde de `field-metrics.contract.ts` do painel):

- `--control-height-compact` não aparece em arquivo nenhum;
- nenhuma declaração `min-height`/`height` com valor **literal** (`rem`/`px` — `var()`, `%`, `vh` e
  `dvh` não são medidos, porque não são o número mágico que a regra proíbe) fica abaixo de 44px, com
  uma exceção: a regra que esconde visualmente o `<input type=file>` nativo do `FileField`
  (`clip-path` + `position: absolute`, documentada no próprio arquivo) — o alvo de toque real ali é
  o rótulo por cima, que já mede `var(--control-height)`;
- o `Button` do design system não tem variante de tamanho abaixo do padrão.

Vermelho pela razão certa: os dois achados reais da varredura.

```
cd apps/frontend-driver && bun test test/shared.contract.test.ts
  antes:  50 pass / 3 fail — --control-height-compact em src/styles/index.css; .boxed/.boxedDone
          de copy-button.module.css em 1.75rem; Button ainda com a variante 'sm'
  depois: 53 pass / 0 fail
```

**Implementação:**

- `src/styles/index.css`: fora `--control-height-compact` e a classe `.ui-button-size-sm` que a
  usava — nenhum `Button` do app pedia `size="sm"` (achado ao auditar todo `size=` do `src/`, sem
  resultado).
- `src/components/ui/button.tsx`: sem o tamanho compacto, `size`/`ButtonSize` não tinham mais para
  que servir com um valor só — saíram os dois, e `buttonClassName`/`Button` ficam só com `variant`.
- `src/components/ui/copy-button.module.css`: `.boxed`/`.boxedDone` (usadas por `CopyButton`, real
  em `WhatsAppPhonePanel`) de `1.75rem` para `var(--touch-target)` (2.75rem) — era o único acerto de
  altura fora do padrão que a varredura achou em toda a app; o resto (`driverTrip.module.css`,
  `notification.module.css`, `whatsappPhone.module.css`, `file-field.module.css`) já usava
  `2.75rem`/`--control-height`/`--field-height`/`--touch-target` ou não era interativo (ícone,
  esqueleto, avatar, logo, barra de progresso).

```
cd apps/frontend-driver && bun run lint && bun run typecheck
  ok

cd apps/frontend-driver && bun run test
  372 pass / 0 fail

cd apps/frontend-driver && bun run build
  precache 13 entries (568.37 KiB) — abaixo do teto de 1,5 MiB
  dist.contract.test.ts 6 pass / 0 fail

make check                                    exit 0
  format:check ok · lint ok (7 apps) · typecheck ok (7 apps)
  api 7309 (T3.3a) segue a mesma faixa · worker/cron/frontend-transportada/frontend-client/
  frontend-landing sem regressão · driver: shared+identity+driver-trip 372 pass / 0 fail
  build das 7 apps ok, incluindo driver (dist.contract 6 pass / 0 fail)
```

**Commit próprio, T3.6 — fecha a Fase 3.**

## Fase 5 — O painel manda o motorista para a casa nova (desligado até a Fase 6)

### T5.1 — Contratos no painel, antes do código

Quatro contratos novos em `apps/frontend-transportada/test/driver-trip/`, importados por
`test/driver-trip.contract.test.ts` (que já está na lista do `package.json`), e um teste a mais em
`test/shared/vite-build-args.contract.ts`:

- `driver-app-redirect.contract.ts`:
  - `readDriverAppUrl`: ausente, vazia e só com espaço devolvem `undefined` **sem lançar**; presente
    passa por `readTrustedUrl` (barra final tirada, `http://localhost` aceito, `http://` de fora
    recusado com `IDENTITY_CONFIGURATION_INVALID_VITE_DRIVER_APP_URL`);
  - `resolveDriverAppRedirect`: **sem a variável, `stay`** em cinco combinações (com fila, sem fila,
    `standalone`, raiz, escritório) — é o "o painel serve `/minha-viagem`"; fila vazia → `redirect`
    (em `/minha-viagem` e na raiz para quem é do campo); `standalone` → `install-screen`; pendência →
    `pending-screen`, inclusive em `standalone` (a fila só sai desta origem); escritório → `stay`;
    fora de `/` e `/minha-viagem` → `stay`.
- `pending-queue.contract.ts`: `countPending` do painel (drainable, rejected, total, anexo vencido
  fora da conta) e a **paridade pelo texto de fonte** com
  `apps/frontend-driver/src/modules/driver-trip/shared/pendingQueue.service.ts` (do tipo
  `PendingCounts` ao fim de `countPending`), mais o cabeçalho "Cópia por valor".
- `queue-discard.contract.ts`: "Descartar" tira o evento recusado com os anexos dele; anexo recusado
  sai sozinho (o evento e os outros anexos ficam); o que não foi recusado não se descarta.
- `legacy-beacon.contract.ts`:
  - `sendDriverLegacyBeacon` manda `('/_driver-legacy-served', 'pending-screen')`;
  - `sendBeacon` só existe em `driverAppRedirect.service.ts`;
  - `main.tsx` chama o beacon **uma** vez, dentro do ramo `case 'pending-screen':`;
  - a rota do `server.ts` sobe de verdade (cópia do arquivo num diretório temporário com um `dist/`
    mínimo, `Bun.spawn`, porta livre): `204` e corpo vazio para válido, inválido, grande (214
    bytes), em partes (stream de 78 bytes) e `GET`; só o válido gera **uma** linha de log, com as
    chaves exatas `at`, `event`, `mode` — sem usuário e sem IP.
- `vite-build-args.contract.ts`: o código lê `VITE_DRIVER_APP_URL` e o `Dockerfile` declara
  `ARG VITE_DRIVER_APP_URL`.

**Vermelhos pela razão certa:**

```
cd apps/frontend-transportada && bun test ./test/driver-trip.contract.test.ts
  0 pass / 1 fail / 1 error
  Cannot find module '@/modules/driver-trip/shared/driverAppRedirect.service'

cd apps/frontend-transportada && bun test ./test/shared.contract.test.ts
  300 pass / 1 fail
  (fail) o interruptor do motorista é lido pelo código e tem ARG no Dockerfile
```

**Commit próprio, T5.1.**

### T5.2 — Implementação (plan D6)

**O que entrou:**

- `identity/shared/identityEnvironment.config.ts`: `readDriverAppUrl()`, lida sozinha no molde de
  `isIdentifierFirstLoginEnabled()`. Ausente/vazia → `undefined`; presente → `readTrustedUrl`.
- `driver-trip/shared/driverAppRedirect.service.ts` (puro): `resolveDriverAppRedirect`,
  `isStandaloneDisplay`, `sendDriverLegacyBeacon` e as constantes do beacon.
- `driver-trip/shared/driverAppEntry.service.ts`: a metade impura — lê a fila antiga do IndexedDB e
  o `display-mode`. Fila ilegível vira `stay` (o painel serve `/minha-viagem` como sempre).
- `driver-trip/shared/pendingQueue.service.ts`: cópia por valor, no sentido inverso, de
  `countPending` da app. A fila do painel não tem dono, então o filtro `ownerSubHash` não vem: com o
  texto idêntico o `tsc` recusava (`TS2559`, os tipos do painel não têm `subHash`). O contrato de
  paridade passou a comparar sem as linhas do filtro de dono e sem linhas em branco — mutação
  conferida: trocar a regra do anexo vencido no painel reprova a paridade e o teste de comportamento.
- `driver-trip/shared/queueDiscard.service.ts`: `discardRejectedQueueItem`.
- `useDriverTrip`: `pendingCounts` e `discardRejected` a mais; nada muda no que já existia.
- `DriverEventQueue.page.tsx`: `onBack` opcional e `onDiscard` opcional, com confirmação em linha
  ("A entrega não foi registrada; fale com o escritório…", "Descartar mesmo assim" / "Manter"). Sem
  `onDiscard`, a marcação do item é **a de antes** (o botão "Enviar agora" direto no item).
- `DriverLegacyPending.page.tsx` (só a fila, sem a viagem; "Ir para o app novo" com `total = 0`) e
  `DriverAppInstall.page.tsx` ("Instale o app novo", link para a casa nova em nova aba). Textos em
  pt-BR e en no `driverTrip*.locale.json`.
- `main.tsx`:
  - `takeOverDriverEntry` roda **antes** e **depois** do `initializeKeycloakAuth`, só em
    `/minha-viagem` e só com a variável. Antes: `redirect` e `install-screen`, sem pedir login ao
    painel. Depois: `pending-screen` (precisa de token para drenar; e a volta do Keycloak cai em
    `/auth/callback`, que só vira `/minha-viagem` dentro do `initialize`). O beacon sai só no
    `case 'pending-screen':`. "Ir para o app novo" recarrega — é a "próxima abertura": o boot decide
    entre ir e instalar.
  - na raiz, o efeito de quem é do campo: sem a variável, o mesmo `replaceState` de sempre; com
    ela, `redirect` → `location.replace(<casa nova>)`, pendência/instalação →
    `location.replace('/minha-viagem')`, onde o boot monta a tela.
- `server.ts`: `/_driver-legacy-served` antes da resolução de arquivo. `POST` com corpo igual a
  `pending-screen` loga `{"at","event":"driver_legacy_served","mode":"pending-screen"}`; qualquer
  outra coisa, nada. `Content-Length` > 32 nem é lido; corpo em partes para no primeiro byte além
  de 32 e cancela. Sempre `204` com os cabeçalhos de segurança.
- `Dockerfile`: `ARG VITE_DRIVER_APP_URL`.
- `.railway/railway.ts` (commit próprio, arquivo compartilhado): `VITE_DRIVER_APP_URL: preserve()`
  no painel, com o comentário do interruptor. `preserve()` não cria a variável que não existe.

**Autorrevisão do boot — sem a variável, nada muda para ninguém:**

- pré e pós autenticação: `takeOverDriverEntry` devolve `false` se o caminho não é `/minha-viagem`
  e, sendo, se `readDriverAppUrl()` é `undefined` — sem abrir IndexedDB, sem render, sem beacon;
- raiz de quem é do campo: `readDriverAppUrl()` `undefined` → `enterDriverTrip()`, que são as três
  linhas de antes, na mesma ordem;
- escritório: o efeito sai antes, em `isFieldOnlyUser`, como antes; `readDriverAppUrl` nem roda;
- `DriverEventQueuePage` sem `onDiscard`: mesma marcação de antes (conferido no diff);
- `useDriverTrip`: só estado a mais (`pendingCounts`), no mesmo lote de `setQueueView`;
- as duas telas novas são `lazy`: não entram no bundle inicial;
- `server.ts`: a rota nova vem antes da resolução de arquivo e só casa o caminho exato; os outros
  caminhos seguem o mesmo fluxo;
- variável presente mas inválida: `readTrustedUrl` lança — só em `/minha-viagem` e no efeito de
  quem é do campo, nunca para o escritório.

**Gates (só o painel, por causa da Fase 4 em paralelo):**

```
cd apps/frontend-transportada && bun run lint        ok
cd apps/frontend-transportada && bun run typecheck   ok
cd apps/frontend-transportada && bun run test
  contratos 5290 pass / 0 fail (29 arquivos; 26 testes novos da T5.1) · hooks 51 pass / 0 fail
cd apps/frontend-transportada && bun run build        ok (precache 151 entradas)
cd apps/api-transportada && bun test ./test/deploy/{migrations-are-applied,staging-refresh,
  osm-extract,gatus,service-naming}.contract.ts       52 pass / 0 fail (leem o railway.ts)
```

**Aberto nesta task:** `make check` (fica com o orquestrador, na publicação), o `code-reviewer`
(`opus`) antes do push e a publicação em staging **sem** a variável com o print de `/minha-viagem`.
Por isso a T5.2 não está marcada no `tasks.md`.

**Commits próprios, T5.2:** o do painel e o do `.railway/railway.ts`.

### T5.3 — `DriverReturnReason` e `DRIVER_RETURN_REASONS` para `modules/trip/shared/`

- `trip/shared/tripReturnReason.types.ts` novo, com a lista e o tipo;
- os quatro imports do módulo `trip` trocados: `trip.types.ts`, `TripReturnReasonDialog`,
  `TripStateActions` e `TripDetail` — `git grep driver-trip/shared/driverTrip.types -- src/modules/trip`
  vazio;
- `driverTrip.types.ts` importa e reexporta até a remoção do módulo (T10.2);
- `test/driver-trip/catalog-parity.contract.ts` passa a ler `DRIVER_RETURN_REASONS` da casa nova,
  para a paridade com a API continuar vigiando a cópia que fica no escritório. Antes da troca:
  `Cannot find module '@/modules/trip/shared/tripReturnReason.types'` (0 pass / 1 fail).

```
cd apps/frontend-transportada && bun run lint && bun run typecheck   ok
cd apps/frontend-transportada && bun run test
  contratos 5290 pass / 0 fail · hooks 51 pass / 0 fail
```

**Aberto:** o `make check` do aceite fica com o orquestrador, na publicação; por isso a T5.3 não
está marcada.

**Commit próprio, T5.3.**

### T5.4 — Smokes do painel (plan D6)

- `test/authenticated-smoke.helper.ts:69-74`: o comentário do destino do motorista — com o
  interruptor ligado ele sai do painel, e os smokes dele moram em `apps/frontend-driver`.
- `test/responsive.smoke.spec.ts`: saem os seis smokes do motorista (`~1185-1331`: entrada na
  viagem, tipos de ocorrência, lista vazia, falha e nova tentativa, sem sinal, romaneio). Entram três:
  - **redirecionamento**: a raiz de quem é do campo e `/minha-viagem` com a fila vazia terminam em
    `VITE_DRIVER_APP_URL` (a casa nova é atendida por uma página mínima via `page.route`);
  - **pendências**: a fila antiga é semeada no IndexedDB da origem do painel, numa página estática
    (`/offline.html`) antes do boot. O beacon sai com `pending-screen`; só a fila aparece (sem
    romaneio); a chegada drena (1 envio, com a chave semeada); o recusado mostra "Descartar", que
    abre o aviso "A entrega não foi registrada; fale com o escritório." e só apaga em "Descartar
    mesmo assim"; sem overflow em 375 px; a fila vazia **não** redireciona sozinha, e "Ir para o
    app novo" leva à casa nova;
  - **instalação**: com `(display-mode: standalone)` respondido no navegador, `/minha-viagem` mostra
    "Instale o app novo", o link aponta para a casa nova, tem ≥ 44 px e não há overflow.
- `test/spec-159-prints.smoke.spec.ts`: saem os prints do motorista (e o que só eles usavam); ficam
  os do escritório. Ele é fora do smoke da CI e grava PNGs versionados da spec 159, então não foi
  rodado; `playwright test --list` lista os 8 do escritório.
- Não há smoke "sem a variável": o build do Playwright é um só e carrega a variável (local e CI, pelo
  `.env.example`). O caso fica no contrato da T5.1.

**O que o smoke achou, corrigido nesta task:**

1. "Descartar" ficava desabilitado para sempre: `isSyncing` não voltava a `false`, sem nenhum pedido
   de rede em voo (medido com `page.on('request')`). Causa: o padrão de `useDriverTrip` cria lojas
   novas a cada render, e o efeito de montagem depende delas — ele roda de novo a cada render e
   emenda uma drenagem na outra. A tela de pendências passa lojas estáveis (`useState`). **O mesmo
   padrão existe em `DriverTripWorkspacePage` do painel e na cópia de `apps/frontend-driver`**; não
   foi mexido aqui (muda o comportamento de hoje e é de outra app) — fica registrado para o
   orquestrador.
2. Overflow em 375 px com a confirmação aberta (a página ia a 456 px): o item com descarte quebra em
   linhas (`.eventQueueItemWithDiscard`), só quando há `onDiscard` — a fila de sempre não muda.
3. Revisão de design pelos prints (375 px, tema do smoke): a tela de instalar esticava as três
   linhas pela altura da moldura pública (`align-content: start`) e o título usava o `h1` gigante;
   passou ao mesmo título da fila de pendências. Com a fila vazia, a lista encolhia ao texto e o
   título ia ao meio da tela; a tela de pendências dá largura cheia aos filhos. Os botões da tela de
   pendências seguem os vizinhos da fila (mesmo `Button`, 44 px).

```
cd apps/frontend-transportada && bun run lint && bun run typecheck   ok
cd apps/frontend-transportada && bun run test
  contratos 5290 pass / 0 fail · hooks 51 pass / 0 fail
cd apps/frontend-transportada && (. ../../.env) VITE_SMOKE_AUTH_BYPASS=true \
  PLAYWRIGHT_TEST_MATCH=responsive.smoke.spec.ts bunx playwright test
  51 passed (1.3m)
cd apps/frontend-transportada && (. ../../.env) VITE_SMOKE_AUTH_BYPASS=true bunx playwright test
  (a lista do smoke da CI: responsive, field-delivery, field-delivery-cargo, trip-timeline)
  1ª tentativa: "Timed out waiting 180000ms from config.webServer" — build do painel sob carga,
  com o Playwright da Fase 4 rodando em paralelo; 2ª tentativa: 62 passed (1.6m)
```

⚠️ A lista do smoke da CI regrava prints versionados de outras specs (`field-delivery-cargo` →
`specs/184-…/prints/`, `trip-timeline` → `specs/158-…/prints/`). Depois da rodada eles foram
restaurados com `git checkout --` e não entram em commit nenhum.

**Aberto:** o `make smoke` do aceite (healthchecks e o Playwright das outras apps) fica com o
orquestrador; por isso a T5.4 não está marcada.

## Fase 4 — Playwright da app

### T4.1 — Montar o Playwright da app

**Login é sempre real — a app não tem o atalho de autenticação do painel** (ADR-0075 §7,
`KeycloakAuthProvider.provider.ts`, comentário de cabeçalho). `test/authenticated-smoke.helper.ts`
(cópia por valor, adaptada) faz o login pela tela de identificação: digita `local-user`, segue para
o Keycloak real, senha de `KEYCLOAK_LOCAL_USER_PASSWORD`. ⚠️ **Achado**: com `login_hint`, o tema do
Keycloak pré-resolve quem é ("Entrando como local-user") e o `#username` vira `type="hidden"` — só
o `#password` fica visível. O helper do painel preenche `#username`; aqui isso trava até estourar o
timeout. Corrigido: só `#password` + `#kc-login`.

**Duas portas locais para a app, não uma** (`realm/transportada-local-realm.json`,
`test/keycloak-realm.contract.test.ts`): `53200` é a de sempre (`make dev`), e `53112` — reservada
desde a T1.3 em `ci.yml:109` e no Makefile — passa a ser a quinta origem aceita pelo cliente
`transportada-spa`. O motivo: o smoke faz `vite build` próprio, e o `redirect_uri` do Keycloak é
`VITE_DRIVER_APP_URL`, gravado nesse build — não dá para reaproveitar a `53200` sem disputar a porta
com o processo real do `make dev`, que `make smoke` já espera de pé. O script `smoke`
(`package.json`) builda com `VITE_DRIVER_APP_URL=http://localhost:53112` e serve na própria `53112`,
então preview e `redirect_uri` sempre apontam para o mesmo lugar. Testado com um servidor ocupando a
`53200` durante o smoke inteiro — sem conflito. **Keycloak local recriado**
(`make identity-bootstrap`) para o realm novo entrar em vigor (`--import-realm` ignora realm já
existente).

**Dois builds, não um** (`playwright.config.ts`, `package.json`): CA05(a) —
`context.setOffline(true)` — e CA09 só funcionam com o service worker de verdade precacheando a
casca (`sw.ts`), e o SW só registra fora do bypass de fumaça (`main.tsx`,
`isSmokeAuthBypassEnabled`). `driver-service-worker.smoke.spec.ts` roda primeiro, sem
`VITE_SMOKE_AUTH_BYPASS`; `driver-app.smoke.spec.ts` roda depois, com o bypass ligado (SW desligado,
para o `page.route` mockar a API sem disputa com um SW real) — o script `smoke` encadeia os dois
`playwright test`, cada um com o próprio `vite build`.

- `driver-trip-smoke.helper.ts`, `notification-smoke.helper.ts`, `installation-brand-smoke.helper.ts`:
  cópia por valor dos homônimos do painel. O de viagem sai sem o mock de foto (`DriverShellHeader`
  desenha iniciais, nunca busca `/company-users/*/picture`) e sem `/auth/me` (`checkDriverAuthorization`
  já usa `GET /me/trips/current`, a mesma rota mockada).
- `driver-app.smoke.spec.ts`: os seis do bloco copiado
  (`apps/frontend-transportada/test/responsive.smoke.spec.ts:1185-1330`, rota `/` em vez de
  `/minha-viagem` — `DRIVER_ROUTE_PATH.trip = '/'` nesta app), CA05(b) (sinal fraco:
  `page.route('**/realms/**', route => route.abort())` com `onLine` verdadeiro), CA06 (pendência de
  outra conta — semeada direto no `IndexedDB`, `subHash` estranho, sem precisar de uma segunda conta
  real de motorista; e snapshot com mais de 24 h descartado no boot sem rede), CA07 (drenagem em
  `visibilitychange` e pelo temporizador — `page.clock` avança o relógio 31 s em vez de esperar de
  verdade; o temporizador para de fato quando a fila zera), CA08 (sino, "Notificações", 44 px), CA15
  (varredura de alvo de toque ≥ 44×44 px na tela da viagem).
- `driver-service-worker.smoke.spec.ts`: CA05(a) (recarregar sem rede de verdade — espera
  `navigator.serviceWorker.controller` antes de derrubar a rede) e CA09 (a atualização não recarrega
  com "Deu problema" aberto — que registra em `captureRegistry`; muda `dist/sw.js` por bytes,
  `registration.update()`, sem rebuildar; aplica sozinha ao fechar a captura). `dist/` não é
  versionado, e o `dist/sw.js` mutado nunca sobrevive a um `vite build` novo (rodado antes de
  commitar).
- `spec-159-prints.smoke.spec.ts`: cópia reduzida — só os "PWA: …" (card com aviso, fotos
  pendentes, pontualidade, perfil com/sem nota); os "Escritório: …" ficam no painel (T5.4). Fora do
  `testMatch` padrão, roda com `PLAYWRIGHT_TEST_MATCH=spec-159-prints.smoke.spec.ts`. Rodado uma vez
  para provar que existe (10/10 passou); os PNGs gravados em `specs/159-…/prints/` foram restaurados
  com `git checkout --` depois, mesma disciplina da T5.4 — não são evidência desta task.
- `Makefile`: `make smoke` ganha o bloco da app, com `PLAYWRIGHT_DRIVER_PORT` default `53112` e
  `PLAYWRIGHT_REUSE_EXISTING_DRIVER_SERVER=false`.

**Achado aberto, não investigado a fundo (fora do escopo desta task):**
`DriverTripWorkspacePage.page.tsx:118-128` (efeito de `listOccurrenceTypes`) dispara mais de uma
requisição automática ao montar, sem clique nenhum — medido 1 e 2 vezes em corridas diferentes,
sempre pelo caminho de login real (tela de identificação → Keycloak). Não é o double-effect do
`StrictMode` (bundle de produção, sem `__DEV__`/avisos de dev). `mockDriverTripApi` trocou o
parâmetro de contagem (`occurrenceTypesFailures: N`) por um interruptor
(`occurrenceTypesFailing`/`setOccurrenceTypesFailing`) para o teste de CA5/RF5 não depender de
quantas vezes o efeito dispara. Sessão separada aberta para investigar
(`task_483df53a`, spawn_task desta sessão).

**Achado do coordenador, corrigido nesta task (commit próprio):**
`useDriverTrip(store = createIndexedDbQueueStore(), attachmentStore = createIndexedDbAttachmentStore())`
criava uma loja nova a cada chamada sem argumento — e a produção chama sem argumento. A loja nova
muda a identidade a cada render, o `useCallback`/`useEffect` que dependem dela rodam de novo, e uma
drenagem emenda na outra sem fim (`isSyncing` nunca volta a `false`, achado que já bateu no CA07
abaixo). Corrigido com `useState` de inicializador preguiçoso (`defaultStores`, uma vez por
instância) e `??` para quem passar loja própria (os contratos); contrato de fonte novo,
`test/driver-trip/stable-stores.contract.ts`, reprova `= createIndexedDb` voltando à assinatura.

**Achado do próprio Playwright, no CA07 — o temporizador não nasce sozinho:**
`scheduleQueueDrainTriggers` só chama `setInterval` na montagem ou num gatilho
(`online`/`pageshow`/`visibilitychange`) — nunca quando um toque enfileira algo no meio da sessão.
Medido com o IndexedDB direto: enfileirar por clique e avançar o relógio (`page.clock`) direto não
dispara requisição nenhuma além do envio imediato do próprio `report()`. O teste do temporizador
dispara um `visibilitychange` primeiro (ainda sem sinal — tenta, falha, mas é isso que liga o
temporizador) antes de usar `page.clock.fastForward` para provar os tiques seguintes; o relógio
falso também precisa ser instalado **antes** da viagem montar, porque instalado depois ele não
adota o `setInterval` já agendado com o `setInterval` real.

```
cd apps/frontend-driver && bun run lint && bun run typecheck   ok
cd apps/frontend-driver && bun run test
  374 pass / 0 fail / 743 expect()   (+2 do stable-stores.contract.ts)
cd apps/frontend-driver && bun run build
  vite build ok · precache 13 arquivos, 601.195 bytes · dist.contract.test.ts 6 pass / 0 fail
bun test test/keycloak-realm.contract.test.ts (raiz)
  18 pass / 0 fail / 99 expect()
bun run --cwd apps/frontend-driver smoke
  driver-service-worker.smoke.spec.ts   2 passed
  driver-app.smoke.spec.ts             13 passed
  (rodado repetidas vezes ao longo da task, com build novo a cada vez — 15/15 estável ao final,
  depois de corrigir a corrida de CA05(a) — page.evaluate destruído por navegação real — e o CA07
  do temporizador acima)
```

**Aberto:**

- `make check` da raiz e `make smoke` do aceite (healthchecks + Playwright das outras apps) ficam
  com o orquestrador na publicação, porque a Fase 5 estava em andamento em paralelo nesta mesma
  árvore (`apps/frontend-transportada`) durante a T4.1 — rodar `make check`/typecheck/lint da raiz
  aqui pegaria o WIP alheio.
- CI (`ci.yml`): o job `integration` já instala Chromium a partir de `frontend-transportada` e o
  cache é compartilhado entre as três apps (mesma versão `1.58.2`) — não medido em CI de verdade
  nesta task, só localmente.
- `realm/spa-redirect-uris.json` (staging/produção) **não muda** — a porta `53112` é só do realm
  local, nunca sai de `localhost`.

## Correção — o toque enfileirado liga o temporizador (achado da T4.1)

O `scheduleQueueDrainTriggers` só armava o temporizador na montagem ou num gatilho (`online`,
`pageshow`, `visibilitychange`). Com sinal fraco, o toque enfileirado no meio da sessão ficava
parado, porque nenhum desses gatilhos dispara. O agendador passou a entregar o `sync` dele por
`onQueueSync`, e `refreshQueueView` o chama sempre que recalcula a pendência drenável.

- Contrato novo em `pending-queue.contract.ts`: "a fila ganhar pendência no meio da sessão liga o
  temporizador, sem esperar gatilho". Falhou antes da correção (13 pass / 1 fail) e passa depois
  (14 pass / 0 fail).
- `bun run --cwd apps/frontend-driver check`: 375 pass / 0 fail, `dist` 6 pass / 0 fail.
- `bun run --cwd apps/frontend-driver smoke`: 2 passed + 13 passed.

## Fase 5 — ajustes da revisão (código, `code-reviewer` opus)

Escopo desta seção: só `apps/frontend-transportada` (e o texto da ADR-0075), pelos itens MEDIUM e
LOW da revisão de código da T5.2/T5.3/T5.4. A Fase 4 (`apps/frontend-driver`) é de outro executor,
em paralelo, e não é tocada aqui.

### M2 — "Descartar" só para recusa de negócio

`isDiscardable` (`DriverEventQueue.page.tsx`) tratava qualquer `status.state === 'rejected'` ou
`attachmentRejectionCause` como descartável — inclusive `401`/`403`/`408`/`429`/5xx e
`REQUEST_FAILED` (a causa genérica que `toOutcome`, em `useDriverTrip.hook.ts:84-92`, dá a qualquer
erro que não seja `DriverTripRequestError`, inclusive a sessão expirada vinda de `getAccessToken`).
Essas causas são infraestrutura passageira, não decisão do servidor sobre o evento — descartar
apagaria uma entrega que a próxima tentativa enviaria.

- Nova função pura `isEventQueueItemDiscardable` em `eventQueueView.service.ts` (ao lado de
  `buildEventQueueView`/`hasSendableEvents`, onde já mora a lógica testável da tela), substituindo
  a `isDiscardable` local do `.page.tsx`. `DriverEventQueue.page.tsx` só chama a função nova.
- Teste em `test/driver-trip/event-queue.contract.ts`: recusa de negócio (`409 CONFLICT`) segue
  descartável; `401`, `403`, `408`, `429`, `500`, `503` e `REQUEST_FAILED` (`it.each`) não são;
  anexo com causa de infraestrutura não fica descartável mesmo com o evento aceito; anexo recusado
  por negócio com evento aceito fica descartável; item sem recusa nenhuma não é descartável.
- `bun test ./test/driver-trip.contract.test.ts`: 209 pass / 0 fail (13 destes são os casos novos;
  antes da função nova o arquivo não compilava — `isEventQueueItemDiscardable` não existia).
- `bun run typecheck`: limpo.

### M4 — gatilhos explícitos de drenagem no `useDriverTrip` do painel

A b18564bc8 estabilizou as lojas padrão do `useDriverTrip` (`useState` em vez de parâmetro
recriado a cada render) e, com isso, tirou sem querer o único gatilho de repetição que a tela de
pendências tinha: o efeito de montagem reexecutando a cada render por causa da loja instável.
Sem ele, um envio que falha (rede fraca, 5xx) só tenta de novo se o motorista trocar de tela ou a
rede voltar (`online`) — nunca sozinho.

O agendador copiado é a versão **atual** da app do motorista (commit `fdffe1f3a`, achado durante a
T4.1 dela): `scheduleQueueDrainTriggers` ganhou `onQueueSync`, chamado por `refreshQueueView`
sempre que a pendência drenável é recalculada — sem isso, um toque enfileirado com sinal fraco não
liga o temporizador até o próximo gatilho externo.

- `pendingQueue.service.ts` (cópia por valor, ADR-0075 §7) ganha `QUEUE_DRAIN_INTERVAL_MS`,
  `DrainTriggerTarget` e `scheduleQueueDrainTriggers` (com `onQueueSync`), idênticos aos da app do
  motorista — só `countPending` (já copiado) muda entre as duas, pelo `ownerSubHash` que o painel
  não tem.
- `useDriverTrip.hook.ts`: `drainableCountRef` e `syncDrainTimerRef` (novos), `refreshQueueView`
  chama `syncDrainTimerRef.current()` ao recalcular a pendência, e o efeito de montagem troca o
  `window.addEventListener('online', ...)` manual por `scheduleQueueDrainTriggers` (gatilhos
  `online`, `pageshow`, `visibilitychange` visível, e o temporizador de 30 s enquanto houver
  pendência drenável).
- **Isto muda o comportamento do módulo antigo com o interruptor desligado.** `useDriverTrip` é o
  hook de `/minha-viagem` também fora do modo `pending-screen` — quem usa a tela de sempre (sem
  `VITE_DRIVER_APP_URL`) ganha os mesmos gatilhos. É intencional: a alternativa (só a tela de
  pendências do painel ganhar retry) duplicaria o hook, e a spec 082 já estabeleceu que "uma
  drenagem por vez" é regra do hook inteiro, não de uma tela.
- Teste novo em `test/driver-trip/pending-queue.contract.ts` — a mesma suíte
  `scheduleQueueDrainTriggers` da app do motorista (8 casos: os três gatilhos chamam `drain`,
  `visibilitychange` invisível não chama, o temporizador só existe com `drainable > 0`, ele chama
  no intervalo de 30 s, para quando a fila zera, `online` liga o temporizador quando a fila ganha
  pendência, `onQueueSync` liga sem esperar gatilho, e cancelar desliga tudo).
- Teste novo, com DOM, em `test/trip-hooks/driver-trip-drain-triggers.contract.ts` (a garantia
  pedida na revisão: "montar não emenda drenagens sem fim"): monta `useDriverTrip` de verdade com
  uma loja em memória e um item sempre "offline" (nunca ganha `rejectionCause`, fica drenável para
  sempre); a montagem drena uma vez, `online` e `pageshow` cada um drena mais uma, e **parado sem
  gatilho nenhum a contagem não sobe sozinha** — é a prova de que o efeito de montagem não
  reexecuta a cada render. Desmontar cancela os ouvintes: disparar `online`/`pageshow` depois não
  drena mais. Fila vazia: montar não drena.
- `bun test ./test/driver-trip.contract.test.ts`: 217 pass / 0 fail (era 209 antes do M2; +8 desta
  revisão).
- `bun run --cwd apps/frontend-transportada test:hooks`: 54 pass / 0 fail (eram 51; +3 desta
  revisão).
- `bun run --cwd apps/frontend-transportada test`: 217 + 54 pass / 0 fail.
- `bun run typecheck` e `bun run lint`: limpos.

### M1 — `VITE_DRIVER_APP_URL` validada no build, laço de redirect coberto em runtime

Antes, uma `VITE_DRIVER_APP_URL` inválida ou igual a `VITE_APP_URL` só falhava dentro do navegador
do motorista, na primeira vez que `readDriverAppUrl()` rodasse — o build ficava verde com uma
variável que quebraria em produção.

- `assertDriverAppUrlBuildsClean` (nova, `identityEnvironment.config.ts`, ao lado de
  `readTrustedUrl`/`readDriverAppUrl`): ausente ou vazia não valida nada (o interruptor desligado é
  silencioso); presente e inválida lança `IDENTITY_CONFIGURATION_INVALID_VITE_DRIVER_APP_URL`
  (mesmo erro do `readTrustedUrl`); igual a `VITE_APP_URL` lança
  `IDENTITY_CONFIGURATION_DRIVER_APP_URL_LOOP`; sem `VITE_APP_URL` para comparar, só valida a
  própria.
- `vite.config.ts` ganha `driverAppUrlValidationPlugin()`, no molde do
  `contentSecurityPolicyPlugin()` (lê `config.env` em `configResolved`, tipado): chama
  `assertDriverAppUrlBuildsClean` com os valores brutos de `VITE_DRIVER_APP_URL` e `VITE_APP_URL`.
  Um `configResolved` que lança falha o `vite build` inteiro, antes do bundle existir.
- Rede em runtime (`main.tsx:490-506` e `takeOverDriverEntry`, antes `:864`/`:930`, agora um pouco
  mais abaixo pelas linhas acrescentadas): `readDriverAppUrl()` continua lançando se a variável
  mudar depois do build (deploy do painel sem rebuild, por exemplo). Nova função
  `isDriverAppUrlOwnOrigin` (`driverAppRedirect.service.ts`) compara a origem de `driverAppUrl`
  com `window.location.origin` antes de todo `location.replace(driverAppUrl)` automático (modo
  `redirect`, nos dois pontos de `main.tsx`) — mesma origem, ou URL ilegível, vira "fica" em vez de
  redirecionar, evitando o laço. `install-screen` e `pending-screen` não precisam da checagem: não
  fazem `location.replace` automático, só mostram a URL como link.
- Teste em `test/driver-trip/driver-app-redirect.contract.ts`: `isDriverAppUrlOwnOrigin` (origem
  diferente não é a própria; mesma origem com caminho diferente é; URL ilegível conta como a
  própria — o lado seguro); `assertDriverAppUrlBuildsClean` (5 casos: ausente/vazia silenciosa,
  inválida lança, igual a `VITE_APP_URL` lança o laço, diferente passa, sem `VITE_APP_URL` passa).
- **Build de verdade, os três casos que a task pede** (`apps/frontend-transportada`, com o `.env`
  local: `VITE_APP_URL=http://localhost:53000`, `VITE_DRIVER_APP_URL=http://localhost:53200`):
  - Válida e diferente (`.env` como está): `bun run build` — verde, `✓ built in 18.97s`, PWA
    `precache 151 entries (5059.54 KiB)`.
  - Inválida (`VITE_DRIVER_APP_URL=http://motorista.example.com.br`, `http:` fora de `localhost`):
    `bun run build` — vermelho, `error during build: Error:
IDENTITY_CONFIGURATION_INVALID_VITE_DRIVER_APP_URL`, lançado de dentro do
    `configResolved` do plugin novo.
  - Igual a `VITE_APP_URL` (`VITE_DRIVER_APP_URL=http://localhost:53000`): `bun run build` —
    vermelho, `error during build: Error: IDENTITY_CONFIGURATION_DRIVER_APP_URL_LOOP`.
- `bun test ./test/driver-trip.contract.test.ts`: 225 pass / 0 fail (era 217 depois do M4; +8 desta
  revisão).
- `bun run typecheck` e `bun run lint`: limpos.

### M3 — aviso de sessão expirada em `DriverLegacyPending.page.tsx`

Esta tela nasce fora do `ApplicationShell` (`renderDriverAppScreen`, `main.tsx`) — é a única do
painel que drena a fila antiga sem o aviso de sessão expirada que o `ApplicationShell` já tem
(`main.tsx:453-455`, `getKeycloakAuthProvider().onSessionExpired`). Sem isto, uma sessão expirada
no meio da drenagem falhava calada: `toOutcome` classifica o erro como `REQUEST_FAILED`
(revisão M2 trata isso como infraestrutura, não descartável), e nada na tela dizia ao motorista
que era preciso entrar de novo.

- `DriverLegacyPending.page.tsx` assina `getKeycloakAuthProvider().onSessionExpired` no mesmo
  molde do `ApplicationShell`, e mostra o aviso com `role="alert"` e um botão "Entrar novamente"
  que **recarrega a página** (`window.location.reload()`) — não `restartAuthentication()`: esta
  tela é boot de página inteira (`renderDriverAppScreen`), fora de qualquer roteador, e recarregar
  devolve o boot ao `check-sso` do zero (o mesmo padrão de `onGoToDriverApp` já usado aqui,
  `main.tsx:881`, e de `AuthenticationNavigation.reloadApplication` em
  `KeycloakAuthProvider.provider.ts:250-254`).
- Textos novos em `legacy.sessionExpired.{message,reload}`, pt-BR acentuado e en, ao lado de
  `legacy.pending`/`legacy.install`.
- `.sessionExpiredBanner` em `driverTrip.module.css`, no mesmo tom de
  `.application-session-banner` (`src/styles/index.css`) — CSS Module por módulo, não token de
  app, porque esta tela não importa estilo do painel.
- Sem contrato novo: a task não pede um (diferente de M1/M2/M4/M5), e o mecanismo que ela usa
  (`getKeycloakAuthProvider().onSessionExpired`) já é coberto por
  `test/keycloak-auth-provider.test.ts:68,102`. Não existe hoje um helper de render de componente
  completo (com DOM) neste app — só de hooks (`test/trip-hooks/`) — e criar um só para esta tela
  seria escopo maior do que a revisão pediu.
- `bun run typecheck`, `bun run lint`: limpos. `bun run test` (contrato + hooks): 5319 + 54 pass /
  0 fail — nenhuma suíte quebrou com o import novo de `KeycloakAuthProvider.provider` na tela.

### M5 — `readSmallBody` protegido, com `reader.cancel()` no `finally`

`readSmallBody` (`server.ts`) chamava `reader.read()` fora de qualquer `try`, e só cancelava o
leitor no ramo de corpo grande demais. Corpo abortado no meio (aba fechada durante o `sendBeacon`)
fazia `reader.read()` rejeitar sem ninguém pegando, e o leitor nunca era liberado nesse caminho.

- `readSmallBody`: `reader.getReader()` e o laço de leitura entram num `try`; qualquer erro (corpo
  abortado, stream corrompido) cai no `catch` e devolve `undefined` — a mesma rota do valor
  inválido, nunca uma exceção subindo até a rota. `reader.cancel()` sai do `finally`
  (`.catch(() => undefined)` porque cancelar um leitor cujo stream já terminou é um não-operação
  segura, mas não custa nada blindar), então ele é solto em toda saída da função, inclusive erro.
  A rota em si (`fetch()`, linha 85-99) já sempre respondia `204` independente do retorno de
  `readSmallBody` — o que faltava era `readSmallBody` nunca lançar.
- **Medido, não só lido:** rodei o servidor de verdade (fora do harness de teste, num diretório
  temporário) com a versão **antiga** de `readSmallBody` (sem `try`/`catch`) e um corpo que erra no
  meio (`ReadableStream` cujo `pull` erra no segundo pedido). Resultado: `stdout` e `stderr` vazios,
  `/health/live` respondeu `200` depois — o `Bun.serve` engole a rejeição da função `fetch` sozinho,
  por padrão, sem log nem crash. Ou seja, **este cenário específico não distinguia código antigo do
  novo num teste de caixa-preta** (a conexão HTTP cai antes de o cliente conseguir ler qualquer
  resposta, então nem `204` dá para observar do lado do cliente para um corpo que o próprio cliente
  abortou — só dá para confirmar que o servidor continua de pé depois). A correção continua certa
  pelo motivo que a task deu (não depender da rede de segurança do framework, soltar o leitor
  explicitamente), e o teste guarda o **contrato observável**: o processo sobrevive e segue
  servindo `204` para o próximo pedido, sem log. Registro aqui para não parecer TDD que não houve.
- Caso novo em `test/driver-trip/legacy-beacon.contract.ts`, com `Bun.spawn` como os existentes:
  corpo cujo `pull` erra depois do primeiro chunk (`pending-`) — `post(abortedBody)` rejeita do
  lado do cliente (a conexão cai, não há como observar status), e o pedido seguinte
  (`install-screen`) continua respondendo `204`, provando que o processo não travou nem morreu. O
  teste final da suíte (contagem de linhas de log) confirma que o corpo abortado não gerou linha
  nenhuma.
- `bun test ./test/driver-trip.contract.test.ts`: 226 pass / 0 fail (era 225 depois do M1; +1
  desta revisão).
- `bun run typecheck` e `bun run lint`: limpos.

### LOW — beacon antes do login, corrida do efeito da raiz, `import()` dinâmico (`main.tsx`)

- **Beacon antes do login.** `takeOverDriverEntry`, ramo `pending-screen`: `sendDriverLegacyBeacon`
  sai antes do `if (!input.isAuthenticated) return false`, não depois. A medida de uso passa a
  contar quem chega à tela de pendências mesmo se abandonar o login do Keycloak, não só quem
  termina de entrar — o teste de `legacy-beacon.contract.ts` que conta ocorrências de
  `sendDriverLegacyBeacon(` no texto de `main.tsx` (ainda 1) e a posição dentro do `case
'pending-screen':` seguem verdes sem mudança, porque a chamada continua sendo a mesma, só mais
  cedo no bloco.
- **Corrida do efeito da raiz.** O efeito de `ApplicationShell` que decide a entrada do motorista
  na raiz (`/`) lê o IndexedDB de forma assíncrona; sem guarda, quem navegasse para outra tela
  enquanto a leitura corria (ou desmontasse o efeito) podia ser puxado de volta quando ela
  terminasse. Ganhou `cancelled` (setado na limpeza do efeito) e a releitura de
  `window.location.pathname !== '/'` dentro do `.then`, antes de agir.
- **`import()` dinâmico.** `readDriverAppMode` (de `driverAppEntry.service.ts`) e
  `isDriverAppUrlOwnOrigin`/`sendDriverLegacyBeacon` (de `driverAppRedirect.service.ts`) saíram dos
  imports estáticos do topo do arquivo — agora entram por `import()`, nos dois pontos de uso
  (efeito da raiz e `takeOverDriverEntry`), só depois do `driverAppUrl === undefined` já ter sido
  descartado. Quem não tem a variável (a maioria, hoje) nunca baixa esses módulos — nem o
  IndexedDB que eles arrastam — no chunk de entrada. `DRIVER_TRIP_PATH`/`isFieldOnlyUser` (de
  `driverWorkspace.service.ts`) continuam estáticos: `WORKSPACE_NAVIGATION_ITEMS` precisa de
  `DRIVER_TRIP_PATH` no escopo do módulo.
- **Build de verdade:** `bun run build` — verde, chunk `index` caiu de 1.043,72 kB para
  1.038,22 kB (gzip 319,47 kB → 317,55 kB), e o precache foi de 151 para 154 entradas (os módulos
  que saíram do chunk de entrada agora são chunks próprios, ainda precacheados pelo PWA — o ganho
  é no chunk de **entrada**, o que carrega antes de qualquer coisa aparecer, não no total).
- `bun test ./test/driver-trip.contract.test.ts`: 226 pass / 0 fail (sem mudança de contagem — só
  reorganização, nenhum teste novo específico destes três itens; a paridade das rotas continua
  coberta pelos testes existentes de `driver-app-redirect.contract.ts` e `legacy-beacon.contract.ts`).
- `bun run typecheck`, `bun run lint`: limpos. `bun run test` (contrato + hooks): 5320 + 54 pass /
  0 fail.

### LOW — `DriverLegacyPending.page.tsx`: lojas sem argumento, erro de descarte à vista

- **`useDriverTrip()` sem argumentos.** Desde a b18564bc8, as lojas **padrão** de `useDriverTrip`
  já nascem estáveis (`useState` interno) — o `useState` local desta tela, que criava as próprias
  lojas só para contornar a instabilidade antiga, e o comentário que explicava esse contorno,
  ficaram sem propósito. A tela agora chama `useDriverTrip()` puro, como qualquer outro consumidor
  do módulo.
- **Erro de descarte à vista.** `onDiscard` engolia a rejeição de `discardRejected` com `void`: uma
  falha (rede, sessão) não aparecia em lugar nenhum, e o motorista via o item continuar na fila sem
  saber por quê. Agora `onDiscard` zera o erro anterior, chama `discardRejected(...).catch(...)`, e
  mostra `role="alert"` com `eventQueue.discard.failed` (novo texto, pt-BR e en) quando falha —
  reaproveitando `.eventQueueStatusRejected` de `driverTrip.module.css`, a mesma classe do texto de
  recusa da própria fila.
- Sem contrato novo dedicado (mesmo motivo do M3: não existe helper de render de componente
  completo neste app, só de hooks). A troca de `useDriverTrip(stores.store, stores.attachmentStore)`
  para `useDriverTrip()` não muda o contrato do hook, que já é testado com e sem argumento em
  `driver-trip-drain-triggers.contract.ts` (revisão M4) e em `event-queue.contract.ts`.
- `bun run typecheck`, `bun run lint`: limpos. `bun run test` (contrato + hooks): 5320 + 54 pass /
  0 fail — nenhuma suíte quebrou com a assinatura nova de `useDriverTrip()` nesta tela.

### LOW — o beacon não inunda o log sob rajada (`server.ts`)

Cada pedido válido gerava uma linha, sempre. Um pico de recarregamentos (deploy, reconexão em
massa depois de uma queda de rede) viraria uma linha por pedido — a medida só precisa saber "ainda
existe uso", não a taxa exata.

- `registerDriverLegacyBeaconHit(now)`: contador em memória (`driverLegacyBeaconPendingCount`) e a
  hora do último log (`driverLegacyBeaconLastLoggedAt`). A primeira ocorrência de uma janela loga
  na hora, com `count: 1`; as seguintes só somam ao contador; a próxima ocorrência **depois** da
  janela funde tudo numa linha só, com o `count` acumulado, e reinicia. No máximo uma linha a cada
  `DRIVER_LEGACY_BEACON_LOG_INTERVAL_MS` (60 s em produção).
- `DRIVER_LEGACY_BEACON_LOG_INTERVAL_MS`: overridável por `Bun.env`, só para o teste apertar a
  janela — não é `VITE_*`, não entra no `Dockerfile` nem em `vite-build-args.contract.ts`, e o
  padrão de produção nunca muda.
- Novo `describe` em `legacy-beacon.contract.ts`, com um servidor próprio (env
  `DRIVER_LEGACY_BEACON_LOG_INTERVAL_MS=100`): três pedidos seguidos, depois um quarto passada a
  janela — resultado: duas linhas, `count: 1` e `count: 3`. O teste existente ("só o valor
  enumerado gera log") ganhou `count: 1` na lista de chaves esperadas — um pedido isolado (primeira
  ocorrência de uma janela nova) continua logando na hora, comportamento que não mudou.
- `bun test ./test/driver-trip.contract.test.ts`: 227 pass / 0 fail (era 226 depois do LOW
  anterior; +1 desta revisão).
- `bun run typecheck`, `bun run lint`: limpos.

### LOW — teto de tempo na abertura do IndexedDB (`readDriverAppMode`)

Um IndexedDB preso (bloqueado por outra aba, disco sem espaço sem erro imediato) não rejeita — ele
nunca resolve. O `catch` existente (fila ilegível → `stay`) só pega **erro**, nunca **silêncio**:
sem teto, o boot travaria antes de qualquer tela aparecer, indefinidamente.

- `readDriverAppMode` corre a leitura das duas lojas contra um `Promise.race` com um teto de
  `DRIVER_APP_ENTRY_INDEXED_DB_TIMEOUT_MS` (3 s) — vencido, cai no mesmo `stay` do `catch`. A
  sentinela do timeout é um `Symbol` local, para não se confundir com o que as lojas já podem
  devolver.
- A função ganhou `createQueueStore`/`createAttachmentStore`/`timeoutMs` opcionais (padrão: as
  lojas reais do IndexedDB e os 3 s), no mesmo molde de `useDriverTrip(providedStore?,
providedAttachmentStore?)` — só para o teste injetar uma loja que nunca resolve, sem esperar 3 s
  de verdade nem mexer no timeout real de produção.
- Novo `test/driver-trip/driver-app-entry.contract.ts`, sem DOM (o caminho do teto não toca
  `window`; o de sucesso tocaria, e por isso não é testado aqui — ver M3 sobre a ausência de um
  helper de render de componente/hook fora de `test/trip-hooks/`): loja presa além do teto
  (`timeoutMs: 20`) devolve `stay`; loja rápida termina bem antes do teto (`timeoutMs: 3000`, mas o
  tempo decorrido fica abaixo de 200 ms).
- `bun test ./test/driver-trip.contract.test.ts`: 229 pass / 0 fail (era 227; +2 desta revisão).
- `bun run typecheck`, `bun run lint`: limpos.

### LOW — ADR-0075 §6: quem decide muda com o caminho; runbook do rollback (T6.5)

- `docs/adr/0075-o-motorista-tem-app-propria.md` §6, no bullet "A decisão é pura": novo sub-item
  explícito — em `/minha-viagem` é o **caminho** que decide (o boot sem sessão também passa por
  ali, `isFieldOnlyUser` nem entra na conta); na **raiz**, quem decide é o usuário de campo
  (`isFieldOnlyUser`), e o escritório abrindo `/` continua na tela de NF-e. Documenta o que
  `resolveDriverAppRedirect` já fazia (`isDriverEntry = pathname === DRIVER_TRIP_PATH ||
(pathname === '/' && isFieldOnlyUser)`), sem mudar código — texto não estava claro sobre a
  assimetria entre os dois caminhos de entrada.
- `specs/189-o-motorista-tem-app-propria/tasks.md`, T6.5 (rollback de staging): acrescentei que o
  painel é PWA com `registerType: 'autoUpdate'` — quem já abriu com o bundle ligado, e tem o
  service worker antigo no aparelho, não sente o rollback na aba aberta nem na reabertura
  imediata; o SW troca de versão em segundo plano e só serve o bundle sem o interruptor na
  **segunda** abertura depois do deploy do rollback. A primeira abertura pode redirecionar mesmo
  com a variável já removida no servidor — quem testar o rollback (T6.5, T6.10) precisa saber
  disso para não confundir "ainda não propagou" com "não funcionou".
- Sem código tocado: os dois são documentação. `bunx prettier --write` nos dois `.md`.

## Fase 7 — Depois da virada: o que não é paridade

### T7.1 — Contrato de `driverTripSelection.service.ts`

`apps/frontend-driver/test/driver-trip/trip-selection.contract.ts`, no entrypoint
`test/driver-trip.contract.test.ts`. Sete casos sobre `resolveSelectedTrip({ selectedTripId, trips })`:
uma viagem; duas com uma em rota (a em rota vence a mais antiga parada); duas em rota (a mais
antiga); nenhuma em rota (a mais antiga da lista, na ordem `createdAt` ascendente da API); a escolha
do motorista vale enquanto está na lista; a escolhida sumiu (volta à padrão); lista vazia. "Em rota"
é `in_transit` ou `on_delivery_route` (ADR-0075 §8).

Vermelho pela razão certa — o módulo ainda não existe:

```
cd apps/frontend-driver && bun test test/driver-trip.contract.test.ts
  error: Cannot find module '@/modules/driver-trip/shared/driverTripSelection.service'
  0 pass / 1 fail / 1 error
```
