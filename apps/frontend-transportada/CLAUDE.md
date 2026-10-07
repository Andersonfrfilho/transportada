## frontend-transportada

Histórico completo e narrativas (specs, medições datadas, defeitos investigados):
`docs/ai-context/frontend-transportada.md`.

React 19.2 + Vite 7.3 + TanStack Query 5 (`retry: false`, `staleTime` 30s). **Sem router**:
navegação manual em `src/main.tsx` (`pushState` + `popstate` + `sessionStorage`). **Sem Tailwind e
sem zod** — `tailwind-merge`/`clsx`/`cva` estão no `package.json` mas não são usados; `cn()` é
reimplementado em `src/lib/utils.ts`; validação é type guard manual em `*.validation.ts`.

Módulos em `src/modules/`: `billing`, `cargo-receiving`, `company-settings`, `cte-batch`, `cte-issuance`,
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
`test/company-settings/tabs.contract.ts`. Aba **Localização** (spec 239) em `/trips` (`trip` module),
`TripLocationRetentionPanel`, `locationRetention` em `SETTINGS_PANEL_PLACEMENT` com
`{ module: 'trip', source: 'locationRetentionSettings', tab: 'location' }` — permite quem tem `settings.manage`
ligar/desligar e ajustar prazo (30–90 dias) do expurgo de coordenadas.

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
- **Um mapa só, MapLibre** (spec 153 RF11): viagem, proposta e aba Regiões de frete (polígonos por
  zona com clique, legenda, cidades fora da malha) usam `maplibre-gl`, com o basemap PMTiles próprio
  preparado por `modules/shared/vectorBasemap.service.ts` (protocolo `pmtiles://`, worker e CSS do
  MapLibre registrados ali, nunca no componente). `AssemblyVectorMap` (lazy-carregado por
  `TripAssemblyMap` e por `TripRouteMap`) renderiza traçado e paradas; `FreightRegionVectorMap`
  renderiza zonas. O primitivo SVG `VectorMap` e serviços órfãos (`tripRouteMap.service`,
  `tripBasemap.service`, `tileMap.service`, `resolveRouteTraceSegments`) foram removidos (aceite 4:
  `test/design-system/legacy-map-removed.contract.ts` varre `src/` inteiro). Contrato de origem:
  `test/fleet/freight-region-map.contract.ts`.
- **Seletor de rota** (spec 153 RF13, `RouteChoiceOptions`): switch **mais rápida ↔ mais barata**
  sobre as opções já em mãos — nenhuma troca chama o OSRM de novo. Na montagem/proposta
  (`TripAssemblyMap`, T402–T404) trocar só muda a tela e sai por `onRouteChoiceChange`: a viagem
  ainda não existe, então quem regrava é o aceite ("Aceitar"/"Usar esta"), com a escolha por veículo.
  No detalhe de uma viagem já criada (`TripRouteChoiceSwitch`, T405) trocar **regrava na hora**, sem
  clique extra — `onSelect` chama `workspace.planRouteMutation.mutate` direto, sobre uma leitura viva
  única do roteirizador. Opção única avisa em tela que não há alternativa. Sem `trip.financials`,
  nenhum valor aparece no mapa (praças e rótulos sim, valores não); linha monetária some sem traço ou
  zero. Detalhe completo: docs/ai-context § "Seletor de rota, um mapa só e redação monetária".

## O menu mostra só o que a pessoa pode abrir (spec 221)

A barra lateral renderizava as 19 entradas para todo usuário autenticado: o separador abria 5 e batia
em parede nas outras 14. **A permissão de cada workspace agora mora num lugar só**,
`modules/shared/workspaceAccess.service.ts` (`WORKSPACE_PERMISSIONS`, lista "qualquer uma de" por
chave, com a origem anotada linha a linha). O `satisfies` faz **chave nova sem entrada reprovar o
typecheck** — é essa a trava, não um teste. A lista de itens e os grupos saíram do `main.tsx` para
`modules/shared/workspaceNavigation.constant.ts`, senão o contrato teria de importar o `main` e
disparar o boot.

- **Acesso é por permissão; só a aterrissagem lê papel.** `canOpenWorkspace` nunca recebe `roles`; a
  preferência de onde começar (`LANDING_PREFERENCE`) recebe, porque a pergunta ali é outra. Um
  contrato afirma que o módulo do mapa não importa `CompanyRole`.
- **O separador começa em `/trips`**, não no primeiro item do menu (que é NF-e). Preferência vence
  "primeiro visível"; preferência que a conta não pode abrir é ignorada.
- **Endereço pedido pela pessoa nunca é trocado.** `resolveCurrentWorkspace` reporta a origem
  (`path | stored | default`) — sem ela, "URL digitada" e "aterrissagem sem endereço" são
  indistinguíveis. URL direta cai na parede da página; só `stored` sem permissão e `default` cedem.
- **Conta sem nenhuma área** abre `NoWorkspaceAccess`, com o botão de sair no corpo.
- **Conta de campo não abre o painel por caminho nenhum** (RF-E1): `isDriverEntry` passou a valer para
  qualquer caminho de `isFieldOnlyUser`, e sem o interruptor o modo `legacy-home` leva a
  `/minha-viagem` por `replaceState`. ⚠️ Motorista que **também** é separador tem `trip.manage`, logo
  não é conta de campo: ele fica no painel, aterrissa em Viagens e ganha "Minha viagem" no menu — o
  item é visível só com `trip.report`.
- **Três telas ganharam a parede que não tinham** (Empresa, NFS-e e Repasses) e decidem **pelo mesmo
  mapa**, nunca por condição própria. Repasses fechou exposição real: não tinha checagem alguma e a
  consulta não tinha `enabled`. A entrada dela no mapa é a única que é **intenção de produto**
  (`billing.create` ou `trip.financials`), não transcrição — a API lê com `trip.financials` desde a
  spec 243 D1 (antes `trip.read`, achado BOLA registrado em `docs/SECURITY.md`).

⚠️ **Contrato de parede não se escreve procurando texto na fonte.** A primeira versão dos três
contratos afirmava que o arquivo continha `isForbidden` e `t('forbidden')`, e passava verde com as
três paredes desligadas (medido por mutação). O que vale é exercitar **conjunto de permissão** em
`test/shared/workspace-walls.contract.ts` e `workspace-landing.contract.ts`.

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

Segurança: `Permissions-Policy: camera=(self), geolocation=(self), microphone=(self)` — `()` nega
a **própria** origem, e a API falha antes de qualquer diálogo do navegador. `geolocation=(self)`
entrou com a spec 057 (a entrega do motorista carimba onde aconteceu, ADR-0045 §3);
`microphone=(self)` com a spec 183 T705 (gravar áudio na conversa, autorizado pelo usuário em
25/09/2026 — `docs/SECURITY.md`). Nunca `*`; o portal da contratante segue sem microfone. Contrato:
`test/shared/security-headers.contract.ts`.

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

## A conversa da ocorrência (spec 183)

`occurrence-conversation/` desenha as duas conversas da ocorrência: a aba Contratante (e-mail e
portal) e a aba Motorista (app). A mesma tela serve ao app do motorista e, com peças próprias, ao
portal. Histórico: docs/ai-context § "A ocorrência tem duas conversas".

- **Do `@adatechnology/conversations-ui` entram só peças que não dependem de Tailwind:**
  `MessageText`, `StatusTicks` e `DateDivider`. O `styles.css` do pacote nunca é importado
  (ADR-0051), e a cor de cada participante vem dos tokens.
- **Mensagem nova é anunciada a leitor de tela** (T903, D2). O fio tem região `aria-live`
  alimentada por `countNewIncomingMessages`, que nunca anuncia a primeira leitura. A leitura nunca
  para: com envio pendente, o refetch é rápido; sem nada pendente, cai para
  `CONVERSATION_IDLE_REFETCH_MS` (60 s).
- **Envio que falhou se recupera no reenvio** (`recoverFromSendFailure`, T903 F2/F3):
  - upload vencido esquece os ids e sobe de novo;
  - chave já usada com outro conteúdo gera chave nova;
  - conversa passada a outro motorista diz o motivo.
- **Ação com chave derivada do anexo** (encaminhar à contratante, anexar à ocorrência): o 409 de chave
  usada quer dizer "já feito" e aparece assim, nunca como erro (T903, F4).
- **"Adicionar aos contatos" é a `AddContractorContactAction` de `delivery-clients`** (T903, F5, pela
  regra da fronteira acima). A conversa só decide quando oferecê-la: remetente fora dos contatos e
  **confirmado**. O e-mail sem DKIM alinhado aparece como "Remetente não confirmado" e não oferece
  cadastro (S2).
- **O módulo tem as próprias guardas** (`occurrenceConversationGuards.validation.ts`). Ler as de `trip`
  fechava ciclo, porque `trip` importa a conversa. Contrato: `module-boundary.contract.ts`.
- **No celular** (T801): a lista vira cartões, o detalhe vira abas, e o fio tem altura limitada com
  a caixa de envio logo abaixo. A caixa presa ao rodapé foi medida e descartada: cobria 359 de
  800 px. Sob `pointer: coarse`, botões pequenos, nome do contato e "fechar" chegam a
  `--touch-target`.
- Áudio e microfone: § "CSP, ambiente e tema de login" acima.

## Testes de hook com DOM

Os contratos rodam **sem DOM**. Hook que só se prova montado (corrida entre efeito, mutation e
storage) vai para `test/trip-hooks/*.contract.ts`, importado por `test/trip-hooks.contract.test.ts`
e rodado por `bun run test:hooks` — que o `test` chama no fim, **em processo próprio**, com o
`@happy-dom/global-registrator` do `test/trip-hooks/dom.preload.ts`.

⚠️ **Contrato de DOM é determinístico sob carga** (spec 237): o prazo do `waitFor` conta tempo esperado, não o custo de uma
asserção reprovada; `expect(nó).toBeNull()` formata o nó do happy-dom (0,5–1 s) — dentro de `waitFor` afirme
`querySelectorAll(...).length`; o `afterEach` do `renderHook.helper.ts` desmonta toda raiz montada. Valide estabilidade
com ≥10 execuções, também com CPU ocupada: uma rodada verde não prova nada. Contrato: `wait-for-budget.contract.ts`.

⚠️ Não registre o DOM no processo dos contratos nem mova a suíte para a lista principal: o
`window` global muda o que eles medem (`resolveTripAssemblyDraftStorage` decide por `typeof
window`), e o `mock.module` que troca os clientes (`getTripClient`, `getRouteSuggestionClient`,
`loadAvailableTripDocuments`) vale para o processo inteiro — por isso ele é feito uma vez só, em
`test/trip-hooks/tripClientMocks.helper.ts`, e cada suíte reconfigura `tripHookFakes`. `renderHook`/`waitFor` são os de
`test/trip-hooks/renderHook.helper.ts`, sobre `react-dom/client` + `act` — sem
`@testing-library/*`. Storage em memória e cliente falso: `test/fixtures/tripAssemblyHooks.fixture.ts`.

## A nota se abre inteira (spec 233)

A linha da nota na viagem é um acordeão de abertura exclusiva (`useOpenTripDocument`) com Dados da nota,
Ocorrências, Comprovante (dois selos) e Eventos desta entrega. ⚠️ `isDeliveryProof` recusa chave desconhecida
e descarta o comprovante inteiro: o painel aceita o campo novo **antes** de a API mandá-lo.

Detalhe completo: docs/ai-context/frontend-transportada.md § "A nota se abre inteira".

A 228 põe nesses eventos a "Foto do canhoto" (`camera`, pino `delivered`) e o "Endereço da parada corrigido"
(`edit`, pino `status`), com origem e deslocamento; "Ver no mapa" só com `location`. Detalhe:
docs/ai-context/frontend-transportada.md § "Foto do canhoto e endereço corrigido na linha do tempo".

## O ajudante é um perfil (spec 235)

Seletor de perfil com opção `helper`, CNH oculta, "Pode atuar como ajudante" travado para ajudante-puro,
"Diária própria" para quem pode ajudar. Papel na tabela de Acesso; convite com `helper` casa ficha pelo CPF.
Seletor de motoristas da viagem exclui quem não dirige; lista de ajudantes segue inalterada (ambos filtram
pela ficha). Permissão `trip.read` — sem `trip.report` — abre `NoWorkspaceAccess` no painel (decisão de
produto fora da spec: qual app o ajudante usa). Detalhe: docs/ai-context/frontend-transportada.md
§ "Spec 235 — O ajudante é um perfil" e ADR-0093.

## A linha do tempo mostra onde o evento aconteceu (spec 196, ADR-0081)

`TripTimelineLocation` (ícone `map-pin`, tooltip com precisão, distância até a parada, coordenada e hora da
leitura) e `TripTimelineLocationMap` (lazy, dois pinos, mapa quieto sem radar). A regra das cinco situações
(`captured`, `restricted`, `unavailable`, `expired`, `null`) é `resolveTimelineLocationView`; só `unavailable`
leva rótulo na tela. `location` e `locationState` chegam sempre (o validador as exige) e `location: null` com
`captured` é o leitor sem `trip.event-location` — a tela não oferece mapa. Coordenada nunca em URL nem em
log. Detalhe: docs/ai-context/frontend-transportada.md § "Spec 196".

## Contratantes e perfil de recebimento (spec 237 T1.4)

Aba "Contratantes" de `/clientes` (`delivery-clients`): ficha com dados do contratante e perfil de
recebimento. O número da carga é lido pelo **texto que o antecede** (`arrivalReferenceLabel`, literal, uma
linha), nunca por expressão regular (revisão de segurança S3). `PUT` do perfil sempre com as 10 chaves; recusa do servidor lista todos os campos com atalho
(`data-field`). Em teste de DOM, compare foco com `activeElement === campo`, nunca `toBe` sobre nó. Detalhe:
docs/ai-context/frontend-transportada.md § "Spec 237 T1.4".

**Seção "Prévia por e-mail" da ficha** (T4.6b): `PreviewEmailPanel`, só com `settings.manage`; cliente e rotas próprios (o perfil não ganhou chave).
Endereço gerado aparece **uma vez**, só em `mutation.data` (`gcTime: 0`, `reset()` ao fechar/desmontar) — nunca em `localStorage`, URL ou console;
rotacionar pede confirmação. Ganchos `beforeEach/afterEach` de arquivo de DOM vão **dentro** do `describe` (a suíte de DOM é uma só). Detalhe:
docs/ai-context/frontend-transportada.md § "Spec 237 T4.6b".

## O ajudante fecha as pontas (spec 243)

Painel "Diária do ajudante" na aba de motoristas (`DriverCrewSettingsPanel`, fora de `SETTINGS_PANEL_PLACEMENT`,
permissão `fleet.read`/`fleet.manage` da API). Variante de `NoWorkspaceAccess` para conta com `trip.read`
e sem workspace: texto "Sua conta acompanha viagens pelo app do motorista" + botão para abrir o app (quando
`VITE_DRIVER_APP_URL` existe). Contrato: `test/fleet/driver-crew-settings-panel.contract.tsx`,
`test/identity/no-workspace-access-variant.contract.tsx`. Detalhe: docs/ai-context/frontend-transportada.md
§ "Spec 243 — O ajudante fecha as pontas" e ADR-0095.

## Recebimento da carga e separação pelo celular (spec 237 T2.4)

Módulo `cargo-receiving`, rota **`/recebimento`**, item "Recebimento" no grupo Operações — visível só com
`fleet.read` (o mapa de `workspaceAccess.service.ts`); escrever é `trip.manage` e decide dentro da tela
(`canManage`). Quatro telas, um módulo: `/recebimento` (lista), `/recebimento/nova` (registro),
`/recebimento/:id/detalhe` (escritório) e **`/recebimento/:id` (o celular do separador)**. Namespace i18n
`cargoReceiving`; guardas de resposta e erro **próprios** (nada importado de `delivery-clients`: contratante e
perfil são lidos por projeção mínima — só `id/displayName/taxId` e `isEnabled`).

- **A máquina do toque é pura** (`cargoSeparationTouch.service.ts`): esperada → recebida → separada, uma etapa
  por vez. "Separar tudo do grupo" são **dois lotes em ordem** (`received` só para as esperadas, depois
  `separated` para todas), porque a API só aceita `separated` a partir de `received`; a nota recusada no
  primeiro não entra no segundo e **nunca derruba o lote**. O resultado traz o estado que cada nota tem DE FATO
  (`TouchRun.states`) — é ele que a atualização otimista grava e que a volta restaura
  (`useSeparationTouch.mutation.ts`: reverte só as notas do toque, e só relê a chegada quando nenhum toque está
  em voo). O toque que cai por rede fica na linha com "Tentar de novo"; o botão de uma nota em voo fica travado.
- **`Idempotency-Key` por tentativa** (`cargoIdempotencyKey.service.ts`): a mesma impressão do pedido (ordem das
  notas não conta) reaproveita a chave; pedido diferente gera uma nova. Chave nova a cada render duplicaria a
  chegada no duplo clique — é mutação provada.
- **A recusa nomeia tudo** (`cargoReceivingRefusal.service.ts`, web.md §11): `documentIds.<n>` do 422 é a posição
  da nota NO PEDIDO enviado (a ordem de marcação); o 409 do fechamento devolve o id de cada pendente em
  `details[].documentId` (campo `pendingDocumentIds.<n>`). Cada nome é atalho (`focusCargoTarget.service.ts`, alvo por `data-field`/`data-document-id`).
- **Seleção** limitada a 300 (`cargoDocumentSelection.service.ts`); "selecionar todas" é "as listadas" (o que a
  busca deixou), porque a API pagina por cursor de 100.
- **Contratos de DOM** em `test/trip-hooks/cargo-*.contract.ts` com o servidor dublado do
  `cargoReceivingHarness.helper.ts` (aplica as MESMAS transições da API). ⚠️ O `MultiSelect`/`SearchableSelect`
  só abrem opções dentro da suíte completa do `test:hooks` — isolados, a lista vem vazia (já era assim na T1.4).
- O leitor de câmera é o primitivo `@/components/ui/barcode-scanner` + `extractNfeAccessKey` (o mesmo da
  viagem): sem acoplar módulos. Fila offline do toque **não existe** (follow-up): falhou, fica na tela.

Detalhe e decisões: docs/ai-context/frontend-transportada.md § "Spec 237 T2.4".

**Revisão das Fases 1–2 (2026-10-06), o que mudou no painel** — detalhe em docs/ai-context § "Spec 237 — correções da revisão
das Fases 1–2, parte do painel":

- **Filtro e ordenação da lista de chegadas vão inteiros ao servidor** (`resolveServerFilters`: vários contratantes e situações,
  `sort`/`direction`), e **`sort`/`direction` viajam junto com o cursor** — cursor de outra ordem é `400
CARGO_ARRIVAL_CURSOR_ORDER_MISMATCH` e a lista recarrega do início com aviso neutro. Notas e Separadas **não ordenam** (o
  servidor não tem a coluna); nunca reintroduzir ordenação só sobre as páginas carregadas.
- **Quem tem o recebimento ligado é UMA consulta paginada** (`GET /contractor-receiving-profiles`), nas três telas (registro,
  envio da planilha e selo da aba Contratantes). Leitura de perfil por contratante só na ficha. As listas vivem sob
  `RECEIVING_PROFILES_QUERY_KEY` (`modules/shared`) e salvar o perfil invalida a raiz.
- **Rota e lote mostram o erro** (`CargoActionFailure`, recusa nomeando as notas pela seleção ENVIADA); o 409 do fechamento é
  lido por `details[].documentId`. A chegada aberta é relida a cada 20 s (aba visível, sem toque em voo); "Separar tudo do
  grupo" trava com toque do mesmo grupo em voo.
- Funções com mais de um parâmetro recebem objeto — inclusive as internas.
- **Tabela do recebimento vira cartão abaixo de 40 rem** (`.stacked` + `data-label` por célula): detalhe (grupos), lista de
  chegadas e notas livres do registro. ⚠️ `scrollWidth <= clientWidth` NÃO prova que nada foi cortado — um ancestral com
  `overflow` recorta e passa. A prova é a geometria real (`test/cargo-clipping-smoke.helper.ts`, nos specs de prints a 375 px).

## Prévias de carga (spec 237 T4.4)

Segunda visão de Recebimento: **`/recebimento/previas`** (lista + envio da planilha) e **`/recebimento/previas/:id`** (detalhe), no mesmo
módulo `cargo-receiving`, com `CargoReceivingNav` (Chegadas | Prévias) dentro do shell. Leitura `fleet.read`, envio e ações `trip.manage`.
Cliente, guardas (chaves exatas) e refusal **próprios** (`shared/cargoPreview*`); `RegistrationRefusalSummary` é reaproveitado.

- **Envio:** `.xlsx/.xlsm`, teto de **960 KiB** (o do servidor), `Idempotency-Key` por tentativa (mesmo arquivo + contratante = mesma chave),
  200 = "já foi enviada" (aviso + botão), 413/422 em português, recusa nomeando todos os campos. Só contratante com recebimento E prévia ligados.
- **Repolling só enquanto há prévia na fila/lendo** (`resolveCargoPreviewRefetchInterval`); para sozinho. Estado de lista e filtros do detalhe na URL.
- **"Esperando o XML" é neutro** (`data-tone="neutral"`), nunca alerta. Desvincular **avisa que age no grupo inteiro** antes de sair. Sem
  `trip.manage` nenhuma ação aparece.
- **Proposta de chegada** leva a `/recebimento/nova` por `history.state` (`cargoArrivalPrefill`) e **nunca assume data nem hora**: os campos vêm
  vazios. Contratos: `test/cargo-receiving/preview-*.contract.ts` e `test/trip-hooks/cargo-preview-*.contract.ts` (+ `cargoPreviewHarness.helper.ts`).
- A lista de prévias não traz contagem por estado (a API só a dá no detalhe). Nome/endereço do destinatário nunca em URL, título ou `localStorage`.
- **Origem da prévia** (T4.7b): `CARGO_PREVIEW_SOURCES = ['email', 'upload']`, com contrato de paridade que lê a constante da API. A prévia por e-mail
  **não tem autor**: só o selo neutro "Enviada por e-mail" (`CargoPreviewSourceBadge`), nunca endereço nem nome. Célula empilhada com selo = **um** filho.

Detalhe e decisões: docs/ai-context/frontend-transportada.md § "Spec 237 T4.4".

## O ajudante sem resto (spec 244)

**T3:** Conversor `toTypedAmountKeepingZero` (`modules/shared/decimalAmount.service.ts`) devolve `0,00` para
`0.0000` nos campos `helperDailyRate`, `dailyAllowanceAmount` (ficha) e diária geral. Testes:
`test/fleet/driver-daily-allowance.contract.ts`, `test/fleet/driver-crew-settings-panel.contract.tsx`,
`test/shared/decimal-amount.contract.ts`.

## Recomendar viagens na prévia (spec 237 T5.2)

Botão no detalhe da prévia; duas visões (roteiros do contratante × proposta do roteirizador). **Nada vira viagem sem o
fluxo existente**: "Montar viagem" navega a `/trips?createFromDocuments=` só com as notas roteáveis, e "Gerar proposta" é o
`MultiVehicleSuggestionAction` com a prop opcional `label` (única mudança em `routing`). "Faltam N notas — esperando o
XML" é neutro (nunca alerta); ação sem nota roteável fica desabilitada com o motivo; sem `trip.manage` nenhuma ação
aparece. Estado na URL (`recommend`, `draftRoute`). Detalhe: docs/ai-context/frontend-transportada.md § "Spec 237 T5.2".

## O prazo de entrega da nota (spec 236 T1.2b)

`documents[].deliveryDeadline` é aceito pelo painel (só tipo e guarda, sem selo ainda) **antes** de a API o mandar: opcional em
`TRIP_DOCUMENT_DETAIL_OPTIONAL_KEYS`, chaves exatas por estado, e malformado cai **sozinho** (`dropMalformedDeliveryDeadline`) — sem isso o leitor
tolerante levaria `contact` e `proofPending` junto. Nunca no `TripDocument`. Detalhe: docs/ai-context/frontend-transportada.md § "Spec 236 T1.2b".

## O selo do prazo de entrega e o filtro (spec 236 Fase 2)

Selo `TripDeliveryDeadlineBadge` na linha da nota (texto de `deliveryDeadline.label.*`, "Vencida" sem número quando o atraso é zero dia útil; `dueOn` é
**data civil**, formatada por `formatDeliveryDeadlineDate`, nunca `new Date(texto)`) e data no "Dados da nota". Só informa: não é botão, não muda ação nem
ordem. Filtro **no cliente** na lista de notas do detalhe (`useTripDeliveryDeadlineScope`, múltiplo, na URL como `?deadline=`, contagem por opção, só com
alguma nota com prazo): as paradas ficam todas, "marcar todas" só alcança as notas à mostra. Sem filtro na lista de viagens (decisão aberta). A tinta do
alerta é `--color-alert-ink` (a `--color-alert` crua media 4,11:1 no claro). ⚠️ Gancho `beforeEach`/`afterEach` no topo de contrato de `test:hooks` vale para
a suíte inteira: guarde dentro de um `describe`. Detalhe: docs/ai-context/frontend-transportada.md § "Spec 236 Fase 2".

## O cadastro de tipos de ocorrência mora em `/ocorrencias` (spec 246)

A aba **Tipos** de `/ocorrencias` (só com `settings.manage`; aba ativa na URL) substitui "Tipos de ocorrência" de
Configurações → Empresa: o `OccurrenceTypeCatalogPanel` **mudou de módulo** (`modules/trip`) e `SETTINGS_PANEL_PLACEMENT`
segue com um endereço por painel. Tipos recolhidos, uma linha-resumo por tipo, exceções à vista lidas de **uma** consulta em
lote (`GET /company-settings/occurrence-types/attachment-overrides`), clientes e contratantes só carregam quando um tipo abre.

⚠️ O que cada campo mostra segue o **conjunto de momentos** (`readOccurrenceRequirementScope`), não o `stage`: `document`
cobra os quatro campos e o mínimo de fotos, `stop` só a foto, `office` só Produtos. A exceção nasce com **nulo explícito**
("Igual ao tipo") e guards e cliente toleram API anterior — `noteMode`, `signatureMode` e `moments` ausentes não viram padrão
no `PUT`. Momentos são rascunho com Aplicar/Desfazer; conjunto vazio e `document + stop` juntos são recusados na tela.

⚠️ O `Select` global mudou (contraste e alvo de 44px no toque; desligado sem `opacity`) e o `Tooltip` só estica o filho com
`fill`. Detalhe: docs/ai-context/frontend-transportada.md § "Spec 246".

## A avaria na entrada e "devolver ao contratante" (spec 237 T3.3)

No módulo `cargo-receiving`: botão **Avaria** na nota (celular do separador), selos "Avaria aberta / A devolver / Devolvida",
marcar, desfazer e concluir a devolução. Marcação e ocorrências vêm só de `GET /cargo-arrivals/:id/occurrences`; a leitura da
chegada **não ganhou chave** (guardas exatas). **Desfazer é só `occurrences.resolve`** (`canResolve`), abrir/marcar/concluir é
`trip.manage`; a janela vale só para abrir; concluir espera a tratativa `decided|closed`; `returned` é terminal — tudo em
`cargoNoteActions.service.ts` (puro). A foto reduz por `buildOccurrencePhotoAttachment` (serviço de `trip/shared`, nunca componente
nem hook do `trip`); `Idempotency-Key` por tentativa. Nota marcada sai do passo de separar, do "Separar tudo" e trava "Fechar
chegada" (motivo antes do clique). ⚠️ O `Select` não abre em teste de DOM sem `stubVisibleLayout()`. Detalhe: docs/ai-context §
"Spec 237 T3.3".

## A tratativa da avaria de recebimento no painel (spec 237 T3.4b)

No detalhe do escritório (`/recebimento/:id/detalhe`), cada avaria ganha as ações da tratativa para quem tem `occurrences.resolve`
(`CargoOccurrenceCaseActions`): só o que a máquina da API aceita em cada estado (`resolveCargoCaseActions`), confirmação/motivo onde
a ação não se desfaz, decisão só `other`/`goods_paid` (nunca reentrega), e o acerto sem motorista/`payerId` antes de encerrar
`goods_paid` (a leitura não traz a decisão: o formulário abre ao decidir aqui ou no 422 do encerramento). Independe do estado da chegada.
Origem de tratativa cancelada não motiva devolução; URLs assinadas das miniaturas ficam estáveis entre leituras; progresso do celular
só conta notas que ainda se separam. ⚠️ Em contrato de DOM, `beforeEach` de arquivo vale para a suíte inteira: leia o dublê por
`currentCaseDouble()`. Detalhe: docs/ai-context/frontend-transportada.md § "Spec 237 T3.4b".

## A devolução soma os itens no painel (spec 247)

A aba Tipos configura número do documento do cliente, valor pago (modo, escopo, rótulo) e o e-mail à contratante; a **prévia vem do
servidor** (`POST /company-settings/occurrence-types/email-preview`), nunca de uma segunda implementação no painel. A correção
(`TripOccurrenceCorrectionForm`) obedece `requirements` do **detalhe** da ocorrência (modo efetivo: `off` esconde, `required` sem
"Limpar"), para não depender de `settings.manage`; `useOccurrenceTypeRecordConfig` é só fallback quando `requirements` falta.
`occurrenceAmount.service.ts` espelha o cálculo da API (`bigint`; contrato `occurrence-amount-mirror.contract.ts`) e a soma da linha
usa o `unitValue` **copiado** em `itemValues`, não o preço atual da nota. O rascunho do e-mail só some quando o salvar pousa (PUT que falha preserva o texto). ⚠️ `fixtures/*.golden.json` são cópia idêntica da API.
O acerto da 164 sugere o valor pago, senão a soma, mas só onde há tratativa (o registro do motorista não a abre: decisão pendente).
Detalhe: docs/ai-context/frontend-transportada.md § "Spec 247".
