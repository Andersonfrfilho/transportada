# Evidências — 225 Cada nota diz quanto rendeu e quanto gastou

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
