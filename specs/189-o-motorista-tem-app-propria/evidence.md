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
