# Feature 090 — O pedágio entra na conta

## Problema e resultado

Quem monta a viagem escolhe as notas olhando ganho previsto contra custo previsto. O custo que a tela
mostra hoje é combustível mais o que o veículo declara por quilômetro. **Pedágio não está lá** — e
numa rota de interior ele é a diferença entre uma viagem que paga e uma que não paga.

Medido nesta base: a rota Ribeirão Preto → sul do estado, **126 km**, passa por **três praças**, que
somam **R$ 32,80 por eixo**. Um `toco` de 2 eixos paga **R$ 65,60**; uma carreta de 5 eixos, **R$
164,00**. Nenhum desses números aparece na montagem.

⚠️ A primeira versão desta linha dizia "um toco de 3 eixos paga R$ 98,40" e contradizia a própria
T6, duas seções abaixo ("`toco` e `truck` da base real, 2 e 3 eixos"). `toco` é caminhão de dois
eixos — um dianteiro e um traseiro simples —, e quem tem três é o `truck`, o truncado. Corrigido ao
executar a T6, e o valor certo é o que está acima.

O resultado desta feature: **o custo de pedágio da rota entra na descrição do roteiro e na conta da
viagem**, com as praças nomeadas, o valor por eixo, o total pelo veículo escolhido, e a data da
tarifa impressa ao lado.

## O que foi medido

Medido em 2026-09-06 (spec 089), com `osmium` sobre `deploy/osrm/data/ribeirao.osm.pbf` e contra a
base local.

| medida                                              | resultado                   |
| --------------------------------------------------- | --------------------------- |
| Praças de pedágio no extract (`barrier=toll_booth`) | **166**                     |
| Com tarifa (`charge`)                               | **163**                     |
| **Com tarifa por eixo de caminhão** (`hgv/axle`)    | **162** — 98%               |
| Nós OSM devolvidos numa rota de 126 km              | 845 (`annotations=nodes`)   |
| Praças casadas nessa rota                           | **3**, por identidade de nó |
| Veículos da frota                                   | 12                          |
| **Veículos com `axle_count` preenchido**            | **4 de 12**                 |

Uma praça no extract vem assim:

```
n1809980851 barrier=toll_booth
charge=10.50BRL/motorcar;5.30BRL/motorcycle;10.50BRL/hgv/axle
operator=... x=... y=...
```

## As duas decisões que ordenam o resto

### D1 — A praça se casa por **identidade do nó**, nunca por proximidade

O OSRM aceita `annotations=nodes` e devolve os **ids de nó OSM percorridos** — 845 numa rota de
126 km. A praça de pedágio **é** um nó OSM. Então a interseção é exata: `nodes ∩ praças`.

Provado antes desta spec existir: a rota real devolveu as três praças, com as três tarifas.

⚠️ **Casar por raio seria o erro.** Rodovia duplicada tem pistas a poucos metros uma da outra, e a
praça do sentido contrário cairia no raio — cobrando pedágio de quem passou do outro lado. Com nó,
o sentido está resolvido por construção: cada pista tem os seus.

⚠️ **Consequência de encanamento:** a chamada de geometria da rota precisa passar a pedir
`annotations=nodes`. Sem isso não há o que cruzar, e o custo sai zero **sem erro nenhum** — que é o
modo de falha silencioso desta feature.

⚠️ **A chamada já existe, e é a mesma que desenha o mapa da montagem** — conferido em 2026-09-07:
`apps/api-transportada/src/trips/infrastructure/osrm-route-geometry.gateway.ts:38` pede
`/route/v1/driving/…?overview=full&geometries=geojson`, e é dessa resposta que saem o traço da rota e
o "Tempo do roteiro" que o diálogo **Nova viagem** já mostra. O `annotations=nodes` é **um parâmetro
a mais nela**, não integração nova. Isso barateia a T4 e é a razão de a fase 2 poder correr em
paralelo com a 1.

### D2 — O eixo tem duas origens, e a tela diz qual é

`fleet_vehicles.axle_count` já existe (2 a 9, ou zero para não informado) e está preenchido em **4
de 12** veículos. Então o número sai de:

1. `axle_count` da ficha, quando maior que zero → origem `declared`;
2. referência por `vehicle_type` → origem `estimated`.

A referência é tabela de mercado sem `company_id`, como `fuel_price_references` e
`vehicle_volume_references` — a terceira do produto, e pela mesma razão: quantidade de eixo de um
`toco` não é dado de uma transportadora.

⚠️ **Um veículo estimado torna o total estimado**, e a tela é obrigada a imprimir a marca junto do
número — a mesma regra do peso (ADR-0052) e da ocupação (spec 075). Custo de pedágio plausível sem
aviso é o modo de falha da ADR-0044 §1, e aqui ele vira decisão de aceitar ou recusar carga.

### D3 — O pedágio na montagem obriga o painel a ler a distância que o mapa já tem

O requisito é **aparecer na criação da viagem**, e ali há uma armadilha que a primeira versão desta
spec não viu. Conferido em 2026-09-07, no mesmo diálogo **Nova viagem**:

- o mapa imprime "Tempo do roteiro: 1 h 26 min — **estrada medida pelo roteirizador**";
- o painel _Custo da operação_, logo abaixo, imprime "Combustível — **roteiro ainda não calculado**".

As duas frases são verdadeiras ao mesmo tempo, e a razão é a fonte: a valoração lê a distância
**persistida na viagem** (`resolveFuelParcel` → `VALUATION_GAPS.noPlannedDistance`), e na montagem a
viagem ainda não existe. O mapa calcula a rota na hora; o painel não a enxerga.

**Decisão: na montagem, a parcela de pedágio e a de combustível saem da mesma rota que o mapa
desenhou.** Acrescentar só o pedágio ali produziria um painel pior que o de hoje — uma parcela com
valor ao lado de outra dizendo que não há roteiro, e um "Custo previsto" parcialmente preenchido com
cara de completo. Meia conta com aparência de conta inteira é exatamente a margem otimista que a
ADR-0049 §2 proíbe, e aqui ela decide aceitar ou recusar carga.

⚠️ **Isto alarga o escopo de propósito**, e o alargamento é pequeno: a distância já está na resposta
que a tela recebe (`RouteGeometryLeg.distanceMetres`, um por par de paradas), e o que falta é o
painel de montagem passar a consumi-la em vez do campo persistido. `noPlannedDistance` continua
existindo e continua certo **na viagem já criada** — ele diz "ninguém planejou a rota", que é
diferente de "a rota desta montagem não foi persistida ainda".

⚠️ **A parcela do motorista não entra nesse conserto.** Ela falta por outro motivo ("rota do agregado
sem valor cadastrado", spec 086), e cadastro ausente não vira número por mudança de fonte de
distância. O painel continua listando o que falta.

### D4 — O pedágio viaja na resposta da rota, nunca numa chamada ao lado

Decidido em 2026-09-07, com a T5 pronta e antes de escrever a tela.

O `POST /route-geometry` já pede `annotations=nodes` e já recebe os nós percorridos (T4). Calcular o
pedágio ali é **de graça**: os nós estão na mão, e o cruzamento com o catálogo é um `Map`. Uma rota
própria para o pedágio custaria uma segunda ida ao OSRM pela mesma rota.

⚠️ **E o custo maior não é a chamada, é a divergência.** Duas consultas para o mesmo trajeto podem
devolver caminhos diferentes — versão do dataset, empate entre alternativas, reordenação de parada
entre um clique e outro —, e aí a tela mostra um traço de 106 km ao lado de um pedágio calculado
sobre outro caminho. Os dois números são plausíveis, nenhum acusa nada, e é a mesma armadilha que a
D3 acabou de fechar do lado da distância. Vindos da mesma resposta, discordar é impossível por
construção.

Na montagem, isso põe o pedágio **imediatamente abaixo da linha "Tempo do roteiro"**, alimentado pelo
mesmo payload que desenhou o traço.

⚠️ **Isto não cria um segundo cálculo de pedágio.** `resolveTollRouteCost` continua sendo o único
lugar que soma; o que muda por consumidor é **de qual rota vêm os nós** — a da montagem, aqui, e a da
viagem já criada, na conta da viagem (T9). Duas rotas diferentes são duas perguntas diferentes; duas
somas seriam o defeito.

## Onde o dado mora

`toll_booths`, **sem `company_id`** — dado público de mercado, idêntico para toda instalação:

| coluna                   | conteúdo                                          |
| ------------------------ | ------------------------------------------------- |
| `osm_node_id`            | chave natural, `bigint`, única                    |
| `name` · `operator`      | o que a tela imprime                              |
| `latitude` · `longitude` | para desenhar no mapa                             |
| `charge_per_axle`        | `numeric` — a parcela `hgv/axle`                  |
| `charge_car`             | `numeric` — para veículo leve da frota            |
| `observed_on`            | **a data do extract**, e é ela que a tela imprime |

⚠️ **`observed_on` não é enfeite.** A tarifa do OSM é fotografia da data do extract e reajuste de
pedágio é anual. Sem a data, o operador lê um número velho como se fosse de hoje.

A carga vem do próprio extract, no mesmo runbook que gera o `.osrm` — é artefato de build, não
chamada de rede em runtime.

## O que aparece na tela

Na montagem (`TripAssemblyMap`, diálogo **Nova viagem**), ao lado de "Tempo do roteiro":

> **Pedágio: R$ 98,40** — 3 praças, R$ 32,80 por eixo × 3 eixos · tarifa de julho/2026

E na descrição do roteiro, praça a praça, na ordem em que o caminhão passa, com nome e operador —
para quem confere saber **por onde** o custo entrou.

Na conta da viagem, o pedágio entra como custo previsto ao lado do combustível, com a mesma origem
(`estimated` quando o eixo foi estimado).

⚠️ E **no painel da montagem** ele aparece pela D3 — junto do combustível, os dois alimentados pela
rota que o mapa acabou de desenhar. Rota sem praça imprime "sem pedágio no trajeto"; ela nunca some
da lista, porque sumir é indistinguível de não ter sido calculada.

## Fora de escopo, e por quê

- **Volta.** A viagem é modelada até a última parada; o retorno não existe no roteiro, então o custo
  mostrado é o da ida. A tela diz isso.
- **Desconto de tag, eixo suspenso, isenção.** Vale-pedágio, tag com desconto por operadora e eixo
  suspenso de carreta vazia mudam o valor real. Entram quando alguém decidir o cadastro de contrato
  com a operadora — não dá para inferir do mapa.
- **Escolher rota por pedágio.** Esta feature **informa** o custo; ela não pede ao OSRM uma rota que
  evite praça. Roteirizar por custo é decisão de produto com ADR própria.
- **Atualizar tarifa por fonte oficial.** ANTT e ARTESP publicam tarifa de graça e são o caminho
  para não depender do mapeamento — fica para a spec que fizer a atualização periódica.

## Contratos obrigatórios

- A chamada de geometria pede `annotations=nodes` — contrato por texto de fonte, porque a ausência
  não quebra nada visível, só zera o custo.
- Casamento por id de nó, nunca por distância: contrato que reprova qualquer aritmética de raio no
  caminho do pedágio.
- Um eixo estimado marca o total inteiro como estimado, e o componente não imprime o valor sem a
  marca.
- `toll_booths` na lista de exceções de `tenant-safety` como terceira tabela sem `company_id`.
- Rota sem praça devolve **zero com origem conhecida**, nunca `null` — "não passa por pedágio" e
  "não sei" são coisas diferentes na conta.
- No painel da montagem, pedágio e combustível saem da **mesma** origem de distância — contrato que
  reprova a tela que imprimir um dos dois com valor enquanto o outro alega roteiro não calculado.
