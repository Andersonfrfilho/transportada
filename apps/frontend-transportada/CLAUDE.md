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

Envs: `VITE_API_URL`, `VITE_APP_ENV`, `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`,
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

⚠️ Não registre o DOM no processo dos contratos nem mova a suíte para a lista principal: o
`window` global muda o que eles medem (`resolveTripAssemblyDraftStorage` decide por `typeof
window`), e o `mock.module` que troca os clientes (`getTripClient`, `getRouteSuggestionClient`,
`loadAvailableTripDocuments`) vale para o processo inteiro — por isso ele é feito uma vez só, em
`test/trip-hooks/tripClientMocks.helper.ts`, e cada suíte reconfigura `tripHookFakes`. `renderHook`/`waitFor` são os de
`test/trip-hooks/renderHook.helper.ts`, sobre `react-dom/client` + `act` — sem
`@testing-library/*`. Storage em memória e cliente falso: `test/fixtures/tripAssemblyHooks.fixture.ts`.
