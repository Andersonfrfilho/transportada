# Feature 097 — A viagem começa no barracão

> Registrada em 2026-09-08, a partir de defeito relatado pelo usuário olhando a tela.

## Problema e resultado

O mapa da montagem desenha a rota **da primeira entrega em diante**. O caminhão sai do barracão, e
essa perna não existe em lugar nenhum da conta: nem na distância, nem no tempo, nem no combustível,
nem no pedágio.

Medido em 2026-09-08 com o barracão real desta base (`-21.1767, -47.8208`, precisão de porta) e as
três notas de uma viagem de verdade — Orlândia, Orlândia, Ipuã:

| rota                        | distância |   tempo | praças | pedágio (toco) |
| --------------------------- | --------: | ------: | -----: | -------------: |
| **como a tela mostra hoje** |   48,4 km |  40 min |  **0** |    **R$ 0,00** |
| com o barracão na origem    |  105,5 km |  86 min |  **1** |   **R$ 30,00** |
| ida e volta ao barracão     |  209,0 km | 167 min |      2 |       R$ 60,00 |

⚠️ **A viagem parece não ter pedágio e tem.** A distância mais que dobra, e todo o erro é **para
baixo** — a direção que faz aceitar carga que não paga.

## O que já existe, e é o que torna isto barato

**O roteirizador já sabe do barracão.** `company_route_optimization_settings.origin_address_key`
guarda o endereço, `geocoded_addresses` tem a coordenada, e o solver do worker usa `depotIndex: 0`
com `endPolicy` cujo padrão é `depot` — ou seja, **"Propor ordem" e "Melhor rota" já partem do
barracão e voltam para ele**.

⚠️ **Quem não sabe é o mapa da montagem.** `TripAssemblyMap` monta os pontos só com as paradas das
notas, e é essa lista que vai ao `/route-geometry` — de onde saem tempo, distância, combustível e
pedágio. O produto tem **duas verdades sobre a mesma viagem**, e a que o operador lê é a errada.

## Decisões

### D1 — O traçado da montagem usa a mesma política do solver

A rota desenhada parte do barracão e termina conforme `endPolicy` (`depot` por padrão), que é o que o
solver já faz. Uma segunda regra aqui recriaria a divergência que este defeito é.

⚠️ **E isso já decide a volta, sem decisão nova.** Medido nesta base em 2026-09-08: as duas empresas
têm `end_policy = 'depot'`, que é também o padrão do esquema. A política configurada **já diz** que a
rota termina no barracão — então o roteiro real é _barracão → paradas → barracão_, e o custo previsto
é o de **ida e volta**: na viagem medida, 209 km e **R$ 60,00** de pedágio num toco, contra os R$ 0,00
que a tela mostra hoje.

Quem quiser terminar na última parada muda `end_policy` para `last_stop` — a configuração existe, e a
montagem passa a respeitá-la junto com o solver. O que não pode é a montagem ter uma política própria.

### D2 — Sem coordenada do barracão, a perna não existe e a tela diz isso

Barracão sem endereço cadastrado ou sem geocodificação **não vira ponto inventado**. A rota volta a
começar na primeira entrega, e a tela avisa que a perna inicial está de fora — com atalho para
cadastrar. Um custo silenciosamente incompleto é o que esta feature existe para acabar.

### D3 — A parada do barracão não é entrega

Ela entra no traçado e na conta, e **não** entra na lista numerada de paradas, não conta em ocupação
de carga, não gera `trip_stops` e não vira nota. É origem, não destino.

### D4 — O barracão tem marca própria no mapa, nunca o pino de parada

O ponto de partida **não pode usar o pino numerado das entregas**. Ele não é parada, não tem número
na sequência e não recebe carga — e um pino igual aos outros faz o operador contar quatro entregas
onde há três, ou procurar a nota da "parada 1" que é o próprio galpão.

A marca é distinta em **forma**, não só em cor: cor sozinha não sobrevive a daltonismo nem a mapa
impresso, e aqui a diferença é categórica — origem contra destino —, não de grau.

⚠️ Com `end_policy = 'depot'` o barracão aparece **duas vezes no traçado**, começo e fim, e é **o
mesmo lugar**. Ele é desenhado uma vez só: dois marcadores idênticos sobrepostos sugerem dois pontos
distintos, e a rota já mostra a volta pela linha.

### D5 — O roteiro é do escritório; o motorista pode mudar na rua

O guia de campo (ADR-0059) leva o motorista até a próxima parada do roteiro despachado, e mudar de
caminho na rua não replaneja a viagem. O custo previsto é o do roteiro planejado — e continua sendo,
mesmo que o motorista pegue outro caminho.

## Fora de escopo

- **Barracão por veículo ou por viagem.** A origem é da empresa; frota que sai de mais de um ponto é
  cadastro novo, com spec própria.
- **Recalcular viagem já despachada.** O roteiro congela em `dispatched` (ADR-0043).

## Contratos obrigatórios

- Com barracão geocodificado, a rota da montagem tem **uma perna a mais** que a lista de paradas, e o
  pedágio inclui as praças dessa perna.
- Sem coordenada de barracão, a rota é a de hoje **e a tela declara a ausência** — contrato reprova a
  queda silenciosa.
- O barracão não aparece na lista numerada de paradas nem na ocupação da carga.
- A política de fim é lida da mesma configuração que o solver usa — contrato reprova constante
  literal `'depot'` no caminho da montagem.
