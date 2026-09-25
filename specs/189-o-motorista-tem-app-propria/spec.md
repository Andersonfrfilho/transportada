# Feature 189 — O motorista tem app própria

Decisão: `docs/adr/0075-o-motorista-tem-app-propria.md` (revisa a ADR-0050 §1 e aplica a §5).

## Specs do assunto lidas

Cada uma foi conferida no `tasks.md`, no `evidence.md` e no código em 2026-09-25.

- **057**: o PWA `/minha-viagem`.
  - D1: `/me/trips/current` sem id.
  - D3: uma leitura de posição por confirmação.
  - D5: fila em IndexedDB. O "cache da viagem na abertura" **não existe** no código.
- **063**: o portal. A D7 cria o consentimento `PUT /me/location-consent`, que o PWA nunca chamou e
  que não tem leitura.
- **082 (app nativo)**: o nativo em `transportada-mobile`. Não embala o PWA.
- **082 (campo, fila e assinatura)**: a base atual do módulo.
  - Assinatura com `screen.orientation.lock` no Android e CSS no iOS.
  - Blob na fila (30 anexos e 50 MB, descarte em 7 dias).
  - Tela de pendentes e despacho pelo motorista.
- **147**: código de confirmação por Web Push. Exige `injectManifest`. Esta spec a emenda: o push e o
  SW passam a ser do app do motorista.
- **159**: foto obrigatória com `proofPending` e tela de fotos pendentes.
- **179**: foto na ocorrência de nota.
  - Fases 1–2 fechadas (T203 recusa `required` sem anexo).
  - Fases 3–4 abertas. Esta spec as emenda para `apps/frontend-driver`.
- **184**: fotos da carga, só pelo escritório. Não toca o motorista.
- **185**: sem "Conferir carga" (ADR-0074). A cópia herda isso.
- **188**: o convite leva à ativação no painel, e o painel redireciona.

A 182 (ocorrência antes do despacho) já está em `origin/staging` (`8a3135a9d`) e não toca o PWA.

## Problema e resultado

O app de entregas do motorista é a rota `/minha-viagem` do painel. Isso causa três problemas:

- instalar o PWA instala o escritório (manifesto "TransportAdA", `start_url: '/'`, sem `scope`);
- no iPhone, o Web Push da 147 só chega a PWA instalado;
- no 3G, o motorista baixa a casca de um produto de escritório.

Resultado desta feature:

- `apps/frontend-driver` em `motorista.<zona>` (local na `53200`), com manifesto, `sw.ts`
  (`injectManifest`), CSP, HSTS, `Dockerfile`, serviço Railway, Playwright e o sino, todos próprios.
- O motorista entra pelo mesmo Keycloak (`transportada-spa`, origem nova), com SSO entre `app.` e
  `motorista.`.
- A app abre sem rede, com a última viagem do mesmo usuário, e aceita toques que vão para a fila.
- O painel manda o motorista para a casa nova por um **interruptor** (`VITE_DRIVER_APP_URL`). Quem tem
  fila antiga vê só a tela de pendências, até esvaziar.
- Depois da virada, a app ganha o seletor de duas viagens, a janela de entrega e o consentimento de
  rastreamento.
- O módulo antigo sai quando o beacon de uso legado zerar por 14 dias.

## Fora do escopo

- **Spec 179 fases 3–4 e spec 147.** Rodam depois, na app nova. Esta spec só **emenda** o `plan` e o
  `tasks` delas, e deixa prontos os pontos de extensão (ADR §8).
- **Background Sync** e drenagem com a app fechada (ADR §8).
- **Web Push no painel.** O painel fica com o sino, e migrar o SW dele é spec futura.
- **Navegação guiada** (ADR-0059, nativo).
- **Adotar shadcn/Tailwind** (ADR §7).
- **HSTS nas outras três apps.**
- **Convite apontando direto para `motorista.`.**
- **O app nativo.**

## Histórias priorizadas

### P1 — Instalar é instalar a viagem

**Given** um motorista em `motorista.staging.<zona>` no Chrome do Android **When** ele instala o app
**Then** o ícone se chama "Viagem" e abre em tela cheia na viagem dele.

**Given** o mesmo no Safari do iPhone, com "Adicionar à Tela de Início" **Then** o ícone abre a app do
motorista.

### P1 — Sem sinal, a viagem continua na mão

**Given** um motorista que abriu a app com rede hoje **When** ele perde o sinal e reabre a app
**Then** vê a viagem com "dados de HH:MM" e pode tocar "Entreguei". A entrega vai para a fila, e o
login só é pedido quando a rede voltar.

**Given** o mesmo aparelho **When** outra conta entra **Then** a viagem e a fila da conta anterior
não aparecem.

### P1 — A mudança de casa não perde entrega

**Given** o interruptor ligado, um motorista com a fila antiga vazia **When** ele abre `app.<zona>/`
ou `/minha-viagem` **Then** vai para `motorista.<zona>`. Se ele abriu pelo ícone antigo instalado, vê
a tela "Instale o app novo".

**Given** 2 entregas na fila antiga **Then** ele vê só a tela de pendências, que envia o que sobe. Uma
entrega recusada mostra "Descartar", com o aviso "fale com o escritório". Com a fila vazia, aparece
"Ir para o app novo".

**Given** o interruptor desligado **Then** `/minha-viagem` funciona como hoje.

### P1 — A versão nova não interrompe a assinatura

**Given** o motorista assinando **When** sai uma versão nova **Then** nada recarrega. A versão nova
vale quando ele tocar "Atualizar" sem captura aberta, ou na próxima abertura.

### P2 — Duas viagens, as duas visíveis (depois da virada)

**Given** um agregado com duas viagens ativas **Then** vê um seletor. A viagem padrão é a mais antiga
em rota, senão a mais antiga. O Perfil mostra a placa da escolhida.

### P2 — A parada diz a janela (depois da virada)

**Given** uma parada com janela 08:00–12:00 **Then** o cartão mostra "Janela 08:00–12:00".

### P2 — Rastreamento com consentimento (depois da virada)

**Given** um motorista que nunca consentiu **Then** o Perfil mostra o interruptor desligado, com a
finalidade, quem vê e por quanto tempo. **When** ele liga, com a viagem em rota e a app aberta
**Then** a posição sobe no máximo a cada 60 s, e um indicador aparece na tela da viagem. **When** ele
desliga **Then** nada mais sobe.

### P3 — Todo toque cabe no dedo

**Given** 375 px **Then** nenhum elemento interativo tem menos de 44×44 px.

## Requisitos funcionais

- **RF1** `apps/frontend-driver`: React 19, Vite 7, TanStack Query e i18n (pt-BR e en), porta `53200`.
  - CSP da ADR §4: `connect-src` só com a própria origem, a API e o Keycloak; `img-src` com `'self'`, `blob:` e a API.
  - Headers da ADR §4, com HSTS.
  - `server.ts` fail-closed sem CSP.
- **RF2** Manifesto da ADR §5. O SW é `injectManifest` com `src/sw.ts` (precache, fallback de
  navegação, `clientsClaim`, mensagem `SKIP_WAITING`), sem `sync` e sem `runtimeCaching` de API. O
  `registerType` é `'prompt'`, e a atualização só vale com o registro de capturas vazio.
- **RF3** Login por `transportada-spa`, com PKCE `S256`.
  - Callback em `<origem>/auth/callback`; o logout volta à origem.
  - `403` da API (sem `trip.read`): "esta conta não é de motorista; use o painel da transportadora".
  - `isRegisteredDriver: false`: a tela que o módulo já tem.
- **RF4** O módulo e as dependências da tabela da ADR §7 são copiados, com o cabeçalho "Cópia por
  valor". Nenhum import de outra app.
- **RF5** Seções com caminho (`/`, `/perfil`, `/fila`, `/fotos`, `/notificacoes`), com `pushState` e
  `popstate`, sem biblioteca de roteamento.
- **RF6** Sem rede antes do Keycloak.
  - Antes do `keycloak.init`, uma sonda ao `openid-configuration` do realm (`no-store`, cerca de 5 s)
    decide.
  - Sem resposta, e com snapshot do último usuário, a app renderiza o snapshot só para leitura, com
    toques enfileiráveis.
  - A autenticação fica adiada ao `online`, e só roda com o registro de capturas vazio. O token só é
    exigido na drenagem.
- **RF7** Snapshot em IndexedDB com a chave `SHA-256(sub)`.
  - É descartado quando outro `sub` autentica, depois de 24 h de `savedAt`, quando todas as viagens
    estão concluídas, e no "Sair".
  - Os itens da fila levam o hash, e a drenagem só envia os do `sub` autenticado.
- **RF8** Pendência é uma função pura só: eventos não recusados, mais anexos no prazo, mais recusados
  não descartados. `drainable` é o total sem os recusados.
  - A drenagem roda em `online`, na abertura, em `visibilitychange` visível e em `pageshow`.
  - Há também um temporizador de 30 s, só com `drainable > 0`.
- **RF9** O sino (`@adatechnology/notification-ui` e `-client`), com o cliente do token copiado, leva
  a `/notificacoes`. O alvo de toque é de 44 px.
- **RF10** Painel: o interruptor `VITE_DRIVER_APP_URL` (ADR §6).
  - `resolveDriverAppRedirect` puro devolve `stay`, `redirect`, `install-screen` ou `pending-screen`.
  - A tela de pendências traz "Descartar" com aviso, para os recusados, e "Ir para o app novo" com a
    fila vazia, sem redirecionar no meio de uma captura.
  - O beacon `/_driver-legacy-served` sai só em `pending-screen`. A rota aceita só o valor enumerado,
    sempre responde `204` e não loga valor inválido.
- **RF11** `DriverReturnReason` e `DRIVER_RETURN_REASONS` vão para `modules/trip/shared/` do painel. A
  cópia da app é vigiada por `catalog-parity`, contra a API.
- **RF12** Seletor de viagem com função pura (ADR §8, ordem `createdAt` ascendente da API).
- **RF13** A janela de entrega aparece no cartão da parada.
- **RF14** API: `GET /me/location-consent` (`trip.report`) → `{ data: { acceptedAt: string | null } }`.
  Sem motorista, `GET` e `PUT` respondem `409 DRIVER_NOT_REGISTERED`. A rota entra no OpenAPI.
- **RF15** Interruptor de consentimento, com o texto de finalidade, quem vê e retenção.
  - Com consentimento e a viagem em rota, `watchPosition` com envio no máximo a cada 60 s, só com a
    app visível.
  - Um indicador na tela da viagem fica visível enquanto a posição sobe.
  - Os envios param ao desligar, ao sair da rota e ao esconder a app.
- **RF16** Infra (plan D9): `spa-redirect-uris.json`, realm local, reconciliação com pós-logout,
  `railway.ts`, filtro de mudança, `deploy.yml`, `mark-deployed.sh`, `package.json` da raiz, sete
  `Dockerfile`, Makefile, `.env.example`, `.env` local e portas em `ci.yml:109`.

## Requisitos não funcionais

- **Precache ≤ 1,5 MB**, sem `opencv`, `background-removal`, `canhoto-ocr`, `maplibre`, `tesseract` ou
  `pdfjs`. É gate de build: `vite build && bun test test/dist.contract.test.ts`.
- **Nenhum terceiro em `connect-src`.** Um contrato varre `https://` no código.
- **Bypass de fumaça** só com a flag **e** hostname local, com `VITE_SMOKE_AUTH_BYPASS` em
  `SOMENTE_EM_TESTE`.
- **Sem PII** em log, URL e beacon. O snapshot fica só no IndexedDB da origem, com dono e prazo, e
  está registrado em `docs/SECURITY.md`.
- **Alvo de toque ≥ 44 px.**

## Casos extremos e falhas

- **Aparelho com fila antiga que nunca esvazia:** o beacon nunca zera, e a remoção espera. Os recusados
  podem ser descartados pelo motorista, com ciência.
- **Interruptor ligado por engano antes do domínio:** rollback removendo a variável e reimplantando o
  painel.
- **Ícone antigo instalado:** a tela "Instale o app novo" aparece, em vez de uma aba solta.
- **Sessão expirada offline:** o snapshot e a fila seguem. O login só é pedido com rede, e a fila não se
  perde.
- **Outro usuário no mesmo aparelho:** snapshot descartado. A fila do anterior não é enviada com o
  token do novo e aparece como "pendências de outra conta", com "Descartar" e aviso.
- **Snapshot com mais de 24 h:** descartado. A tela sem rede diz "sem viagem salva; conecte-se".
- **Consentimento ligado e GPS negado:** "posição indisponível no aparelho", e nada sobe.
- **Duas abas:** a drenagem é única por aba, e a `Idempotency-Key` resolve a repetição.
- **Atualização disponível durante uma captura:** adiada até o registro esvaziar.
- **Logout em `app.`:** `motorista.` descobre no próximo refresh do token (ADR §2).

## Critérios de aceite

- **CA01** `make check` verde a cada task, na ordem do `tasks.md`. `make dev` serve
  `http://localhost:53200/manifest.webmanifest` com os campos da ADR §5.
- **CA02** Contratos da app passam:
  - CSP, com `img-src` contendo a origem da API;
  - headers, com HSTS;
  - `vite-build-args`, com `SOMENTE_EM_TESTE`;
  - faixa de ambiente, manifesto e SW `injectManifest` sem `sync`;
  - `registerType: 'prompt'` e ponto seguro;
  - orçamento de precache no build.
- **CA03** Login local na `53200` com conta de papel `driver`, e o logout volta à `53200`. Sem
  `trip.read`, a tela de `403`. Com `isRegisteredDriver: false`, a tela do módulo. SSO: com sessão em
  `53000`, a `53200` entra sem senha.
- **CA04** Os **20** contratos de `test/driver-trip/` (os 21 menos `office-execution`) rodam na app.
- **CA05** Offline (Playwright): (a) `context.setOffline(true)`; (b) sinal fraco, com `onLine`
  verdadeiro e `page.route('**/realms/**', (route) => route.abort())`. Nos dois: abrir com rede, recarregar, ver a viagem
  com "dados de HH:MM", tocar "Entreguei" e ver o item na fila. Com a rede de volta, a autenticação
  acontece e a fila drena.
- **CA06** Troca de usuário descarta o snapshot e não envia a fila do anterior. Snapshot com mais de
  24 h é descartado.
- **CA07** Drenagem em `visibilitychange` e pelo temporizador, e o temporizador para com
  `drainable = 0`.
- **CA08** O sino aparece, leva a `/notificacoes` e tem 44 px.
- **CA09** A atualização não recarrega com captura aberta.
- **CA10** Painel:
  - sem a variável, `/minha-viagem` é servida como hoje;
  - com a variável, `redirect`, `install-screen` e `pending-screen` como na ADR §6;
  - "Descartar" pede confirmação;
  - o beacon sai só em `pending-screen`, e valor inválido não gera log.
- **CA11** Staging: `motorista.staging.<zona>` no ar, login e logout, `deploy-api` verde com a
  reconciliação e o `frontend-origins-check`, e instalação no Android e no iPhone (humano).
- **CA12** Seletor de duas viagens e janela de entrega.
- **CA13** `GET /me/location-consent`: nulo, aceito, retirado e `409` sem motorista, com contrato e
  integração. Outra empresa não vê.
- **CA14** Interruptor com o texto, pings a no máximo 1 a cada 60 s (relógio falso), o indicador
  visível, e nada depois de desligar.
- **CA15** Todo interativo com ≥ 44×44 px em 375 px.
- **CA16** Prints em 375 px e 768 px, claro e escuro, em `prints/`.
- **CA17** Remoção só com zero beacons em 14 dias em produção.

## Dúvidas

Nenhuma aberta. As decisões do usuário de 2026-09-25 (fila antiga, Web Push, sino) estão na ADR-0075.
