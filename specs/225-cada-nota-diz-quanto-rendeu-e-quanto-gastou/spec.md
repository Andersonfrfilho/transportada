# Feature 225 — Cada nota diz quanto rendeu e quanto gastou

## Problema e resultado

O painel "A conta desta viagem" responde "esta viagem deu lucro?". Ninguém consegue responder **qual
nota** deu lucro. A receita por nota já existe no payload (`revenueLines`, com valor, origem, regra e
percentual), mas a tela do detalhe não a lê; e o custo não existe por nota em lugar nenhum — ele é da
viagem inteira.

Quem monta viagem decide o que carregar, e quem negocia decide se um cliente vale a pena. As duas
decisões precisam do número por item, não do número do lote. Hoje a conversa é "o roteiro deu R$ 900
de lucro" e a pergunta seguinte — "por causa de qual nota?" — não tem resposta no produto.

**Resultado**: no detalhe da viagem, cada nota mostra **frete, gasto e lucro próprios**, com o
critério à vista; e o painel da viagem mostra **a previsão e o número congelado lado a lado**, cada um
rotulado, em vez de um substituir o outro.

O gasto por nota é medido por **distância e tempo** — decisão do usuário em 2026-10-02 —, não por
rateio do frete nem por peso.

## Fora do escopo

- Congelar o número por nota. Nesta spec ele é **derivado na leitura**, sobre a avaliação que já
  existe. Persistir vem depois, se e quando alguém precisar auditar o passado por nota.
- Mudar qualquer regra de cálculo do custo da viagem (specs 038, 101, 153, 165, 177). O total não se
  move: esta spec só o **reparte**.
- Receita lançada à mão (`trip_revenue_entries`). Ela já não entra no `totalRevenue` da avaliação
  (linha separada do frete previsto) e continua fora.
- Rateio por peso ou por volume. Fica registrado como caminho futuro em D2.
- Lucro por cliente, por região ou por período. É consequência natural disto, e é outra spec.

## Decisões

- **D1 — O gasto da nota vem do trecho que ela andou, e do tempo que ela ocupou.** A rota congelada
  já guarda `legs[{ distanceMetres, durationSeconds }]` em `trips.planned_route`
  (`parse-planned-route.policy.ts:10`), e `trip_documents.stop_id` diz em qual parada cada nota é
  entregue. Uma nota está **a bordo** desde a origem até a parada que a entrega. O custo de cada
  trecho vai para as notas a bordo **daquele** trecho:
  A classificação das nove parcelas que `TRIP_COST_KINDS` conhece é **exaustiva e declarada** — sem
  `default`, porque parcela nova caindo no rateio errado em silêncio é o defeito mais provável desta
  spec:

  | parcela               | critério               | por quê                                                                                                               |
  | --------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
  | `fuel`                | distância do trecho    | queima com o quilômetro                                                                                               |
  | `other_per_kilometer` | distância do trecho    | definida por quilômetro (spec 038)                                                                                    |
  | `toll`                | distância do trecho    | já é por índice de trecho (`parseFrozenBoothLegIndexes`)                                                              |
  | `delivery_charges`    | distância do trecho    | **decisão do usuário** em 2026-10-02 — ver abaixo                                                                     |
  | `driver`              | tempo: trecho + espera | diária, custa tempo — ver D9                                                                                          |
  | `helper`              | tempo: trecho + espera | diária de quem acompanha (ADR-0065 §2) — ver D9                                                                       |
  | `manual` (avulso)     | rateio de viagem (D3)  | `trip_cost_entries` tem só `trip_id`: **não existe** vínculo com parada nem nota, então não há trecho a que amarrá-lo |
  | `icms`                | frete da própria nota  | percentual da receita, exato por nota (ADR-0049 §4)                                                                   |
  | `pis_cofins`          | frete da própria nota  | idem                                                                                                                  |

  ⚠️ **`delivery_charges` pela distância é escolha do usuário contra a recomendação registrada.** A
  tabela `delivery_charges` tem `trip_document_id`: a taxa **já sabe de qual nota ela é**, e daria para
  atribuí-la inteira e exata, sem rateio. Repartindo pela distância, a taxa causada pela nota da
  primeira parada cai parcialmente sobre notas que descem depois — e a linha da tela **não** pode ser
  explicada como "a taxa desta nota". Isto está aqui para que a troca, se vier, seja uma decisão e não
  a descoberta de um defeito.

- **D9 — Tempo é trecho rodado mais espera no cliente, e a espera é de quem desce ali.** Pedido do
  usuário em 2026-10-02. A base de tempo de `driver` e `helper` soma dois pedaços:
  - **o trecho**, `legs[i].durationSeconds` da rota congelada, repartido entre as notas a bordo (D1/D2);
  - **a espera na parada**, atribuída **direto** às notas entregues ali, dividida igualmente entre
    elas — ninguém mais causou aquela espera. O caminhão ficou parado **uma vez** na parada, e é esse
    tempo que custa: `departed − arrived` dos eventos daquela parada. `TRIP_STOP_EVENT_KINDS` tem
    `arrived`, `delivered` e `departed`, e o schema é explícito em `trip.schema.ts:1129` — "chegada é
    da parada; entrega e retorno são de uma nota".

  ⚠️ Somar `delivered − arrived` **por nota** seria errado e é tentador: as entregas de uma parada
  acontecem dentro da mesma permanência, então isso contaria o mesmo minuto várias vezes e faria o
  tempo total da viagem crescer sozinho.

  Ausência tratada, nunca adivinhada:
  - sem `departed`, mas com `delivered`: usa o **último** `delivered` da parada como saída, e o tempo
    sai marcado como parcial;
  - sem `arrived`: a espera daquela parada é **zero**, e o tempo sai marcado como incompleto — não um
    palpite;
  - **não existe espera planejada** no produto: a rota congelada só tem trecho de viagem. Logo o
    previsto nasce **sem** espera, e o número cresce conforme a viagem acontece. Isso não é defeito — é
    a razão de D6 mostrar previsto e fechado lado a lado, e a tela precisa dizer qual dos dois o leitor
    está vendo.

- **D2 — Dentro de um trecho, a divisão é igual por nota, e isso é escolha, não descuido.** Dividir
  por peso seria mais fiel ao combustível, mas peso não é confiável em toda nota — e divisor que às
  vezes falta faz o número mentir em silêncio, que é pior do que um critério simples e declarado. A
  tela **diz** qual critério usou. Rateio por peso entra quando o peso for obrigatório e medido; até
  então, não.

- **D3 — Trecho sem nota a bordo não desaparece: ele vira rateio de viagem, declarado.** O retorno
  (`planned_return_distance_meters`) e qualquer trecho vazio custam dinheiro e não pertencem a nota
  nenhuma. Esse custo é repartido **igualmente entre todas as notas da
  viagem**, e a tela mostra as duas partes separadas: **"do trecho"** e **"rateio da
  viagem"**. Esconder a segunda faria a soma das notas não fechar com a viagem; somar as duas sem
  dizer faria a nota parecer mais cara do que ela causou.

  ⚠️ **Igualmente, não proporcionalmente ao gasto já acumulado.** A primeira redação dizia
  proporcional, e isso contradizia o CA06: a nota sem parada acumula gasto zero, logo receberia peso
  zero e ficaria **sem rateio nenhum** — justamente a nota que só tem rateio. Proporcional também faria
  a nota de percurso curto quase não pagar o retorno, que acontece pela viagem inteira. A contradição
  apareceu ao implementar, não ao revisar.

- **D4 — A soma das notas fecha com a viagem, e um contrato prova isso.** Invariante, para toda
  viagem: `Σ (costAmount + taxAmount) == totalCost`, `Σ freightAmount == totalRevenue` e
  `Σ marginAmount == totalMargin`. ⚠️ O imposto entra na soma do custo porque o `totalCost` da viagem
  **já o inclui**: o `buildTripValuation` final recebe `[...buildCostParcels(context), ...taxParcels]`
  (`read-trip-valuation.use-case.ts:481`), ainda que a tela separe as duas naturezas e o comentário do
  domínio diga que imposto "desce da receita". Afirmar `Σ costAmount == totalCost` deixaria a conta
  fora por todo o imposto, sem nada falhar. Dinheiro é `Decimal`/`numeric`, nunca float binário; o resto
  da divisão vai para a nota de maior gasto, de forma determinística, para que a conta feche sem
  centavo órfão.

- **D5 — Sem roteiro congelado, não há número inventado.** `planned_route` ausente, sem `legs`, ou com
  contagem de trechos que não casa com a de paradas: o gasto por nota sai **ausente**, com o
  vocabulário que a tela já usa (`NO_PLANNED_DISTANCE`, "roteiro ainda não calculado"). Nunca um zero
  que parece resposta. ⚠️ O casamento trecho↔parada é a parte frágil: `legs[i]` é o trecho que **chega
  à parada `i+1`** na ordem da rota, e a spec 206 mexeu em onde a rota começa. Um contrato prende esse
  mapeamento, e a divergência de contagem é tratada como ausência, não como aproximação.

- **D6 — Previsão e congelado lado a lado, cada um com nome.** Hoje o painel mostra a previsão com a
  viagem aberta e troca para o congelado quando ela fecha. Passa a mostrar os dois, rotulados:
  **"previsto"** e **"fechado"**, com a diferença entre eles visível. Viagem aberta mostra só o
  previsto, dizendo que o fechado ainda não existe — não um campo vazio.

- **D7 — Nada de dinheiro sem `trip.financials`.** A rota já remove `amounts` inteiro sem a permissão
  (`trip.routes.ts:742-751`), e os campos novos seguem a mesma porta. Um contrato negativo garante que
  gasto e lucro por nota não vazam para resposta sem a permissão, nem para o portal da contratante.

- **D8 — Derivado na leitura, uma fonte só.** O cálculo vive numa política de domínio nova, chamada
  pelo mesmo caso de uso que já monta a avaliação (`read-trip-valuation.use-case.ts`), e a resposta
  ganha campos por nota dentro de `revenueLines` — não um endpoint paralelo. Dois lugares calculando a
  mesma conta divergem; já aconteceu nesta base (spec 177).

## Requisitos funcionais

- **RF1** `GET /trips/:id/valuation` devolve, por nota: o frete em `amount` (já existe — ⚠️ a linha de
  receita chama o frete de `amount`, **não** `freightAmount`; `freightAmount` é o nome interno do
  resultado da política, e a T2.2 faz o mapeamento), `legCostAmount`,
  `tripShareCostAmount`, `costAmount` (soma das duas), `taxAmount`, `marginAmount`,
  `marginPercentage` e `costBasis` (`'leg'` quando houve roteiro, `'unavailable'` quando não).
- **RF2** `Σ (costAmount + taxAmount) == totalCost`, `Σ amount == totalRevenue` e
  `Σ marginAmount == totalMargin`, com o resto de arredondamento na nota de maior gasto. `costAmount` é
  só operação (trecho + rateio); imposto vive em `taxAmount`, para a tela separar as naturezas como já
  separa hoje.
- **RF3** Sem roteiro congelado, toda nota sai com `costBasis: 'unavailable'` e sem valor de gasto,
  lucro ou margem — nunca zero.
- **RF4** No detalhe da viagem, a linha de cada nota mostra frete, gasto e lucro, com o gasto
  separando "do trecho" e "rateio da viagem", e o critério de divisão nomeado.
- **RF5** O painel da viagem mostra previsto e fechado lado a lado, com a diferença, e diz quando o
  fechado não existe.
- **RF6** Sem `trip.financials`, nada disso aparece na resposta nem na tela.
- **RF7** A nota sem parada (`stop_id` nulo) não recebe gasto de trecho: entra só no rateio de viagem,
  e a tela diz por quê.
- **RF8** A base de tempo soma trecho rodado e espera na parada (`departed − arrived`); a espera vai
  direto às notas entregues naquela parada, dividida igualmente. Sem `departed`, o último `delivered`
  da parada serve de saída e o tempo sai parcial; sem `arrived`, a espera é zero e o tempo sai
  incompleto.
- **RF9** A resposta diz, por nota, `timeBasis` (`'complete'`, `'partial'`, `'incomplete'`), para a
  tela não ter de inferir se o tempo está fechado.

## Critérios de aceite

- **CA01** Viagem com três paradas e cinco notas: `Σ (costAmount + taxAmount)` é igual ao `totalCost`
  ao centavo, `Σ amount` ao `totalRevenue` e `Σ marginAmount` ao `totalMargin`.
- **CA02** Nota entregue na primeira parada tem gasto de trecho **menor** que nota entregue na última,
  com o mesmo frete — é a prova de que distância e tempo entraram na conta.
- **CA03** Viagem com retorno: o rateio de viagem é maior que zero em toda nota, e a soma continua
  fechando.
- **CA03b** Duas paradas com o mesmo trecho e esperas diferentes: a nota da parada que **esperou mais**
  tem gasto de tempo maior, e a soma continua fechando. Uma parada com duas notas divide a espera em
  duas partes iguais, e o total de tempo da viagem **não** cresce por isso.
- **CA04** Viagem sem `planned_route`: toda nota sai `unavailable`, e a tela mostra "roteiro ainda não
  calculado" em vez de zero.
- **CA05** Contagem de trechos diferente da de paradas: tratado como ausência (CA04), não como
  aproximação.
- **CA06** Nota com `stop_id` nulo: sem gasto de trecho, com rateio de viagem, e com o aviso na tela.
- **CA07** Sem `trip.financials`: a resposta não traz nenhum dos campos novos; o portal da contratante
  também não.
- **CA08** O painel mostra previsto e fechado lado a lado numa viagem fechada, e só o previsto numa
  aberta, com o aviso de que o fechado ainda não existe.
- **CA09** Revisão de design com prints em 1280 e 375 px, comparando a linha da nota com as vizinhas,
  contraste em estado normal e selecionado (web.md §15), e o **ok explícito do usuário**.

## Casos extremos

- Viagem com uma nota só: todo o custo vai para ela, inclusive o retorno.
- Viagem sem nota: a conta da viagem continua como hoje; não há linha por nota.
- Trecho com duração zero (paradas na mesma coordenada): a divisão por tempo não divide por zero — o
  custo de tempo desse trecho vai para o rateio de viagem.
- Nota entregue em parada removida depois do congelamento da rota: cai em D5 (ausência).
- Duas notas na mesma parada: dividem igualmente o trecho, e a soma fecha.
