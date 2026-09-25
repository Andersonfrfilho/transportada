## frontend-transportada

Histórico completo e narrativas (specs, medições datadas, defeitos investigados):
`docs/ai-context/frontend-transportada.md`.

React 19.2 + Vite 7.3 + TanStack Query 5 (`retry: false`, `staleTime` 30s). **Sem router**:
navegação manual em `src/main.tsx` (`pushState` + `popstate` + `sessionStorage`). **Sem Tailwind e
sem zod** — `tailwind-merge`/`clsx`/`cva` estão no `package.json` mas não são usados; `cn()` é
reimplementado em `src/lib/utils.ts`; validação é type guard manual em `*.validation.ts`.

Módulos em `src/modules/`: `billing`, `company-settings`, `cte-batch`, `cte-issuance`,
`cte-profiles`, `fleet`, `foundation`, `freight`, `identity`, `mdfe-manifest`, `nfe-workspace`,
`nfse-invoice`, `notification`, `operations`, `trip`, `shared`. `shared/` concentra client HTTP +
validação + view-model. Um client HTTP **por módulo** (`shared/<modulo>Client.service.ts`), com
`fetch` injetado por dependência. Auth via `KeycloakAuthProvider`.

Tokens de design em `:root` de `src/styles/index.css` (`--color-*`, `--font-*`, `--space-1..16`),
tema escuro único. Design system caseiro em `src/components/ui/`. Estilos por módulo em
`*.module.css`.

## Regras do design system que não se negociam

Cada linha é um primitivo obrigatório — o cru correspondente é **proibido** em `src/**/*.tsx` fora
de `src/components/ui/` e há um contrato de design-system que falha se ele reaparecer. Detalhe de
cada um (props, teclado, ARIA, por que a regra existe) no doc da coluna "Regra" e no histórico.
Os contratos de cada doc leem **este** arquivo e cobram a referência a ele: tirar o caminho de uma
linha reprova o contrato daquela regra.

| Precisa de                                 | Use                                                                   | Nunca                                                 | Regra                                    | Contrato                                               |
| ------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------ |
| Largura de tela                            | 4 breakpoints (`web.md` §10) em `min-width`                           | `max-width`/`width <=`                                | `docs/frontend/responsive.md`            | `responsive.contract.ts`                               |
| Largura de container                       | `var(--layout-width)`                                                 | largura própria por módulo                            | `docs/frontend/layout.md`                | `layout-width.contract.ts`                             |
| Altura/padding de campo                    | tokens `--field-*`                                                    | valor literal                                         | `docs/frontend/fields.md`                | `field-metrics.contract.ts`                            |
| Data                                       | `@/components/ui/date-picker` / `date-range-picker`                   | `<input type=date>`                                   | `docs/frontend/fields.md`                | `test/design-system/date-picker.contract.ts`           |
| Leitura de etiqueta                        | `@/components/ui/barcode-scanner`                                     | implementação própria de câmera                       | `docs/frontend/barcode-scanner.md`       | `barcode-scanner.contract.ts`                          |
| Medida de caixa pela câmera (experimental) | `@/components/ui/box-dimension-scanner`                               | implementação própria de câmera ou de medida          | `docs/frontend/box-dimension-scanner.md` | `test/design-system/box-dimension-scanner.contract.ts` |
| Checkbox                                   | `@/components/ui/checkbox`                                            | `<input type=checkbox>`                               | `docs/frontend/checkboxes.md`            | `checkbox.contract.ts`                                 |
| Dica de interface                          | `@/components/ui/tooltip`                                             | `title` nativo                                        | `docs/frontend/tooltips.md`              | `tooltip.contract.ts`                                  |
| Ícone                                      | `@/components/ui/icon`                                                | `<svg>` cru                                           | `docs/frontend/icons.md`                 | `icon.contract.ts`                                     |
| Altura de controle/botão quadrado          | `--control-height(-compact)`                                          | `rem` literal                                         | `docs/frontend/buttons.md`               | `control-height.contract.ts`                           |
| Seleção única/múltipla                     | `@/components/ui/select` / `multi-select`                             | `<select>` nativo                                     | `docs/frontend/selects.md`               | `select.contract.ts` / `multi-select.contract.ts`      |
| Painel flutuante (select, calendário)      | portal via `useFloatingLayer`                                         | `position: absolute` dentro de ancestral com overflow | `docs/frontend/selects.md`               | `floating-layer.contract.ts`                           |
| Filtro ativo                               | `@/components/ui/filter-pills`                                        | pílula própria                                        | `docs/frontend/data-tables.md` § 8       | `filter-pills.contract.ts`                             |
| Contagem em botão de ícone                 | `@/components/ui/count-badge`                                         | badge em `position: absolute`                         | `docs/frontend/data-tables.md` § 9       | `count-badge.contract.ts`                              |
| Estado de carregamento                     | `@/components/ui/skeleton` na forma do conteúdo real                  | texto solto ou `null`                                 | `docs/frontend/loading.md`               | `skeleton.contract.ts`                                 |
| Painel que nasce por clique                | `useRevealedPanel` (rola + foca)                                      | renderizar antes da lista que abre                    | `docs/frontend/panels.md`                | `panel-reveal.contract.ts`                             |
| Tabela com filtro/ordenação/seleção        | seguir a regra (referências vivas: `nfe-workspace` e `cte-batch`)     | reimplementar do zero                                 | `docs/frontend/data-tables.md`           | contrato do módulo                                     |
| Invalidar cache após mutação de vínculo    | `invalidateMutationEffect` (`shared/mutationInvalidation.service.ts`) | lista de chaves montada à mão                         | `docs/frontend/mutations.md`             | `mutation-invalidation.contract.ts`                    |
| Botão com ícone: alinhamento               | regra global `button:has(svg)`                                        | `display`/`gap` de módulo                             | `docs/frontend/buttons.md`               | `button.contract.ts`                                   |

Texto pt-BR em `*.locale.json` vai **acentuado** — `locale-accents.contract.ts` varre e falha com
forma sem acento (`nao`, `possivel`, …).

**Toda tarefa que toca a tela fecha com revisão de design contra a própria página** (`web.md` §15):
o elemento tocado é comparado com os vizinhos da mesma tela (campo com campo, botão com botão), o
contraste é conferido no estado normal e no selecionado, e um print vai para o usuário como prova.
Primitivo cru ao lado de um do design system é defeito da tarefa, não pendência de outra.

## Fronteira entre módulos

Um módulo que precisa de uma ação de outro módulo importa **só o componente de ação autocontido**
que o módulo dono exporta (padrão `NfseEmissionAction`, `nfse-invoice`) — nunca o diálogo ou o hook
internos. Isso já era o costume do repositório antes de virar regra escrita: `nfe-workspace` importa
`NfseEmissionAction` de `nfse-invoice` (`NfeDocumentTable.component.tsx`) em vez do diálogo de
emissão, e `trip` segue o mesmo precedente para abrir a emissão de NFS-e a partir da linha da
viagem. O componente de ação decide sozinho estado interno, permissão e abertura de diálogo; quem
importa só decide quando oferecê-lo.

## Configuração perto do efeito

Painel de configuração mora na tela onde o efeito aparece, nunca numa tela central de
configurações. O endereço de cada painel é declarado uma vez em
`company-settings/shared/companySettingsTabs.service.ts` (`SETTINGS_PANEL_PLACEMENT`), e é esse
registro que garante o campo vir preenchido ao abrir a aba. `company-settings` tem hoje **Empresa**,
**Site**, **Certificados**, **Tributos** e **Diária do motorista** (spec 143 D7, mesmo molde de
`FederalTaxPanel`: `GET/PUT/DELETE /company-settings/driver-allowance`, sem linha gravada é o padrão
do sistema, `settings.manage`); outros painéis (busca automática de notas, preço de combustível,
credencial da Nota RP, tabela de frete) moram nas abas dos módulos a que pertencem.
Contrato: `test/company-settings/tabs.contract.ts`. Detalhe de cada painel (permissão exigida,
conversão percentual/fração dos tributos, mapa de zona via IBGE): docs/ai-context § "Configuração
perto do efeito". Painel **"Medida pela câmera (experimental)"** (spec 152) mora na aba **Caixas**
do `nfe-workspace`, registrado como `cameraMeasurement` em `SETTINGS_PANEL_PLACEMENT` com
`{ module: 'nfe-workspace', source: 'cameraMeasurementSettings', tab: 'boxes' }` — exige `settings.manage`
e controla o interruptor `cameraMeasurementEnabled` por empresa (padrão desligado). Contrato em
`test/company-settings/tabs.contract.ts`.

## Domínio de viagem, roteirização e proposta de carga — ver a referência

**As regras de negócio de `trip`/`routing` (montagem de viagem, proposta multi-veículo, aceite,
valuation, roteirizador com teto de paradas) são as que causaram o CLAUDE.md de 184k — não as
resuma aqui de novo.** Antes de tocar em qualquer código de `trip`, `routing`, `route-suggestions`
ou valuation, leia a seção correspondente em `docs/ai-context/frontend-transportada.md` (specs 058,
090, 100–105, 110–112, ADR-0044, ADR-0055). Invariantes mais cotadas para não reimplementar por
engano:

- A conta (`buildValuationFromContext`) e a distância/pedágio da proposta têm **um** seam cada,
  compartilhado entre viagem, prévia e sugestão — segunda implementação diverge calada.
- **A frase da diária nasce em `composeCostParcelDetail`** (spec 143, ADR-0066) e é **compartilhada**
  entre o razão da viagem (`ValuationLedger`) e o da proposta — a API nunca compõe texto, `detail` da
  parcela do motorista chega sempre `null`. A frase tem de bater, **literal**, com a que a API
  congela em `note` ao fechar a viagem; é o contrato da T11 que segura essa igualdade. A frase
  aparece no razão da viagem mas não na proposta de roteiro
  (`SuggestionVehicleValuation.component.tsx` só compõe detalhe de parcela com lacuna, e a parcela do
  motorista deixou de ter lacuna) — comportamento esperado, não regressão.
- Verde é o que entra, vermelho é o que sai — `--color-ready`/`--color-alert`, nunca `.negative`
  (que é cobre, usado por outras telas).
- Tirar destino é marcação (riscar + desfazer), nunca destruição; mover destino entre caminhões não
  existe hoje.
- Aceite parcial de proposta **consome** a sugestão inteira.
- A nota que não coube sai por botão, nunca sozinha (spec 148 T7): `TripReviewQueue` no painel de
  carga da viagem e da proposta, só com `trip.manage` e viagem não despachada. Mover/trocar esperam a
  planta do destino (`runReviewChange`) e só gravam com ela; na proposta o botão marca e o aceite
  leva `releaseUnplacedFromLayoutIds`. Contrato: `test/trip/review-queue.contract.ts`.
- **A linha do tempo da viagem** (spec 158) é `TripTimeline` sobre `useTripTimeline` (cursor, `GET
/trips/:id/timeline`, `canReadTrip`). A frase de autoria é **uma** função,
  `resolveFieldAuthorshipText` (`fieldAuthorship.service.ts`, namespace `authorship.*`), usada também
  por `TripOccurrences` — frase nova de canal entra ali, nunca no componente. O namespace
  `eventTimeline.*` não é `timeline.*` (este é a linha da rota do dia, spec 110).
- O roteirizador tem teto de paradas e marca a qualidade da otimização (`optimizationQuality`);
  10 mil paradas numa instância só segue fora de alcance (memória da matriz).

## O motorista ganhou app própria (spec 189, ADR-0075)

O módulo `driver-trip` (a tela `/minha-viagem`) continua aqui, mas deixou de ser o destino final: a
spec 189 copiou tudo por valor para `apps/frontend-driver` (ver o CLAUDE.md dela) e este painel
agora só **encaminha** para lá. `VITE_DRIVER_APP_URL` é interruptor, não configuração — lido sozinho
por `readDriverAppUrl()` (`identityEnvironment.config.ts`), fora de `getIdentityEnvironment()`, para
uma variável ausente não derrubar o boot em nenhum contexto. Ausente, `/minha-viagem` funciona como
sempre. `resolveDriverAppRedirect` (`driver-trip/shared/driverAppRedirect.service.ts`, função pura)
decide entre quatro modos, só quando a entrada é do motorista (`/minha-viagem`, ou a raiz com
`isFieldOnlyUser`):

- `stay` — sem a variável, ou fora da entrada do motorista;
- `redirect` — fila antiga (IndexedDB desta origem) vazia: `main.tsx` confere
  `isDriverAppUrlOwnOrigin` (rede de segurança em runtime contra laço de redirect consigo mesmo,
  além da checagem já feita no build por `assertDriverAppUrlBuildsClean`) e faz
  `window.location.replace(driverAppUrl)`;
- `install-screen` — aberto pelo ícone antigo instalado (`standalone`): `DriverAppInstall.page.tsx`
  explica e linka, porque um `location.replace` para outra origem sairia do `scope` do PWA antigo;
- `pending-screen` — há o que enviar da fila antiga: `DriverLegacyPending.page.tsx` mostra a fila
  (`DriverEventQueue.page.tsx`) com "Enviar"/"Enviar tudo" e "Descartar" por item recusado; quando
  `pendingCounts.total` zera, "Ir para o app novo" recarrega a página, que decide de novo.

O **beacon** mede quem ainda depende do módulo antigo, para autorizar a remoção por medida (nunca
por calendário): `sendDriverLegacyBeacon` (mesmo arquivo) dispara `navigator.sendBeacon
('/_driver-legacy-served', 'pending-screen')` só dentro do caso `pending-screen`, antes mesmo de
checar autenticação. A rota em `server.ts` é pública, sem auth, aceita só o valor enumerado num
corpo de até 32 bytes, sempre responde `204`, e loga
`{"event":"driver_legacy_served","mode":"pending-screen"}` só na primeira ocorrência de uma janela
de 60 s — sem usuário nem IP. Critério de remoção (tasks.md Fase 10, T10.1): zero ocorrências em 14
dias seguidos de log de produção, conferido e autorizado pelo usuário.
`test/driver-trip/driver-app-redirect.contract.ts`, `test/driver-trip/legacy-beacon.contract.ts`.
Histórico completo (por que o interruptor é lido fora da config, a revisão M1 da rede de segurança
em runtime): `docs/ai-context/frontend-transportada.md`.

## CSP, ambiente e tema de login

**A CSP nasce no build** — `shared/contentSecurityPolicy.service.ts` é a fonte única, o plugin
`transportada-content-security-policy` do `vite.config.ts` gera `dist/content-security-policy.txt`,
e `server.ts` lê o arquivo **fail-closed** (`FRONTEND_MISSING_CONTENT_SECURITY_POLICY`). Destino
externo novo entra no `connect-src` existente, nunca numa segunda diretiva. Contrato:
`test/shared/content-security-policy.contract.ts`.

⚠️ `frame-src` é `'self'` (spec 150 T403; era `'none'` desde a ADR-0037) — o único uso é
`<iframe sandbox="" srcDoc>` para prévia de HTML confiável (nunca `dangerouslySetInnerHTML`, sem
`allow-scripts`); `frame-ancestors`/`object-src` continuam `'none'`.

`VITE_APP_ENV` (`local`·`staging`·`production`, ausente/desconhecido cai em `production`) decide a
faixa de ambiente e o ícone 🚧 fora de produção — mesmo padrão do `web.md` §12. A tela de login
**não é desta app**: é o tema Keycloak em `deploy/keycloak/theme/`, com os tokens de design
copiados por valor (não importa código nosso) — mudou cor/fonte/escala aqui? copie lá. Detalhe
completo do tema (incluindo as armadilhas do FreeMarker) em `docs/frontend/login-theme.md` e no
histórico.

Envs: `VITE_API_URL`, `VITE_APP_ENV`, `VITE_DRIVER_APP_URL` (opcional — interruptor, não
configuração; ver seção abaixo), `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`,
`VITE_KEYCLOAK_CLIENT_ID`.

Segurança: `Permissions-Policy: camera=(self), geolocation=(self), microphone=()` — `()` nega a
**própria** origem, e a API falha antes de qualquer diálogo do navegador. `geolocation=(self)` entrou
com a spec 057 (a entrega do motorista carimba onde aconteceu, ADR-0045 §3); o microfone segue
fechado para todo mundo. Contrato: `test/shared/security-headers.contract.ts`.

## Fleet — pedágio (spec 154)

A aba de pedágio em Frota (Fleet Workspace) deixou de listar só as praças que a operação já cruzou
(spec 095) — agora lista o **catálogo inteiro** paginado do servidor, com busca por nome e operador.
O cabeçalho mostra contagem total, data do catálogo (`observed_on`), estado (`empty | stale | current`)
e quantas praças estão sem tarifa por eixo conhecida para aquela empresa (inclui o efeito do ajuste
manual). Abaixo da lista, um segundo bloco (só com `settings.manage`) oferece **recarregar catálogo**:
seletor de extratos (do mais novo para o mais antigo), botão que abre diálogo de confirmação (informa
"afeta todas as empresas da instalação"), e resultado com praças salvas, data do extrato e praças que
ficaram fora deste extrato. Dois casos extremos:

- Catálogo vazio: frase "nenhum extrato registrado ainda — não há o que recarregar".
- Catálogo populado sem extrato registrado: frase com link ao runbook (`docs/runbooks/osrm-extract.md`).

**Deep link vindo da viagem:** praça sem tarifa no extrato da rota (Trip) tem botão que abre
`/fleet?tollBoothSearch=<nome ou operador da praça>` — a aba de pedágio lê `initialSearch` na query
e filtra o catálogo de primeira, deixando a praça pronta para ajuste. Sem nome nem operador (raro),
abre a aba sem termo. Navegação compartilhada com driver/vehicle (mesmo padrão de `fleetRoute.service.ts`),
parâmetro dedicado `FLEET_TOLL_BOOTH_PARAMETER = 'tollBoothSearch'`.

Histórico completo (contratos de catálogo/recarregamento/navegação, caso extremo de catálogo vazio,
validação do deep link):
`docs/ai-context/frontend-transportada.md` (spec 154 T204–T303, T401).

## Testes de hook com DOM

Os contratos rodam **sem DOM**. Hook que só se prova montado (corrida entre efeito, mutation e
storage) vai para `test/trip-hooks/*.contract.ts`, importado por `test/trip-hooks.contract.test.ts`
e rodado por `bun run test:hooks` — que o `test` chama no fim, **em processo próprio**, com o
`@happy-dom/global-registrator` do `test/trip-hooks/dom.preload.ts`.

⚠️ Não registre o DOM no processo dos contratos nem mova a suíte para a lista principal: o
`window` global muda o que eles medem (`resolveTripAssemblyDraftStorage` decide por `typeof
window`), e o `mock.module` que troca os clientes (`getTripClient`, `getRouteSuggestionClient`,
`loadAvailableTripDocuments`) vale para o processo inteiro — por isso ele é feito uma vez só, em
`test/trip-hooks/tripClientMocks.helper.ts`, e cada suíte reconfigura `tripHookFakes`. `renderHook`/`waitFor` são os de
`test/trip-hooks/renderHook.helper.ts`, sobre `react-dom/client` + `act` — sem
`@testing-library/*`. Storage em memória e cliente falso: `test/fixtures/tripAssemblyHooks.fixture.ts`.
