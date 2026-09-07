# Feature 090 — O pedágio entra na conta

## Problema e resultado

Quem monta a viagem escolhe as notas olhando ganho previsto contra custo previsto. O custo que a tela
mostra hoje é combustível mais o que o veículo declara por quilômetro. **Pedágio não está lá** — e
numa rota de interior ele é a diferença entre uma viagem que paga e uma que não paga.

Medido nesta base: a rota Ribeirão Preto → sul do estado, **126 km**, passa por **três praças**, que
somam **R$ 32,80 por eixo**. Um `toco` de 3 eixos paga **R$ 98,40**; uma carreta de 5 eixos, **R$
164,00**. Nenhum desses números aparece na montagem.

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
