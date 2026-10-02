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
