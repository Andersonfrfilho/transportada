# Feature 123 — A lacuna do agregado diz **qual célula da planilha** falta

## Problema e resultado

No razão da viagem, a parcela `driver` sem preço saía como `NO_DRIVER_RATE` com `detail: null`. A
tela imprimia "rota do agregado sem valor cadastrado" e nada mais.

A planilha do cliente tem **29 zonas × 6 colunas de classe**. Sem dizer qual linha e qual coluna, a
lacuna manda o operador conferir 174 células — ou, mais provável, não conferir nenhuma. Compare com
`CITY_WITHOUT_REGION`, que desde a spec 086 leva o nome da cidade e imprime "— ITOBI/SP": aquela
lacuna vira ação, esta não.

O que torna isso reparável sem consulta nova é que **o cálculo já sabia**: `resolveTripDriverZone`
tinha a zona casada na mão no instante em que recusou a cobertura do motorista, e a jogava fora;
`resolveCrew` tinha a classe do veículo e o id do motorista, e não os passava adiante no caminho de
lacuna.

O resultado desta feature é uma lacuna que nomeia **a linha e a coluna** da planilha, distingue as
duas faltas possíveis, e diz de quem é a falta quando a viagem tem mais de um condutor. Nenhum
número da conta muda.

## Medições

Base real desta instalação, 2026-09-10:

| medida                                                   | número                           |
| -------------------------------------------------------- | -------------------------------- |
| Viagens com tripulação                                   | 20                               |
| Delas, sem preço de agregado                             | 16                               |
| Motorista **sem cobertura nenhuma** cadastrada           | 1 de 6 (`adalberto rocha`)       |
| Lacunas que passam a nomear zona + classe                | 8                                |
| Lacunas que já nomeavam a cidade (`CITY_WITHOUT_REGION`) | 4                                |
| Lacunas que continuam secas (nenhuma parada com cidade)  | 4                                |
| Zonas com a coluna `utility` vazia                       | **25 de 25** que têm algum preço |
| Valores do razão alterados                               | **0**                            |

## Fora do escopo

- Mudar a planilha, a importação dela ou a tela de Regiões (spec 038, ADR-0038).
- Mudar qual zona paga: a decisão da spec 086 D1 (o destino mais distante) continua intacta.
- Mexer no `ValuationLedger` — ele já imprime `line.detail` ao lado da frase da lacuna desde a 110.

## Histórias priorizadas

### P1 — A lacuna nomeia a linha e a coluna

**Given** uma viagem cujo destino caiu na zona `3.000` (CAJURU) num veículo `vuc`
**When** o operador abre o razão
**Then** a parcela do motorista diz `— 3.000 (CAJURU) · vuc`
**And** o valor da parcela continua `0,00`, como sempre foi.

### P2 — As duas faltas são distintas, e se resolvem em telas diferentes

**Given** que a zona do destino existe e o motorista não a cobre
**Then** a lacuna é `DRIVER_ZONE_NOT_COVERED` — "motorista não cobre a zona do destino"

**Given** que a zona existe, o motorista a cobre e a célula de preço da classe está vazia
**Then** a lacuna é `DRIVER_RATE_MISSING_FOR_CLASS` — "zona sem preço para a classe do veículo".

### P3 — Com dois condutores, a lacuna diz de quem é

**Given** uma viagem com dois agregados, um deles sem preço
**Then** o detalhe nomeia **aquele** motorista
**And** com um condutor só o nome não aparece — não há de quem confundir.

### P4 — Nada é inventado

**Given** um veículo sem coluna na planilha (moto, carro, cavalo mecânico)
**Then** a classe **não** aparece no detalhe, e a lacuna continua a genérica

**Given** que não houve destino que resolvesse zona nenhuma
**Then** o detalhe é `null` e a frase seca de sempre permanece.

## Decisões

### D1 — As duas faltas se distinguem sem consulta nova

`resolveTripDriverZone` já separa "zona não casou" de "zona casou e a cobertura não alcança"; só o
segundo ramo perdia a informação. E `resolveCrew` já tinha o preço na mão para saber se a célula
respondeu. Nenhuma consulta foi acrescentada.

### D2 — O detalhe é dado cru; a frase é do `*.locale.json`

Igual à cidade da 086. O separador é `·`, o **mesmo** de `ledger.driverBasis`, que a tela já usa
para a parcela medida (`Zona 1.002 (RIBEIRÃO PRETO) · toco · …`). Compor a frase na API significaria
traduzir na API.

### D3 — A coluna só aparece acompanhada da linha

Sem zona decidida, imprimir `three_quarter` sozinho diz que o problema é a classe do veículo — e o
problema é que nenhuma parada resolveu zona. Uma coordenada só não localiza célula em planilha.
Medido: 4 das 20 viagens reais caem exatamente aí.

### D4 — Veículo sem coluna na planilha não é "célula vazia"

`resolveVehicleFreightClass` manda `''` para moto, carro, `other` e cavalo mecânico. Ali não existe
célula a preencher, e chamar isso de célula vazia mandaria o operador procurar uma coluna que a
planilha não tem. A lacuna continua `NO_DRIVER_RATE`, agora com a zona no detalhe.

### D5 — O nome do motorista só entra com mais de um condutor

Com um só, o nome é ruído. Com dois, sem ele a parcela relata um condutor e o operador confere a
ficha do outro — o defeito conhecido de eleger um tripulante para reportar.

### D6 — Entre dois condutores sem preço, vence quem tem o que dizer

A cidade a cadastrar continua vencendo (086 D2). Depois dela, a escolha passou a preferir o
tripulante cujo detalhe não é vazio: relatar o primeiro da lista quando o segundo conhece zona e
classe devolveria a frase seca com a informação a um índice de distância.

### D7 — A cidade a cadastrar sai sozinha

`CITY_WITHOUT_REGION` significa que **não há** zona; pôr uma ao lado contradiria a própria lacuna.

## Alcance nas outras superfícies

A prévia da montagem e a proposta de roteiro leem o mesmo `readPreviewContext` e o mesmo
`buildValuationFromContext` — o detalhe vale nas três sem uma linha a mais.

## Ordem de deploy

**Indiferente.** As duas lacunas novas chegam como texto e o frontend traduz por chave com
`defaultValue`; um frontend antigo imprimiria a chave crua em vez de quebrar, e uma API antiga
simplesmente nunca manda as chaves novas. Não há guard por lista fechada nesse caminho.
