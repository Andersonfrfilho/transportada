# Evidências — 232 Cada nota diz quanto rendeu e quanto gastou

## T1.1 — o contrato da regra de rateio

Fase 1 é 🧠 `opus`, então foi executada na sessão, sem delegar.

### Três coisas que a leitura do código mudou na spec antes do primeiro teste

1. **`TRIP_COST_KINDS` tem nove parcelas, não sete.** A spec listava sete e esquecia
   `other_per_kilometer` e `delivery_charges`. A classificação virou tabela exaustiva no D1, e o tipo
   `Readonly<Record<TripCostKind, ApportionmentBasis>>` faz o compilador cobrar parcela nova — o
   contrato cobra o **valor** de cada uma, porque classificar errado compila igual.
2. **`delivery_charges` foi decidida pelo usuário contra a recomendação.** A tabela
   `delivery_charges` tem `trip_document_id`: a taxa já sabe de qual nota é, e daria para atribuí-la
   exata. O usuário escolheu repartir pela distância. Está no ⚠️ do D1, com a consequência escrita: a
   taxa causada pela nota da primeira parada cai em parte sobre notas que descem depois, e a linha da
   tela não poderá ser explicada como "a taxa desta nota".
3. **`manual` se resolveu por fato, não por escolha.** A spec dizia "trecho quando amarrado a uma
   parada" — `trip_cost_entries` tem só `trip_id`, sem parada e sem nota. Não existe trecho a que
   amarrá-lo: vai para rateio de viagem.

### E uma que salvou a invariante

A spec afirmava `Σ costAmount == totalCost`. **Isso estaria errado por construção**: o
`buildTripValuation` final recebe `[...buildCostParcels(context), ...taxParcels]`
(`read-trip-valuation.use-case.ts:481`), então o `totalCost` da viagem **já inclui** imposto — ainda
que o comentário do domínio diga que imposto "desce da receita" e a tela separe as naturezas. A
invariante do D4 passou a ser `Σ (costAmount + taxAmount) == totalCost`, com `Σ freightAmount ==
totalRevenue` e `Σ marginAmount == totalMargin`. A redação anterior deixaria a conta fora por todo o
imposto sem nada falhar.

### O que entrou

- `src/trips/domain/document-cost-apportionment.types.ts` — `APPORTIONMENT_BASES`, `DWELL_BASES`,
  `COST_BASES`, `TIME_BASES`, os `Params`/`Result` e `CostKindApportionment`.
- `src/trips/domain/document-cost-apportionment.policy.ts` — `COST_KIND_APPORTIONMENT` (a tabela do
  D1, que é dado) e `apportionDocumentCosts`, que **lança** até a T1.2. Typecheck verde com o
  contrato escrito é o motivo de a assinatura existir já aqui: contrato que não compila não é
  contrato, e o vermelho tem de vir do comportamento ausente, não do import.
- `test/trip-domain/document-cost-apportionment.contract.ts` (22 testes de comportamento + 2 de
  classificação), registrado em `test/trip-domain.contract.test.ts`.

### Vermelho pelo motivo certo, conferido

**317 pass · 22 fail**, e as 22 falhas são todas o `throw` da T1.2 — conferido contando a mensagem na
saída (44 aparições, duas por falha: linha do erro e pilha). Nenhuma é de import, de tipo ou de
arquivo não registrado; o typecheck em exit 0 é a prova disso.

Os 2 testes de classificação **passam** de primeira, porque classificação é dado, não comportamento —
então eles foram provados por mutação: trocando `driver` de `time` para `distance`, "o critério de cada
parcela é o da tabela do D1, nome por nome" reprova (**23 fail**). Revertido.

### Portões

| Portão                                     | Resultado                                                    |
| ------------------------------------------ | ------------------------------------------------------------ |
| `bun run typecheck` (api)                  | exit 0                                                       |
| `bun run lint` (api)                       | exit 0                                                       |
| `test ./test/trip-domain.contract.test.ts` | **317 pass · 22 fail · 1420 expect()** — vermelho pretendido |

⚠️ O lint reprovou `_params` não usado na assinatura que lança. Em vez de desligar a regra, a mensagem
do erro passou a citar `params.documents.length` — o parâmetro é usado de verdade, e o aviso morre com
a T1.2.

## T1.2 — a regra de rateio

### Uma contradição da própria spec, achada ao implementar

O D3 mandava ratear o bolo da viagem "**proporcionalmente ao gasto que cada nota já acumulou**". Isso
contradiz o CA06: a nota sem parada acumula gasto zero, logo teria peso zero e ficaria **sem rateio
nenhum** — justamente a nota que _só_ tem rateio. Proporcional também faria a nota de percurso curto
quase não pagar o retorno, que acontece pela viagem inteira.

Corrigido para **divisão igual entre todas as notas**, coerente com o D2, e a spec registra a
contradição e a data. Revisão de texto não tinha pegado; implementar pegou.

### Por que a soma fecha, e não é sorte de arredondamento

Toda divisão acontece em **dois níveis, nunca num só**:

1. o balde (distância, tempo) se reparte entre os trechos — e, no tempo, também entre as paradas;
2. o valor de cada trecho se reparte entre as notas a bordo dele; o de cada parada, entre as notas
   entregues ali.

`distribute` faz piso em cada parte e entrega o resto inteiro ao de **maior peso**, com desempate
determinístico pelo primeiro índice — resto que muda de dono entre execuções faria a mesma viagem
mostrar números diferentes. Dois `distribute` encadeados fecham a soma em cada nível, então ela fecha
no fim, sem tolerância e sem ajuste final.

Dinheiro é `bigint` escalado por `MONEY_SCALE`, com `parseScaledDecimal` / `formatScaledDecimal` — o
mesmo idioma de `trip-valuation.policy.ts`. Nenhum float em nenhum passo.

### O que não achou dono volta para o rateio

`giveEqually` devolve o valor quando não há a quem dar, e quem chama soma isso ao bolo da viagem. É o
que faz três casos funcionarem sem código especial para cada um: o retorno (ninguém a bordo), a parada
com espera e sem nota, e a viagem com tempo total zero — nesse último o balde de tempo inteiro desce
como rateio, em vez de dividir por zero.

### Provado por mutação, três sondas

| sonda                                                                        | o que reprovou                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `hasUsableRoute` passa a devolver sempre `true`                              | os 2 testes de ausência (CA04 e CA05)                                                |
| a espera da parada desce para quem está **a bordo**, não para quem desce ali | "a parada que esperou mais encarece a nota dela" (CA03b)                             |
| `distribute` devolve as partes **sem** corrigir o resto                      | 5 testes, todos de soma: CA01 (duas vezes), centavo órfão, rateio zero, parcela nula |

A terceira sonda é a que importa mais: ela mostra que a invariante do D4 não está sendo satisfeita por
acaso de números redondos — tirar a correção de resto quebra cinco asserções diferentes.

### Portões

| Portão                                     | Resultado                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `bun run typecheck` (api)                  | exit 0                                                                      |
| `bun run lint` (api)                       | exit 0                                                                      |
| `test ./test/trip-domain.contract.test.ts` | **339 pass · 0 fail · 1459 expect()** — as 22 da T1.1 fecharam              |
| contrato inteiro da API (`bun test`)       | **8536 pass · 23 skip · 0 fail · 27480 expect() · 192 arquivos · [32.26s]** |

A integração não foi rodada nesta task, e não precisa: a política é função pura, sem I/O. Ela entra na
T2.2, quando a resposta passar a carregar os campos.

## T2.1 — o contrato da resposta

Executada por subagente `executor` em `sonnet`; gates conferidos por mim depois. `git status` confirma
`src/` intacto — só três arquivos de teste.

### O que entrou

- `test/trip-valuation/document-figures.contract.ts` (novo, 23 testes), importado por
  `test/trip-valuation.contract.test.ts` — que já está no script `test` do `package.json`.
- `test/fixtures/trip-http.fixture.ts`: um parâmetro opcional `readValuationExecute`, no molde do
  `readTripRouteGeometryExecute` que já existia. Sem o parâmetro, o fixture se comporta como antes.

O contrato roda o **caso de uso real atrás da rota real**, com permissões reais: três paradas, cinco
notas, frete de 10%, ICMS de 20 por nota, segunda parada esperando 30 min. Custo total 640, dos quais
100 são imposto — de propósito, para que uma conta que esquecesse o imposto ficasse fora por 100.

### A permissão é afirmada por papel real, não por texto da fonte

O contrato itera sobre `COMPANY_ROLE_PERMISSIONS`, o catálogo real: papel sem `trip.financials` recebe
403 e o caso de uso **não é chamado**; papel com a permissão recebe 200 com os oito campos. Há um
teste-guarda para o laço não passar vazio — existe papel que vê e papel que não vê. Isso evita o defeito
que esta base já registrou: `toContain('trip.financials')` no texto do arquivo não prende regra
nenhuma.

`sumOf` **lança** quando o campo está ausente, em vez de tratar `undefined` como zero. Sem isso a soma
poderia "fechar" por acidente.

### Uma divergência de nome que a spec tinha errado

O RF1 dizia que `freightAmount` "já existe" na linha de receita. Não existe: `TripRevenueLine` chama o
frete de **`amount`** (`trip-valuation.policy.ts:240`), e `freightAmount` é o nome interno do resultado
da política. Spec corrigida; a T2.2 faz o mapeamento. Afirmar a chave errada teria produzido um
vermelho que parece defeito de implementação e é defeito de spec.

### Vermelho pelo motivo certo

**181 pass · 9 fail** no arquivo; **8550 pass · 23 skip · 9 fail** na app inteira, contra a referência
de 8536 pass · 0 fail — ou seja **+14 passando** (os negativos e os guardas) e os 9 vermelhos todos
deste arquivo. Nada que já passava quebrou.

As 9 falhas são todas campo ausente na resposta: os oito campos em toda linha, `costBasis` esperado
`'leg'`, `legCost + tripShare == cost`, as três somas do D4 e os três papéis que têm a permissão.

### Os negativos nascem verdes, e por isso foram provados por mutação

O fechamento da rota já existe, então os testes de "não vaza" passam de primeira — o que os tornaria
inúteis sem prova. Duas sondas, aplicadas e desfeitas:

| sonda                                                                 | o que reprovou                                                                                                        |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| política da rota de valoração trocada para `TRIP_MANAGE_POLICY`       | 4 testes a mais (13 contra 9), entre eles "o papel `separator` é recusado" e "quem só monta a viagem não recebe nada" |
| `...delivery` espalhado no `serialize` da lista de entregas do portal | "a lista de entregas do portal é projeção fechada" (10 contra 9)                                                      |

### O portal, provado em três camadas

O portal não tem valoração hoje — `grep -iE "freight|cost|margin|valuation|financial|revenue"` em
`src/contractor-portal` não acha nada. Provar ausência exigiria banco, então o contrato prova o que dá
sem ele: (1) o papel `contractor` não tem `trip.financials`, e a rota de valoração lhe dá 403; (2) a
lista de entregas do portal é alimentada com um objeto carregando **todas** as chaves do RF1 mais um
sentinela `777.7777`, e nenhuma sai em qualquer profundidade; (3) o mesmo para a lista de ocorrências.
Vale porque o `serialize` do portal é projeção explícita campo a campo.

### O que ficou declaradamente fora

- A camada **SQL** do portal (`contractor-occurrence.query.ts`, `contractor-delivery.query.ts`) não é
  exercitada em contrato; a prova fica para a integração da T2.2.
- `POST /trips/valuation-preview` usa o mesmo `buildValuationFromContext`, então ganha os campos na
  T2.2; o 403 dela não foi coberto porque o fixture HTTP não tem a dependência `previewValuation`.
- O RF9 foi afirmado como "`timeBasis` é um dos valores de `TIME_BASES`", não valor a valor — cada caso
  de espera já tem teste na política da Fase 1.
- Mutação nas **somas** do D4 sobre a resposta montada: só faz sentido quando a T2.2 existir.

### Portões

| Portão                                        | Resultado                                                    |
| --------------------------------------------- | ------------------------------------------------------------ |
| `bun run typecheck` (api)                     | exit 0                                                       |
| `bun run lint` (api)                          | exit 0                                                       |
| `test ./test/trip-valuation.contract.test.ts` | **181 pass · 9 fail · 798 expect()** — vermelho pretendido   |
| contrato inteiro da API                       | **8550 pass · 23 skip · 9 fail** (referência: 8536 · 0 fail) |

## T2.2 — a resposta passa a dizer por nota

Executada por subagente `executor` em `sonnet`; gates conferidos por mim. `document-cost-apportionment.*`
**não** aparece no `git status`: a política da Fase 1 está intacta.

### O D9 estava errado contra os dados reais, e a implementação achou

A spec mandava `departed − arrived` da mesma parada. **Conferi na fonte, não no relatório:** o
`departed` da ADR-0088 é a saída **em direção** à parada, gravada com o `stopId` do **destino**
(`report-stop-departure.use-case.ts:128`), e a ADR-0088 §2 só permite "a caminho" em parada aberta **e
sem chegada**. Na mesma parada o `departed` vem **antes** do `arrived` — a conta da spec sairia
**negativa**, e `arrived − departed` é o tempo de viagem _até_ a parada, não a espera nela.

A leitura correta, implementada em `stop-dwell.policy.ts`: a espera na parada X vai da chegada em X até
o **primeiro `departed` de outra parada** com instante ≥ essa chegada — forma que aguenta o motorista
reordenar o destino. `departure_cancelled` desfaz o `departed` anterior da mesma parada, e no empate de
carimbo o `departed` vence, porque o cancelamento carrega o mesmo `tapped_at` (ADR-0088 §2b). Instante
é `coalesce(tapped_at, created_at)`.

Spec corrigida no D9, com o porquê — senão alguém "conserta" de volta para a conta negativa.

### E os trechos precisavam de normalização que a spec não previa

`planned_route.legs` é a lista crua do roteirizador: saída do barracão + trechos entre paradas +
retorno, com as contagens em `depot.leadingLegs` / `trailingLegs`
(`read-route-geometry.use-case.ts:145-149`, conferido). A política exige `legs[i]` chegando a
`stops[i]`, então o retorno sai de `legs` — ele já vem em `planned_return_distance_meters` e entraria
duas vezes — e **sem barracão** entra um trecho vazio na frente, porque o caminhão **começa** na
primeira parada e nenhum trecho a alcança. Sem isso, toda rota sem barracão cairia em "contagem não
casa, logo ausência" e o número desapareceria da tela por detalhe de forma. Virou **D10**.

### Uma consulta nova, e o N+1 provado por contagem

`readStopDwells` entra no `Promise.all` que já existia: um `trip_stops LEFT JOIN trip_stop_events`
filtrado por `kind`, trazendo as paradas e os eventos da viagem **inteira** de uma vez. Trechos,
retorno e `stop_id` das notas não custam consulta — entraram no select de `trips` e na junção de
documentos que já existiam.

A prova de que não há N+1 é por **contagem, não por leitura**: um `Proxy` conta os `select` de
`readContext`, e o teste exige **igualdade** entre viagem de 1 parada/1 nota e viagem de 3 paradas/5
notas — **17 e 17**.

### Mutação

| sonda                                                       | contrato                                                             | integração                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| rateio de viagem fora do `costAmount`                       | 2 falhas (soma do D4: esperado 640, recebido 505; e trecho + rateio) | 2 falhas (`14395000n` vs `12145000n`)            |
| `icms` fora das parcelas passadas à política                | 3 falhas (soma do custo, imposto por nota, soma da margem)           | **não reprovou** — o cenário tem só `pis_cofins` |
| espera lida com o `departed` da própria parada (D9 literal) | 2 falhas no contrato do dwell                                        | 1 falha, "a espera vem dos eventos do banco"     |

A segunda linha é honestidade do agente e fica registrada: a prova do ICMS-dentro-do-total vive **só**
no contrato, porque o cenário de integração não emite CT-e. A integração garante `pis_cofins > 0` e a
soma fechando.

### Portões, conferidos por mim

| Portão                                                            | Resultado                                                        |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `bun run typecheck` (api)                                         | exit 0                                                           |
| `bun run lint` (api)                                              | exit 0                                                           |
| contrato inteiro da API                                           | **8570 pass · 23 skip · 0 fail · 27605 expect() · 192 arquivos** |
| `test/integration/trip-valuation-document-figures.integration.ts` | **5 pass · 0 fail · 39 expect() · [9.13s]**                      |

As 9 vermelhas da T2.1 fecharam, e **nenhuma asserção dela foi tocada**: `git diff` no arquivo da T2.1
tem **zero** linhas `-` e zero `+` com `expect(` — só o ponto de montagem do contexto mudou.

### Declaradamente fora

- A prévia (`POST /trips/valuation-preview`) e a sugestão multi-veículo passam pelo mesmo
  `buildValuationFromContext` e **não** têm trechos nem paradas no contexto: as linhas delas saem
  `costBasis: 'unavailable'` com campos nulos e o `taxAmount` calculado. Nenhum contrato existente
  quebrou. Se a prévia tiver de mostrar gasto por nota, é task nova.
- A suíte de integração inteira não foi rodada aqui — ela entra no portão da T4.3.

## T3.1 — a guarda de tipo e a formatação, sem componente

Executada por subagente `executor` em `sonnet`; gates conferidos por mim. `apps/api-transportada`
intacta.

### O que entrou

- `trip-financials/shared/tripValuation.constant.ts` — `COST_BASIS`, `TIME_BASIS`, os tipos e
  `UNAVAILABLE_COST_GAP = 'NO_PLANNED_DISTANCE'`.
- `revenueLineCostFigures.validation.ts` — a guarda escrita à mão (**esta app não usa `zod`**),
  devolvendo `absent` | `present` | `malformed`.
- `revenueLineCost.service.ts` — `describeRevenueLineCost`, que entrega rótulo e valor já formatados,
  para o componente da T3.2 só imprimir.
- Os oito campos opcionais em `tripValuation.service.ts`, lidos por `readRevenueLines` em
  `tripValuationResponse.validation.ts`.
- `documentCost` nos **dois** locales, pt-BR e `en`.
- `test/trip-financials/revenue-line-cost.contract.ts` (26 testes).

### A ausência reaproveita o texto que a tela já tem

`costBasis: 'unavailable'` usa `gap.NO_PLANNED_DISTANCE` — "roteiro ainda não calculado" / "route not
planned yet" —, a mesma chave que o razão já usa. Um contrato afirma que **nenhum** rótulo novo de
`documentCost` repete essa frase: duas frases para a mesma ausência é como a tela passa a dizer coisas
diferentes sobre o mesmo estado.

### Linha fora de forma derruba a avaliação, de propósito

`toTripValuation` devolve `null` quando uma linha é malformada — o mesmo caminho que ele já usava para
`revenueSource` inválido. É falha em voz alta em vez de painel mostrando parte do dinheiro. Conta como
malformada: campo de tipo errado, dinheiro fora de `^-?\d+(\.\d{1,4})?$`, base desconhecida, **só parte
dos oito campos**, e combinação incoerente (`unavailable` com gasto, ou `leg` com gasto/trecho/rateio
nulos). Linha **sem nenhum** dos oito é válida — é a prévia e a sugestão multi-veículo.

### Provado por mutação

Fazendo `isDecimalOrNull` aceitar `number` e pular o padrão decimal: **9 pass · 5 fail** (contra 14 ·
0), reprovando "rejeita: gasto como número", "rejeita: gasto que não é decimal", "rejeita: mais de
quatro casas decimais", "rejeita: margem percentual como número" e "uma linha malformada derruba a
avaliação, mesmo entre linhas boas". Desfeito, 14 · 0 de novo.

### Um buraco pré-existente achado de passagem, e deixado fora

`amount` — o frete da linha — é lido por `readText`, que devolve `''` quando o dado não é texto
(`tripValuationResponse.validation.ts:106`, e `:71` nas parcelas). `formatAmount` **lança** nesse caso:
a resposta fora de forma não é recusada na fronteira, atravessa como `''` e estoura na renderização.

Conferi o `git diff`: **é pré-existente**, não foi introduzido aqui — e improvável, porque a API tipa o
campo. Não ampliei o escopo da task para consertá-lo; está aberto como tarefa à parte, com o padrão
correto já existindo no mesmo módulo (a guarda desta T3.1).

### Portões

| Portão                             | Resultado                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `bun run typecheck` (painel)       | exit 0                                                                                               |
| `bun run lint` (painel)            | exit 0 — 16 avisos de `exhaustive-deps` **pré-existentes** em `modules/trip`, nenhum em arquivo novo |
| `bun run test` (script, nunca cru) | **6192 pass · 0 fail · 31 arquivos** e `test:hooks` **180 pass · 0 fail**                            |
| contrato isolado da T3.1           | **26 pass · 0 fail**                                                                                 |

### Desvio do `tasks.md`, registrado

O `tasks.md` apontava `tripResponse.validation.ts` e `trip.types.ts` do módulo `trip`. A validação de
`revenueLines` mora em `trip-financials/shared/`, e é lá que o trabalho foi feito; o contrato foi para
`test/trip-financials/`. O `tasks.md` fica corrigido.

## T3.2 — a linha da nota passa a dizer gasto e lucro

Executada por subagente `executor` em `sonnet`; gates conferidos por mim.

### A fiação foi decidida antes de delegar, e por regra, não por gosto

O caminho da página até a linha da nota tem **três níveis**
(`TripDetail.page.tsx` → `TripDetail.component.tsx` → `TripStopList` → a linha) e `TripStopList` já
tinha **cinco props**, que é o teto desta base. As duas regras apontam para o mesmo lugar: contexto.
Entrou `DocumentCostContext` + `DocumentCostProvider`, provido pela página, consumido por
`TripDocumentCost`. `TripStopList` continua com cinco props e ganhou **uma linha**.

### O que a linha imprime, e o que ela não imprime

Com os campos: gasto com as duas partes nomeadas, lucro, margem, imposto, a frase do critério de
divisão (RF4 pede o critério **nomeado**, não implícito) e o aviso de tempo quando existe. Prejuízo
troca o rótulo para "Prejuízo", sai negativo e ganha classe própria — **o sinal não depende só de cor**.
Roteiro não calculado mostra o texto da ausência e nunca zero.

Sem permissão, sem provedor, sem a linha daquela nota, ou com linha sem os oito campos: **não imprime
nada** — sem rótulo vazio, sem "—", sem espaço reservado. Provado por mutação: fazer o componente
imprimir o bloco mesmo sem linha reprova **4 asserções**, uma por caminho de ausência.

### O RF7 **não** foi cumprido, e não vou inferi-lo na tela

O RF7 pede que a nota sem parada (`stop_id` nulo) diga na tela que entra **só** no rateio de viagem. A
T3.2 não entrega isso, e a razão é que **a API não manda esse indicador**: o `stopId` existe no contexto
do cálculo e não na resposta.

Daria para inferir — "gasto de trecho zero e rateio maior que zero" —, e seria errado: uma nota **com**
parada pode ter gasto de trecho zero legitimamente (trecho de distância e duração zero, parada na mesma
coordenada da anterior). Inferência que acerta quase sempre é a pior espécie de rótulo: ela mente
exatamente no caso raro que alguém vai investigar.

Fica como **T3.4**, com a mudança do lado da API nomeada: a linha de receita precisa dizer se a nota
tem parada.

### Portões

| Portão                       | Resultado                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `bun run typecheck` (painel) | exit 0                                                                       |
| `bun run lint` (painel)      | 0 errors · 16 warnings **pré-existentes**, nenhum em arquivo novo            |
| `bun run test` (script)      | **6203 pass · 0 fail** (+11 sobre 6192) e `test:hooks` **180 pass · 0 fail** |

### Observação de layout, não verificada em tela

O bloco usa `grid-column: 1 / -1` com grade interna `repeat(auto-fit, minmax(9rem, 1fr))`. Ninguém viu
isso em 375 px ainda — o palpite do executor é que cai em duas colunas e cada nota ganha uma linha de
texto a mais, com a frase do critério e o aviso de tempo como as partes mais compridas. **A T4.1
decide** se o critério e o "rateio da viagem" vão para o detalhe expandido. Palpite não é prova, e por
isso está escrito como palpite.

## T3.3 — previsto e fechado lado a lado (D6)

Executada por subagente `executor` em `sonnet`; gates conferidos por mim.

### O painel perdeu o ramo, e isso é a mudança estrutural

Antes havia `if (result === null)` com retorno antecipado: um ramo para viagem aberta, outro para
fechada. Agora é **um caminho só** — cabeçalho, lançamentos, tabela de comparação (quando há os dois),
as duas colunas, recálculo (quando há fechado). O painel ficou em 191 linhas, sob o teto de 200.

### O custo comparável inclui imposto, e isso não era óbvio

O `totalCost` do previsto já contém imposto (a mesma descoberta que corrigiu o D4 na T1.1). Então o
custo **fechado** comparável é `taxTotal + costTotal`, e o rótulo da linha diz **"Custo (com
imposto)"** em vez de só "Custo". Comparar `costTotal` puro contra o previsto mostraria uma diferença
que é só o imposto, e ninguém saberia disso olhando a tela.

### A diferença não é colorida, de propósito

Diferença positiva é **boa** na receita e **ruim** no custo. Verde e vermelho induziriam leitura errada
na metade das linhas, então a célula não tem cor; o sinal (`+` ou `−`) carrega o significado. Diferença
zero **continua na tela**, com "sem diferença" — ausência de linha pareceria dado faltando.

A conta é `fechado − previsto` com `sumScaledAmounts` + `negateAmount` sobre BigInt, em
`shared/expectedVersusClosed.service.ts`. **Nenhum `Number()` em dinheiro.**

### A primeira versão da mutação passou, e o teste foi endurecido

Vale registrar porque é o padrão que esta base já pagou para aprender: a sonda (inverter a diferença
para `previsto − fechado`) **passava** na primeira redação do teste de painel, porque ele procurava
`"+27"` e `"−27"` soltos no markup. Trocado por asserção da **linha contígua** — rótulo, previsto,
fechado e diferença juntos —, com o painel renderizado de verdade por `renderToStaticMarkup`. Aí a
mutação reprovou: **3 falhas**, incluindo `Expected: "0.2000" / Received: "-0.2000"`.

### Dois contratos antigos mudaram, e eu conferi o diff

Eles liam o **texto-fonte** do painel, então a reestruturação os quebrou:

- `valuation-panel.contract.ts`: a asserção de `<ValuationLedger` e `valuation={valuation}` **mudou de
  arquivo** para o componente de colunas — não desapareceu, e ganhou `valuation={valuation}` a mais.
- `cost-entries.contract.ts`: `LaunchedEntries` de `2` para `1`, **compensado** por uma asserção nova e
  mais forte, `not.toMatch(/if \(result === null\)/u)`, que prende o caminho único. Teste renomeado.

Nenhuma intenção foi perdida. O contrato **novo** usa `renderToStaticMarkup`, não texto de fonte.

### Portões

| Portão                       | Resultado                                                          |
| ---------------------------- | ------------------------------------------------------------------ |
| `bun run typecheck` (painel) | exit 0                                                             |
| `bun run lint` (painel)      | 0 errors · 16 warnings **pré-existentes**                          |
| `bun run test` (script)      | **6216 pass · 0 fail** (+13 sobre 6203) e `test:hooks` **180 · 0** |

### Achados que vão para a T4.1, nenhum resolvido às cegas

1. **"previsto" × "estimado" no mesmo painel.** O selo `source.estimated` da **parcela** aparece dentro
   da coluna **"Previsto"** — "estimado R$ 480,00" sob o cabeçalho "Previsto". São eixos diferentes
   (origem do número × estado da viagem) e ficaram vizinhos. Nada foi renomeado: se confundir na tela, é
   decisão de produto.
2. **Tabela de 4 colunas em 375 px.** Linha, Previsto, Fechado, Diferença, com valores tipo
   `R$ 1.365,45`. Abaixo de 64rem as colunas empilham e a comparação vai para o topo. **Ninguém mediu** —
   é suspeita, e a T4.1 olha isso primeiro.
3. **Buraco pré-existente de locale**: `tripFinancials.en.locale.json` não tem `panel.error` nem
   `panel.retry`, que existem em pt-BR. Já era assim; o bloco `comparison` criado aqui está nos dois.

## T4.1 — revisão de design (web.md §15), **aguardando o ok do usuário**

Os 16 prints estão em `specs/232-cada-nota-diz-quanto-rendeu-e-quanto-gastou/prints/`, nas larguras
**1280 e 375**, nos temas **dark e light**, em quatro situações: notas por parada com o detalhe aberto,
painel da conta, e as duas variações de ausência ("roteiro ainda não calculado" + fechado inexistente).
Para gerar de novo:

```bash
cd apps/frontend-transportada && PLAYWRIGHT_FRONTEND_PORT=53225 PLAYWRIGHT_TEST_MATCH=spec-232-prints.smoke.spec.ts bun run smoke
```

A API é dublada na rede (`mockTripWorkspaceApi`, dois modos novos: `document-cost` e
`document-cost-open`), e a conta do cenário **fecha**: Σ(gasto + imposto) = 1.860,00 = `totalCost`,
Σ frete = 2.500,00 = `totalRevenue`, Σ lucro = 640,00 = `totalMargin`. Print com conta que não fecha é
pior que print nenhum.

### O que a revisão achou, e o que foi feito

| #   | achado                                                                                                                                                                                                                                                              | decisão                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Lugar errado.** Os números estavam na linha sempre visível da nota; o usuário falava do **detalhe de cada item**. Com cinco notas a seção virou parede de números (1549 px).                                                                                      | Movidos para dentro de "Detalhes da nota" (**1173 px**). `hasNoteDetail` passou a considerar a figura de custo, senão nota sem contato e sem regra de frete ficaria sem botão e o número inalcançável.                     |
| 2   | **O painel transbordava 59 px em 375** e cortava a primeira letra dos rótulos do previsto. Suspeita minha (a grade de duas colunas) estava **errada**; medido, a causa era a tabela de comparação com min-content de 400 px dentro de um painel sem `min-width: 0`. | `.panel { min-width: 0 }` e a tabela rola **dentro** do painel. `scrollWidth <= innerWidth` virou asserção do smoke.                                                                                                       |
| 3   | **A frase do critério** se repetia nas cinco notas.                                                                                                                                                                                                                 | Saiu da linha e do cabeçalho; aparece **uma vez por nota, dentro do detalhe**, só quando a nota mostra o rateio.                                                                                                           |
| 4   | **"Custo" com dois valores e um valor com dois nomes.** O mesmo R$ 1.860,00 era "Custo (com imposto)" na tabela e "Despesas" no Previsto; "Custo" no Fechado era R$ 1.700,00.                                                                                       | **Decisão do usuário:** a tabela adota "Despesas", com a legenda dizendo uma vez que inclui imposto.                                                                                                                       |
| 5   | **Gasto e lucro tinham a mesma cor** no detalhe da nota (só o prejuízo se destacava). Pedido do usuário: cores diferentes.                                                                                                                                          | Reaproveitada a convenção que o razão já escreve — `.amountIn` (verde, `--color-ready`) para o que rende e `.amountOut` (vermelho, `--color-alert`) para o que sai. **Nenhuma cor nova, nenhum contraste novo a validar.** |

### A cor do gasto: o que ficou perto e por quê

Gasto e imposto em vermelho; lucro e margem em verde; as linhas "do trecho" e "rateio da viagem" ficam
**cinza**, subordinadas. Prejuízo continua `.negative` (vermelho **e negrito**), com o rótulo trocado
para "Prejuízo" e o valor negativo — então **o sinal não depende só de cor**. ⚠️ Numa nota em prejuízo,
GASTO e PREJUÍZO ficam os dois vermelhos na mesma linha; é a mesma coincidência que o painel já tem
(Despesas e Prejuízo), e o que os separa é rótulo, negrito e sinal.

Provado por mutação: pintar o gasto com a cor do lucro reprova "gasto e lucro têm cores diferentes"
(**14 pass · 1 fail**, e **15 · 0** depois de desfeita). O CSS module não gera nome de classe no teste,
então a asserção lê a regra do módulo e a forma da fonte.

### Contraste, nos dois temas

Conferido no print de 375 em **light** e no de 1280 em **dark**: vermelho e verde legíveis sobre os dois
fundos. São os tokens que o painel já usava, então não há combinação nova.

### Dívida conhecida que a revisão **não** resolve

- **RF7** — a nota sem parada ainda não diz que entra só no rateio (T3.4): exige a API mandar o indicador. **Resolvida na T3.4** (seção abaixo).
- **"Previsto" × "estimado"** convivem na coluna Previsto: o título da coluna é o estado da viagem, o selo
  "estimado" é a origem de cada parcela. Não vi confusão no print, só repetição; nada foi renomeado.
- **A tabela de comparação rola na horizontal em 375 px.** Escolha consciente: ela precisa de ~400 px.
  Alternativas apresentadas ao usuário (empilhar em três blocos; esconder em tela estreita), **ainda sem
  resposta**.

## T4.3 — o portão completo na raiz

Um comando por vez, em primeiro plano — `make check` estoura o teto de 600 s.

| Portão                 | Resultado                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `bun run format:check` | **reprovou na primeira passada** — `apps/frontend-transportada/test/trip-smoke.helper.ts` sem prettier; corrigido; depois **verde** |
| `bun run lint`         | 0 erros · 16 avisos `exhaustive-deps` **pré-existentes** do painel                                                                  |
| `bun run typecheck`    | exit 0, as sete apps                                                                                                                |
| `bun run test`         | **0 fail nas sete apps** (tabela abaixo)                                                                                            |
| `bun run build`        | exit 0, as sete apps (`✓ built`; o aviso de tamanho de chunk é do Vite e pré-existente)                                             |

O `format:check` pegou exatamente o defeito que já derrubou deploy de staging nesta base: **gate só da
raiz**, que os jobs por app não cobrem. Um helper de teste que o executor tocou e não formatou.

| App                     | Resultado                                                         |
| ----------------------- | ----------------------------------------------------------------- |
| `api-transportada`      | 8561 pass · 32 skip · 0 fail · 192 arquivos                       |
| `worker-transportada`   | 1486 pass · 0 fail · 94 arquivos                                  |
| `cron-transportada`     | 101 pass · 0 fail · 8 arquivos                                    |
| `frontend-transportada` | 6220 pass · 0 fail · 31 arquivos + `test:hooks` 180 pass · 0 fail |
| `frontend-client`       | 89 pass · 0 fail · 5 arquivos                                     |
| `frontend-driver`       | 942 pass · 0 fail · 3 arquivos                                    |
| `frontend-landing`      | 131 pass · 0 fail · 5 arquivos                                    |

⚠️ **A API mostra 32 skip aqui contra os 23 citados nas tasks anteriores.** O total é o mesmo (8593): a
diferença são **9 testes que só rodam com `--env-file=../../.env.test`**, e o script `test` da raiz não o
passa. Não é regressão; é o aviso do `CLAUDE.md` sobre "pular não é passar", e por isso os números
anteriores (com o env) e este (sem) não se comparam direto.

⚠️ **A integração da API (~19 min) não foi rodada neste portão.** Ela passou na T2.2 só para
`trip-valuation-document-figures.integration.ts` (5 · 0), e a suíte inteira **não** foi repetida depois
que o frontend mudou — o que é coerente, porque as mudanças da T3.x e da T4.1 são todas no painel. Mas
fica dito: o portão da raiz **não** cobre a integração, e ela é gate de **push** (T4.4 em diante).

## T4.4 — revisão independente por `code-reviewer` em `opus`

Revisor somente leitura, sem ter escrito o código. Veredito: **REQUEST CHANGES, leve** — nenhum
bloqueante, **um achado alto**, que ele provou **rodando** com uma entrada exata, e quatro médios.

### O alto, e por que é o gêmeo de um defeito que eu já tinha corrigido

**A1 — `spreadDistance` perdia o balde de distância inteiro quando todos os trechos e o retorno medem
zero.** `distribute` devolve zeros sem peso, o retorno também vira zero, e nada vai para o rateio. Com
`fuel 50` e `delivery_charges 30`, **R$ 80 desapareciam**: `totalCost 299` contra `Σ 219`.

É a mesma família do defeito que a T1.2 corrigiu no D3 (peso zero fazendo dinheiro sumir em silêncio).
O `spreadTime` já tinha a guarda e eu só a espelhei num dos dois. Não é raro o bastante para ignorar:
`delivery_charges` e o pedágio lançado à mão não dependem de quilometragem, e basta uma viagem sem
barracão com duas paradas na mesma coordenada.

Corrigido com duas coisas, não uma: a guarda no `spreadDistance` (o balde inteiro desce como rateio da
viagem, como o tempo já fazia) **e uma soma de conferência no fim** — o que desceu para as notas tem de
ser exatamente o que as parcelas somam, senão a resposta é `unavailable`. A segunda pega também o balde
de imposto com frete total zero (B5), e qualquer `kind` futuro que escape da tabela. Provado por
mutação: sem a guarda reprovam 2 testes; sem a soma, o terceiro.

### Os médios

| #   | achado                                                                                                                                                                                                                                        | decisão                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Sem `departed` para a parada seguinte, a espera engolia o trajeto **e** a espera da seguinte, e saía `measured`: o mesmo minuto contado duas vezes.                                                                                           | **Corrigido.** Para na chegada/entrega em outra parada e sai `proxy`.                                                                                                   |
| M2  | `timeBasis: 'complete'` **nunca** acontecia numa viagem real: a última parada é sempre `proxy`, e isso rebaixava a viagem. O teste de integração afirmava `partial` para uma viagem **completa e semeada** — estava **cimentando o defeito**. | **Corrigido.** O `proxy` da última parada não conta; o do meio continua parcial. A asserção da integração passou a `complete`.                                          |
| M3  | A espera misturava relógios e canais (aparelho × servidor × escritório), contra o ADR-0088 §6.                                                                                                                                                | **Corrigido sem migration**: `trip_stop_events` já tem `channel` e `tapped_at`. Só mede com os dois extremos do `driver_app` no mesmo relógio.                          |
| M4  | `readStopDwells` no `Promise.all` derrubava a avaliação **e** o recálculo do congelado.                                                                                                                                                       | **Corrigido.** Falha vira lista vazia → `unavailable` (D5); o log leva o nome do erro e os ids, nunca a mensagem. Provado por **comportamento** no teste de integração. |
| M5  | A comparação "previsto × fechado" compara a **mesma conta** duas vezes.                                                                                                                                                                       | **Pergunta de produto** — ver abaixo.                                                                                                                                   |

### M4 provado por comportamento, e a mutação mostrou o vazamento que o teste previne

O teste faz a leitura falhar com uma mensagem que contém uma coordenada e afirma: totais iguais ao caso
saudável, toda linha `unavailable`, **um** aviso, e a coordenada ausente do log. Sem o isolamento ele
reprova, e **o erro cru que aparece na saída do teste é a própria coordenada** — a demonstração de por que
só o nome do erro vai para o log.

### Quatro mutações nas regras novas do dwell

| sonda                                          | reprovou                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| ignorar a chegada/entrega em outra parada (M1) | os 2 testes de M1                                                         |
| ignorar o canal (M3)                           | "chegada do escritório e saída do aplicativo não se subtraem como medida" |
| ignorar o relógio (M3)                         | "relógio do servidor contra relógio do aparelho também rebaixa"           |
| a última parada volta a rebaixar (M2)          | "o proxy da última parada não rebaixa a viagem"                           |

### Baixos corrigidos

- **B6** — a margem percentual por nota agora usa `divideHalfUp`, como a da viagem (2/3 saía 66,6666%
  contra 66,6667%).
- **B8** — o provedor criava um `Map` novo a cada render e re-renderizava todas as notas: `useMemo`.
- **B9** — o `TripDocumentCostCriterion` não tinha o cabeçalho de copyright que os vizinhos têm.
- **B10** — o RF8 ainda dizia `departed − arrived`; o comentário da guarda dizia que a prévia sai sem os
  oito campos, quando sai com eles como `unavailable`.

### O que ficou aberto, nomeado

- **M5** — pergunta de produto, sem resposta.
- **B1** — as asserções de cor em `document-cost.contract.tsx` leem o **texto da fonte**
  (`toContain("flow === 'in' ? ...")`), o antipadrão que esta base já registrou: refatorar mantendo o
  comportamento quebra o teste, e uma regressão de classe aplicada pode passar. O CSS module não gera
  nome de classe no teste, o que limita; resolver exige renderizar com um mapa de classes.
- **B2** — o teste de integração diz "tem imposto, avulso e retorno" mas só afirma `pis_cofins > 0` e
  `tripShare > 0`, que sai do avulso **ou** do retorno.
- **B3** — não há teste **negativo de tenant** para `readStopDwells`; o `CLAUDE.md` da API o exige em
  mudança de query. Pela leitura é seguro (filtra `companyId` e um `tripId` alheio já dá 404 antes).
- **B4** — o alinhamento trecho↔parada é só por contagem; rota antiga sem `depot` **e** parada sem
  coordenada podem casar a contagem e desalinhar. Confiança baixa.
- **B7** — `NaN`/`Infinity` em `legs` lançam `RangeError`; inalcançável hoje.

### O que o revisor tentou quebrar e **não** conseguiu — o que ficou provado

A invariante do D4 fechou ao centavo em: caso base, `stopId` inexistente, espera negativa, três centavos
ímpares em três notas com frete `0,0001`, parcela `null`, nota duplicada e duração zero em todos os
trechos. A classificação das nove parcelas está exaustiva e correta. Os defeitos (c) e (d) não voltaram.
A permissão do D7 cobre as **três** rotas que chamam a avaliação (`valuation`, `valuation-preview` e
`route-suggestions/:id/valuation`) e o portal não a chama. Tenant, N+1, dinheiro (nenhum `Number()`) e PII
estão limpos. Acessibilidade da tabela e do bloco de custo está correta.

### Portões

| Portão                                           | Resultado                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `bun run typecheck` / `lint` (api)               | exit 0                                                           |
| contrato inteiro da API                          | **8580 pass · 23 skip · 0 fail · 27618 expect() · 192 arquivos** |
| `trip-valuation-document-figures.integration.ts` | **6 pass · 0 fail**                                              |
| `bun run test` (painel) · `test:hooks`           | **6220 pass · 0 fail** · **180 pass · 0 fail**                   |

⚠️ A integração da API **inteira** (~19 min) não foi repetida depois destas correções — só o arquivo da 225. Ela é gate de **push**, e a T4.3 já registrava que o portão da raiz não a cobre.

### M5 resolvido — "Previsto" virou "Conta atual"

Pergunta de produto da revisão, respondida pelo usuário em 2026-10-02. A coluna "Previsto" era a
avaliação **calculada agora** pela mesma função que gerou o congelado; chamá-la de previsão prometia mais
do que ela entrega, e a diferença tende a sair sempre "sem diferença". Alternativas apresentadas:
congelar a conta no despacho (planejado × realizado — exige coluna nova e migration) ou deixar o rótulo.
Escolhido o honesto e barato: **"Conta atual"** (`Current account` em `en`), legenda
"Conta atual e conta fechada, com a diferença (fechado menos conta atual)".

Mudou o **texto**, não a chave (`comparison.expected` fica — renomear chave é churn sem ganho). Não toquei
em `expectedCost`/`expectedRevenue`/`expectedMargin`: são pré-existentes, de outro contexto (propostas de
roteiro, onde "previsto" está certo). O D6 da spec foi reescrito com a razão medida.

Os testes **passaram sem mudança** porque leem o rótulo pela chave — ou seja, nada prendia a decisão.
Acrescentei a asserção que a prende (`Conta atual` / `Current account`, e nenhuma legenda com "previst" ou
"expected"); revertendo o rótulo para "Previsto" ela reprova (**13 pass · 1 fail**, e **14 · 0** depois).
Prints regenerados (8 passed).

## A integração inteira da API, depois das correções da revisão

A lacuna que a T4.3 deixou dita — "o portão da raiz **não** cobre a integração" — fechou, rodando o
`test:integration` **inteiro** sobre o código **depois** das correções da T4.4 (A1, M1–M4) e do rótulo
"Conta atual":

```
802 pass · 8 skip · 0 fail · 4962 expect() · 810 testes · 146 arquivos · [888.70s]
```

Os 8 skips são os de sempre da suíte. Desta vez o `company-user-listing.integration.ts` **não** estourou o
teto de 120 s que estourou na primeira rodada da T1.3 — o que confirma o diagnóstico de carga de ambiente,
não de defeito. A infra foi a de E2E (postgres 65432), que o `.env.test` aponta.

⚠️ Isto vale para a base **atual**, 93 commits atrás de `origin/staging`. A spec 233, Fase 0, refaz o rebase e
**repete** esta integração (T0.4) — é o gate de push, e este resultado não o substitui.

## Revisão opus (2026-10-02): M3

Confirmado e corrigido junto da 233 (`e2ab47179`): resultado `unavailable` com imposto que não pôde ser distribuído
(frete total zero e ICMS positivo) publicava `taxAmount: "0.0000"` e o painel imprimia "Imposto R$ 0,00". Agora
`taxAmount: null` nesse caso (zero só quando não há imposto). Detalhe, contratos e mutações em
`specs/233-a-nota-se-abre-inteira/evidence.md`.

## Renumeração 226 → 232 e 227 → 233

Em 2026-10-02 a numeração colidiu com `226-a-fila-do-motorista-nao-trava-com-o-servidor-fora` e
`227-a-fila-nao-apaga-o-que-nao-subiu` (outra frente, em `origin/staging`). Esta spec virou 232 e a
"A nota se abre inteira" virou 233; a 228 permanece. Padrões trocados (perl, nos arquivos que a
branch toca, fora `snapshot.json` e PNG): número solto `226`/`227` não colado a letra, dígito ou ponto
(cobre "spec 226", "226 T3.2", "(226 D4)", "226 RF4", "a 227", `transportada_226_`, `integration-226`),
`spec-226-`/`spec-227-` (smokes e PNGs, renomeados com `git mv`) e as pastas `specs/226-…`/`specs/227-…`.
Não trocados: `217-227` (linhas de código em `specs/196`), "78 de 227" e "(226 linhas)" em
`docs/ai-context/api-transportada.md`.

## T3.4 — a nota sem parada diz por quê (RF7)

**API.** A linha de `revenueLines` ganhou `hasStop?: boolean` (aditivo), montado em `attachDocumentCostFigures` a
partir do `stopId` do contexto (`trip_documents.stop_id`, lido do banco): `true` com parada, `false` com `stop_id`
nulo, e **sem a chave** quando o contexto não informou `stopId` (undefined) — nunca um `false` inventado.
Não é dinheiro: não há classificação de redação monetária neste caminho (a rota inteira é `trip.financials`; o
contrato do portal ganhou `hasStop` na lista de chaves proibidas).

**Painel.** O validador de linha (`toRevenueLine`) lê chaves conhecidas, **não é estrito**: o painel antigo já
ignora `hasStop`. Ordem de publicação: **indiferente** — API primeiro (painel antigo ignora o campo) ou painel
primeiro (sem o campo, nada é impresso). O validador novo aceita booleano e ignora o resto, sem derrubar a avaliação.
A frase (`documentCost.noStop`, pt-BR e en) sai no `TripDocumentCostCriterion` só com `hasStop === false`.

**Mutações** (todas restauradas; arquivo reescrito, sem checkout):

| Mutação                                          | Reprovou                      |
| ------------------------------------------------ | ----------------------------- |
| API: `hasStop: true` sempre                      | 2 (contrato) + 1 (integração) |
| API: contexto sem `stopId` vira `hasStop: false` | 1                             |
| API: não anexa `hasStop`                         | 3                             |
| Painel: `hasStop !== true` (infere por ausência) | 2                             |
| Painel: infere também por trecho zero            | 3                             |
| Painel: validador descarta o campo               | 2                             |
| Painel: critério não imprime o aviso             | 1                             |
| Painel: não booleano aceito como `true/false`    | 1                             |
| Painel: quebra a frase pt-BR                     | 2                             |

**Portões.**

- API: `bun run typecheck` exit 0; `bun run lint` (`--max-warnings=0`) limpo;
  `bun --env-file=../../.env.test test --timeout 120000` -> 8728 pass · 23 skip · 0 fail (8751 testes, 193 arquivos);
  integração `./test/integration/trip-valuation-document-figures.integration.ts` -> 7 pass · 0 fail (Postgres 65432 do `.env.test`).
- Painel: `bun run typecheck` exit 0; `bun run lint` 0 errors · 16 warnings pré-existentes; `bun run test` -> 6431 pass · 0 fail (+ 327 pass · 0 fail no segundo arquivo do script).
