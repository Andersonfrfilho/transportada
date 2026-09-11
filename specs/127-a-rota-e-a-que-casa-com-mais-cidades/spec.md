# Feature 127 — A rota do agregado é a que casa com mais cidades da viagem

## Problema e resultado

`resolveTripDriverZone` montava o catálogo de cidades como `Map<cidade, linha>`. Uma cidade em duas
rotas — legítimo: a unicidade de `freight_region_cities` é `(company_id, region_id, city, state)`, e
na planilha real FRANCA/SP está na 1.003 e na 7.001, BARRINHA/SP na 1.000 e na 5.000 — era
**sobrescrita**: vencia a última linha que o Postgres devolveu, e a outra rota sumia sem aviso. É o
defeito de ordem que a 086 corrigiu em BARRETOS, com outra roupa.

Decisão do usuário: **"Você identifica as rotas e, quanto mais rotas baterem com a listagem da
planilha, escolha a faixa. As regiões dos motoristas são só para ajudar a montar o roteiro."**

## Regras

1. **Rota = a família (`parseRegionCode`) que casa com mais cidades da viagem.** Cada cidade distinta
   com zona conhecida vota em toda rota em que aparece na planilha; vence a rota com mais cidades. A
   cidade em duas rotas vota nas duas; as outras paradas desempatam.
2. **Faixa = a mais alta alcançada dentro da rota vencedora** (D1 da 086: o destino mais distante
   paga, e a faixa alta cobre as baixas da família). Parada cuja cidade não está na rota vencedora não
   puxa faixa dela.
3. **Empate real** (duas ou mais rotas com a mesma contagem máxima) → a parcela do motorista sai sem
   valor com `DRIVER_ROUTE_AMBIGUOUS`, e o `detail` nomeia as zonas empatadas no formato da 123
   (`1.003 (FRANCA) | 7.001 (FRANCA)`). O cálculo não escolhe calado.
4. **A cobertura do motorista (`fleet_driver_regions`) não decide preço nem origem.** O preço é o da
   tabela para `(zona escolhida, classe)`, `measured`. Sem preço para a zona/classe →
   `DRIVER_RATE_MISSING_FOR_CLASS` (123), ou `NO_DRIVER_RATE` para veículo sem coluna.
5. `CITY_WITHOUT_REGION` (nenhuma parada casa com a planilha) continua como está.
6. Nada muda no roteirizador nem na montagem que usam a cobertura — só a conta.

## Decisões

### D1 — O catálogo é lista por cidade

`groupCatalogByCity` guarda **todas** as linhas de uma cidade. Qualquer estrutura de uma linha por
cidade reintroduz a dependência de ordem, e o contrato embaralha o catálogo em todas as rotações e
inversões para provar que a ordem não decide.

### D2 — Dentro da faixa, a cidade nomeada é determinística

Duas cidades da viagem na mesma faixa vencedora: nomeia a de parada mais tardia; sem roteiro, a
primeira em ordem alfabética. A zona (e o preço) é a mesma nos dois casos — isso só decide o texto.

### D3 — A ordem do roteiro não desempata rota

A 086 usava a última parada para escolher a zona. A 127 troca o critério pela contagem: duas rotas
com uma cidade cada empatam mesmo com `sequence`. Escolher pela ordem seria desempatar por um dado que
a regra do usuário não nomeia.

### D4 — `DRIVER_ZONE_PRICED_FROM_TABLE` fica, com outra semântica

O código **não foi renomeado**: resultados congelados (`freeze-trip-financial-result`) e os rótulos
das duas telas já o carregam, e renomear exigiria migrar nota congelada. A semântica mudou: era
"estimado por falta de cobertura" (124), agora é **lembrete** — a parcela sai `measured`, o valor é o
da tabela, e o aviso só pede para acrescentar a zona na ficha. Continua em `ADVISORY_GAPS` (não
marca `hasGaps`). O rótulo das telas já dizia "preço da tabela: o motorista não tem esta zona —
adicione-a na ficha dele", e continua verdadeiro.

### D5 — `DRIVER_ZONE_NOT_COVERED` deixa de ser produzido

A constante fica em `VALUATION_GAPS` (e com rótulo nas telas) porque resultado congelado antes da 127
pode carregá-la. Nenhum caminho novo a produz: sem cobertura e sem preço, a falta é da planilha.

## Ordem de deploy

Indiferente. A lacuna nova chega como texto e o `t()` cai no `defaultValue` no frontend antigo; a
parcela `measured` com aviso já era renderizada pelo razão da 124 (valor **e** aviso na linha).
Nenhum guard por lista fechada no caminho.
