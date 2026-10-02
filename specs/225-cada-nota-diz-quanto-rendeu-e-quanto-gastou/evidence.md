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
