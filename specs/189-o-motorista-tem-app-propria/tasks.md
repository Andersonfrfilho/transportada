# Tasks — Feature 189

## Como executar

- Uma task por vez, num worktree próprio (`make worktree NAME=spec-189`).
- Cada task fecha com typecheck, testes e commit isolado, e registra a evidência em `evidence.md`.
- O teste de aceite ou de contrato vem **antes** da implementação.
- Task que mexe em `test/integration/**` só fecha com o comando de integração.
- Task que muda `package.json` roda `bun install` e commita o `bun.lock`.
- **Toda task cujo aceite diz `make check` verde fecha verde na ordem escrita.** Nenhuma depende de
  task posterior.

**👤 = ação humana.** O executor para, descreve o passo exato, espera o "feito" e confere o efeito.

## Como o realm chega ao Keycloak

É **automático**. O job `deploy-api` roda `.github/scripts/keycloak-reconcile.sh` em todo deploy
(`deploy.yml:230-234`), com as origens de `realm/spa-redirect-uris.json`. A T2.2 soma o pós-logout.

**Não** é automático:

- o `FRONTEND_ORIGIN` da API;
- o `railway config apply`;
- o domínio e o DNS;
- o interruptor `VITE_DRIVER_APP_URL` do painel.

## Ordem

As Fases 1 a 6 levam o motorista para a casa nova com **paridade** e segurança do campo: abrir sem
rede, fila com dono, atualização segura, 44 px e o sino. A Fase 7, com seletor, janela e
consentimento, vem **depois da virada** e não a segura.

## Fase 1 — A app existe, vazia e servida

> 🤖 Modelo: `sonnet` · T1.2 🧠 `opus` (SW `injectManifest`, `registerType: 'prompt'` e orçamento de
> precache)

- [x] **T1.1** Contratos da app, antes do código, em `apps/frontend-driver/test/shared/*.contract.ts`,
      com o entrypoint `test/shared.contract.test.ts`:
  - `content-security-policy`:
    - `connect-src` só com `'self'`, a API e o Keycloak;
    - `img-src 'self' blob: <origem da API>`;
    - varredura de `https://` em `src/`, aceitando só `NON_FETCH_ORIGIN`;
  - `security-headers`:
    - `Permissions-Policy: camera=(self), geolocation=(self), microphone=()`;
    - `Strict-Transport-Security: max-age=31536000`;
    - o servidor não sobe sem CSP;
    - `sw.js` com `no-cache`;
  - `vite-build-args`: cópia do contrato do painel, com `SOMENTE_EM_TESTE`;
  - `environment-banner`: paridade de texto com o portal;
  - `manifest`: os campos da ADR-0075 §5;
  - `service-worker`:
    - `injectManifest` e `registerType: 'prompt'`;
    - `precacheAndRoute`, fallback de navegação e `clientsClaim`;
    - `skipWaiting` só por `SKIP_WAITING_MESSAGE`;
    - **nenhum** listener de `sync`;
  - `test/dist.contract.test.ts`:
    - o manifesto emitido tem os campos;
    - o precache soma ≤ 1,5 MB;
    - não há `opencv`, `background-removal`, `canhoto-ocr`, `maplibre`, `tesseract` nem `pdfjs`.

  **Aceite:** os contratos existem e falham pela razão certa.

- [x] **T1.2** 🧠 Esqueleto (plan D1 e D2), num **único commit** com as linhas de "T1.2" da tabela D9:
  - `package.json` (`build` = `vite build && bun test test/dist.contract.test.ts`), `tsconfig.json`,
    `eslint.config.mjs` e `index.html`;
  - `vite.config.ts` (53200, `injectManifest`, `prompt`), `src/sw.ts` e `server.ts`;
  - `Dockerfile`, ícones (192, 512, maskable 512, apple-touch 180) e `offline.html`;
  - `main.tsx` com uma tela provisória, CSP, `EnvironmentBanner` e `environment.config.ts`;
  - `COPY apps/frontend-driver/package.json` nos seis `Dockerfile` de app e no novo;
  - `changed-targets.sh` com o alvo `driver` e `apps/frontend-driver/` no alvo `api` (`:12-16`);
  - `pipeline-change-filter.contract.ts` (`:47`, `:194`, `:204`).

  **Aceite:**
  - T1.1 verde;
  - `bun run --cwd apps/frontend-driver check` verde;
  - `make check` verde, com `dockerfile-workspace` e `pipeline-change-filter` verdes;
  - o tamanho do precache registrado no `evidence.md`.

- [x] **T1.3** Workspace e pipeline (linhas de "T1.3" da D9):
  - `package.json` da raiz, com os scripts encadeando a app;
  - Makefile:
    - `FRONTEND_DRIVER_PORT := $(or $(shell sed …),53200)`;
    - `dev` sobe a app e a mata no `cleanup`;
    - `smoke` confere `/` e `/manifest.webmanifest`;
  - `.env.example`, com as três variáveis;
  - `.env` local, com as três variáveis, pelo procedimento da plan D7, sem imprimir o conteúdo;
  - `ci.yml:109`, com `53112,53200`;
  - `deploy.yml`:
    - a saída `driver` no job `changes` (`:105`);
    - `FRONTEND_DRIVER` → `"frontend-driver"` no passo `apps` (`:129-150`);
  - `mark-deployed.sh` com `driver`, e `DRIVER_CHANGED` no job, **sem** o job de deploy. O marco
    fica parado, e isso é esperado.

  **Aceite:**
  - `make check` verde;
  - `make dev` serve `http://localhost:53200/manifest.webmanifest`, com a resposta no `evidence.md`;
  - `bash -n` nos dois scripts.

## Fase 2 — Entrar e sair pelo Keycloak

> 🤖 Modelo: `sonnet`

- [x] **T2.1** Contratos:
  - `test/keycloak-realm.contract.test.ts:246-266`, com a `53200` em `redirectUris`, `webOrigins` e
    `post.logout.redirect.uris`;
  - o harness `runReconcile` (`keycloak-realm.contract.ts:178-185`) estendido:
    - a entrada ganha `spaClient`, com `attributes`;
    - `clientWrites` passa a registrar `attributes`;
    - o `GET` depois do `PUT` reflete o gravado;
  - três casos novos de `runReconcile` sobre `clientWrites`:
    - o corpo preserva `pkce.code.challenge.method`;
    - o corpo contém o pós-logout novo;
    - o pós-logout que já existia continua;
  - a verificação depois do `PUT` reprova quando `pkce` não é `S256`.

  **Aceite:** vermelhos pela razão certa.

- [x] **T2.2** `realm/transportada-local-realm.json` com a `53200`, e `keycloak-reconcile.sh` com a
      plan D7 (`$merged.attributes` completo e o cálculo de faltas com o pós-logout).
      `spa-redirect-uris.json` ainda **não** muda.

  **Aceite:** T2.1 verde; `make config` e `make check` verdes.

- [x] **T2.3** Autenticação na app (plan D3 e D4):
  - `KeycloakAuthProvider`, `LoginIdentifier` e `loginHintClient` copiados do portal;
  - `smokeAuthBypass.service.ts`, com as duas travas;
  - a tela de `403` para quem não tem `trip.read`.

  Os testes de `frontend-client/test/keycloak-auth-provider.test.ts` e `login-hint-client.test.ts`
  vêm copiados e adaptados.

  **Aceite:**
  - login local na `53200` com uma conta `driver`, criada pelo convite local da spec 188, com o passo
    no `evidence.md`;
  - o logout volta à `53200`;
  - conta de escritório vê o `403`;
  - com sessão na `53000`, a `53200` entra sem senha (SSO).

## Fase 3 — O módulo muda de casa, com o campo seguro

> 🤖 Modelo: `sonnet` · T3.1 `haiku` · T3.3a 🧠 `opus` (boot sem Keycloak, dono do snapshot e da
> fila)

- [x] **T3.1** Copiar os **20** contratos de `apps/frontend-transportada/test/driver-trip/` (os 21
      menos `office-execution`), inclusive o `catalog-parity`, que compara com a API. O entrypoint
      `test/driver-trip.contract.test.ts` entra no `package.json`, e entra também o contrato do
      cabeçalho "Cópia por valor".

  **Aceite:** rodam e falham só por import ausente.

- [x] **T3.2** Copiar o código da tabela da ADR §7 (sem o sino, que é a T3.3):
  - cada arquivo com o cabeçalho;
  - na cópia, o comentário de `driverLocation.service.ts` atualizado (plan D3);
  - o `eslint` barra import de `../frontend-*` e `@/` que não resolva dentro da app.

  **Aceite:** T3.1 verde; o `check` da app e o `make check` verdes.

- [x] **T3.3** Casca (plan D4):
  - `driverRoute.service.ts`, com contrato para as cinco seções e `popstate`;
  - `main.tsx` com `DriverShellHeader`, a seção e `DriverBottomBar`, sem layout de escritório;
  - `isRegisteredDriver: false` mostra a tela do módulo;
  - "Instalar" no Android e a instrução no iOS, com contrato;
  - **o sino**: `@adatechnology/notification-ui` e `-client` nas versões do painel,
    `notificationClient.service.ts` copiado, `NotificationProvider`, `NotificationBell` no cabeçalho
    e `/notificacoes` com a lista do pacote.

  Registrar no `evidence.md`:
  - o que o pacote exporta;
  - a versão instalada. O painel usa `-client` 0.1.0-rc.3 e `-ui` 0.1.0-rc.9.

  O stream é `fetch` com `ReadableStream` para `${apiBaseUrl}/v1/notifications/stream`, e a CSP não
  muda.

  **Aceite:** contratos verdes; o sino aparece no `make dev`.

- [x] **T3.3a** 🧠 Boot sem rede, com o snapshot e a fila com dono (plan D4 e D5). Contratos antes:
  - `probeIdentityProvider`: `fetch` do `openid-configuration` com `cache: 'no-store'` e timeout de
    ~5 s;
  - `resolveBootMode({ isReachable, snapshot, now })`: alcançável, inalcançável com snapshot válido e
    inalcançável sem snapshot;
  - ao voltar a rede, o `keycloak.init` só roda com `captureRegistry.isIdle()`. Com captura aberta,
    espera o `close`;
  - o store `trip-snapshot`, com a chave `SHA-256(sub)` e o ponteiro `last`, descartado por outro
    `sub`, depois de 24 h, com todas as viagens concluídas e no "Sair";
  - a drenagem filtra por `subHash`, e os itens de outro `sub` aparecem como "pendências de outra
    conta", com "Descartar".

  Implementação:
  - `indexedDbQueue.service.ts` na versão 3. A origem é nova e nasce sem dados, então não há
    migração;
  - `useDriverTrip.hook.ts:104` com `initialData`;
  - `main.tsx` com a sonda antes do `keycloak.init` e o boot adiado ao `online`;
  - a entrada em `docs/SECURITY.md`.

  **Aceite:** contratos verdes; `make check` verde. O Playwright desta task está na T4.1 (CA05 e CA06).

- [x] **T3.4** Pendência e drenagem (plan D5):
  - contrato de `countPending`, com `drainable`, `rejected` e `total`, e anexo vencido fora da conta;
  - contrato dos gatilhos: `visibilitychange`, `pageshow` e temporizador só com `drainable > 0`, que
    para quando zera;
  - a implementação em `useDriverTrip.hook.ts:235-250`.

  **Aceite:** contratos verdes.

- [x] **T3.5** Atualização em ponto seguro (plan D2):
  - contrato de `captureRegistry` (abrir, fechar, `isIdle`) e da regra de aplicação (abertura, toque
    com `isIdle`, adiamento);
  - câmera, recorte, assinatura e diálogo de ocorrência registram no `captureRegistry`;
  - aviso "Nova versão — Atualizar".

  **Aceite:** contratos verdes.

- [x] **T3.6** Alvo de toque: contrato de CSS. Nenhum `min-height` ou `height` interativo abaixo de
      `2.75rem`, e nada de `--control-height-compact` na app. O sino está incluído.

  **Aceite:** verde.

## Fase 4 — Playwright da app

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** Montar o Playwright da app:
  - `@playwright/test` 1.58.2 (a versão do painel e da landing) e `playwright.config.ts`, com o preview
    na `53112` e o bypass só em localhost;
  - `driver-trip-smoke.helper.ts` copiado;
  - os testes do motorista de `apps/frontend-transportada/test/responsive.smoke.spec.ts:1190-1313` e
    os prints do motorista de `spec-159-prints.smoke.spec.ts` copiados para a app. No painel eles
    saem na T5.4;
  - os novos:
    - CA05: abrir com rede, recarregar sem rede, ver a viagem, "Entreguei" na fila, rede de volta,
      autenticação e drenagem, em dois cenários:
      - `context.setOffline(true)`;
      - sinal fraco: `onLine` verdadeiro e `page.route('**/realms/**', (route) => route.abort())`;
    - CA06 (troca de usuário), CA07 (drenagem), CA08 (sino), CA09 (atualização adiada) e CA15 (44 px
      em 375 px);
  - `make smoke` passa a rodar o Playwright da app. É assim que ele entra na CI, pelo
    `ci.yml:156`;
  - o job `integration` do `ci.yml` instala o Chromium uma vez só, servindo as três apps.

  **Aceite:** `make smoke` verde local; o job de integração da CI verde.

## Fase 5 — O painel manda o motorista para a casa nova (desligado até a Fase 6)

> 🤖 Modelo: `sonnet` · T5.2 🧠 `opus`, com `code-reviewer` (`opus`) antes do push

- [x] **T5.1** Contratos no painel:
  - `readDriverAppUrl`: ausente e vazia devolvem `undefined` sem lançar, e a presente passa por
    `readTrustedUrl`;
  - `resolveDriverAppRedirect`:
    - **sem a variável, `stay`, e o painel serve `/minha-viagem`**;
    - fila vazia, `redirect`;
    - `standalone`, `install-screen`;
    - pendência, `pending-screen`;
    - escritório, `stay`;
  - paridade de `countPending` com a app, pelo texto de fonte;
  - o beacon:
    - a fonte chama `sendBeacon` **só** em `pending-screen`;
    - a rota do `server.ts` do painel lê no máximo ~32 bytes e sempre responde `204`;
    - valor válido loga a linha sem usuário;
    - valor inválido ou corpo grande não loga;
  - `test/shared/vite-build-args.contract.ts` com `VITE_DRIVER_APP_URL` no `Dockerfile`.

  **Aceite:** vermelhos.

- [ ] **T5.2** 🧠 Implementação (plan D6):
  - `identityEnvironment.config.ts`, `driverAppRedirect.service.ts` e `pendingQueue.service.ts`;
  - `main.tsx`, a tela de pendências e a tela "Instale o app novo". O painel não tem registro de
    capturas;
  - o beacon e a rota no `server.ts`;
  - o `ARG` no `Dockerfile` e `preserve()` no bloco do painel em `railway.ts`.

  `code-reviewer` (`opus`) revisa antes do push.

  **Aceite:**
  - T5.1 verde;
  - `make check` verde;
  - publicado em staging **sem** a variável, com `/minha-viagem` igual a antes (print no
    `evidence.md`).

- [ ] **T5.3** `DriverReturnReason` e `DRIVER_RETURN_REASONS` para
      `modules/trip/shared/tripReturnReason.types.ts`, com os quatro imports trocados e o reexport em
      `driverTrip.types.ts`.

  **Aceite:** `make check` verde.

- [ ] **T5.4** Smokes do painel (plan D6):
  - `authenticated-smoke.helper.ts:69-74`;
  - o bloco do motorista de `responsive.smoke.spec.ts` (até `~1313`) sai. No lugar entram
    redirecionamento, pendências com a fila semeada e "Descartar", e instalação em `standalone`;
  - não há smoke "sem a variável". O Playwright do painel faz um build só, e a CI usa o
    `.env.example`, que tem a variável. O caso fica no contrato da T5.1;
  - os prints do motorista saem de `spec-159-prints.smoke.spec.ts`.

  **Aceite:** `make smoke` verde.

## Fase 6 — A virada: staging, depois produção

> 🤖 Modelo: `sonnet` · 👤 onde marcado

- [ ] **T6.1** Contratos:
  - `service-naming.contract.ts:67` (a tabela de `docs/spec/railway.md`);
  - `keycloak-redirect-uris.contract.ts:25`, com `'motorista.'`.

  **Aceite:** vermelhos. O de redirect URIs fecha na T6.4.

- [ ] **T6.2** O serviço `driver` em `.railway/railway.ts` (plan D9), com as `VITE_*` literais.
      Os valores vêm de `railway variables --service client --environment <env> --json`, filtrando só
      as `VITE_*`, sem imprimir nada além delas. A linha entra em `docs/spec/railway.md`.

  **Aceite:** `service-naming` verde; `railway config plan` de staging **sem nenhum `destroy`**, colado
  no `evidence.md`.

- [ ] **T6.3** 👤 **Staging, Railway.** O usuário:
  1. aplica `railway config apply` em staging;
  2. cria o domínio `motorista.staging.fernandes-transportadora.com.br`;
  3. cria o CNAME e o TXT `_railway-verify`. O TXT sai de `railway domain status --json`;
  4. acrescenta ao `FRONTEND_ORIGIN` da API de staging o domínio próprio e o domínio gerado.

  O executor informa o domínio gerado e espera o "feito".

- [ ] **T6.4** Num **mesmo push**, com gates verdes:
  - o job `deploy-driver` (`needs: [target, changes, gate, deploy-api]`) e o `DRIVER_RESULT` no
    `mark-deployed`;
  - `deploy-driver` no teste "api e apps de cliente dependem do gate" de
    `pipeline-change-filter.contract.ts:228-236`;
  - as origens de staging em `spa-redirect-uris.json`.

  **Aceite:**
  - `deploy-api` verde, com "Reconciliar realm" e "Conferir as origens do frontend";
  - `deploy-driver` verde;
  - login e logout em `motorista.staging.<zona>`;
  - `keycloak-redirect-uris` verde;
  - o pós-logout conferido por `scripts/keycloak-client-origins.py staging show`.

- [ ] **T6.5** 👤 **Ligar o interruptor em staging.** O usuário define `VITE_DRIVER_APP_URL` no
      serviço do painel de staging e reimplanta o painel.

  **Aceite** (o executor confere):
  - `app.staging.<zona>/minha-viagem` redireciona;
  - com fila semeada, aparece a tela de pendências;
  - o beacon aparece em `railway logs`.

  **Rollback:** remover a variável e reimplantar.

- [ ] **T6.6** 👤 **Aparelhos reais em staging.** O usuário:
  - instala no Android e no iPhone;
  - abre com rede, perde o sinal, reabre, toca "Entreguei" e volta a ter sinal;
  - abre o ícone antigo e vê a tela "Instale o app novo".

  O executor registra no `evidence.md`.

- [ ] **T6.7** 👤 **O usuário aprova produção.** Sem aprovação, a spec para aqui.
- [ ] **T6.8** 👤 **Produção, Railway.** Os passos da T6.3, com
      `motorista.fernandes-transportadora.com.br` e o `FRONTEND_ORIGIN` de produção.
- [ ] **T6.9** As origens de produção em `spa-redirect-uris.json`, e o PR de produção (a `main` é
      protegida e exige os dois status checks).

  **Aceite:** `deploy-api` e `deploy-driver` de produção verdes; login em `motorista.<zona>`.

- [ ] **T6.10** 👤 **Ligar o interruptor em produção**, como na T6.5. A data da virada fica no
      `evidence.md`, e é o início da medida da T10.1.

## Fase 7 — Depois da virada: o que não é paridade

> 🤖 Modelo: `sonnet` · T7.4 🧠 `opus` (rota nova na API)

Cada task publica pelo fluxo normal: staging direto e produção por PR.

- [ ] **T7.1** Contrato de `driverTripSelection.service.ts`:
  - uma viagem;
  - duas, com uma em rota;
  - duas em rota: a mais antiga;
  - nenhuma em rota: a mais antiga;
  - a escolhida sumiu da lista.

  **Aceite:** vermelho.

- [ ] **T7.2** `DriverTripSelector.component.tsx`, com `trips[0]` trocado em
      `DriverTripWorkspace.page.tsx` e `DriverProfile.page.tsx` e a escolha guardada na sessão.

  **Aceite:** T7.1 verde; Playwright com duas viagens e o Perfil com a placa da escolhida.

- [ ] **T7.3** Janela de entrega: contrato do formatador (os dois lados, um lado, nenhum) e o texto no
      `DriverStopCard`, em pt-BR e en.

  **Aceite:** verde; aparece no Playwright.

- [ ] **T7.4** 🧠 API `GET /me/location-consent` (plan D8).
  - Antes: `git fetch && git rebase origin/staging` e `bun install --frozen-lockfile`.
  - Contrato de rota: esquema, `trip.report` e `409 DRIVER_NOT_REGISTERED`. O `PUT` também é
    conferido e, se preciso, alinhado.
  - Integração: nulo, aceito, retirado, `409` e outra empresa.
  - Use case, rota e OpenAPI.

  **Aceite:** os dois comandos da API verdes, de dentro de `apps/api-transportada`, com as contagens
  no `evidence.md`:

  ```bash
  bun --env-file=../../.env.test test --timeout 120000
  bun --env-file=../../.env.test run test:integration
  ```

- [ ] **T7.5** Consentimento na app.
  - Contrato do serviço de rastreamento:
    - só envia com consentimento, a viagem em `dispatched`, `in_transit` ou `on_delivery_route` e a
      app visível;
    - no máximo 1 envio a cada 60 s;
    - `clearWatch` ao desligar, ao sair da rota e ao esconder a app;
    - GPS negado mostra "posição indisponível no aparelho".
  - O interruptor no Perfil, com o texto de finalidade, quem vê e retenção (ADR §8).
  - O indicador na tela da viagem enquanto a posição sobe.
  - `GET`/`PUT /me/location-consent` e `POST /me/trips/current/location`.

  **Aceite:** contrato verde; Playwright com relógio falso conta os `POST` (1 por 60 s), vê o
  indicador e não vê envio depois de desligar.

## Fase 8 — Documentação viva e emendas

> 🤖 Modelo: `haiku` · T8.1 e T8.3 `sonnet`

- [ ] **T8.1** Criar `apps/frontend-driver/CLAUDE.md` (o núcleo normativo) e
      `docs/ai-context/frontend-driver.md`.
  - Conteúdo: separação, SSO, reconciliação, CSP, HSTS, SW `prompt`, boot sem rede, dono do snapshot,
    pendência, sino, o que a 147 e a 179 acrescentam, cópia por valor e porta.

  **Aceite:** os dois arquivos existem e citam a ADR-0075.

- [ ] **T8.2** Atualizar a documentação existente:
  - `CLAUDE.md` da raiz: Estrutura, portas (`frontend-driver 53200`, preview `53112`), comandos e a
    nota de que o motorista não é mais rota do painel;
  - `apps/frontend-transportada/CLAUDE.md` e `docs/ai-context/frontend-transportada.md`: o
    interruptor, a tela de pendências e o beacon;
  - `docs/spec/railway.md`: o serviço `driver`, as `VITE_*` literais e o interruptor do painel;
  - a ADR-0050: "Revisada por ADR-0075".

  **Aceite:** `bunx prettier --check` nos `.md`.

- [ ] **T8.3** Emendar a spec 147:
  - `plan.md` e `tasks.md`:
    - a T006 vale para as duas apps, mas só para a tela do código;
    - a T008 passa a ser "`push` e `notificationclick` no `sw.ts` de `apps/frontend-driver`";
    - a T010 inscreve só no app do motorista;
  - o painel fica com o sino, e migrar o SW do painel vira spec futura.

  Emendar também `specs/179-a-recusa-sai-com-foto/tasks.md`: T302 e T303 apontam para
  `apps/frontend-driver`, e a T303 segue o desenho de `documentOccurrence` da plan desta spec.

  **Aceite:** diff revisado; prettier.

## Fase 9 — Revisão

> 🤖 Modelo: `sonnet` (prints) · `opus` (`code-reviewer` e `security-reviewer`)

- [ ] **T9.1** Revisão de design e usabilidade (web.md §15), com prints em **375 px e 768 px**, claro
      e escuro, em `prints/`. As telas:
  - a viagem, com e sem rede ("dados de HH:MM");
  - pendências de outra conta;
  - o aviso de atualização;
  - o sino e `/notificacoes`;
  - o seletor e a janela;
  - o Perfil, com o consentimento e "Instalar";
  - a tela de `403`;
  - no painel, as telas de pendências e "Instale o app novo".

  Cada elemento é conferido contra o vizinho (altura, borda, raio, foco) e contra os 44 px.

  **Aceite:** prints commitados; os achados corrigidos ou registrados.

- [ ] **T9.2** `code-reviewer` e `security-reviewer` (`opus`) sobre a spec inteira. Em especial: CSP,
      HSTS, bypass, snapshot e fila com dono, beacon sem PII, `PUT` completo da reconciliação e
      consentimento. Mais a auditoria de go-live (code-standart §15).

  **Aceite:** nenhum achado alto aberto.

## Fase 10 — Remoção do módulo antigo, pela medida

> 🤖 Modelo: `sonnet` · abre só depois do 👤

- [ ] **T10.1** 👤 O usuário confere em `railway logs --service transportada-frontend`
      (produção) **zero** `driver_legacy_served` nos últimos 14 dias seguidos e autoriza a remoção.
      Sem zero, a fase espera.
- [ ] **T10.2** Remover do painel:
  - `modules/driver-trip/` e os testes dele;
  - a tela de pendências, o beacon e a rota do `server.ts`.

  O painel mantém o redirecionamento incondicional (com a variável) e a tela "Instale o app novo".
  Também saem o locale do motorista do `i18n.service.ts`, `main.tsx:130` e o ícone
  `workspace-driver-trip`, se ficar sem uso. `DriverReturnReason` continua em `modules/trip/shared/`.

  **Aceite:** `make check` e `make smoke` verdes;
  `git grep driver-trip -- apps/frontend-transportada/src` vazio.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/189-o-motorista-tem-app-propria/ (leia spec.md,
plan.md, tasks.md e docs/adr/0075-o-motorista-tem-app-propria.md antes de começar). Uma task por
vez, na ordem do tasks.md, num worktree próprio (make worktree NAME=spec-189).
Modelos: Fase 1 → executor model=sonnet, T1.2 🧠 → opus · Fase 2 → executor model=sonnet ·
Fase 3 → executor model=sonnet (T3.1 → haiku, T3.3a 🧠 → opus) · Fase 4 → executor model=sonnet ·
Fase 5 → executor model=sonnet, T5.2 🧠 → opus + code-reviewer model=opus antes do push ·
Fase 6 → executor model=sonnet · Fase 7 → executor model=sonnet, T7.4 🧠 → opus ·
Fase 8 → executor model=haiku (T8.1 e T8.3 → sonnet) · T9.1 → executor model=sonnet ·
T9.2 → code-reviewer e security-reviewer model=opus · Fase 10 → executor model=sonnet.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md. A T1.2 é UM commit
com os Dockerfiles, o changed-targets e o contrato de pipeline. A T7.4 fecha com os DOIS comandos da
API (contrato e `bun --env-file=../../.env.test run test:integration`, de dentro de
apps/api-transportada). Rode prettier nos .md antes de cada push. Nunca imprima o .env.
Tasks 👤 (T6.3, T6.5, T6.6, T6.7, T6.8, T6.10, T10.1): pare, descreva o passo exato e espere "feito".
Pare e pergunte antes de: deploy em produção, railway config apply, qualquer mudança de variável na
Railway, migration destrutiva, qualquer [NEEDS CLARIFICATION].
Staging: publicar com gates verdes (fetch → rebase origin/staging → install → gates → push).
```
