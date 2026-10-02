# Feature 227 — A nota se abre inteira

## Problema e resultado

Tudo o que se quer saber de **uma** entrega mora em três lugares da página `/trips/:id`, e quem investiga uma
nota percorre os três:

1. **"Detalhes da nota"** na linha da nota (telefone, contratante, regra de frete e — desde a spec 226 —
   custo e lucro);
2. **"Ver comprovante"**, que abre o comprovante e, **dentro dele**, uma terceira expansão com as
   ocorrências;
3. **a linha do tempo da viagem**, no pé da página, **uma só para todas as notas**, que se filtra por nota
   em memória.

O usuário aprovou, em 2026-10-02, um canvas que funde isso num **acordeão de uma nota por vez**: aberta, a
nota mostra _Dados da nota_, _Comprovante da entrega_, _Ocorrências_ e _Eventos desta entrega_, com botão de
copiar em cada campo e atalhos para as outras telas.

**Resultado**: abrir uma nota mostra tudo sobre aquela entrega num lugar só, na ordem em que a pessoa pergunta
("o que é?", "foi entregue?", "deu problema?", "o que aconteceu e onde?"), com copiar e links.

### A referência é um canvas, e a revisão final é contra ele

**Referência**: canvas "Preview expansivo de entrega" — `https://claude.ai/artifact/Q5dwyMjB9oTGG8x8FJab1T`,
prancha `project/Main.dc.html`, **versão 4**. Ele usa os **mesmos tokens** do painel (`--color-ready`,
`--color-alert`, `--color-copper`, `--color-slate`), então diferença de cor é defeito, não escolha.

Pedido do usuário: **"ao final compare ela com o seu preview"**. A tarefa final (T6.1) imprime a tela real e a
prancha do canvas **lado a lado**, em 1280 e 375 px, e lista **cada divergência** como defeito corrigido ou
pendência declarada. Ver D10 — o canvas tem **dados de mentira** que não são requisito.

## O que já existe (mapa de 2026-10-02, a reler no começo de cada fatia)

| Seção do canvas    | Hoje no app real                                                                                                                                                                                                             | Falta                                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dados da nota**  | `TripStopList.component.tsx` — linha da nota e "Detalhes da nota"; `TripDocumentCost` (spec 226)                                                                                                                             | **Série** separada (hoje colada: `123/1`); **CNPJ** (a API já devolve `contact.taxId`, **nenhum componente o imprime**); **Volumes** (**não existe na API**); botão de copiar por campo |
| **Comprovante**    | `TripDeliveryProof.component.tsx`, só **depois** de "Ver comprovante"; selo de situação `ProofReviewChip` (Aguardando conferência / Aprovado / Recusado); "Longe do ponto" é um badge **à parte**, dentro de `ProofReadings` | Um selo único; comprovante visível **sem** um segundo clique                                                                                                                            |
| **Ocorrências**    | `TripOccurrences.component.tsx`, numa **terceira expansão dentro** do comprovante                                                                                                                                            | Lista direta na nota; **link por ocorrência** para `/ocorrencias/:id` (spec 183)                                                                                                        |
| **Eventos + mapa** | `TripTimeline.component.tsx`: **uma por viagem**, filtro por nota em memória e só sobre as páginas já carregadas; spec 196: ícone, tooltip, mapa do ponto com dois pinos                                                     | Eventos **por nota**; **raio tolerado** (não existe na tela); eventos "Foto do canhoto" e "endereço geocodificado" (**não existem como evento**)                                        |

⚠️ O mapa acima vem do `HEAD` do worktree, que está **93 commits atrás de `origin/staging`**. Staging tem as
specs **222** (fechada), **223** e **224**, que mexem exatamente neste fluxo — ver D0.

## Fora do escopo

- Mudar a regra do custo e lucro por nota. É a spec **226**; aqui ela só **muda de lugar** (D3).
- Congelar a conta no despacho (planejado × realizado). Já decidido fora desta spec.
- A planta de empacotamento (`cargoLayout`, spec 145) — o nome "planta" engana: não tem relação com isto.
- Tela do **motorista** (`apps/frontend-driver`) e portal do contratante. Esta spec é só o painel.
- Redefinir "parada" como (cliente, endereço) — spec 197.

## Decisões

- **D0 — Antes de qualquer fatia, o chão tem de estar certo.** Três coisas, nesta ordem, e é a **Fase 0**:
  1. **Renumerar a minha spec de custo**: `225-cada-nota-diz-quanto-rendeu-e-quanto-gastou` vira
     **`226-…`**, porque `origin/staging` já tem `225-a-viagem-terminada-nao-foi-movida`.
  2. **Rebase em `origin/staging`** (93 atrás, 28 à frente). A interseção medida é de **12 arquivos**, quase
     todos entrypoints de teste e `package.json`; os que pedem cuidado são `trip.schema.ts`,
     `static-migration.contract.ts`, `TripStopList.component.tsx` e `TripDetail.page.tsx`.
  3. **Reencadear a migration da spec 196.** A pasta `20261002033125_occurrence_location_stamp` fica
     **anterior** à `20261002120000_trip_canhoto_read_job` de staging; o `drizzle-kit` diffa contra o
     **último** snapshot, que passa a ser o de staging — sem as minhas colunas. Sem refazer a cadeia,
     `db:generate` deixa de dar `no_changes` e o `schema-snapshot.contract.ts` reprova.
     Escrever código de tela sobre a base velha produziria conflito em `TripStopList` — arquivo que as specs
     222/223 já tocaram.

- **D1 — Uma nota aberta por vez, e o cabeçalho continua sendo checkbox + botão.** O estado de "nota aberta"
  é **compartilhado**. Hoje convivem três estados locais (`isDetailExpanded`, `isProductsExpanded`,
  `isOccurrencesExpanded`) e um compartilhado, `openProofDocumentId`, que **já é exclusivo** e já dispara as
  buscas de comprovante, produtos e ocorrências. ⚠️ O checkbox de seleção (`TripDocumentSelectionController`,
  spec 181 RF10–RF12) **não pode ficar aninhado dentro do botão** de abrir: botão dentro de botão é HTML
  inválido e engole o clique. A âncora `#doc-…` da linha do tempo hoje **não abre** a nota; no acordeão, seguir
  a âncora **abre** a nota.

- **D2 — A ordem das seções é a da pergunta.** _Dados da nota_ → _Comprovante da entrega_ → _Ocorrências_ →
  _Eventos desta entrega_, como no canvas. O comprovante é **visível** ao abrir a nota, sem um segundo clique.

- **D3 — O custo e lucro (spec 226) muda de lugar, não de conteúdo.** Sai do "Detalhes da nota" e entra em
  _Dados da nota_, como no canvas, com as mesmas regras: sem `trip.financials` **nada** aparece, nem o
  "Valor da carga" nem o "Frete" (a API os redige — `nfeTotalValue` e `freightAmount` são `'money'`).

- **D4 — Dois selos de situação, lado a lado, nunca um só.** Decisão do usuário em 2026-10-02. O app tem
  **três** eixos independentes: a conferência do canhoto (`Aguardando conferência` / `Aprovado` /
  `Recusado`), a pontualidade (`on_time` / `late` / `away` / `late_and_away`) e, em staging, o
  `proofPending` da spec 223. O canvas junta tudo em **Aprovado / Longe do ponto / Pendente** e **não tem
  "Recusado"** — um selo único esconderia um dos eixos: um comprovante recusado **e** longe do ponto diria só
  uma das duas coisas. Ficam **dois**: o da **conferência** (com Recusado) e o da **pontualidade**. O
  `proofPending` da 223 entra como estado do selo de conferência (canhoto ainda não conferido). O **canvas é
  corrigido** para mostrar os dois.
- **D5 — Dado que a API não devolve entra por tarefa de API, nunca por inferência na tela.** _Volumes_ existe
  só em `nfe_volumes.quantity`; o serializador do detalhe usa `FieldPolicy` **exaustiva**, então o campo novo
  precisa ser **classificado** ou o typecheck reprova. ⚠️ "Volumes" do canvas é **quantidade de volumes da
  nota**, e **não** os m³ da carga, que é o que "volume" já significa no resto do painel.

- **D6 — O raio tolerado é dado, não desenho.** Hoje ele só existe em `GET /company-settings/delivery-proof`
  e em `…/settings-resolution` (spec 218, resolvido por contratante), ambas sob `settings.manage` —
  **não** a permissão do detalhe da viagem. O padrão do app é **300 m**; o **"20 m" do canvas é de mentira**.
  **Decisão do usuário (N2)**: a API devolve o raio **já resolvido por contratante** (a mesma resolução da spec 218), calculado no servidor e **sem** exigir `settings.manage` do leitor. O círculo só é desenhado quando o dado existe.

- **D7 — Eventos por nota exigem a linha do tempo filtrável no servidor.** Hoje `GET /trips/:id/timeline` é
  paginada por cursor e **sem filtro por nota**; o filtro é em memória e só vale sobre as páginas carregadas
  (uma nota entregue cedo pode nem estar na página). Eventos de parada (`document === null`) passam por
  qualquer filtro. Os eventos "Foto do canhoto" e "endereço geocodificado" **não existem** como evento —
  ver D12.

- **D8 — Links seguem o padrão do painel, não `href` cru.** O painel **não tem router**: `main.tsx` decide a
  tela por `window.location.pathname`. O padrão é `<a href>` **com** `onClick` + `preventDefault` +
  `navigateTo…` (`tripRoute`, `tripOccurrenceRoute`, `tripNavigation`) — navega na mesma aba sem recarregar, e
  o `href` serve para "abrir em outra aba". O `href` do canvas com `appBaseUrl` é recurso de **protótipo**, não de produto.

- **D9 — Copiar usa o primitivo da casa.** `src/components/ui/copy-button.tsx` (`CopyButton`: `label`,
  `copiedLabel`, `value`, `variant`). O rótulo vem por prop; o primitivo não traduz. Há cópias soltas fora do
  padrão (`main.tsx`, `CompanyUserTable`, …); **não** são tocadas aqui.

- **D10 — O canvas tem dados de mentira, e eles não são requisito.** `20 m` de raio, o id `oc-8841`,
  `localhost:53000`, os nomes e valores. A comparação final olha **estrutura, ordem, vocabulário, cor e
  estados** — não os números.

- **D11 — Correção do canvas: o rótulo é "Saída para esta parada".** Decisão do usuário em 2026-10-02. O
  `departed` do produto é a saída **em direção** à parada (ADR-0088 §1–§2: o app do motorista diz _"Iniciar
  rota — parada N"_ e _"Você está a caminho da parada N"_), gravado com o `stopId` do **destino**; a linha do
  tempo real o rotula **"Saída"**, que é ambíguo (saída de onde?). "Saí da parada" no canvas, no evento da
  **própria** parada, descrevia o evento errado. O canvas passa a dizer **"Saída para esta parada"**, e a tela
  real usa o **mesmo texto**.

## Decisões tomadas

Todas as perguntas foram respondidas pelo usuário em 2026-10-02: **N1** — dois selos lado a lado (D4);
**N2** — a API devolve o raio (D6); **N3** — "Saída para esta parada" (D11); **N4** — Volumes é campo novo na
API (D5, T2.3); **N5** — criar os dois eventos (D12).

- **D12 — "Foto do canhoto" e "Endereço da parada (geocodificado)" passam a ser eventos de verdade.**
  Decisão do usuário, **contra a recomendação registrada**: eu sugeri tirar o endereço (é dado do cadastro
  da parada, não algo que aconteceu) e derivar a foto da leitura do comprovante, sem evento novo. O usuário
  preferiu criar os dois. Isso **não cabe como uma tarefa desta spec**, e a razão é de tamanho medido, não de
  gosto: evento novo é **tipo novo** em `TRIP_STOP_EVENT_KINDS` (e no CHECK que o espelha), **migration**,
  escrita nas rotas do motorista (o canhoto) e no geocodificador (o endereço), **carimbo de posição**
  (spec 196: todo evento carrega onde aconteceu), **entrada no expurgo** (a paridade do D8 reprova tabela com
  coordenada fora da lista), **entrada na lista fechada de leitores** (T1.3 da 196) e o mapeamento na linha do
  tempo. Por isso vira a **spec 228**, escrita **antes** da Fase 5 (T5.0), e a Fase 5 desta spec **consome** o
  que a 228 entregar. ⚠️ O endereço geocodificado como evento tem uma pergunta de modelagem própria — **de
  quem é o evento** (da parada? de uma re-geocodificação?) e **quando** ele nasce — que a 228 precisa
  responder antes de qualquer migration.
  **Respondida pela 228** (2026-10-02): o evento do endereço é da **parada**, rótulo **"Endereço da parada
  corrigido"** (`stop.address_corrected`), nascido de correção humana ou refino pedido no painel — o usuário
  escolheu "Só correção humana" (228 D11), sem migration. A foto é **"Foto do canhoto"**
  (`document.canhoto_photo`), derivada de `trip_delivery_proofs` sem tabela nova (228 D1/D12) — ponto a
  **confirmar com o usuário na T6.1**, não pergunta bloqueante.

Não há `[NEEDS CLARIFICATION]` aberto nesta spec nem na 228.

## Requisitos funcionais

- **RF1** Só **uma** nota fica aberta por vez; abrir outra fecha a anterior. O cabeçalho da nota mantém o
  checkbox de seleção **fora** do botão de abrir.
- **RF2** A nota aberta mostra, nesta ordem, _Dados da nota_, _Comprovante da entrega_, _Ocorrências_ e
  _Eventos desta entrega_ (D2).
- **RF3** _Dados da nota_ mostra NF-e, **Série**, Cliente, **CNPJ**, Valor da carga e **Volumes** (campo novo na API, D5); mais o bloco de custo e lucro da spec 226 (D3).
- **RF4** Cada campo de _Dados da nota_ e cada valor de custo tem **botão de copiar** (`CopyButton`), com
  rótulo acessível que diz **o que** copia ("Copiar CNPJ", não "Copiar").
- **RF5** _Comprovante da entrega_ aparece **sem segundo clique**, com um selo de situação (D4/N1), data, "recebido
  por" e as miniaturas.
- **RF6** _Ocorrências_ lista as ocorrências **da nota** direto na seção, cada uma com **link** para
  `/ocorrencias/:id`; sem ocorrência, "Nenhuma ocorrência registrada".
- **RF7** _Eventos desta entrega_ mostra os eventos **daquela nota** e os da parada dela, em ordem, com a
  distância ao ponto quando o leitor tem `trip.event-location`; sem a permissão, o evento aparece **sem**
  distância e **sem** mapa (spec 196).
- **RF8** "Abrir em outras páginas" leva ao cliente ("Ver cliente") e à ocorrência ("Ver ocorrência"), pelo
  padrão da D8. O usuário disse em 2026-10-02 que "Lista de NF-e" e "Resultado da viagem" **não são
  necessários** (já estão na tela): nenhum dos dois existe. "Ver cliente" **só** aparece a quem abre `/clientes`
  (`canOpenWorkspace`) e leva o nome por `sessionStorage`, nunca pela URL (revisão M4, security.md §8).
- **RF9** Seguir a âncora da linha do tempo para uma nota **abre** a nota.
- **RF10** Em 375 px nada transborda na horizontal e nenhuma letra é cortada (a revisão da 226 achou esse
  defeito três vezes).

## Critérios de aceite

- **CA01** Abrir a nota B com a A aberta fecha a A; selecionar o checkbox da nota **não** a abre nem a fecha.
- **CA02** Sem `trip.financials`, a nota aberta **não** mostra valor da carga, frete, gasto, lucro nem margem.
- **CA03** O CNPJ aparece formatado e o botão de copiar copia o valor **sem** máscara surpresa (decidido na T2.2).
- **CA04** A ocorrência tem link, e o clique navega na mesma aba sem recarregar.
- **CA05** A linha do tempo filtrada por nota **não** perde eventos que estão em páginas ainda não carregadas.
- **CA06** O print da tela real e o da prancha do canvas, lado a lado, em 1280 e 375 px, com cada divergência
  listada — **e o ok explícito do usuário** (web.md §15).

## Riscos

1. **Rebase** sobre 93 commits (D0) — o maior risco desta spec está **antes** da primeira linha de tela.
2. **Conflito com a spec 181** — ela decidiu "duas expansões independentes" e travou a grade com
   `test/trip/document-row-structure.contract.ts` (T202). O acordeão **revoga** essa decisão, e o contrato
   precisa ser **atualizado, nunca afrouxado**.
3. **Spec 167** (0/22) mexe na mesma lista de ocorrências; **206** (12/23) é dona do `stop.departed`; **196**
   tem tarefas abertas que o canvas **não pode** pressupor (carimbo de ocorrência e WhatsApp).
4. **Permissão**: o detalhe da viagem, o comprovante, a linha do tempo e a avaliação têm **quatro** políticas
   diferentes; a nota aberta pode ter seções com e sem dado ao mesmo tempo.
