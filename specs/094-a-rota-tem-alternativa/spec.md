# Feature 094 — A rota tem alternativa, e a mais barata pode ser a mais cara

> Registrada em 2026-09-07. Estado: **pendente**. Depende da 090 (o catálogo de praças, a política
> que soma e o `annotations=nodes` são dela) e da 089b (o `overlay.pmtiles` e o estilo do mapa).

## Problema e resultado

A 090 põe o pedágio na conta, e para de aí: ela **informa** o custo do caminho que o roteirizador
escolheu. Quem monta a viagem não ganha escolha nenhuma — e escolha é o que ele quer, porque entre
Ribeirão Preto e Campinas existem dois caminhos com quinze reais de diferença de pedágio.

O resultado desta feature: **a montagem oferece rota mais rápida e rota mais barata**, com o custo
total de cada uma; **as praças aparecem no mapa com o valor ao lado do ícone**; e **os radares
aparecem com a velocidade permitida**.

## O que foi medido (2026-09-07)

Tudo contra o OSRM local (`osrm-routed --algorithm mld`) e o `ribeirao.osm.pbf` real.

### As alternativas existem, e não em toda rota

| rota                          | alternativas |
| ----------------------------- | -----------: |
| Ribeirão Preto → Campinas     |            2 |
| Ribeirão Preto → Pirassununga |            1 |
| Ribeirão Preto → São Paulo    |            1 |
| Ribeirão Preto → Bebedouro    |            1 |

`alternatives=true` funciona no MLD — **uma de quatro** rotas medidas ofereceu segunda opção. A tela
não pode prometer escolha que o roteirizador nem sempre tem.

### E quando existem, elas trocam pedágio por quilômetro

Ribeirão Preto → Campinas, tarifa por eixo × 2 (toco):

| rota | distância |   tempo | praças |   pedágio |
| ---- | --------: | ------: | -----: | --------: |
| 0    |  221,5 km | 179 min |      5 | R$ 108,60 |
| 1    |  239,6 km | 198 min |      4 |  R$ 93,20 |

A alternativa economiza **R$ 15,40 de pedágio** e custa **18,1 km e 19 minutos** a mais.

### ⚠️ A armadilha: a alternativa "mais barata" é, nesta rota, a mais cara

18,1 km a mais num toco que faz ~3,5 km/L, com diesel a ~R$ 6,20, são **~R$ 32 de combustível** —
contra R$ 15,40 de pedágio economizado. **A rota com menos pedágio sai ~R$ 16 mais cara**, e ainda
chega 19 minutos depois.

Chamar essa rota de "mais barata" seria mentira produzida por nós, num rótulo que o operador vai
acreditar. É o modo de falha da ADR-0044 §1 na forma mais direta possível: número plausível,
apresentado com confiança, decidindo carga.

### Radar

| medida                                      | resultado                                         |
| ------------------------------------------- | ------------------------------------------------- |
| Radares no extract (`highway=speed_camera`) | 527                                               |
| **Com `maxspeed`**                          | **438 — 83%**                                     |
| Valores mais comuns                         | 40 (110×), 60 (108×), 110 (61×), 50 (52×)         |
| Com `maxspeed:hgv` (limite de caminhão)     | 12                                                |
| Com `direction`                             | 49                                                |
| O `overlay.pmtiles` carrega hoje            | só `class: speed_camera` — **nenhuma velocidade** |

## Decisões

### D1 — "Mais barata" é o custo total, nunca só o pedágio

A comparação soma **pedágio + combustível** pela distância de cada alternativa, com o consumo e o
preço que a valoração já usa (`fleet/domain/vehicle-cost.policy.ts` e o preço efetivo por UF). O
rótulo diz o que a conta diz: se a rota com menos praça sai mais cara, ela **não** é a mais barata, e
a tela mostra isso em vez de esconder.

⚠️ Quando o veículo não declara consumo, ou não há preço para o combustível dele, **não há "mais
barata"**: a tela oferece só a mais rápida e diz por que a outra comparação não existe. Estimar
consumo para preencher o rótulo é inventar o número que decide a escolha.

### D2 — Sem alternativa, não se inventa escolha

Três de quatro rotas medidas têm um caminho só. Nesse caso a tela mostra a rota e o custo dela, sem
seletor — um seletor de uma opção só ensina que existe escolha onde não existe.

### D3 — A praça no mapa vem da rota, com o valor ao lado

O ícone de cabine já existe no basemap desde a 089b (`cabine-de-pedagio`, da camada `poi`), **sem
valor**. O valor vem da resposta da rota (090 D4), que já traz as praças percorridas com tarifa,
nome e operador — então o rótulo é desenhado sobre a praça **do trajeto**, não sobre toda cabine da
região.

⚠️ Praça sem tarifa conhecida aparece com **"—"**, nunca com "R$ 0,00". Medido na 090: `0.00` é
tarifa declarada em 4 das 166 praças e nem sempre significa isenção — duas delas têm nome de praça de
rodovia e zero em tudo, que é campo não mapeado.

### D4 — O radar mostra a velocidade que o mapa souber, e cala quando não sabe

O `overlay.yml` ganha `maxspeed` (e `maxspeed:hgv`, e `direction`) como atributo da camada `radar`, e
o overlay é reassado — 51 s locais, pelo caminho que a evidência da 089b registrou. Os **17% sem
`maxspeed`** aparecem como radar **sem número**: um radar existe mesmo quando ninguém mapeou o limite,
e inventar "60" porque é comum é pior que não dizer nada.

⚠️ **`maxspeed:hgv` vence para caminhão quando existir** (12 radares). O limite do caminhão é menor
que o do carro em rodovia brasileira, e é o do caminhão que interessa a quem opera frota.

### D5 — Nada disto reordena parada

A ordem das paradas continua sendo do solver, que usa `/table` — matriz de distância e duração, **sem
anotação de nó**, e portanto sem como conhecer praça. Escolher a ordem por pedágio exigiria uma rota
por par de paradas em vez de uma matriz, e continua fora de escopo. Esta feature escolhe **o caminho
entre as paradas**, que é onde o pedágio varia.

## Fora de escopo

- **Reordenar paradas por custo** (D5).
- **Rota que evita pedágio por construção.** O OSRM não tem `avoid=toll` no perfil `driving`; o que
  se faz aqui é escolher entre as alternativas que ele já devolve.
- **Desconto de tag, vale-pedágio e eixo suspenso** — herdado do fora-de-escopo da 090.
- **Radar na conta.** Ele informa; não entra em custo nem em tempo previsto.

## Contratos obrigatórios

- O rótulo "mais barata" é atribuído pela **soma pedágio + combustível**, e um contrato reprova a
  atribuição feita só pelo pedágio — com o caso medido de Campinas, em que as duas respostas
  divergem.
- Sem consumo ou sem preço de combustível, não existe rótulo de mais barata.
- Rota única não renderiza seletor.
- Praça sem tarifa imprime "—", e o contrato reprova "R$ 0,00" nesse caso.
- Radar sem `maxspeed` renderiza sem número.
- `maxspeed:hgv` vence `maxspeed` no rótulo do radar.
