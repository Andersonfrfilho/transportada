# ADR-0075 — O motorista tem app própria

- **Status:** aceita
- **Data:** 2026-09-25
- **Decisores:** usuário (separação, domínio e motivos em 2026-09-24; fila antiga na virada, Web Push só
  no app do motorista e o sino no app do motorista em 2026-09-25). Identidade, deploy, service worker
  e migração são desta ADR, revisada pelo `critic` em 2026-09-25.
- **Spec:** `specs/189-o-motorista-tem-app-propria/`
- **Revisa:** ADR-0050 §1, na frase "São três superfícies com três públicos: painel, PWA do motorista,
  portal do cliente". As três superfícies continuam, mas o PWA do motorista deixa de ser a rota
  `/minha-viagem` do painel e passa a ser uma app com bundle próprio.
- **Aplica:** ADR-0050 §5 (posição contínua com consentimento), que revisou a ADR-0045 §3 e a spec
  057 D3 ("uma leitura por confirmação, nunca `watchPosition`") para quem consente.
- **Mantém:** ADR-0045 (execução é contrato de domínio, `/me/trips/current/*` sem id), ADR-0056 (o
  nativo é o campo que o navegador não alcança), ADR-0067 (`isFieldOnlyUser`), ADR-0070 (foto pesa na
  nota), ADR-0074 (sem "Conferir carga")
- **Emenda:** spec 147 (o Web Push e o `sw.ts` passam a ser do app do motorista) e spec 179 (T302 e
  T303 passam a ser em `apps/frontend-driver`)

## Contexto

O PWA do motorista é hoje o módulo `apps/frontend-transportada/src/modules/driver-trip/`: 34
arquivos, cerca de 5.760 linhas. Ele é servido em `/minha-viagem`, dentro do layout do escritório.

- O `main.tsx` do painel resolve a rota pelo pathname (`:206`).
- Depois do `GET /auth/me`, o painel manda para lá quem tem `trip.report` sem `trip.manage`
  (`:469-477`).

Esse arranjo tem três problemas:

1. **Instalar leva ao escritório.**
   - O manifesto é o do painel: `name` e `short_name` "TransportAdA", `start_url` em `/`, sem `scope`
     (`apps/frontend-transportada/vite.config.ts:174-185`).
   - O motorista que instala ganha um ícone que abre o painel. O atalho para a viagem depende do
     `auth/me`, e sem rede não há `auth/me`.
2. **No iPhone, o Web Push só chega a PWA instalado** (iOS 16.4+). A spec 147 manda o código de
   confirmação por push, mas o que o motorista instala é o escritório.
3. **O bundle é do escritório.** O motorista, no 3G, carrega a casca e o layout de um produto de
   escritório. Os artefatos pesados do painel ficam fora do precache por `globIgnores`
   (`vite.config.ts:186-197`), mas são da mesma build e do mesmo `scope`:
   - OpenCV (~3 MB);
   - `maplibre-gl`, `tesseract.js` e `pdfjs-dist`;
   - o modelo U²-Net de 16 MB. Ele é da foto de usuário do escritório, não do motorista, e separar as
     apps o tira do caminho do motorista.

A ADR-0050 §1 separou o portal do contratante por segurança, e o argumento vale aqui. Com bundles
separados, é impossível, e não só improvável, que um usuário de campo carregue a tela de financeiro.
O motorista é funcionário do mesmo tenant, então o risco é menor que o do portal. Mesmo assim, hoje a
separação é só uma condicional de permissão no cliente.

O app nativo (ADR-0056, React Native em `transportada-mobile`) não embala o PWA e não muda com esta
decisão.

## Decisão

### 1. `apps/frontend-driver`, em `motorista.<zona>`

É a quarta app web do monorepo, depois do painel, do portal e da landing. Segue o molde de
`apps/frontend-client`, com build, bundle, `Dockerfile`, serviço Railway e domínio próprios:

| Ambiente | Origem                                                      |
| -------- | ----------------------------------------------------------- |
| local    | `http://localhost:53200`                                    |
| staging  | `https://motorista.staging.fernandes-transportadora.com.br` |
| produção | `https://motorista.fernandes-transportadora.com.br`         |

O domínio segue a zona da instalação (ADR-0021). Ele só aparece em configuração versionada
(`.railway/railway.ts`, `realm/spa-redirect-uris.json`), nunca em `src/`.

### 2. Keycloak: o mesmo client `transportada-spa`, com uma origem a mais

Não se cria client novo. A app entra como terceira origem de `transportada-spa`, ao lado de `app.` e
`cliente.`, em `realm/spa-redirect-uris.json`, como o portal fez.

- **Por que não um client próprio.**
  - A autorização vem da membership no banco (`authorization.policy.ts:229,232`), não do client.
    `aggregate` nem existe como papel no Keycloak.
  - Um `transportada-driver` teria os mesmos mappers (audiência `transportada-api`, claim
    `company_id`) e emitiria o mesmo token.
  - E custaria caro: a reconciliação, o script manual, `frontend-origins-check.sh` e três contratos só
    conhecem `transportada-spa`.
- **PKCE `S256`, client público e `directAccessGrantsEnabled: false`** já são a configuração do
  `transportada-spa` (`realm/transportada-local-realm.json:42-90`). Nada muda.
- **Redirect URIs.**
  - O callback é `<origem>/auth/callback`.
  - Em staging, o domínio gerado da Railway entra ao lado do próprio enquanto o DNS não entra.
- **Pós-logout.**
  - Hoje `keycloak-reconcile.sh` une `redirectUris` e `webOrigins`, e só o script manual une
    `post.logout.redirect.uris` (`keycloak-client-origins.py:134-139`).
  - A reconciliação passa a unir também o pós-logout (`<origem>/*` e `<origem>`, separador `##`).
  - O corpo do `PUT` leva **todos** os atributos atuais com o pós-logout unido. Um `PUT` parcial
    apagaria `pkce.code.challenge.method`, e o Keycloak aceitaria sem erro.
  - A verificação depois do `PUT` confere o pós-logout **e** `pkce.code.challenge.method = S256`.
  - A prova é o harness `runReconcile` de `apps/api-transportada/test/deploy/keycloak-realm.contract.ts`
    (`clientWrites`, `:178`).
- **Como chega ao Keycloak.** Chega automaticamente.
  - O job `deploy-api` roda a reconciliação em todo deploy (`deploy.yml:230-234`), e `realm/` está no
    alvo `api` (`changed-targets.sh:16`).
  - `deploy/keycloak/realm.json` não serve para isso: o `--import-realm` ignora realm existente.
- **CORS.** `FRONTEND_ORIGIN` da API é variável da Railway.
  - `frontend-origins-check.sh` reprova o deploy se falta origem, mas não escreve a variável.
  - Acrescentar a origem é passo **humano**, e vem **antes** de a origem entrar em
    `spa-redirect-uris.json`.
- **SSO entre as apps.**
  - `app.` e `motorista.` usam o mesmo client e a mesma sessão do Keycloak. Quem entrou em uma entra
    na outra sem digitar senha (`check-sso`).
  - O logout encerra a sessão do Keycloak. A outra app descobre no próximo refresh: `updateToken`
    falha e ela lança `IDENTITY_SESSION_EXPIRED`, como já faz hoje. Ela não é avisada na hora.
- **Papéis.** A app não confere papel no front, como no portal.
  - Sem `trip.read`, a API responde `403`, e a tela diz "esta conta não é de motorista; use o painel
    da transportadora", sem link.
  - Com `isRegisteredDriver: false` no snapshot, aparece a tela que o módulo já tem.

### 3. Serviço `driver` em `.railway/railway.ts`, sem `deploy/<app>/`

- **O bloco.** `service('driver', …)` espelha `service('client', …)` (`railway.ts:562-607`):
  - Dockerfile `apps/frontend-driver/Dockerfile`;
  - healthcheck `/health/live`, com timeout 120;
  - `ON_FAILURE` e `replicas: { sfo: 1 }`;
  - `domains` por ambiente;
  - entra em `shared`.
- **Sem `deploy/frontend-driver/railway.json`.** Esse formato está depreciado, e serviço novo não pode
  optar por ele. O `client` também não tem.
- **As `VITE_*` do serviço `driver` são literais por ambiente.** O modelo é o
  `VITE_IDENTIFIER_FIRST_LOGIN` do `client` (`railway.ts:597-602`). A variável é pública e fica
  inlinada no bundle, então uma esquecida no painel gera build verde que quebra no celular. `PORT`,
  `DEPLOYED_REVISION` e `RAILWAY_DOCKERFILE_PATH` seguem em `preserve()`.
- **O domínio próprio se cria no painel** (`railway.ts:564`). O CNAME e o TXT `_railway-verify` são
  passo **humano**, e o TXT sai de `railway domain status --json`. O `railway config apply` também é
  humano.
- **CI.**
  - O alvo `driver` nasce em `changed-targets.sh`, com a app e a API, e `apps/frontend-driver/` entra
    no alvo `api` (`:12-16`). A app valida o corpo da API, pela mesma razão da spec 078.
  - Ele nasce também no passo `apps` do `deploy.yml` (`:129-150`), que alimenta a matriz do gate, e no
    `mark-deployed.sh`.
  - O job `deploy-driver` só entra **depois** de o serviço existir (§9). Ele espera `deploy-api`: a
    app chama rota nova, e publicá-la antes da API deixa botão batendo em `404`.

### 4. CSP e headers

- `server.ts`, `contentSecurityPolicy.service.ts` e o plugin de CSP do Vite são cópia do portal. A CSP é
  composta no build, e o servidor não sobe sem ela.
- **`connect-src`: a própria origem, a API e o Keycloak.** O sino fala com `<API>/v1`, que já está na
  lista. A task do sino confirma que o pacote não abre outra origem nem `wss:`.
- **Origens só de navegação.** `maps.google.com` (`DriverStopCard:141`) e o XML do MDF-e por URL
  assinada (`DriverTripWorkspace.page.tsx:219-221`) são `window.open`. Ficam em `NON_FETCH_ORIGIN`, e
  um contrato varre `https://` no código.
- **`img-src 'self' blob: <origem da API>`.**
  - `blob:` é a prévia da foto e do recorte.
  - A origem da API é o logo da instalação (`/public/landing-logo`, `installationBrand.service.ts:13`).
  - A origem do storage entra com a 179 (§8).
- **Headers de resposta.**
  - `Permissions-Policy: camera=(self), geolocation=(self), microphone=()`, o valor do painel
    (`server.ts:61`) e não o do portal.
  - `X-Frame-Options: DENY`, `nosniff` e `Referrer-Policy`, como no portal.
  - **`Strict-Transport-Security: max-age=31536000`**, sem `includeSubDomains` e sem `preload`. É a
    primeira app a emitir esse header, e um contrato o cobre.

### 5. Manifesto, service worker e atualização

| Campo                              | Valor                                                      |
| ---------------------------------- | ---------------------------------------------------------- |
| `id`                               | `/`                                                        |
| `name`                             | `Minha viagem`                                             |
| `short_name`                       | `Viagem`                                                   |
| `description`                      | `A viagem do motorista: paradas, entregas e comprovantes.` |
| `start_url` / `scope`              | `/`                                                        |
| `display`                          | `standalone`                                               |
| `theme_color` / `background_color` | `#0B1F2A`                                                  |
| ícones                             | 192, 512, 512 `maskable`, `apple-touch-icon` 180           |

- **O nome é genérico.** A marca da transportadora chega em tempo de execução, por
  `/public/landing-settings`.
- **Sem `orientation` no manifesto.**
  - A assinatura da spec 082 (D3) trava paisagem com `screen.orientation.lock` no Android
    (`signatureCapture.service.ts:26-40`), que funciona com a app instalada e em tela cheia.
  - No iOS, onde o `lock` não existe, a tela gira por CSS.
  - Uma `orientation` no manifesto travaria a app inteira.
- **O service worker nasce `injectManifest`, com `src/sw.ts`.**
  - O motivo é a 147, que passa a morar nesta app. `push` e `notificationclick` não existem em
    `generateSW`, e a troca de modo depois perde `navigateFallback` e cache sem aviso. Fazer isso na
    app vazia custa menos que com motorista em campo.
  - O `sw.ts` da 189 tem só: `precacheAndRoute(self.__WB_MANIFEST)`, fallback de navegação para
    `index.html`, `clientsClaim()` e a mensagem `SKIP_WAITING`.
  - **Sem `sync`** (§8) e sem `runtimeCaching` de API.
- **`registerType: 'prompt'`**, e a atualização só é aplicada em ponto seguro.
  - Com `autoUpdate`, a versão nova recarregaria a página no meio de uma assinatura, de um recorte ou
    de uma foto recém-tirada.
  - Um registro de capturas abertas (câmera, recorte, assinatura, diálogo de ocorrência) diz se o
    momento é seguro.
  - A atualização vale na abertura seguinte, ou no toque em "Atualizar", e só quando o registro está
    vazio. Um contrato cobre.

### 6. `/minha-viagem` no escritório: interruptor, tela de pendências e remoção medida

- **`VITE_DRIVER_APP_URL` é um interruptor, não uma configuração obrigatória.**
  - O painel lê a variável sozinha, fora de `getIdentityEnvironment`, no molde de
    `isIdentifierFirstLoginEnabled()` (`identityEnvironment.config.ts:55-65`).
  - Variável ausente ou vazia: o painel serve `/minha-viagem` como hoje, sem lançar erro.
  - Variável presente: passa por `readTrustedUrl`.
  - O código publica antes, desligado. A variável só é definida no serviço do painel depois de
    `motorista.<ambiente>` estar no ar. No `railway.ts` do painel ela é `preserve()`, e o `ARG` no
    `Dockerfile` do painel entra desde já.
  - **Rollback:** remover a variável e reimplantar o painel.
- **A decisão é pura:** `resolveDriverAppRedirect`, que recebe `pathname`, `isFieldOnlyUser`, `pendingTotal`, `driverAppUrl` e `isStandalone`.
  - Sem interruptor ou sem usuário de campo, o resultado é `stay`.
  - Com interruptor, usuário de campo e `pendingTotal = 0`: `redirect`. Em `display-mode: standalone`,
    o resultado é `install-screen` (abaixo).
  - Com pendência, o resultado é `pending-screen`.
- **Pendência** é uma definição só, em função pura: eventos não recusados, mais anexos dentro do prazo
  de 7 dias, mais recusados ainda não descartados. A drenagem automática usa a parte drenável (sem os
  recusados), e o painel usa o total.
- **Tela de pendências (decisão do usuário: "descartar com ciência").**
  - No modo `pending-screen`, o painel mostra **só** a tela de pendências do módulo antigo, sem a
    viagem.
  - Ela drena o que sobe.
  - O evento recusado ganha o botão "Descartar", com o aviso "a entrega não foi registrada; fale com o
    escritório".
  - Quando a fila esvazia, aparece o botão "Ir para o app novo". O redirecionamento acontece só pelo
    toque ou na abertura seguinte, nunca no meio de uma captura.
- **Tela "Instale o app novo".** O PWA antigo instalado abre o painel em `standalone`. Um
  `location.replace` para outra origem sairia do `scope` e cairia numa aba solta. Por isso a tela
  explica e oferece o link.
- **O módulo antigo sai quando a medida disser que ninguém mais usa, e não por calendário.**
  - O beacon sai **só** em `pending-screen`. Uma conta de escritório abrindo `/minha-viagem` seria
    ruído.
  - O painel manda `navigator.sendBeacon('/_driver-legacy-served', 'pending-screen')` para a própria
    origem.
  - A rota do `server.ts` do painel é pública, lê no máximo ~32 bytes do corpo e aceita só o valor
    enumerado. Ela sempre responde `204`.
  - Valor válido gera uma linha JSON `{ "event": "driver_legacy_served", "mode": "pending-screen" }`,
    sem usuário e sem IP. Valor inválido não gera log.
  - A remoção exige zero ocorrências em 14 dias seguidos nos logs de produção
    (`railway logs --service transportada-frontend`), com aprovação humana.
- **`DriverReturnReason` e `DRIVER_RETURN_REASONS` ficam no escritório.**
  - Eles mudam para `modules/trip/shared/`, porque o módulo `trip` os importa (`trip.types.ts:3`,
    `TripReturnReasonDialog:13`, `TripStateActions:8`, `TripDetail:51`).
  - A cópia da app nova é vigiada pelo contrato que já existe, `catalog-parity`, **contra a API**. Não
    há paridade com o painel.

### 7. Nenhuma app importa código de outra: o que se copia, o que fica, e o design system

Tudo é copiado com o cabeçalho "Cópia por valor de `<caminho>`". Nada é importado de outra app, e
nada vira pacote.

| Vai para `apps/frontend-driver` (cópia)                                                                                                 | Origem                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| o módulo inteiro                                                                                                                        | `frontend-transportada/src/modules/driver-trip/`                                                |
| `button`, `icon` (só os ícones usados), `skeleton`, `barcode` + `code128.service`, `file-field`, `copy-button`, `cn`, os tokens usados  | `frontend-transportada/src/components/ui/`, `src/lib/`, `src/styles/`                           |
| `KeycloakAuthProvider`, `environment.config`, `contentSecurityPolicy.service`, `LoginIdentifier`, `loginHintClient`, `server.ts`        | `frontend-client/src/modules/shared/` e a raiz da app                                           |
| `EnvironmentBanner.component.tsx`                                                                                                       | `frontend-client/src/components/`                                                               |
| `smokeAuthBypass.service.ts`, contrato `vite-build-args` (com `SOMENTE_EM_TESTE`)                                                       | `frontend-transportada/src/modules/identity/shared/`, `test/shared/vite-build-args.contract.ts` |
| `InstallationBrandMark`, `useInstallationBrandView`, `WhatsAppPhonePanel` e dependências, `useAuthMe` reduzido, `taxId.service`, `i18n` | `frontend-transportada/src/modules/identity/`, `modules/shared/`                                |
| **o sino**: `notificationClient.service.ts`, `NotificationProvider` e `NotificationBell` montados como no `main.tsx:866-871` e `:669`   | `frontend-transportada/src/modules/notification/shared/`, `src/main.tsx`                        |

O sino **não** é código de outra app: `@adatechnology/notification-ui` e
`@adatechnology/notification-client` são pacotes publicados, e a app nova os declara como dependência.
Copia-se só a cola, isto é, o cliente com o token e o provider.

**Fica no escritório:**

- `DriverReturnReason`;
- a baixa em nome do motorista (ADR-0067);
- o recorte da foto de usuário com o modelo de 16 MB (`@adatechnology/image-cutout`);
- OpenCV, OCR do canhoto e `maplibre`;
- as telas de notificação do escritório (configuração e lista).

**Web Push fica só no app do motorista** (decisão do usuário). O painel fica só com o sino. Migrar o
service worker do painel é spec futura.

**O design system é o caseiro do painel, não shadcn.**

- O painel não tem Tailwind nem shadcn.
- A web.md §14 manda shadcn para componente **novo**, mas diz também que "a tela existente manda" e
  proíbe "migrar tela que funciona só para adotar shadcn". Estas telas funcionam em campo, e as mais
  sensíveis a toque são assinatura e recorte.
- Esta ADR é a exceção registrada que a CLAUDE.md exige. O primitivo copiado é o mesmo componente, não
  um paralelo.
- Componente novo que tenha equivalente no shadcn continua sob a web.md §14.

**Playwright, com bypass de fumaça.**

- Fila offline, assinatura e alvo de toque só se provam em navegador, então a app leva a cópia de
  `smokeAuthBypass.service.ts`, com as duas travas do painel.
- O contrato de build é o do **painel**, com `VITE_SMOKE_AUTH_BYPASS` em `SOMENTE_EM_TESTE`
  (`vite-build-args.contract.ts:15`). O `Dockerfile` nunca declara esse `ARG`.

### 8. A app nasce resolvendo as lacunas conhecidas do PWA

**Antes da virada (paridade e segurança do campo):**

- **Abre sem rede, antes do Keycloak.**
  - `navigator.onLine` não basta: com sinal fraco ele diz `true` e o Keycloak não responde. Por isso,
    antes do `keycloak.init`, a app sonda
    ``fetch(`${keycloakUrl}/realms/${realm}/.well-known/openid-configuration`, { cache: 'no-store' })``,
    com timeout de cerca de 5 s.
  - Se a sonda falhar, a app renderiza o último snapshot. Ele é só leitura, mas os toques continuam
    enfileiráveis. Não dá para esperar a falha do `init`: o `check-sso` sem
    `silentCheckSsoRedirectUri` navega a página inteira, e nenhuma exceção chega ao código.
  - A autenticação fica adiada ao evento `online`. O token só é exigido na drenagem.
  - Quando a rede volta, o `keycloak.init` só roda com o registro de capturas vazio, porque ele navega
    a página. Com captura aberta, espera o `close`.
- **Snapshot persistido com prazo e dono.**
  - O último `GET /me/trips/current` é gravado em IndexedDB, com a chave `SHA-256(sub)`.
  - O snapshot é descartado quando outro usuário autentica, depois de 24 h, ou quando todas as viagens
    estão concluídas. Também sai no "Sair".
  - Os itens da fila levam o mesmo hash, e a drenagem só envia os do usuário autenticado.
  - Registro em `docs/SECURITY.md`.
- **Drenagem.**
  - Gatilhos: `online`, abertura, `visibilitychange` visível, `pageshow`, e um temporizador de 30 s
    enquanto houver pendência drenável (§6).
  - **Sem Background Sync.** O `sync` do Chromium só acordaria a página aberta, que os gatilhos acima
    já cobrem, e o Safari não tem o evento. Drenar com a app fechada exigiria token no SW, o que a
    security.md §8 proíbe, e a ADR-0056 reserva isso ao nativo.
- **Alvo de toque ≥ 44 px em tudo.** Sem o cabeçalho do escritório, somem os botões `size="sm"` de
  2.4rem.

**Depois da virada (não seguram a mudança de casa):**

- **Duas viagens.**
  - A API devolve N viagens em `createdAt` ascendente (`drizzle-current-driver-trip.repository.ts:205-227`),
    e hoje a tela mostra `trips[0]` (`DriverTripWorkspace.page.tsx:121`, `DriverProfile.page.tsx:43`).
  - A viagem padrão, por função pura, é a mais antiga em `on_delivery_route` ou `in_transit`. Sem
    nenhuma em rota, é a mais antiga da lista, na ordem da API.
  - Quando há mais de uma, aparece um seletor.
- **Janela de entrega.** `deliveryWindowStart/End` já chegam validados
  (`driverTripResponse.validation.ts:140-141`), e o cartão da parada passa a mostrar.
- **Consentimento de rastreamento.**
  - A API tem `PUT /me/location-consent`, mas não tem leitura do estado. Nasce
    `GET /me/location-consent` → `{ data: { acceptedAt: string | null } }`.
  - Conta sem motorista responde `409 DRIVER_NOT_REGISTERED` (`trip.error.ts:436-444`), no `GET` e no
    `PUT`.
  - No Perfil, o interruptor vem desligado por padrão. O texto diz a finalidade (o contratante vê onde
    a carga está), quem vê (o contratante daquela entrega, só um ponto, sem nome nem placa) e a
    retenção (o rastro é apagado quando a viagem fecha).
  - Com consentimento e a viagem em `dispatched`, `in_transit` ou `on_delivery_route`, a app usa
    `watchPosition` e envia no máximo a cada 60 s, só com a app visível.
  - Enquanto a posição sobe, **um indicador fica visível na tela da viagem**.
  - O comentário de `driverLocation.service.ts` na cópia passa a citar esta revisão.

**Já corrigido:** a ocorrência de nota manda `Idempotency-Key` (commit `5a27ae408`), e a cópia herda
isso.

**O que fica pronto para a 179 (fases 3–4).**

- O envio da ocorrência de nota com foto é **um** `kind` na fila, `documentOccurrence`. Dentro do
  próprio envio, ele pede a URL assinada, sobe, confirma o upload e só **então** faz o `POST` JSON com
  `attachmentObjectId`.
- A drenagem de hoje sobe o evento e depois os anexos (`offlineAttachments.service.ts:185-195`). A 179
  T203 recusa tipo `required` sem anexo, então a foto não pode ser um anexo posterior.
- O `switch` de `driverTripClient.service.ts:125-145` já é exaustivo. O `kind` novo entra ali e no
  tipo, e o compilador aponta o que falta.
- A 179 acrescenta a origem do storage ao `connect-src` e ao `img-src`.

**O que fica pronto para a 147:** o `sw.ts` com `scope: '/'`, a CSP com `worker-src 'self'` e `manifest-src 'self'`, e a área de "Instalar" no Perfil. `push` e `notificationclick` entram como handlers novos.

### 9. Porta, dev local, gates e ordem de publicação

- **Portas.**
  - `FRONTEND_DRIVER_PORT := $(or $(shell sed …),53200)`, no padrão do Makefile (`:11-12`).
  - Preview do Playwright na `53112`, na faixa `5311x`.
  - O `ci.yml:109` reserva `53112,53200` em `ip_local_reserved_ports`.
- **Comandos locais.**
  - `make dev` sobe a app. `make smoke` confere `/` e `/manifest.webmanifest` e roda o Playwright da
    app.
  - `make check` cobre a app pelos scripts encadeados da raiz. O `build` da app é
    `vite build && bun test test/dist.contract.test.ts`: o orçamento de precache é gate de build.
- **Na mesma mudança que cria `apps/frontend-driver/package.json`:**
  - os seis `Dockerfile` de app e o novo copiam o manifesto dele (`dockerfile-workspace.contract.ts`);
  - o alvo `driver` entra no filtro de mudança (`pipeline-change-filter.contract.ts:47`).

  Sem isso, `make check` fica vermelho.

- **O job `deploy-driver` entra no mesmo push que acrescenta a origem de staging em
  `spa-redirect-uris.json`**, depois de o usuário criar o serviço e o domínio.

## Consequências

- Aparece a quarta app web, com CSP, HSTS, PWA, Playwright e deploy próprios. Toda mudança de
  workspace passa a tocar sete `Dockerfile`.
- O motorista instala um ícone que é dele. A 147 ganha um `scope` onde o push faz sentido, e a 179,
  uma fila onde a foto entra sem disputar o SW do escritório.
- Enquanto o beacon não zerar, o mesmo código existe em duas apps. Depois da virada, a cópia do
  painel não recebe correção: ela só esvazia filas.
- Nenhum item pendente é descartado sem que o motorista veja e confirme.
- Cada nova origem autenticada continua exigindo três lugares: o arquivo de origens com a
  reconciliação, o `FRONTEND_ORIGIN` (humano) e o domínio (humano).

## Alternativas descartadas

| Alternativa                                   | Por que não                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Segundo manifesto só para `/minha-viagem`     | O `scope` do SW continua o do painel, e o push da 147 seguiria indo ao "TransportAdA"                       |
| Client Keycloak `transportada-driver`         | Mesmo token e mesmos mappers; exigiria ensinar a reconciliação, o script e três contratos                   |
| `generateSW` agora, `injectManifest` na 147   | A troca perde `navigateFallback` e cache em silêncio, e a 147 passa a morar aqui                            |
| `registerType: 'autoUpdate'`                  | Recarrega no meio de uma assinatura ou de uma foto                                                          |
| Background Sync (com a app aberta ou fechada) | Aberta, os gatilhos já cobrem; fechada, exige token no SW (security.md §8), e é o papel do nativo           |
| `VITE_DRIVER_APP_URL` obrigatória no painel   | Build do painel quebraria antes de a app nova existir; sem interruptor, não há rollback sem reverter código |
| Redirecionar sempre, sem olhar a fila         | A fila antiga é da origem `app.`; entrega e foto ficariam presas no aparelho                                |
| Descartar a fila antiga em silêncio           | Entrega some sem o motorista saber; o usuário escolheu "descartar com ciência"                              |
| Remover o módulo antigo por calendário        | Não diz se alguém ainda depende dele; o beacon diz                                                          |
| Web Push também no painel                     | Obriga migrar o SW do escritório agora; o sino basta ali                                                    |
| Reescrever as telas em shadcn na mudança      | Migração sem ganho e com risco em assinatura e recorte (web.md §14, "a tela existente manda")               |
| `VITE_*` do serviço `driver` em `preserve()`  | Variável esquecida gera bundle verde que quebra no celular                                                  |
