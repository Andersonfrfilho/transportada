# Plan — Feature 189

Decisão: ADR-0075. Os caminhos são relativos à raiz e as linhas vêm do mapeamento de 25/09; confira
antes de editar. A 182 já está em `origin/staging` (`8a3135a9d`). A única task que toca
`apps/api-transportada/src/trips` é a T7.4, e ela só pede rebase.

## Contexto e premissas

- **Molde:** `apps/frontend-client`, que fornece:
  - `package.json` com a porta por `${FRONTEND_CLIENT_PORT:-53100}`;
  - `vite.config.ts` com o plugin de CSP e o `VitePWA`;
  - `server.ts`, que não sobe sem `content-security-policy.txt`;
  - `Dockerfile` em três estágios.
- **Conteúdo:** `apps/frontend-transportada/src/modules/driver-trip/`, 34 arquivos e cerca de 5.760
  linhas.
  - Nada de biblioteca pesada: IndexedDB, canvas e geolocalização são nativos.
  - Depende de `react-i18next`, `@tanstack/react-query` e `keycloak-js`, este último via identity.
- **O painel não tem router.** `/minha-viagem` vive em `src/main.tsx`: `:24-27`, `:130`, `:206`,
  `:228`, `:283-286`, `:363` e `:469-477`.

## D1 — Esqueleto de `apps/frontend-driver`

```
apps/frontend-driver/
  CLAUDE.md  Dockerfile  eslint.config.mjs  index.html  package.json  playwright.config.ts
  server.ts  tsconfig.json  vite.config.ts
  public/icons/{icon.svg,icon-work-in-progress.svg,icon-192.png,icon-512.png,icon-maskable-512.png,
                apple-touch-icon-180.png}  public/offline.html
  src/main.tsx  src/sw.ts  src/vite-env.d.ts
  src/components/ui/…  src/components/EnvironmentBanner.component.tsx
  src/lib/utils.ts  src/styles/index.css
  src/modules/shared/…  src/modules/identity/…  src/modules/notification/…  src/modules/driver-trip/…
  test/…
```

- **`package.json`**
  - `build` é `vite build && bun test test/dist.contract.test.ts`.
  - `dev`, `preview` e `start` usam `${FRONTEND_DRIVER_PORT:-53200}`.
  - `smoke` roda o Playwright.
  - `test` recebe a lista explícita de entrypoints.
  - Dependências: as do portal, mais `i18next`/`react-i18next`, `@adatechnology/notification-ui` e
    `@adatechnology/notification-client` (nas versões do painel), mais `workbox-precaching`,
    `workbox-routing` e `workbox-core` (nas versões que o `vite-plugin-pwa` 1.3.0 já traz, para não
    duplicar).
- **`vite.config.ts`**: cópia do portal com estas trocas:
  - `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'`;
  - `registerType: 'prompt'`;
  - o manifesto da ADR §5;
  - `envDir` na raiz e o proxy `/api` → `53001`;
  - a CSP recebendo `apiBaseUrl` também para `img-src`.
- **`server.ts`**: cópia do portal, com três mudanças:
  - a `Permissions-Policy` e o `Strict-Transport-Security` da ADR §4;
  - o `sw.js` servido com `no-cache`. O `cacheControlFor` do portal já faz isso, porque o `sw.js` fica
    fora de `/assets/`.
- **`Dockerfile`**: `ARG` para `VITE_API_URL`, `VITE_APP_ENV`, `VITE_DRIVER_APP_URL`,
  `VITE_IDENTIFIER_FIRST_LOGIN` e `VITE_KEYCLOAK_*`. **Nunca** para `VITE_SMOKE_AUTH_BYPASS`.
- **`environment.config.ts`**: cópia do portal, com `appBaseUrl` lido de `VITE_DRIVER_APP_URL`, que é
  obrigatória **nesta** app.

## D2 — Service worker e atualização

```ts
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))
clientsClaim()
self.addEventListener('message', (event) => {
  if (event.data?.type === SKIP_WAITING_MESSAGE) void self.skipWaiting()
})
// 147: push e notificationclick entram aqui como handlers novos
```

- Sem `sync` e sem `runtimeCaching` de API.
- **Registro de capturas** em `driver-trip/shared/captureRegistry.service.ts`, puro:
  - `open(kind)` e `close(kind)` para câmera, recorte, assinatura e diálogo de ocorrência;
  - `isIdle()`.
- **Atualização.** O `onNeedRefresh` do `registerSW` guarda que há versão nova.
  - Na abertura, antes da primeira captura, aplica `updateSW(true)`.
  - Depois disso, mostra "Nova versão — Atualizar", e o toque só aplica se `isIdle()`. Senão, espera o
    `close`.
  - `SKIP_WAITING_MESSAGE` é constante compartilhada entre o `sw.ts` e a página, e um contrato
    confere.

## D3 — O que se copia e como se prova

A tabela está na ADR §7. Como se prova:

- **Cabeçalho.** Cada arquivo copiado começa com `/* Cópia por valor de <origem> (ADR-0075 §7). */`,
  e um contrato lista os arquivos e exige o cabeçalho.
- **Build.** A app copia o `vite-build-args.contract.ts` do **painel**, com
  `SOMENTE_EM_TESTE = new Set(['VITE_SMOKE_AUTH_BYPASS'])` (`:15`). Os contratos do portal que proíbem
  o bypass não vêm.
- **Paridade.**
  - `catalog-parity`, contra a API, cobre `DRIVER_RETURN_REASONS`.
  - A regra de CNPJ usa o molde de `alphanumeric-tax-id.contract.ts`.
  - A faixa de ambiente é comparada com a do portal.
- **Posição.** Na cópia, o comentário de `driverLocation.service.ts` passa a dizer: "uma leitura por
  confirmação; posição contínua só com consentimento (ADR-0050 §5, ADR-0075 §8)".

## D4 — Casca e boot sem rede

- **`driverRoute.service.ts`** (puro) mapeia `/`, `/perfil`, `/fila`, `/fotos` e `/notificacoes`. O
  estado local de `DriverTripWorkspace.page.tsx:47-52` passa a derivar dele.
- **O sino.** `NotificationProvider` envolve a casca, e `NotificationBell` fica no `DriverShellHeader`.
  - O clique leva a `/notificacoes`, que lista com o componente de lista do pacote. A task confere o
    que o pacote exporta.
  - A folha `@adatechnology/notification-ui/styles.css` é importada, e a classe local dá 44 px ao sino.
  - O stream é `fetch` com `ReadableStream` para `${apiBaseUrl}/v1/notifications/stream`, já coberto
    pelo `connect-src`, então a CSP não muda.
- **Boot** (`main.tsx`), com `bootMode.service.ts` puro:
  - Antes do `keycloak.init`, `probeIdentityProvider()` faz
    ``fetch(`${keycloakUrl}/realms/${realm}/.well-known/openid-configuration`, { cache: 'no-store' })``,
    com `AbortSignal.timeout(5000)`, e devolve `isReachable`.
  - `resolveBootMode({ isReachable, snapshot, now })` devolve `authenticate`, `offline-snapshot` ou
    `offline-empty`. A entrada é `isReachable`, e não `navigator.onLine`, que diz `true` com sinal
    fraco.
  - Em `offline-snapshot`, a app renderiza a viagem só para leitura. `report()` e `attachProof()`
    enfileiram como hoje, e a drenagem fica suspensa até haver token.
  - Em `authenticate`, `keycloak.init`. A decisão acontece **antes** dele, porque o `check-sso` sem
    `silentCheckSsoRedirectUri` navega a página inteira e nenhuma exceção chega ao código.
  - No `online`, a app sonda de novo. Se o Keycloak responde e `captureRegistry.isIdle()`, chama
    `keycloak.init`. Com captura aberta, espera o `close`. Com sucesso, confere o `sub` (D5) e
    drena.
- **Tela de `403`** para quem não tem `trip.read`. Com `isRegisteredDriver: false`, aparece a tela do
  módulo.
- **Instalar:** `beforeinstallprompt` no Android. No iOS (`navigator.standalone === false`), a
  instrução "Compartilhar → Adicionar à Tela de Início". Serviço puro, com contrato.

## D5 — Snapshot, dono e pendência

- **`indexedDbQueue.service.ts`** vai para a versão 3 e ganha o store `trip-snapshot`. A origem é
  nova e não tem dados antigos: a app já nasce na versão 3.
  - A chave é `subHash`, e o valor, `{ savedAt, snapshot }`.
  - A chave `last` guarda o `subHash` do último usuário, para o boot sem rede.
  - `subHash` é `SHA-256(sub)` em hex, por `crypto.subtle`.
- **Descarte:**
  - outro `sub` autentica;
  - `now - savedAt > 24 h`;
  - todas as viagens estão concluídas;
  - "Sair".
- **Fila.** `QueuedReport` e `QueuedAttachment` ganham `subHash`.
  - A drenagem filtra pelo `sub` autenticado.
  - O que é de outro `sub` aparece como "pendências de outra conta", com "Descartar" e aviso. Nunca é
    enviado.
- **`pendingQueue.service.ts`** (puro): `countPending({ reports, attachments, now })` devolve
  `{ drainable, rejected, total }`.
  - `drainable` = eventos não recusados + anexos com menos de 7 dias.
  - `rejected` = recusados não descartados.
  - `total = drainable + rejected`.
  - O temporizador usa `drainable`, e o painel usa `total`.
- **Gatilhos da drenagem** (`useDriverTrip.hook.ts:235-250`): `online`, abertura, `visibilitychange`
  visível, `pageshow`, e `setInterval(30 s)` que só existe com `drainable > 0`.
- **`useDriverTrip.hook.ts:104`**
  - `initialData` e `initialDataUpdatedAt` vêm do store.
  - O `onSuccess` grava no store.
  - Resposta sem viagem apaga.
- **`docs/SECURITY.md`** ganha a entrada: o que fica no aparelho, a chave, o prazo e o descarte.

## D6 — Painel: interruptor, tela de pendências, beacon e `DriverReturnReason`

- **`identityEnvironment.config.ts`**: `readDriverAppUrl(): string | undefined`, no molde de
  `isIdentifierFirstLoginEnabled()` (`:55-65`).
  - Variável ausente ou vazia devolve `undefined`.
  - Presente, passa por `readTrustedUrl`.
- **`modules/driver-trip/shared/driverAppRedirect.service.ts`** (novo e puro):
  `resolveDriverAppRedirect({ pathname, isFieldOnlyUser, pendingTotal, driverAppUrl, isStandalone })`
  devolve `stay`, `redirect`, `install-screen` ou `pending-screen`.
- **`pendingQueue.service.ts`** do painel: a mesma definição (cópia por valor, no sentido inverso). Um
  contrato compara as duas pelo texto de fonte.
- **`main.tsx`**:
  - em `/minha-viagem`, avalia antes do `auth/me`, porque a fila é local;
  - em `/`, avalia depois (`:469-477`);
  - `redirect` → `location.replace`;
  - `install-screen` → a tela "Instale o app novo";
  - `pending-screen` → só `DriverEventQueuePage`, com "Descartar" e confirmação para os recusados, e
    "Ir para o app novo" quando `total = 0`.
- **O painel não tem registro de capturas.** Em `pending-screen` não há captura, e o redirecionamento
  só sai do toque em "Ir para o app novo" ou da próxima abertura.
- **Beacon, só em `pending-screen`:** `navigator.sendBeacon('/_driver-legacy-served', 'pending-screen')`.
  - A rota do `server.ts` do painel é pública e lê no máximo ~32 bytes do corpo. Ela aceita só o valor
    enumerado e sempre responde `204`.
  - Valor válido loga `{"event":"driver_legacy_served","mode":"pending-screen","at":"…"}`, sem
    usuário. Valor inválido ou corpo grande não gera log.
  - Contrato de fonte e teste do `server.ts` para valor válido, inválido e grande.
- **Ambientes.**
  - `ARG VITE_DRIVER_APP_URL` no `Dockerfile` do painel, coberto por
    `test/shared/vite-build-args.contract.ts`.
  - `VITE_DRIVER_APP_URL: preserve()` no bloco do painel em `railway.ts`, com o comentário "interruptor
    da ADR-0075 §6; definido só com `motorista.<env>` no ar".
- **Contrato "sem a variável o painel serve `/minha-viagem`":** `resolveDriverAppRedirect` com
  `driverAppUrl: undefined` devolve `stay`, e `readDriverAppUrl` com a variável vazia não lança.
- **`DriverReturnReason` e `DRIVER_RETURN_REASONS`** vão para
  `modules/trip/shared/tripReturnReason.types.ts`.
  - Os quatro imports do módulo `trip` são trocados.
  - `driverTrip.types.ts` do painel reexporta o tipo até a remoção.
- **Smokes do painel:**
  - `test/authenticated-smoke.helper.ts:69-74`: o comentário do destino do motorista;
  - `test/responsive.smoke.spec.ts:1190-1313`: o bloco do motorista vai para a app nova, e no painel
    ficam os casos de redirecionamento, pendências e instalação;
  - `test/spec-159-prints.smoke.spec.ts`: os prints do motorista vão para a app nova.

## D7 — Identidade e origem

- **`realm/transportada-local-realm.json`**: `http://localhost:53200` em `redirectUris`
  (`/auth/callback`), `webOrigins` e `post.logout.redirect.uris`. Também
  `test/keycloak-realm.contract.test.ts:246-266`.
- **`.github/scripts/keycloak-reconcile.sh`**:
  - o conjunto desejado de pós-logout é `<origem>/*` e `<origem>` para cada `webOrigins` declarado;
  - `$merged.attributes` = `$current.attributes` + `post.logout.redirect.uris` unido (`##`),
    acrescentando e nunca removendo;
  - o cálculo do que falta (`:129-134`) passa a incluir o pós-logout;
  - a verificação depois do `PUT` confere o pós-logout **e** `pkce.code.challenge.method == "S256"`.
- **Prova:** `runReconcile` (`apps/api-transportada/test/deploy/keycloak-realm.contract.ts:178-185`),
  estendido:
  - a entrada ganha `spaClient` (o client vivo, com `attributes`);
  - `clientWrites` passa a registrar `attributes`;
  - o `GET` depois do `PUT` devolve o que foi gravado, para a verificação ler o estado real.

  Três casos:
  - `clientWrites[0].attributes` preserva `pkce.code.challenge.method`;
  - `clientWrites[0].attributes` contém o pós-logout novo;
  - o pós-logout que já existia continua lá.

- **`realm/spa-redirect-uris.json`**: staging e produção, cada um no seu push (T6.4 e T6.9).
  `keycloak-redirect-uris.contract.ts:25` passa a `['app.', 'cliente.', 'motorista.']`.
- **`.env.example`**: `FRONTEND_DRIVER_PORT=53200`, `VITE_DRIVER_APP_URL=http://localhost:53200` e a
  `53200` no `FRONTEND_ORIGIN`.
- **`.env` local.** Ele é link simbólico para a árvore principal. Acrescentar as três sem imprimir o
  conteúdo:
  - `target="$(readlink -f .env)"`;
  - para as duas novas, `grep -q '^FRONTEND_DRIVER_PORT=' "$target" || printf '…\n' >> "$target"`;
  - para `FRONTEND_ORIGIN`, reescrever a linha com um script que lê e grava o **alvo**. `sed -i` não
    serve: ele troca o link por arquivo;
  - nunca `cat`, `echo` ou `grep` sem `-q` no `.env`.

## D8 — API: leitura do consentimento

- **Rota.** `GET /me/location-consent` em `me-location.routes.ts`, com a política `REPORT_POLICY`
  (`:22`), a mesma do `PUT`. A resposta é `{ data: { acceptedAt: string | null } }`.
- **Use case.** `createReadLocationConsent`, sobre `drizzle-trip-location.repository.ts` (`:174` já
  escreve a coluna).
- **Sem `fleet_driver`.** O use case lança `DriverNotRegisteredError` (`409 DRIVER_NOT_REGISTERED`,
  `trip.error.ts:436-444`). A task confere que o `PUT` faz o mesmo e, se não fizer, alinha.
- **Documentação.** OpenAPI gerado da rota.
- **Testes.** Contrato de rota e integração: nulo, aceito, retirado, `409` e isolamento entre
  empresas.

## D9 — Infra e CI, na ordem em que entram

| Quando              | Arquivo                                                                | Mudança                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1.2 (mesmo commit) | 6 `Dockerfile` de app e o novo                                         | `COPY apps/frontend-driver/package.json` no estágio `manifests`                                                                                                                       |
| T1.2 (mesmo commit) | `.github/scripts/changed-targets.sh`                                   | `TARGETS` com `driver` (`:3`); `driver) apps/frontend-driver/ apps/api-transportada/`; `apps/frontend-driver/` no alvo `api` (`:12-16`)                                               |
| T1.2 (mesmo commit) | `apps/api-transportada/test/deploy/pipeline-change-filter.contract.ts` | `:47` (toda app tem alvo) passa; `:194` e `:204` com o alvo `driver`                                                                                                                  |
| T1.3                | `.github/workflows/deploy.yml`                                         | saída `driver` no job `changes` (`:105`); `FRONTEND_DRIVER: ${{ steps.detect.outputs.driver }}` → `"frontend-driver"` no passo `apps` (`:129-150`), que alimenta a matriz do `ci.yml` |
| T1.3                | `.github/scripts/mark-deployed.sh` + `mark-deployed`                   | `driver` em `TARGETS` (`:7`); `DRIVER_CHANGED` passado desde já; `DRIVER_RESULT` vazio até o job existir, então o marco **não avança** ("marco parado") e a mudança fica pendente     |
| T1.3                | `package.json` raiz, Makefile, `.env.example`, `ci.yml:109`            | scripts encadeados; `FRONTEND_DRIVER_PORT := $(or $(shell sed -n 's/^FRONTEND_DRIVER_PORT=//p' $(ENV_FILE) 2>/dev/null),53200)`; `dev`, `smoke`; `53112,53200` reservadas             |
| T6.2                | `.railway/railway.ts`, `docs/spec/railway.md`                          | `service('driver', …)` em `shared`, com `VITE_*` literais; `VITE_DRIVER_APP_URL: preserve()` no painel; linha na tabela de build (`service-naming.contract.ts:67`)                    |
| T6.4 (mesmo push)   | `deploy.yml`, `spa-redirect-uris.json`                                 | job `deploy-driver` (`needs: [target, changes, gate, deploy-api]`, `railway-deploy.sh deploy driver`) + `DRIVER_RESULT` no `mark-deployed` + a origem de staging                      |

A matriz de qualidade vem do `deploy.yml`, no passo `apps` → `ci.yml` `inputs.apps`. O `ci.yml` só
ganha as portas.

## O que a 189 deixa pronto para a 179 (fases 3–4)

- **O `kind` novo.** A ocorrência de nota com foto é o `kind` `documentOccurrence` em
  `DriverFieldReport` (`driverTrip.types.ts:158-185`).
  - O `switch` de `driverTripClient.service.ts:125-145` já é exaustivo. O caso novo entra no tipo e no
    `switch`, e o `tsc` aponta onde falta.
  - A 189 não cria mapa nem indireção.
- **O upload fica dentro do `send`, antes do `POST`.**
  - No `send` desse `kind`: pedir a URL (`occurrence-uploads`), subir o blob, confirmar e só então
    `POST .../documents/:id/occurrences` com `attachmentObjectId` e a `Idempotency-Key` do item.
  - A drenagem de hoje manda o evento e depois os anexos (`offlineAttachments.service.ts:185-195`). A
    T203 da 179 recusa `required` sem anexo, e a ordem de hoje daria `422`.
  - O blob fica no store `event-attachments`, com a chave do item. O `send` o lê e só o remove depois
    do `POST` aceito.
- **Origem do storage.** A 179 acrescenta `VITE_STORAGE_URL` (`ARG` e contrato de build) e a origem
  dela ao `connect-src` e ao `img-src`.
- **Onde executar.** A emenda da 179 (T8.3) aponta T302 e T303 para `apps/frontend-driver`.

## O que a 189 deixa pronto para a 147

- **O service worker.** `sw.ts` com `injectManifest`, `scope: '/'` e handlers por evento. A T008 da 147
  passa a ser "acrescentar `push` e `notificationclick` ao `sw.ts` do app do motorista".
- **A área de "Instalar" no Perfil.** Ali entram o pedido de permissão (depois de um gesto) e o aviso
  de que, no iOS, só funciona instalado.
- **A tela do código.** Vale para as duas apps (T006). O push só chega ao app do motorista, e o painel
  fica com o sino.

## Estratégia de testes

- **App nova**
  - Contratos puros e de fonte em `test/<area>/*.contract.ts`, com entrypoints no `package.json`.
  - `test/dist.contract.test.ts` no `build`.
  - Playwright com o preview na `53112`: boot sem rede, troca de usuário, drenagem, atualização
    adiada, sino, alvos de toque, seletor, consentimento com relógio falso e prints.
- **Painel:** `resolveDriverAppRedirect`, `readDriverAppUrl` sem a variável, paridade de
  `countPending`, beacon e smokes de redirecionamento, pendências e instalação.
- **API:** contrato e integração do `GET /me/location-consent`. A integração roda com
  `bun --env-file=../../.env.test run test:integration`.
- **Deploy:** `runReconcile` com os atributos preservados, redirect URIs, pipeline, nomes de serviço e
  `dockerfile-workspace`.

## Riscos

- **iPhone:** sem `sync` e sem drenagem em segundo plano. A fila anda com a app aberta, como hoje.
- **Pacote do sino:** o stream é `fetch` com `ReadableStream` para `${apiBaseUrl}/v1/notifications/stream`,
  e a CSP não muda. A T3.3 confere a versão instalada (`-client` 0.1.0-rc.3 e `-ui` 0.1.0-rc.9 no
  painel).
- **Reconciliação:** roda em todo deploy da API. O `PUT` com todos os atributos e a verificação de
  `pkce` são a guarda.
- **Beacon:** sai só em `pending-screen` e depende de o motorista abrir o painel. Aparelho perdido nunca manda beacon nenhum. A
  medida é "ninguém mais usa", não "todas as filas vazias", e isso é aceito: os anexos já vencem em 7
  dias.
