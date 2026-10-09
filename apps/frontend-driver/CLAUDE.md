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

## A foto do canhoto já enviado

Duas fontes, nesta ordem, em `useStoredProofThumbnail`: **o aparelho** (a miniatura guardada no
envio, abaixo) e, só quando ele não tem, **o servidor** —
`GET /me/trips/current/documents/:documentId/proof` (`readDeliveryProofs` do cliente), `trip.read`,
URL assinada de 5 min, lida uma vez por nota (`staleTime` de 4 min). A rede nunca corre na frente do
IndexedDB: a consulta só liga depois de a leitura local responder vazia (`isDeviceEmpty`), e fica
desligada no boot sem rede (`canSync`). É o que cobre a foto anexada pelo escritório, o celular
trocado e a nota de ontem. ⚠️ A origem do storage entrou no **`img-src`** da CSP por causa disso
(ADR-0075 §4, emenda de 01/10) — sem ela a foto volta em branco, sem erro visível.
`test/driver-trip/proof-server-read.contract.ts`, `test/shared/content-security-policy.contract.ts`.

## A miniatura do canhoto já enviado

Pedido do usuário (01/10): no estado "Comprovante já enviado" a tela mostrava só uma frase, dentro de
uma moldura quadrada de `--space-16` por onde o texto vazava. Agora as duas molduras do canhoto (a
vazia e a confirmada) ocupam a largura do card, e a foto aparece em miniatura: quando a drenagem
aceita o anexo, `saveProofThumbnail` guarda a **miniatura** (a da spec 220, ≤128 KiB — nunca o
original) no store `proof-thumbnails` do IndexedDB (versão **4**, só cria store novo, sem migração).
`useStoredProofThumbnail` lê por `documentId` em `renderConfirmedFrame`; sem miniatura guardada (foto
do escritório, outro aparelho, 24 h vencidas) fica a frase, como antes. Dono e prazo são os do
snapshot: `subHash` dentro do registro, `retainOnly` no boot autenticado (`main.tsx`),
`discardProofThumbnails` no "Sair" e 24 h de validade. Registro em `docs/SECURITY.md`.
`test/driver-trip/proof-thumbnail-archive.contract.ts`, `proof-confirmed-by-server.contract.ts`.

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

**O momento do evento é o do toque, corrigido pelo relógio** (spec 234, Fase 2). `request()` do cliente
lê o `Date` de toda resposta `ok` e guarda (`clockOffset.service.ts:driverClockOffset`) o desvio
`servidor − aparelho`, contra o ponto médio do pedido; o `Date` tem resolução de 1 s e o erro de ±1 s é
aceito, e pedido com ida e volta acima de 5 s (`MAX_CLOCK_SAMPLE_ROUND_TRIP_MS`) não mede — upload lento é
assimétrico. O item da fila (`QueuedReport`) e o anexo (`QueuedAttachment`) guardam o desvio **da criação**
(`clockOffsetMs`); no envio a drenagem entrega `{ tappedAt: createdAt, clockOffsetMs }` ao `send` (`send({ report, stamp })`,
`StampedReport`, com `stamp` obrigatório no objeto). Só
`CLOCK_FIELD_REPORT_KINDS` (`arrive`, `deliver`, `return`, ocorrência de parada e a foto dela) levam os dois
campos — os esquemas da API são `.strict()` e `depart`/`cancelDeparture` (já com `tappedAt` próprio),
`dispatch`, ocorrência de nota e `proof/receiver` dariam `400`. O multipart do comprovante leva só
`clockOffsetMs` (o `capturedAt` já é a hora do toque). Sem desvio medido, nenhum campo vai. ⚠️ O `Date` de outra
origem só chega ao JavaScript com `Access-Control-Expose-Headers: Date`, que a API emite em
`applyCorsHeaders` (`CORS_EXPOSE_HEADERS`, `test/cors.contract.test.ts`); sem ele o app não mede nada e não há erro.

**O desvio sobrevive ao aparelho sem sinal** (spec 234 D7/T2.6): a última medição vai ao `localStorage`
(`transportada.driver.clock-offset.v1`, `{ offsetMs, measuredAt }`) e vale `CLOCK_OFFSET_MAX_AGE_MS` (24 h,
limite inclusivo); a leitura devolve `undefined` com registro malformado, vencido ou com `measuredAt` no futuro
do relógio atual. É `localStorage` e não IndexedDB porque a leitura é **síncrona**: o hook lê o desvio ao
enfileirar, e uma leitura assíncrona deixaria a primeira entrega do boot offline sem ele (mesmo precedente do
`occurrenceTypesCache`). O desvio é do aparelho, não da conta — sem `subHash`, e o "Sair" não o apaga.
`test/driver-trip/clock-offset.contract.ts`, `test/driver-trip/clock-offset-persistence.contract.ts`, `test/driver-trip/event-clock-fields.contract.ts`, smoke em
`driver-app.smoke.spec.ts`.

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

⚠️ **Viagem concluída agora chega na lista, e não pode ser eleita** (spec 225). A API devolve a
viagem `completed`/`cancelled` dos últimos 15 min junto das ativas, então `resolveSelectedTrip`
descarta concluída nos três caminhos (`isConcludedTripStatus`) e `DriverTripSelector.component.tsx`
a tira da contagem e dos botões — sem isso o motorista veria a viagem terminada como ativa. A
cópia legada do painel (`frontend-transportada/src/modules/driver-trip/`) pegava `trips[0]` cru e
ganhou o mesmo filtro em `driverTripCurrent.service.ts`.

**Por que a API passou a mandá-la**: o aviso de reatribuição (`hasReassignedTrip`, 217 RF8/D6) é
deduzido da ausência, com a ressalva "não estava concluída" lida do snapshot local. Como o endpoint
filtrava `completed` para fora **antes** de o app poder vê-lo, a ressalva era inalcançável e o aviso
"a viagem foi movida para outro motorista" disparava em **toda** conclusão — relatado pelo usuário
em 02/10. O conserto não mudou `hasReassignedTrip`: fez o status chegar. A conclusão passa a ser
duas leituras (a mesma viagem já terminal, depois ausente), e nenhuma avisa.
`test/driver-trip/trip-reassignment.contract.ts`, `test/spec-225-prints.smoke.spec.ts`.

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
saída quando a câmera não abre ou foi negada). No canhoto, "Tirar foto", "Anexar" e "Colher
assinatura" (ícone `pen`) são empilhados, cada um ocupando 100% da largura do card (pedido do
usuário, 01/10) — nunca lado a lado. Depois de anexar:
miniatura (`usePhotoPreviewUrl`), "anexada" e "Refazer". `test/driver-trip/proof-capture.contract.ts`.

**A foto do "Deu problema" é da ocorrência de parada, nunca canhoto** (spec 209). Antes ela ia por
`attachProof` para a primeira nota aberta da parada: virava canhoto, entrava na pontualidade e pesava
na nota do motorista (e, em nota não entregue, ficava recusada na fila). O formulário aceita **uma**
foto, reduzida por `reduceOccurrencePhotoToJpeg` até 512 KiB, com o mesmo par "Tirar foto"/"Anexar". A
fila recebe dois itens (`stopOccurrencePhoto.service.ts`): a `occurrence`, que sobe sozinha e nunca
espera a foto, e atrás dela o `stopOccurrencePhoto`, cujo `send` sobe por
`/me/trips/current/stops/:stopId/occurrence-uploads` (+ `confirm`) e reenvia a ocorrência com a
chave dela e `attachmentObjectId` — a API completa o anexo uma vez. Fila cheia derruba a foto, nunca o
relato (`reportStopOccurrence` → `photo-dropped`, aviso `occurrencePhotoDropped`) — **exceto** quando
o tipo pede foto `required`: aí o toque inteiro vai por `reportAllOrNothing` e volta `size-limit`.
`test/driver-trip/stop-occurrence-photo.contract.ts`.

**Um botão só de ocorrência, por nota e sempre visível** (spec 218 RF-A5, D1–D4). "Registrar
ocorrência" (nota, só depois do "Cheguei", sem foto) e "Deu problema" (parada, `kind` fixo) viraram
"Ocorrência" em cada nota, antes e depois do "Cheguei" e também na nota já resolvida
(`DriverOccurrenceRegistrationForm.component.tsx` + `useOccurrenceRegistrationForm.hook.ts` +
`occurrenceRegistration.service.ts`). A lista é a de `GET /me/trips/current/occurrence-types`, com
tipos de nota e de parada juntos, cada um dizendo o que pede de foto (`attachmentMode`). Com
`required`, "Registrar" só habilita com a foto capturada no aparelho — o gate reaproveita
`listMissingProofFields` com um plano de campo único, nunca a captura do canhoto (`ProofCaptureFields`
levaria a foto ao comprovante). Quem escolhe a rota é o `flow` do tipo: `stop` → fila da parada com
`occurrenceTypeId` (o item antigo da fila, com `occurrenceKind`, ainda sai com `kind`); `document`
sem foto → `registerDocumentOccurrence` direto; `document` com foto → o item `documentOccurrence` da
spec 179. A prévia do aviso sai do `stopKind` do tipo. "Não entreguei" oferece só tipos de nota.
`test/driver-trip/occurrence-registration*.contract.ts`.

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

## Todo toque manda onde aconteceu (spec 196, ADR-0081)

Despacho, "Iniciar rota", ocorrência da parada e da nota levam `location` na fila. Toque que vai para a fila
grava a posição na hora (leitura de 8 s); toque direto (despacho e "Iniciar rota") espera a posição só
**3 s** (`readDirectTapLocation`, relógio da própria app) e segue com `location: null` se ela não vier — GPS
negado ou mudo nunca trava a entrega. O reenvio da foto da ocorrência da parada repete o corpo **sem**
`location`. Detalhe: docs/ai-context/frontend-driver.md § "Spec 196".

## O ajudante acompanha a viagem (spec 243)

`crewRole` na resposta de `/me/trips/current` (`'driver'` | `'helper'`, campo opcional no tipo porque
snapshot antigo no IndexedDB não traz — lê como `driver` por padrão). Com `helper`: aviso fixo
"Você acompanha esta viagem como ajudante", sem botões de ação que exigem `trip.report`. Fila offline
trata o 403 como recusado; com ajudante nenhum botão chama `report(...)`. Contrato:
`test/driver-trip/helper-crew-role.contract.ts`. Detalhe: docs/ai-context/frontend-driver.md
§ "Spec 243 — O ajudante acompanha a viagem" e ADR-0095.

## O ajudante sem resto (spec 244)

**T2:** `useLocationConsent` trata 403 em leitura como inaplicável; cartão some. Testes:
`test/driver-trip/location-consent-applicability.contract.tsx`.

## A exigência da ocorrência na rua (spec 246)

O botão "Registrar" da ocorrência de **nota** só habilita com o que o tipo **já resolvido para aquela nota** pede
(`document.occurrenceTypes` do snapshot, `occurrenceRequirements.service.ts`): observação, foto (até 5, com
`photoMinimumCount`), assinatura (`SignaturePad` só monta quando pedida) e produtos. O app **nunca** manda
`contractorId`/`recipientTaxId` (`security.md` §3); campo ausente lê como antes e a ocorrência de **parada** segue só com a foto.

A assinatura e as fotos extras entram no **mesmo item de fila** `documentOccurrence` (`extraPhotos`, `signature`), sobem pelo par
`occurrence-uploads` + `confirm` e vão no mesmo `POST` (`signatureObjectId`; uma foto = `attachmentObjectId`, mais de uma =
`attachmentObjectIds`, nunca os dois) — nada vai a `/proof`. ⚠️ Os itens da nota entram na spec 247 (abaixo). Fila offline do app antigo recebe 422 permanente
quando o tipo endurece. Detalhe: docs/ai-context/frontend-driver.md § "Spec 246".

## A devolução soma os itens (spec 247)

O snapshot traz os produtos de cada nota (código, descrição, unidade, quantidade, valor unitário), e o registro marca itens,
quantidade e valor pago **sem rede**. `occurrenceAmount.service.ts` é o **espelho** do cálculo da API (nenhuma app importa outra):
`bigint`, meio para cima por linha, valor pago vence a soma, `0` é valor; o contrato `occurrence-amount.contract.ts` roda os mesmos
casos da API e do painel. O app **nunca** manda preço nem unidade; o servidor lê da nota e recalcula. O número e o valor pago só
aparecem e só bloqueiam o "Registrar" conforme `requirements` do tipo **já resolvido para a nota** (não reimplementar a
precedência); modo `off` na hora do envio é descartado pelo servidor, não recusado. ⚠️ Máscara de centavos com teto de 12 dígitos
(o campo antigo descartava dígito em silêncio); total sem o que somar mostra "—". Medido só sintético: o snapshot passa de
256 KiB com dezenas de notas grandes, e login/fila offline reais nunca foram exercitados. Detalhe: docs/ai-context/frontend-driver.md
§ "Spec 247".

⚠️ **O ícone do tipo é catálogo fechado** (spec 255): `occurrenceTypeIcon.constant.ts` é cópia por valor da API; ampliar exige API (migration) + esta cópia + `icon.tsx` + painel. Detalhe: docs/ai-context/frontend-driver.md § "Spec 255".

## O envio que falha deixa rastro (spec 254)

Em produção um aparelho fez 60 `POST .../occurrence-uploads` sem nenhum `/confirm`: o PUT ao storage não terminava e o
temporizador de 30 s repetia o fluxo inteiro. Duas peças, ambas sem tocar regra de ocorrência:

- **Coletor de diagnóstico** (`clientDiagnostics.service.ts`, `getDriverDiagnostics()`): é **melhor esforço**. `record` é
  síncrono e nunca lança; o buffer guarda 50 eventos e `flush` manda até 20 por chamada a `POST /v1/me/client-diagnostics`.
  **Nunca entra na fila offline, nunca conta em `attempts` e nunca mede o próprio envio** (usa um cliente sem coletor).
  400 descarta o lote; 408/429/5xx/rede devolvem os eventos ao buffer. Campos são uma lista fechada (sem texto livre, URL,
  coordenada nem observação) e o sanitizador espelha o `.strict()` da rota. Passos: `trip_open`, `photo_reduce`,
  `upload_slot`, `upload_put`, `upload_confirm`, `report_send`. Publicar a API antes do driver.
- **Backoff só no temporizador** (`retryBackoff.service.ts`): `min(30 s × 2^(tentativas−1), 10 min)` com ±20 % de jitter. Item
  em espera **para** a drenagem `timer` sem contar tentativa; `immediate` ignora o espaçamento. Backoff nunca descarta item
  (227 D1).

Detalhe e medições: `docs/ai-context/frontend-driver.md` § "Spec 254".

## O feriado na cidade da parada (spec 252 T5.1b e T5.4, ADR-0100 §6)

`GET /me/trips/current` traz `stops[].holidayWarnings` (data civil, `cityIbgeCode`, `cityName` e `reasons[]` com escopo, origem e nome). A guarda
(`readHolidayWarnings`) o lê como **acessório**: ausente ou malformado vira lista vazia, **nunca** `DriverTripResponseError`, e ele viaja no snapshot do aparelho. O
`DriverHolidayNotice` (componente próprio, fora do `DriverStopCard` de 75 KB) mostra uma linha neutra por aviso — "Hoje é feriado em Campinas (…). Confirme com o cliente antes de ir." —
**sem toque, sem foco e sem esconder ou travar nenhuma ação** da parada (iniciar trajeto, chegar, entregar, ocorrência).

- **"Hoje" é o dia civil de São Paulo no relógio corrigido pelo desvio de `clockOffset.service.ts`**, não o fuso do aparelho; aviso de data anterior a hoje some, data malformada não vira texto.
- **Feriado nacional chega como chave estável** e o texto é do locale (`holidayWarning.national.*`); `NATIONAL_HOLIDAY_KEYS` é cópia por valor da API, presa por contrato.
- A nota do motorista não muda com feriado (CA16, contrato na API). Nada é importado do painel (ADR-0075).

Detalhe: `docs/ai-context/frontend-driver.md` § "Spec 252".

## Conversas (spec 260)

- **A tela não é copiada para o app.** `DriverConversations.page.tsx` só monta o `ParticipantConversations` de
  `@adatechnology/conversations-ui/participant` (import dinâmico) e liga rota, adapter, tema, rótulos e ícones. Layout, busca,
  protocolo, canais e bolhas vêm do pacote; cópia da tela é regressão (ADR-0075 §7). Fixe `conversations-ui` e
  `conversation-contracts` em versão exata, e atualize as três apps juntas.
- **Rotas por assunto, com queda.** O adapter (`driverConversationsApi.service.ts`) fala com
  `/me/trips/current/conversations[/:subjectType/:subjectId/{messages,messages/read,uploads}]` e a resposta já traz
  `awaitingDriver` e o eco do `clientMessageId` — não há mais remendo no app. `driverConversationRoutes.service.ts` cai nas rotas de
  ocorrência (`occurrence-conversations`, `occurrences/:id/**`) quando a nova responde 501 ou 404 **que não seja**
  `CONVERSATION_NOT_FOUND` (API ainda não implantada, ADR-0081 §9), e fica nelas até recarregar. Na queda, nota e viagem são
  recusadas (`SUBJECT_UNSUPPORTED`) e `awaitingParticipant` vira "tem não lida". Teste: `driver-conversations-fallback.contract.ts`.
- **Fila offline.** A `Idempotency-Key` é o `clientMessageId` em toda tentativa e em qualquer das duas rotas; a fila guarda
  `subjectType`/`subjectId` e reenvia pela rota do assunto. Assunto desconhecido é recusado antes de ir à fila.
- **Protocolo, canais e ícone.** O mapper repassa `protocol`, `channels` (só os que o pacote conhece) e `iconName` **se a API
  mandou** — sem campo, nada aparece, nunca se inventa. `renderDriverSubjectIcon` mapeia o catálogo da spec 255 para o `<Icon>` do
  app e devolve `null` fora dele (o pacote usa o ícone do grupo). Rótulos novos do SDK entram em `conversation.locale.json` **e**
  `.en`; ao subir o pacote, confira as chaves de `participantLabels`.
- **Demonstração.** `scripts/driver-preview-conversations*.ts` serve as duas famílias de rota; reinicie a API de demonstração
  (porta 53901) depois de mudar o script.
