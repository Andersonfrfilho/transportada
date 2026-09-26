## frontend-driver

Histórico completo e narrativas (specs, defeitos investigados, decisões datadas):
`docs/ai-context/frontend-driver.md`.

A **app do motorista** (ADR-0075, spec 189): o PWA que ele instala, com bundle, `Dockerfile`,
serviço e domínio próprios, em `motorista.<zona>` (local na `53200`, `make dev`/`make smoke`
sobem por `FRONTEND_DRIVER_PORT`). Molde: `apps/frontend-client`. Nenhuma app importa código de
outra: o que vem do painel ou do portal é **cópia por valor**, e o arquivo copiado começa com
`/* Cópia por valor de <origem> (ADR-0075 §7). */` — vigiado por
`test/driver-trip/copy-by-value-header.contract.ts`. Estrutura em `src/modules/`: `driver-trip`
(a viagem, cópia do antigo `apps/frontend-transportada/src/modules/driver-trip/`), `identity`
(Keycloak, marca da instalação, telefone do WhatsApp), `notification` (o sino) e `shared` (i18n).

## Auth/SSO

Client Keycloak `transportada-spa`, o mesmo do painel e do portal, só com uma terceira origem
(`realm/spa-redirect-uris.json`) — não há client `transportada-driver` (ADR-0075 §2): a autorização
vem da membership no banco, não do client, e um client novo custaria os mesmos mappers e três
contratos ensinados de novo. `KeycloakAuthProvider`, `LoginIdentifier` e `loginHintClient` são cópia
por valor do portal (`test/identity/keycloak-auth-provider.contract.ts`,
`test/identity/login-hint-client.contract.ts`). `VITE_IDENTIFIER_FIRST_LOGIN` liga a tela de
identificação antes da senha. Quem entrou em `app.` ou `cliente.` entra em `motorista.` sem senha
(`check-sso`, mesma sessão do Keycloak); o logout descobre no próximo `updateToken`, não na hora.
Sem `trip.read` no token, a API responde `403` e a app mostra a tela dedicada — sem papel checado no
front, no molde do portal. `test/identity/driver-authorization.contract.ts` cobre o `403`.
`smokeAuthBypass.service.ts` (cópia do painel, com as duas travas) e `VITE_SMOKE_AUTH_BYPASS`
existem só para o Playwright: o `Dockerfile` nunca declara esse `ARG`
(`test/shared/vite-build-args.contract.ts`).

## Boot sem rede, com sonda

`navigator.onLine` não basta — sinal fraco devolve `true` com o Keycloak inacessível. Antes do
`keycloak.init`, `probeIdentityProvider` (`src/modules/driver-trip/shared/bootMode.service.ts`)
sonda `fetch(`${keycloakUrl}/realms/${realm}/.well-known/openid-configuration`, { cache: 'no-store'
})` com timeout de 5 s (`IDENTITY_PROBE_TIMEOUT_MS`). `resolveBootMode({ isReachable, snapshot, now
})` decide entre `authenticate` (a sonda respondeu), `offline-snapshot` (não respondeu, mas há
snapshot válido) e `offline-empty` (nem isso). Sem rede a app não trava no `check-sso` — que, sem
`silentCheckSsoRedirectUri`, navegaria a página inteira e nenhuma exceção chegaria ao código — e
renderiza o último snapshot como leitura, com os toques ainda enfileiráveis.
`scheduleAuthenticationOnReconnect` (mesmo arquivo) sonda de novo a cada evento `online` e a cada 30
s (`REAUTHENTICATION_RETRY_MS`, cobrindo o sinal fraco onde `online` nunca dispara); quando a rede
volta, `keycloak.init` só roda com `captureRegistry.isIdle()` — com captura aberta, espera o
`close`, porque o `init` navega a página. `test/driver-trip/boot-mode.contract.ts`.

## Snapshot e fila com dono

O último `GET /me/trips/current` é gravado em IndexedDB (`indexedDbQueue.service.ts`, versão 3, sem
migração — a origem nasce sem dados) com a chave `SHA-256(sub)`
(`tripSnapshot.service.ts:hashSubject`; o `sub` em si nunca é gravado) e um ponteiro `last`, que diz
de quem é o snapshot que o boot sem rede pode abrir. Sai quando outro `sub` autentica
(`claimTripSnapshot`, que descarta o anterior antes de aceitar o novo), depois de 24 h de `savedAt`
(`TRIP_SNAPSHOT_MAX_AGE_MS`), quando todas as viagens estão `completed`/`cancelled`
(`hasOnlyConcludedTrips`) e no "Sair" (`discardTripSnapshots`). Registro em `docs/SECURITY.md`. Os
itens da fila offline levam o mesmo `subHash`
(`queueOwner.service.ts:isOwnedBy`/`partitionPendingByOwner`); a drenagem só envia os do usuário
autenticado, e o que é de outra conta (outro motorista usou o mesmo aparelho) nunca sai com o token
deste — aparece como "pendências de outra conta", com "Descartar"
(`discardForeignPending`). `pendingQueue.service.ts:countPending` soma `drainable`/`rejected`/
`total`, ignorando item de outra conta quando `ownerSubHash` é informado.
`test/driver-trip/trip-snapshot.contract.ts`, `test/driver-trip/queue-owner.contract.ts`,
`test/driver-trip/pending-queue.contract.ts`.

## Drenagem

Gatilhos (`pendingQueue.service.ts:scheduleQueueDrainTriggers`, chamado por
`useDriverTrip.hook.ts`): `online`, `visibilitychange` visível, `pageshow`, a abertura (chamada uma
vez por quem monta, antes de agendar o resto) e um temporizador de 30 s
(`QUEUE_DRAIN_INTERVAL_MS`, o mesmo intervalo da sonda de reconexão) que só existe enquanto
`getDrainable() > 0` e se desliga sozinho quando a fila esvazia. **Sem Background Sync**: o `sync`
do Chromium só acordaria a página já aberta, que os gatilhos acima cobrem, o Safari não tem o
evento, e drenar com a app fechada exigiria token no service worker — proibido por
`security.md` §8 e reservado ao nativo (ADR-0056). A ocorrência de nota com foto é o `kind`
`documentOccurrence` em `DriverFieldReport` (spec 179 T301 — a 189 o dava como pronto, e ele não
existia): o `Blob` da foto mora no próprio item, e dentro do `send` (`driverTripClient.service.ts`)
pede a URL assinada, faz o `PUT` direto ao storage **sem** o token da API, confirma e só então `POST
.../documents/:id/occurrences` com `attachmentObjectId` e a chave do toque — a drenagem de eventos e
depois anexos (`offlineAttachments.service.ts`) exigiria a ordem inversa, e a 179 T203 recusa
`required` sem anexo. A foto conta no teto de bytes dos anexos (`sumReportPhotoBytes`).
`test/driver-trip/offline-queue.contract.ts`, `test/driver-trip/offline-attachments.contract.ts`,
`test/driver-trip/occurrence-upload.contract.ts`.

**"Não entreguei" é ocorrência com foto e devolução** (spec 179, pedido do usuário de 25/09,
`notDelivered.service.ts`). A devolução (`/return`, `DRIVER_RETURN_REASONS`) é o que fecha nota,
parada e viagem; a ocorrência (tipo do cadastro, com a foto) é a prova e abre a tratativa da spec
164, mas não muda `separation_status` (spec 164 RF19). O motivo não se deduz do tipo (seria comparar
nome), então o formulário pergunta os dois. Confirmar grava os dois itens numa transação só
(`enqueueReports`), ocorrência antes. Sem lista de tipos (falha sem cópia em
`occurrenceTypesCache.service.ts`, ou empresa sem tipo de rua), a devolução segue só com o motivo. O
cartão diz "na fila" pelo que está na fila e "enviado" só pela chave que a drenagem viu o servidor
aceitar (`resolveNotDeliveredStatus`). `test/driver-trip/not-delivered*.contract.ts`.

## `captureRegistry` e atualização em ponto seguro

`captureRegistry.service.ts`: registro das capturas abertas (`camera`, `crop`, `signature`,
`occurrence-dialog`), contado por tipo (`open`/`close`), com `isIdle()`, `onIdle(listener)` e
`hasOpened()` (nunca volta a `false` na sessão). Câmera, recorte, assinatura e o diálogo de
ocorrência abrem e fecham nele. Dois consumidores esperam `isIdle`/`onIdle` antes de navegar a
página: a reautenticação da volta de rede (acima) e `serviceWorkerUpdate.service.ts` — o SW é
`injectManifest` com `registerType: 'prompt'` (nunca `autoUpdate`, que recarregaria no meio de uma
assinatura ou de uma foto). Antes da primeira captura da sessão (`!hasOpened()`), a versão nova
aplica sozinha; depois, `onNeedRefresh` mostra "Nova versão — Atualizar" e só aplica no toque, e só
se `isIdle()` — com captura aberta, espera o `close`. `test/driver-trip/capture-registry.contract.ts`,
`test/shared/service-worker.contract.ts`.

## Alvo de toque ≥ 44 px

Sem o cabeçalho do escritório para dar altura de sobra, `test/shared/touch-target.contract.ts` varre
o CSS: nenhum `min-height`/`height` interativo abaixo de `2.75rem` (44px) e nada de
`--control-height-compact` na app — o sino está incluído.

## O sino

Notificações são pacotes publicados, não cópia de código: `@adatechnology/notification-client`
(0.1.0-rc.3) e `@adatechnology/notification-ui` (0.1.0-rc.9), as mesmas versões do painel. Só a cola
é cópia por valor: `notificationClient.service.ts`, `NotificationProvider` e `NotificationBell` no
cabeçalho (`main.tsx`), e `/notificacoes` (`DriverNotifications.page.tsx`) com a lista do pacote. O
stream é `fetch` com `ReadableStream` para `${apiBaseUrl}/v1/notifications/stream`, já coberto pelo
`connect-src` existente — a CSP não muda por causa do sino.

## Seletor de viagem e janela de entrega

O motorista pode ter mais de uma viagem aberta. `driverTripSelection.service.ts:resolveSelectedTrip`
(RF12, função pura): a escolha do motorista (`selectedTripId`) vale enquanto ela continuar na lista;
sem escolha, ou com a escolhida fora dela, a padrão é a mais antiga em `in_transit`/
`on_delivery_route` (`dispatched` fica de fora de propósito: a carga saiu, mas o motorista ainda não
marcou nada), senão a mais antiga da lista (a API devolve em `createdAt` ascendente). Um seletor
aparece só quando há mais de uma viagem. `deliveryWindowStart`/`deliveryWindowEnd` já chegam
validados (`driverTripResponse.validation.ts`) e `DriverStopCard.component.tsx` mostra a janela de
entrega da parada. `test/driver-trip/trip-selection.contract.ts`,
`test/driver-trip/delivery-window.contract.ts`.

## Consentimento e rastreamento de posição

`driverTripClient.service.ts` fala com `GET`/`PUT /me/location-consent` (`{ accepted: boolean }` →
`{ acceptedAt: string | null }`) e `POST /me/trips/current/location` (sem id de viagem). Conta sem
motorista responde `409 DRIVER_NOT_REGISTERED` nas duas rotas de consentimento. No Perfil, o
interruptor (`DriverLocationConsentCard.component.tsx`, `role="switch"`) vem **desligado por
padrão**, com o texto de finalidade, quem vê (só o contratante daquela entrega, um ponto, sem nome
nem placa) e a retenção (some quando a viagem fecha, e na hora em que se desliga). Com consentimento
e a viagem em `dispatched`/`in_transit`/`on_delivery_route`,
`locationSharing.service.ts:createLocationSharingController` usa `watchPosition` e envia **no
máximo uma vez por minuto** (`LOCATION_SHARING_INTERVAL_MS`), só com a app visível
(`useLocationSharing.hook.ts`, `visibilitychange` via `useSyncExternalStore`); desligar limpa o
`watch` e o temporizador na hora, antes da resposta do `PUT`: o toque marca
`locationConsentRevocation.service.ts` (compartilhada, síncrona, desfeita só por um `PUT` de ligar
bem-sucedido), que o controlador assina — o caminho `setQueryData` → `setTimeout(0)` do TanStack →
efeito do React deixava um envio agendado sair depois do toque (CA14 na CI, spec 189 T9.2). Falha
de envio não entra na fila: posição ao vivo velha não serve. Enquanto sobe, `DriverLocationSharingIndicator.component.tsx`
(`role="status"`) fica visível na tela da viagem. `test/driver-trip/location-sharing.contract.ts`.
⚠️ Não confundir com `driverLocation.service.ts` (`readCurrentLocation`): é uma leitura **pontual**
via `getCurrentPosition`, para carimbar uma confirmação de entrega (ADR-0045 §3) — não bloqueia o
envio se falhar, e não tem relação com o consentimento contínuo acima.

**O service worker é `injectManifest`, com `src/sw.ts`, e `registerType: 'prompt'`** (ADR-0075 §5).
O `sw.ts` tem só precache, fallback de navegação para `index.html`, `clientsClaim()` e a mensagem
`SKIP_WAITING_MESSAGE` (`src/modules/shared/serviceWorker.constant.ts`, o valor que o `workbox-window`
manda). ⚠️ Sem listener de `sync` e sem cache de API — `test/shared/service-worker.contract.ts`
reprova os dois. O `push` da spec 147 entra no mesmo `sw.ts`.

**O orçamento de precache é gate de build.** `build` é `vite build && bun test
test/dist.contract.test.ts`: o precache soma no máximo 1,5 MiB e nada de `opencv`,
`background-removal`, `canhoto-ocr`, `maplibre`, `tesseract` ou `pdfjs` chega ao `dist`. Por isso o
`dist.contract.test.ts` não está na lista de `test`: sem `dist/` ele não tem o que ler.

**CSP e cabeçalhos** (ADR-0075 §4): `connect-src` é a própria origem, a API e o Keycloak, e um
contrato varre `https://` em `src/`; origem só de `window.open` vai para `NON_FETCH_ORIGIN`.
`img-src` é `'self' blob:` e a origem da API. `Permissions-Policy` abre câmera e posição para a
própria origem (o valor do painel) e o servidor emite `Strict-Transport-Security: max-age=31536000`,
sem `includeSubDomains` e sem `preload`. O `server.ts` não sobe sem a CSP emitida no build.

Envs: `VITE_API_URL`, `VITE_APP_ENV`, `VITE_DRIVER_APP_URL` (obrigatória aqui; no painel é só o
interruptor da ADR-0075 §6), `VITE_IDENTIFIER_FIRST_LOGIN` e `VITE_KEYCLOAK_*`. Toda `VITE_*` lida
em `src/` tem `ARG` no `Dockerfile` (`test/shared/vite-build-args.contract.ts`), menos
`VITE_SMOKE_AUTH_BYPASS`, que nunca entra numa imagem.

## Testes, Playwright e portas

`package.json`: `test` roda os três entrypoints de contrato
(`test/shared.contract.test.ts`, `test/identity.contract.test.ts`,
`test/driver-trip.contract.test.ts`, que juntos importam as ~30 suítes de `test/driver-trip/`,
`test/identity/` e `test/shared/`) — `test/dist.contract.test.ts` fica de fora da lista porque só o
`build` gera `dist/`. `check` encadeia `lint && typecheck && test && build`. Porta real de
desenvolvimento/preview: **`53200`** (`FRONTEND_DRIVER_PORT`, `Makefile`, `.env.example`,
`vite.config.ts`) — é ela que `make dev` sobe e `make smoke` confere (`/` e
`/manifest.webmanifest`). **`53112` não é uma segunda porta de serviço**: é a origem sintética que o
Playwright usa como `VITE_DRIVER_APP_URL` só durante o próprio smoke
(`test/authenticated-smoke.helper.ts`), para não disputar a porta real do processo — reservada em
`ci.yml:109` (`ip_local_reserved_ports: 53112,53200`). O `smoke` do `package.json` roda dois specs:
`driver-service-worker.smoke.spec.ts` (sem bypass) e `driver-app.smoke.spec.ts` (com
`VITE_SMOKE_AUTH_BYPASS=true`) — a suíte cobre CA05/CA06 (abrir com rede, recarregar sem rede,
rede fraca), CA07 (drenagem), CA08 (sino), CA09 (atualização adiada), CA14 (consentimento e
indicador de posição) e CA15 (44 px em 375 px). `make smoke` da raiz roda o Playwright das três apps
(painel, portal, motorista) com o Chromium instalado uma vez só pelo job `integration` da CI.

## O que a spec 147 e a spec 179 acrescentam

- **147 (Web Push).** O `sw.ts` já nasce `injectManifest`, então a 147 só acrescenta os handlers
  `push` e `notificationclick` a ele — não há troca de modo para fazer aqui. `POST`/`DELETE
/me/web-push-subscriptions` entram como inscrição por gesto do usuário, só neste app (o painel
  fica com o sino, sem Web Push).
- **179 (recusa sai com foto).** Feita nesta app (T301–T303): ver "Drenagem" acima. A origem do
  storage é `VITE_OBJECT_STORAGE_URL` (o mesmo nome do painel), lida só pelo `vite.config.ts` para a
  CSP, com `ARG` no `Dockerfile` (`test/shared/vite-build-args.contract.ts`) — entra **só no
  `connect-src`**: a foto sobe por `PUT`, e nada aqui exibe imagem do bucket. Sem ela no ambiente, o
  navegador recusa o `PUT` e o item fica recusado na fila.

## Foto: botão, não campo de arquivo

O canhoto e a foto da ocorrência usam `FilePickerButton` (`src/components/ui/file-picker-button.tsx`):
um `Button` do design system que clica num `<input type="file">` fora da vista e da tabulação.
"Tirar foto" leva `capture="environment"` (câmera na hora), "Anexar" não leva (galeria e arquivos, a
saída quando a câmera não abre ou foi negada). No canhoto, "Colher assinatura" tem ícone próprio
(`pen`) e ocupa a linha inteira; as duas portas da foto dividem a linha de cima. Depois de anexar:
miniatura (`usePhotoPreviewUrl`), "anexada" e "Refazer". `test/driver-trip/proof-capture.contract.ts`.

**A foto do "Deu problema" é da ocorrência de parada, nunca canhoto** (spec 209). Antes ela ia por
`attachProof` para a primeira nota aberta da parada: virava canhoto, entrava na pontualidade e pesava
na nota do motorista (e, em nota não entregue, ficava recusada na fila). Hoje o formulário
(`DriverStopOccurrenceForm.component.tsx` + `useStopOccurrenceForm.hook.ts`) aceita **uma** foto,
reduzida por `reduceOccurrencePhotoToJpeg` até 512 KiB, com o mesmo par "Tirar foto"/"Anexar". A fila
recebe dois itens (`stopOccurrencePhoto.service.ts`): a `occurrence`, que sobe sozinha e nunca espera
a foto, e atrás dela o `stopOccurrencePhoto`, cujo `send` sobe por
`/me/trips/current/stops/:stopId/occurrence-uploads` (+ `confirm`) e reenvia a ocorrência com a
chave dela e `attachmentObjectId` — a API completa o anexo uma vez. Fila cheia derruba a foto, nunca o
relato (`reportStopOccurrence` → `photo-dropped`, aviso `occurrencePhotoDropped`).
`test/driver-trip/stop-occurrence-photo.contract.ts`.

## Cópia por valor: o que veio de onde

Tabela completa em ADR-0075 §7. Resumo: o módulo `driver-trip` inteiro veio de
`frontend-transportada/src/modules/driver-trip/`; `button`, `icon`, `skeleton`, `barcode` +
`code128.service`, `file-field`, `copy-button`, `cn` e os tokens usados vieram de
`frontend-transportada/src/components/ui/`, `src/lib/` e `src/styles/`; `KeycloakAuthProvider`,
`environment.config`, `contentSecurityPolicy.service`, `LoginIdentifier`, `loginHintClient` e
`server.ts` vieram de `frontend-client`; `EnvironmentBanner` veio de `frontend-client/src/components/`;
`smokeAuthBypass.service.ts` e o contrato `vite-build-args` vieram de
`frontend-transportada/src/modules/identity/shared/`; `InstallationBrandMark`,
`useInstallationBrandView`, `WhatsAppPhonePanel`, `useAuthMe` reduzido, `taxId.service` e `i18n`
vieram de `frontend-transportada/src/modules/identity/` e `modules/shared/`; e a cola do sino
(`notificationClient.service.ts`, `NotificationProvider`, `NotificationBell`) veio de
`frontend-transportada/src/modules/notification/shared/` e `src/main.tsx`.
`DriverReturnReason`/`DRIVER_RETURN_REASONS` **não** vieram — ficaram em
`frontend-transportada/src/modules/trip/shared/`, porque o módulo `trip` do escritório os importa; a
cópia daqui é vigiada pelo `catalog-parity`, contra a API.

⚠️ `test/driver-trip/copy-by-value-header.contract.ts` vigia o cabeçalho só dos arquivos vindos de
`frontend-transportada` (o mapa fixo `path → origem`, ~60 arquivos). Os vindos de `frontend-client`
(auth, CSP, ambiente, `server.ts`) têm o comentário, mas não estão nesse mapa automatizado — a
garantia ali é só a prosa do cabeçalho, não um teste dedicado.
