## frontend-transportada

React 19.2 + Vite 7.3 + TanStack Query 5 (`retry: false`, `staleTime` 30s). **Sem router**: navegação
manual em `src/main.tsx` (`pushState` + `popstate` + `sessionStorage`). **Sem Tailwind e sem zod** —
`tailwind-merge`/`clsx`/`cva` estão no package.json mas não são usados; `cn()` é reimplementado em
`src/lib/utils.ts`; validação é type guard manual em `*.validation.ts`.

Módulos em `src/modules/`: `billing`, `company-settings`, `cte-batch`, `cte-issuance`,
`cte-profiles`, `fleet`, `foundation`, `freight`, `identity`, `mdfe-manifest`, `nfe-workspace`,
`nfse-invoice`, `notification`, `operations`, `trip`, `shared`. `shared/` concentra client HTTP +
validação + view-model. Um client HTTP **por módulo** (`shared/<modulo>Client.service.ts`), com `fetch`
injetado por dependência. Auth via `KeycloakAuthProvider`.

**Configuração perto do efeito:** um painel de configuração mora na tela onde o efeito dele aparece,
não numa tela de configurações que cresce sem fim. O endereço de cada painel é declarado uma vez em
`company-settings/shared/companySettingsTabs.service.ts` — `SETTINGS_PANEL_PLACEMENT` mapeia painel →
`{module, source, tab}`, e `settingsPanelsOf`, `settingsTabsOf` (ordem de declaração = ordem das abas)
e `resolveSettingsDataScope` derivam dali. É esse registro que garante o campo **vir preenchido**:
a tela liga a consulta com `enabled: canManageSettings && settingsScope.<source>` — permissão **e**
aba aberta —, então abrir a aba busca o cadastro que já existe em vez de mostrar formulário em branco.
Contrato em `test/company-settings/tabs.contract.ts`.

- `company-settings` tem **Empresa**, **Site**, **Certificados** e **Tributos** (spec 126).
- **Tributos** é o regime federal e o PIS/COFINS (`federalTaxes`, aba `taxes`), servido por
  `GET`/`PUT`/`DELETE /company-settings/federal-taxes` (`settings.manage`, escopo `company`, trilha
  em `audit_logs`). A tela mostra **percentual** e grava **fração** — a conversão é textual em
  `shared/fractionPercentage.service.ts`, e a API recusa alíquota acima de `0.2`
  (`COMPANY_FEDERAL_TAX_RATE_OUT_OF_RANGE`) justamente para pegar `0.65` digitado no lugar de
  `0.0065`. A sugestão sai do CRT (`1`/`2` → Simples, zero, dentro do DAS; `3` → Presumido
  0,65%/3,00% ou Real 1,65%/7,60% nominais), a origem fica impressa ao lado do campo, e digitar apaga
  a marca. Simples com alíquota ≠ 0 é recusado (`COMPANY_FEDERAL_TAX_SIMPLE_NOT_ZERO`). Na conta, o
  federal segue a origem da receita: sobre receita prevista sai `estimated`. ⚠️ A CBS (LC 214/2025)
  substitui PIS/COFINS a partir de 2027 — a troca é spec própria.
- A busca automática de notas (opt-in + cursor) mora na aba **Remota** de `nfe-workspace`, guardada
  por `settings.manage`; sem a permissão a aba continua visível com o cartão somente-leitura, porque
  ali é informação de operação. Contrato em `test/nfe-workspace/distribution-settings.contract.ts`.
- O ajuste de preço de combustível mora na aba **Combustível** de `fleet` e a credencial da Nota RP
  mais os perfis de emissão na aba **Configurações** de `nfse-invoice` — as duas guardadas por
  `settings.manage`.
- A tabela de frete mora na aba **Regiões** de `fleet`, e ali a permissão guarda **a escrita, não a
  aba**: sem `settings.manage` sobram a tabela e o mapa, e nenhum botão. Ler região é `fleet.read`
  porque a cobertura é o que o formulário de motorista consulta, e quem cuida da frota sem
  administrar configuração ainda precisa ver em que zona a cidade caiu — aba escondida não mostraria
  nem uma coisa nem outra. Por isso a consulta desta aba liga só com `settingsScope.freightRegions`,
  sem o `canManageSettings` que as outras exigem. Contrato em `test/fleet/regions-tab.contract.ts`.
- Painel movido leva junto os rótulos: as chaves vão para o `*.locale.json` do módulo de destino, e o
  atalho que apontava para a tela de origem é retirado — atalho para tela que não hospeda mais o
  controle é caminho para lugar nenhum.

**O mapa da zona é desenho nosso, e a malha vem do IBGE** (`fleet/shared/ibgeMesh.service.ts`, o
quarto e último destino externo do módulo, ao lado do Photon e das duas rotas da BrasilAPI —
`https://servicodados.ibge.gov.br/api/v3/malhas/estados`, por UF, na qualidade mínima e recortada por
município). Aqui **não há `iframe` nem imagem remota** — como no endereço do motorista desde a
ADR-0037: o SVG é primitivo do design system e a cor da zona sai dos tokens, então
nada de terceiro renderiza dentro da nossa tela — e a malha não leva dado pessoal, só a sigla do
estado. Município com ilha ou enclave vira **um** caminho fechado: desenhar anel por anel pintaria a
mesma cidade em duas cores quando a zona mudasse. Cidade gravada sem polígono na malha (grafia que o
IBGE não reconhece, cidade de outra UF) é **nomeada fora do mapa**, nunca escondida — zona vista pela
metade é pior que zona vista inteira com um aviso ao lado —, e o casamento é pela dobra de
`normalizeVehicleCatalogName`, não pela grafia, para `BARRINHA/SP` da planilha casar com `Barrinha`
do IBGE. Com uma zona aberta no formulário, clicar no município acrescenta a cidade e clicar de novo
a retira, **pela grafia gravada**: pela do IBGE a cidade importada seria impossível de desmarcar.
Por isso `useFreightRegionForm` mora no `FreightRegionEditorDeck`, acima do formulário e do mapa —
os dois escrevem na mesma lista de cidades, e trocar a zona em edição é remontagem por `key`.

Tokens de design em `:root` de `src/styles/index.css` (`--color-*`, `--font-*`, `--space-1..16`), tema
escuro único. Design system caseiro em `src/components/ui/`. Estilos por módulo em `*.module.css`.

Todo container de tela usa `width: var(--layout-width)` — nenhum módulo declara largura própria, para
o cabeçalho da aplicação e os painéis fecharem na mesma borda. Detalhes em `docs/frontend/layout.md`,
contrato em `test/design-system/layout-width.contract.ts`.

Toda largura de tela sai dos quatro pontos de quebra do `web.md` §10 — base (sem consulta), `40rem`,
`64rem` e `80rem` —, sempre em `min-width`: `max-width` e `width <=` são **proibidos** em
`src/**/*.css` e o contrato `test/design-system/responsive.contract.ts` falha com qualquer um dos
dois, e com ponto de quebra fora dos quatro. Regra completa, com o alvo de toque de 44px e as três
larguras de conferência, em `docs/frontend/responsive.md`.

Todo campo (`input`, `textarea`, gatilho de select) tira altura, padding e corpo de texto dos tokens
`--field-height`/`--field-padding`/`--field-font-size` (e suas variantes `*-compact`) — nenhum módulo
inventa altura própria. Detalhes em `docs/frontend/fields.md`, contrato em
`test/design-system/field-metrics.contract.ts`.

Todo campo de data usa `@/components/ui/date-picker` (uma data) ou `@/components/ui/date-range-picker`
(período) — o campo de data nativo é **proibido** em `src/**/*.tsx` fora de `src/components/ui/` e o
contrato `test/design-system/date-picker.contract.ts` falha se algum reaparecer. Módulo com invólucro
próprio de campo publica o dele ao lado do de texto (`FleetDateField`, `ProfileDateField`) em vez de
aceitar um `type` que escolhe entre texto e data — era por esse `type` que o nativo entrava. Regra na
seção "Data é calendário" de `docs/frontend/fields.md`.

Toda leitura de etiqueta pela câmera usa `@/components/ui/barcode-scanner` — `BarcodeDetector`
quando o navegador tem (Chromium no Android) e o decodificador do `@zxing/library` num worker
empacotado pelo Vite quando não (Safari do iPhone, Firefox). O worker é referenciado por
`new URL(…, import.meta.url)`, **nunca** por `blob:`: a CSP declara `worker-src 'self'` e o leitor
não a afrouxa (ADR-0042). Câmera ausente ou permissão negada devolvem indisponibilidade, não
exceção — o campo digitado continua sendo o caminho. Regra em `docs/frontend/barcode-scanner.md`,
contrato em `test/design-system/barcode-scanner.contract.ts`.

Todo checkbox usa `@/components/ui/checkbox` — `<input type="checkbox">` cru é **proibido** em
`src/**/*.tsx` e o contrato `test/design-system/checkbox.contract.ts` falha se algum reaparecer.
Props, variante com/sem rótulo e estado indeterminado em `docs/frontend/checkboxes.md`.

**Dica de interface é `@/components/ui/tooltip`, não o `title` nativo.** O atributo funciona e mesmo
assim não serve: o navegador espera cerca de um segundo com o ponteiro parado, desenha fora do tema e
não existe no toque — três dicas foram acrescentadas por `title` e as três voltaram como "passei o
mouse e não apareceu". O componente abre em 150 ms no ponteiro e **na hora** no teclado, entra como
`aria-describedby` (nunca como nome acessível — botão só de ícone continua com o `aria-label` dele) e
renderiza em portal por `useFloatingLayer`, como os selects. ⚠️ O invólucro é `inline-flex` e **não**
`display: contents`: elemento sem caixa devolve `getBoundingClientRect()` zerado e a dica nasce no
canto da tela. O `title` fica só onde a dica é acessório de leitura, como o texto completo de célula
truncada. O tooltip do menu lateral recolhido segue em CSS puro, exceção declarada. Regra em
`docs/frontend/tooltips.md`, contrato em `test/design-system/tooltip.contract.ts`.

Todo ícone vem de `@/components/ui/icon` — `<svg>` cru é **proibido** em `src/**/*.tsx` fora de
`src/components/ui/` e o contrato `test/design-system/icon.contract.ts` falha se algum reaparecer.
Tamanho por token (`--icon-size-sm`/`--icon-size-md`), cor por `currentColor`, botão só de ícone com
`aria-label` obrigatório. Nomes disponíveis e como criar um novo em `docs/frontend/icons.md`.

Todo botão que hospeda ícone alinha ícone e rótulo por **uma regra global** (`button:has(svg)` em
`src/styles/index.css`), nunca por CSS de módulo: classe de botão com ícone não declara `display`
(a especificidade venceria a regra e devolveria o ícone colado ao rótulo) nem `gap` fora da escala
`--space-*`. Regra completa em `docs/frontend/buttons.md`, contrato em
`test/design-system/button.contract.ts`.

Toda altura de controle sai de `--control-height` / `--control-height-compact` (derivados de
`--field-height*`): as duas classes de tamanho do botão e todo botão só de ícone, que é quadrado
nesse valor. Nenhum módulo declara controle quadrado com medida literal em `rem` — era assim que
"Novo veículo" (2,5rem), o botão de colunas (2,25rem) e a barra de filtro (2,4rem) davam três
alturas na mesma fileira. Contrato em `test/design-system/control-height.contract.ts`.

Todo campo de seleção usa `@/components/ui/select` — `<select>` nativo é **proibido** em
`src/**/*.tsx` e o contrato `test/design-system/select.contract.ts` falha se algum reaparecer.
Contrato de props, teclado e ARIA em `docs/frontend/selects.md`. Campo que aceita **vários**
valores usa `@/components/ui/multi-select` — gatilho com a contagem, painel buscável que não fecha a
cada escolha e o escolhido em pílulas abaixo; grade de caixas por opção empurrava o resto da ficha
para fora da tela (é o caso do vínculo de veículos do motorista). Contrato em
`test/design-system/multi-select.contract.ts`.

Todo painel que abre sobre a tela (lista do select, calendários) é renderizado em portal no
`document.body` e posicionado pelo hook `useFloatingLayer` — dentro de modal ou tabela rolável o
`position: absolute` era recortado pelo `overflow` do ancestral. Contrato em
`test/design-system/floating-layer.contract.ts`, regra na seção "Camada flutuante" de
`docs/frontend/selects.md`.

Tabelas com muitas informações seguem `docs/frontend/data-tables.md` (contrato obrigatório: ordenação,
filtros multi-valor, filtro simples + avançado com grupos E/OU aninhados, reordenação/visibilidade de
colunas persistida em `localStorage`, seleção em massa, teste de contrato). Duas referências vivas: o
módulo `nfe-workspace` (tabela "Notas") — hook `useNfeDocumentTable.hook.ts` +
`AdvancedFilterBuilder.component.tsx` — e o módulo `cte-batch` (tabela de CT-es) — hook
`useCteItemTable.hook.ts`, que acrescenta paginação por cursor, soma decimal da seleção entre páginas
e status escondido por padrão (`CTE_ITEM_DEFAULT_HIDDEN_STATUSES`).

Todo filtro ativo aparece como pílula removível vinda de `@/components/ui/filter-pills`
(`components/ui/filter-pills.tsx`) — nenhum módulo desenha a sua. Os descritores ficam em
`shared/<modulo>FilterPills.service.ts` (sem tradução, com `formatDay` injetado) e a remoção por campo
em `clearFilterField` do hook; no modo simples o badge do filtro usa `countFilterPills(pills)`, e a
pílula que resume vários filtros declara o próprio peso em `count`. Regra completa na
§ 8 de `docs/frontend/data-tables.md`, contrato em `test/design-system/filter-pills.contract.ts`.

Toda contagem de filtros ativos no botão de ícone vem de `@/components/ui/count-badge` — o badge fica
**ao lado do ícone, dentro do botão**, e a regra global `button:has([data-count-badge])` em
`src/styles/index.css` troca a largura fixa do botão por `width: auto` + `padding-inline`. No canto
(`position: absolute`) ele ficava pendurado por cima da borda e era recortado pelo `overflow` da barra
de ações. Regra na § 9 de `docs/frontend/data-tables.md`, contrato em
`test/design-system/count-badge.contract.ts`.

Todo estado de carregamento (`isLoading` de query, gate de página, tabela, painel, diálogo)
renderiza um esqueleto de `@/components/ui/skeleton` com a mesma forma do conteúdo real que ele
antecede — nunca texto solto ("Carregando…") nem `null`, que é o que causa o piscar da tela ao
trocar para o conteúdo. Regra completa e como compor por tipo de tela em `docs/frontend/loading.md`,
contrato em `test/design-system/skeleton.contract.ts`.

Todo painel que nasce por clique do operador — os quatro editores inline: `FreightRegionForm`,
`VehicleForm`, `DriverForm` e `CteProfileForm` — chama `useRevealedPanel`
(`shared/useRevealedPanel.hook.ts`), que rola até ele (`block: 'start'`, instantâneo sob
`prefers-reduced-motion`) e foca o primeiro campo com `preventScroll`. Esses formulários são
renderizados **depois** da lista que os abre: com a tabela cheia o painel montava duas telas abaixo
do botão, e quem clicava em "Nova zona" concluía que nada tinha acontecido — o `<form>` estava no
DOM, que é por isso que a conferência por DOM não pegou. A margem do topo é a regra global
`[data-revealed-panel]` em `src/styles/index.css`, nunca CSS de módulo. Painel sempre visível e
formulário em diálogo (que já tem `useModalDialog`) ficam de fora. Regra em
`docs/frontend/panels.md`, contrato em `test/design-system/panel-reveal.contract.ts`.

Toda mutação que mexe num **vínculo** dispara um efeito de
`shared/mutationInvalidation.service.ts` (`invalidateMutationEffect`), nunca uma lista de chaves
montada à mão — e nenhum hook importa a chave de consulta de outro módulo para invalidá-la. O
alcance mora num lugar só porque era rederivado em dez hooks: todo caminho que _cria_ o vínculo
invalidava os dois lados, e todo caminho que o _solta_ nasceu invalidando só o seu — descartar a
NFS-e devolvia a nota no banco e a tabela seguia com o `cteBlockReason` da consulta anterior, nota
impossível de selecionar até recarregar a página. Dois efeitos hoje: `nfeDocumentLink` e
`billingInvoiceItem`. Regra e como acrescentar um efeito em `docs/frontend/mutations.md`, contrato
em `test/shared/mutation-invalidation.contract.ts`.

**O separador bipa em sequência, e a recusa fica na linha da nota.** A leitura não preenche o campo
digitável — cada chave lida vira uma linha em `TripScanQueue.component.tsx`, com esqueleto enquanto
resolve e o motivo impresso ao lado quando a nota é recusada; uma nota que não existe nesta empresa
não derruba as vizinhas nem interrompe o bipe seguinte. A fila é serviço puro
(`trip/shared/tripScanQueue.service.ts`): `acceptScannedText` extrai a chave e **descarta a
duplicata** (o separador passa a mesma etiqueta duas vezes o tempo todo), e `markScanEntry` **ignora
veredito de chave que não está mais na fila** — as respostas chegam fora de ordem e "Limpar leituras"
não pode ressuscitar linha nenhuma. O seam é puro porque o teste desta app não tem DOM: o
comportamento se prova na função, e o contrato `test/trip/scan-link.contract.ts` cobra a fiação por
texto de fonte. Vincular e desvincular disparam `MUTATION_EFFECT.nfeDocumentLink` além das chaves da
viagem; marcar entregue **não** — ali muda o estado da nota dentro da viagem, não o vínculo dela com
lote ou NFS-e.

**A viagem lista por parada, e toda mutação de estado mora no mesmo hook.** `TripDetail` agrupa
`trip.stops` (T014/T015), cada parada com arraste por `@dnd-kit` (`TripStopList.component.tsx` +
`useTripStopOrder.hook.ts`, escolhido em vez de HTML5 `draggable` nativo por acessibilidade de
teclado e pelo alvo de toque de 375px que `draggable` não cobre) — nota sem parada (CEP que não
normaliza, ou a lacuna de reconciliação do backend antes de ser corrigida) cai num balde "Sem
parada" via o mesmo componente de linha, nunca some da tela. **Nenhuma pasta `mutations/` existe no
módulo** apesar de três tasks da spec 056 sugerirem esse caminho de arquivo — toda mutação de
viagem (criar, fechar, vincular, liberar, reordenar parada, desviar endereço, separar/carregar/
devolver nota, lote, despachar, cancelar, planejar rota) entra em `useTripWorkspace.hook.ts`, ao
lado das demais; seguir o nome de arquivo sugerido teria fragmentado o mesmo padrão em dois
lugares. O diálogo de despacho forçado (`TripStateActions.component.tsx`) calcula as notas
pendentes **direto de `trip.documents`** (mesmo filtro `pending`/`separated` do backend) em vez de
decodificar `error.details` depois de uma tentativa recusada — evita o round-trip e é o mesmo dado.

**A câmera é permitida à própria origem, e só ela.** `server.ts` responde
`Permissions-Policy: camera=(self), geolocation=(), microphone=()` — `camera=()` negava a **própria**
origem e fazia `getUserMedia` falhar antes de qualquer diálogo do navegador. `(self)` não é `*`:
nenhum terceiro herda a câmera, e a CSP já declara `frame-src 'none'` desde a ADR-0037. O contrato
`test/shared/security-headers.contract.ts` guarda os dois sentidos — falha se `camera` voltar a `()`
e falha se `geolocation` ou `microphone` deixarem de ser `()`, que é a carona de capacidade de
dispositivo seis meses adiante. Achado datado em `docs/SECURITY.md`.

**Marca e modelo do veículo têm saída da lista, e a frota realimenta a lista.** O catálogo FIPE não
tem implemento, marca regional nem cavalo antigo: `VehicleCatalogField.component.tsx` acrescenta a
opção **"Outro — digitar"** (`VEHICLE_CATALOG_OTHER_VALUE`, sentinela que nunca é gravada — escolhê-la
limpa o campo e abre a digitação, com "Escolher da lista" para voltar). O que foi digitado à mão volta
como opção na próxima vez: `buildVehicleCatalogChoices` soma catálogo + marcas/modelos já cadastrados
na frota + o valor gravado na ficha aberta, deduplicados por `normalizeVehicleCatalogName` — a mesma
dobra que `vehicleBrandDefaults.service.ts` usa para herdar ficha técnica, senão a lista mostraria
"Randon" e "RANDON" separadas enquanto a herança as trataria como uma marca só. Lista vazia abre
digitável direto; carregando e bloqueado por falta do tipo do veículo seguem como select. Contrato em
`test/fleet/vehicle-catalog-other.contract.ts`.

Texto pt-BR nos `*.locale.json` vai **acentuado**. O contrato `test/shared/locale-accents.contract.ts`
varre por glob todo `src/modules/*/locales/*.locale.json` que não seja `.en.` e falha se achar palavra
de uma blocklist de formas que não existem sem acento (`nao`, `possivel`, `numero`, `pagina`, …).
Módulo novo entra na varredura sozinho; palavra nova que escapar se acrescenta à blocklist.

Fora de produção o ícone da aba troca para `public/icons/icon-work-in-progress.svg` — a marca fica
**do tamanho normal**, e o 🚧 entra como plaquinha sobreposta no canto inferior esquerdo, dentro do
próprio desenho, porque na aba o ícone é o que aparece antes do título; encolher a marca para abrir
espaço ao aviso tornava o ícone irreconhecível justamente onde ele é menor. O título fica só com o
nome, para não haver dois avisos lado a lado. A tela abre com uma faixa de
ambiente. Quem decide é
`VITE_APP_ENV` (`local` · `staging` · `production`), resolvido em
`shared/deploymentEnvironment.service.ts`: ausente ou desconhecido cai em `production` — variável
esquecida no painel não pode fazer a instalação do cliente pedir desculpas. Build de dev (`vite dev`)
cai em `local` sem configurar nada. Contrato em `test/shared/deployment-environment.contract.ts`,
que também guarda o `ARG VITE_APP_ENV` do `Dockerfile` — sem ele o valor não entra no bundle.

**O tema de login também troca o ícone fora de produção.** Ele era a única tela do produto que não
avisava o ambiente — a app troca o `<link rel=icon>` em tempo de execução e o tema seguia com a marca
de produção em toda instalação. O tema lê `appEnvironment=${env.TRANSPORTADA_APP_ENV}` no
`theme.properties` (o `compose.yaml` passa `VITE_APP_ENV`), e o `template.ftl` compara com `local` e
`staging`. ⚠️ **Ausente deixa o literal `${env.…}` no valor** — medido em container de sonda —, então
a propriedade nunca fica vazia e um `<#if>` que testasse conteúdo acenderia o 🚧 na instalação do
cliente; por isso a comparação é com lista fechada. ⚠️ **`?seq_contains` sobre sequência literal é
recusado** pelo FreeMarker do Keycloak: a condição sai sempre falsa, sem erro nenhum. Medido nos
cinco casos (`local`, `staging`, `production`, ausente, valor desconhecido).

⚠️ **Em staging a variável não existia** — medido no painel do Railway em 2026-09-08 —, e por isso ela
é **literal** em `.railway/railway.ts` (`isProduction ? 'production' : 'staging'`), não `preserve()`:
o valor não é segredo, é determinado pelo ambiente, e deixá-lo no painel só recria o modo de falha que
ele existe para evitar. ⚠️ O arquivo só vale depois de `railway config apply`.

A tela de login **não é desta app**: é o tema Keycloak em `deploy/keycloak/theme/`, montado pelo
`compose.yaml` e copiado pelo `deploy/keycloak/Dockerfile` — o mesmo diretório nos dois caminhos.
Herda de `base` (não de `keycloak.v2`, que arrasta o PatternFly) e reescreve `template.ftl` e
`login.ftl`; os tokens de design são **cópia por valor** de `src/styles/index.css`, porque o tema
não importa código nosso. Mudou cor, fonte ou escala aqui? copie lá. Regra completa em
`docs/frontend/login-theme.md`.

**A CSP nasce no build, e o servidor não sobe sem ela.** `VITE_API_URL` e `VITE_KEYCLOAK_URL` são
inlinadas no bundle e **não existem** no contêiner que serve o `dist` — o estágio de runtime do
`Dockerfile` copia só `dist` e `server.ts`, e `server.ts` não pode importar de `src/`. Então a
diretiva tem fonte única em `shared/contentSecurityPolicy.service.ts`, o plugin
`transportada-content-security-policy` do `vite.config.ts` emite `dist/content-security-policy.txt`, e
o `server.ts` lê o arquivo **fail-closed** (`FRONTEND_MISSING_CONTENT_SECURITY_POLICY`): publicar sem
cabeçalho é a única falha que não quebra nada visível. Destino externo novo entra **nesse**
`connect-src` — nunca numa segunda diretiva, que não soma (a primeira ocorrência vence).
`'unsafe-inline'` existe **só** em `style-src`, pelo atributo `style` da camada flutuante que nonce
não cobre — `style-src-attr` é ignorado pelo Safari < 15.4 e quebraria todo select no iPhone —, e o
servidor de **dev** ganha `'unsafe-inline'` no `script-src` porque o `@vitejs/plugin-react` injeta o
preâmbulo do react-refresh inline. O contrato
`test/shared/content-security-policy.contract.ts` varre `src/**/*.{ts,tsx,css,json}` por origem
`https://` e falha se alguma não estiver no `connect-src` nem em `NON_FETCH_ORIGIN` (origem que o
bundle nomeia mas nunca busca, hoje só o link do rodapé).

Envs: `VITE_API_URL`, `VITE_APP_ENV`, `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`,
`VITE_KEYCLOAK_CLIENT_ID`.

**A proposta se revisa dentro do diálogo que a pediu, viagem por viagem** (spec 110). Ela era
renderizada em `TripWorkspace.page.tsx`, entre os botões e a tabela, e o diálogo fechava **antes** de
ela aparecer — quem escolheu 132 notas, 5 motoristas e 5 veículos perdia de vista o pedido que gerou
aquilo. Hoje o diálogo fica aberto e o formulário recolhe numa faixa com "Alterar o pedido"; ele
fecha no aceite. Cada viagem proposta é uma linha expansível: marca do veículo (cor da viagem na
borda, `VEHICLE_TYPE_ICONS` dentro), motorista, placa, cidades, e seis números em **grade de largura
fixa** — `flex` fazia `R$ 541,85` não cair embaixo de `R$ 1.211,97`, e número que não alinha não se
compara.

⚠️ **Os totais da barra são do que está MARCADO.** `POST /route-suggestions/:id/accept` passou a
aceitar `vehicleIds` (ausente = a proposta inteira, o corpo de sempre), e o aceite parcial
**consome** a sugestão: manter `ready` para aceitar o resto depois descreveria, na segunda metade,
uma distribuição que o maço já não tem. A recusa de veículo fora da proposta vem **antes** da
reivindicação da spec 107 D2 — consumir a sugestão por um id errado queimaria uma proposta boa.

⚠️ **Três campos que a API sempre mandou e o adaptador descartava**: a parada inteira
(`estimatedArrivalAt`, `distanceFromPreviousMeters`, `durationFromPreviousSeconds`,
`geocodingPrecision` — `coverableStopsFromApi` lia 4 de 12) e o `endPolicy`, que vem em
`assumptions`. Nenhum dos dois precisou de mudança de API, e por isso não têm janela de deploy.

⚠️ **A ordem se troca à mão, e o aceite a leva** (spec 111, reverte a D6). As setas ao lado da lixeira
trocam a parada de lugar **na tela**, e só "Salvar alterações" mede: carga, conta e rota **pausam**
enquanto há rascunho (seguram o último número medido) e o aceite fica travado — na primeira versão
cada toque ia três vezes ao servidor, duas ao OSRM. O
aceite recebe `stopOrderByVehicle` com a regra de `orderStopKeys` — parada não mencionada vai ao fim,
chave desconhecida é ignorada (o degrau `cidade:` da tela), parada de **outro** caminhão é
**movimento** — ela vai com as notas dela (spec 112) —, e a mesma parada na ordem de dois caminhões
é 400 antes da reivindicação. Um select por parada joga
a parada em outro caminhão com **sobra de peso** na ficha — peso, não cubagem: cubagem só é calculada
para o caminhão aberto. O movimento é rascunho como a ordem, identificado pela **nota** (o id vem do
servidor; a chave é recalculada na tela), e o caminhão alterado e salvo mostra dinheiro, tempo e
distância como ausência na linha recolhida: a conta do roteirizador descreve outra carga. Ordem trocada nasce **sem horário previsto**: ele é gravado casado por endereço, na
ordem do solver. ⚠️ O corpo é `.strict()`: **a API sobe antes do front**.

⚠️ **Verde é o que entra, vermelho é o que sai — nas duas portas da proposta.** Receita e lucro em
`--color-ready`, despesa e prejuízo em `--color-alert`, no razão, na linha recolhida, na barra de
totais e na porta da tabela de Notas (`SuggestionValuationReport`, `SuggestionVehicleValuation`). ⚠️ O
`.negative` do `trip.module.css` é **cobre**, não vermelho, e é usado por outras telas: quem pintar
prejuízo na proposta usa `proposalExpenses`, nunca ele — foi assim que o mesmo prejuízo saía laranja
na linha e vermelho no razão, na mesma tela.

⚠️ **Tirar destino é marcação, não destruição.** A parada fica **riscada com "Desfazer"** e o aceite
é recusado até o recálculo — que é **da proposta**, não de um caminhão, porque mexer no maço muda a
distribuição inteira. **Mover destino para outro caminhão não existe**: o solver redistribui e
desfaria o movimento; ele exige fixar parada em veículo, que é spec própria. E "adicionar" é o
próprio "Alterar o pedido".

⚠️ **A conta mora num lugar só.** `ValuationLedger` (`trip-financials`) é o razão de uma coluna com a
derivação de cada custo na linha de baixo — combustível traz consumo, preço e litros; motorista traz
a zona, a cidade que a decidiu e a classe. A API sobe os insumos **crus** (`TripCostParcelBasis`), e
a frase é composta na tela, que é quem traduz e formata. `valuationSteps.service.ts` saiu:
`TripValuationPreview` virou só permissão, esqueleto e vazio. `VehicleIdentityBand` (`fleet`) segue a
mesma regra, e `test/trip/manual-creation-convergence.contract.ts` reprova a segunda implementação —
ela **compila igual**, e só aparece quando os dois números discordam.

⚠️ **O pedágio da proposta vem do mapa, não da sugestão** (spec 111). O expandido de cada viagem
proposta desenha `TripAssemblyMap`, que pede a rota ao OSRM com nós e imprime as praças por trecho — e
a conta ao lado é `useTripValuationPreview`, que tira distância **e** pedágio dessa mesma chamada. Antes
o razão era a conta da sugestão, medida na matriz do solver: o `/table` do OSRM **não tem nós**, então
o mapa imprimia R$ 71,40 e o razão logo abaixo dizia "pedágio só é calculado depois da viagem criada".
⚠️ As **linhas recolhidas e a barra de totais** ainda leem a conta da sugestão, sem pedágio — até
irem à prévia, linha recolhida e expandido podem discordar em pedágio e distância. Pedágio na sugestão
em si exige `/route?annotations=nodes` por veículo no worker, e é spec própria.

⚠️ **`var(--x)` sem definição apaga a declaração inteira**, sem erro e sem console. Medido em
2026-09-09: **59 declarações descartadas em 5 arquivos**, com onze tokens fantasmas — o painel da
proposta renderizava sem borda e o relatório de endereços da spec 084 é quase todo construído sobre
eles. `test/design-system/css-tokens.contract.ts` varre por glob: folha nova entra sozinha.

**A sugestão de roteiro tem duas portas, e a segunda não parte de viagem** (spec 058 P2). A de
sempre é `POST /trips/:id/route-suggestions`: a viagem existe, as paradas existem, e o solver só
reordena. A outra é **`POST /route-suggestions/multi-vehicle`**, fora da árvore `/trips/:id` de
propósito — ela recebe um **pool de notas** e uma **frota**, e é o aceite que cria as viagens. Todas
sob `trip.manage`; ler é `fleet.read`.

O que muda por dentro: `route_suggestions.trip_id` é nulo, `route_suggestion_documents` guarda o
pool, `route_suggestion_vehicles` guarda a frota **na ordem oferecida** (é ela que faz a mesma
semente distribuir igual), `route_suggestion_stops.vehicle_id` diz quem serve cada parada e
`route_suggestion_stop_documents` diz qual nota cai em qual parada proposta — sem essa última, o
aceite reagruparia as notas por endereço de novo, e o segundo agrupamento poderia discordar do
primeiro. Nota já em viagem e veículo que não traciona são recusados na criação (`409`), com o id no
`details`.

⚠️ **O aceite cria viagem, mas não escreve viagem**: ele chama os casos de uso da 056 — criar,
vincular, ordenar, planejar —, um por veículo, e as viagens saem em `route_planned`. As viagens
nascem **antes** de a sugestão virar `accepted`: falha no meio deixa a sugestão `ready` para repetir.

**A viagem nasce com o motorista que o humano pareou** (ADR-0055, spec 081), e isso reverte a frase
"viagem nasce sem motorista" da ADR-0044 §5. O argumento dela estava certo sobre _deduzir_ e errado
sobre _carregar_: o PWA de campo acha a viagem por `membership → fleet_drivers → trip_drivers →
trip` (`find-current-driver-trip.use-case.ts`), e **viagem sem linha em `trip_drivers` não existe
para quem dirige** — nada do trabalho de campo chega até ele. O corpo da rota é
`vehicles: [{vehicleId, driverId?}]` (não mais `vehicleIds`), `route_suggestion_vehicles.driver_id`
é nulo e legítimo — distribuir na véspera, antes da escala, era o único comportamento possível antes
disto —, e o mesmo motorista em dois pares é `409`: seriam duas viagens simultâneas dele no PWA. O
aceite **não reconfere** o motorista; suspenso entre o pedido e o aceite, a viagem nasce com ele.

**A distribuição proposta diz quanto rende, e a distância não é pedida de novo** (spec 101).
`GET /route-suggestions/:id/valuation` (`trip.financials`, escopo `company` — dinheiro tem permissão
própria: quem monta o roteiro não ganha a margem de carona) devolve uma conta **por viagem
proposta** mais o relatório do conjunto. Até ela, a tela em que o operador escolhe entre distribuir
a carga de um jeito ou de outro mostrava só contagem de paradas — era a única tela do produto que
não dizia qual dos jeitos paga.

⚠️ **A distância sai das paradas que o solver já escolheu, nunca de uma segunda consulta ao OSRM.**
Reusar `POST /trips/valuation-preview` N vezes seria o caminho curto e está errado: o solver
escolheu um trajeto, e outra consulta pode devolver outro — a tela desenharia um roteiro e cobraria
outro, os dois plausíveis. É a spec 090 D4 (_"o pedágio viaja na resposta da rota"_) um nível acima.
A guarda é **estrutural, não só um teste**: `SuggestionValuationPort`
(`routing/application/suggestion-valuation.port.ts`) **não expõe geometria nenhuma**, então chamar o
roteirizador ali exige alargar a interface, e isso aparece em revisão em vez de se esconder numa
linha do use case. `sumVehicleRoad` soma as pernas; parada sem perna anterior é o normal (a primeira,
e a excluída da otimização), mas veículo sem **nenhuma** perna conhecida é distância `null` — nunca
zero, que desceria o combustível a nada.

⚠️ **O pedágio não entra, e diz que não entrou.** Ele precisa dos `nodeIds` de `annotations=nodes`
(spec 090), e a sugestão não os persiste. A parcela sai como `TOLL_NOT_AVAILABLE_IN_SUGGESTION`,
distinta de `NOT_RECORDED` de propósito: na viagem o operador **pode** lançar, e dizer "ninguém
lançou" numa tela sem viagem o manda procurar um botão que não existe. Quem for persistir os
`nodeIds` fecha isso — é spec própria, porque mexe na **escrita** do solver.

⚠️ **A conta é uma só em todo o produto.** `buildValuationFromContext`
(`trips/application/read-trip-valuation.use-case.ts`) é o seam público que a viagem, a prévia da
montagem e a sugestão compartilham. Uma segunda implementação da margem divergiria **calada** — foi
exatamente assim que o preço do combustível passou a ler só o ajuste manual enquanto a ficha do
veículo lia o efetivo (spec 100).

⚠️ **Tempo total é a soma das durações, não o máximo**: são caminhões em paralelo, e a pergunta é
quanto custa operar o conjunto, não quando o último chega. Uma lacuna de qualquer veículo torna o
conjunto incompleto, e `test/suggestion-valuation/report.contract.ts` (frontend) reprova o
componente se o lucro aparecer sem a marca — inclusive se ela ficar escondida atrás de uma segunda
condição. ⚠️ O guard do corpo é `hasExactKeys` nas duas formas: **a API sobe antes do frontend**,
senão o painel some com 200 na rede e nada no console, o mesmo defeito de `VEHICLE_DETAIL_KEYS`.

⚠️ **O preenchimento é vínculo único, nunca dedução.** `multiVehiclePairing.service.ts` (frontend)
preenche o outro lado do par só quando `fleet_driver_vehicle_assignments` tem **um** — que é o caso
do agregado. Veículo com dois motoristas, ou motorista com dois veículos, fica vazio para o humano
decidir, e o de dois veículos nem aparece no seletor por motorista (ele entra pelo select da linha
do caminhão). Dois defeitos que o contrato pegou e que não se deduzem do código: desmarcar no
seletor por motorista **não pode** derrubar o par preenchido pela ponta do veículo, e escolher o
motorista cujo caminhão já está na lista **substitui** o par em vez de descartá-lo. O vínculo vem de
`GET /fleet/driver-vehicles` (`fleet.read`), pares crus da empresa — a rota por motorista custaria
uma requisição por motorista escolhido —, e o **separador a alcança**, por decisão registrada em
`test/separator-role.contract.test.ts`.

**O roteirizador tem teto, e ele diz quando não otimizou** (specs 104 e 105, adendo da ADR-0044).
Medido em 2026-09-09: 305 paradas produziram **6.655 km e 150 horas** em sete viagens, uma com 207
notas. Três causas, nenhuma delas o GA.

⚠️ **O `2-opt` era O(n³) por passada** — todos os pares, avaliação completa em cada candidato. Acima
de 200 paradas o GA completava **zero gerações** e devolvia a semente gulosa vestida de sugestão. A
correção é vizinhança granular (K=20, `routing/domain/neighbourhood.ts`) mais filtro por delta de
distância. Medido: 305 paradas de 0 para 121 gerações, de 123 s para 14 s, rotas 6,5% mais curtas.
⚠️ O delta **decide quem vale avaliar, nunca quem entra**: janela de tempo e jornada não são
decomponíveis em O(1), e quem aceita continua sendo a avaliação completa.

⚠️ **O orçamento era piso.** O relógio só era conferido entre gerações e o custo está dentro de uma:
30 s viravam 183 s. Hoje o `2-opt` o consulta no laço **externo** dos candidatos — no interno pagaria
O(n²) consultas por passada.

⚠️ **`optimizationQuality`** (`optimized` · `partial` · `greedy`) sai na solução: zero geração é a
semente, e não pode se apresentar como otimizada. **A API ainda não publica o campo**, então a marca
não chega à tela — elo aberto da 104.

⚠️ **`maxStopsPerRoute` existe e nasce `null`.** O fitness é a **soma** dos custos, e soma é
indiferente à distribuição — concentrar paradas próximas num veículo até a reduz, e 207 × 8 era o
ótimo do que pedimos. É teto **absoluto**, nunca fatia igualitária: a fatia obrigaria a usar a frota
inteira, e 20 notas com 6 caminhões dariam teto 4. Nenhuma origem o preenche — um padrão silencioso
mudaria o roteiro de toda instalação sem ninguém pedir.

⚠️ **Dez mil paradas numa instância só continua fora de alcance**, e a primeira parede não é o
solver: 10⁸ células × 2 métricas × 8 bytes = **1,6 GB** de matriz. O caminho é decomposição por
região — `freight_regions` já mapeia cidade → zona —, e é spec própria. Comparação com HGS,
OR-Tools, VROOM e PyVRP em `docs/routing/algorithm-review.md`.

**O filtro decide o que sai da tela de notas** (spec 103). `useNfeDocumentTable` não podava
`selectedIds` contra o filtro: o operador marcava um conjunto amplo, estreitava para 21, lia "21
notas encontradas" e despachava **345**. A poda é **derivação**
(`nfe-workspace/shared/documentSelectionScope.service.ts`), nunca apagamento — podar por efeito
reentraria a cada render, e apagar o estado faria quem só queria olhar outra faixa perder a escolha.
⚠️ A poda é contra o **filtro**, nunca contra a página: seleção entre páginas do mesmo filtro é
legítima. E a marcação escondida é **dita** (`countSelectionHiddenByFilter`), senão o número cai
sozinho e o operador conclui que perdeu a seleção.

⚠️ A chave de parada do pool (`worker-transportada/src/routing/domain/pool-address-key.ts`) é
**cópia por valor** de `api-transportada/src/trips/domain/stop-address-key.ts`, com contrato que
compara os dois arquivos linha a linha: se divergirem, a parada que o worker propõe e a parada que o
aceite cria deixam de casar, e o roteiro aceito fica com duas paradas no mesmo portão.
