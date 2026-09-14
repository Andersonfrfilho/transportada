# Feature 105 — A vizinhança é granular

> Registrada em 2026-09-09, **depois da implementação**, ao contrário do processo: ela nasceu de uma
> cobrança direta do usuário — _"precisa ter qualidade até com 10.000 entregas, o algoritmo tem que
> funcionar"_ — e o código já citava "Spec 105" antes deste documento existir.

## Problema

A spec 104 fez o roteirizador **dizer a verdade**: acima de 200 paradas ele completava zero gerações
e devolvia a semente gulosa, agora rotulada `greedy`. Honesto, e insuficiente — o usuário não quer
saber que o roteiro é ruim, quer um roteiro bom.

A causa não era o GA. Era o `2-opt`:

1. varria **todos os O(n²) pares** de posições;
2. fazia **avaliação completa O(n)** em cada candidato, com alocação de array.

**O(n³) por passada**, e `refine` roda isso em 38 indivíduos por geração.

## D1 — Vizinhança granular

Para cada parada, as **K=20 mais próximas** por duração. O `2-opt` só tenta pares em que o destino é
vizinho da origem.

O fundamento é Toth & Vigo (2003, _granular tabu search_): movimento que liga duas paradas distantes
quase nunca melhora, então nem se avalia. É o mecanismo que faz busca local escalar de centenas para
milhares, e está em HGS, FILO e no resto do estado da arte.

⚠️ **É heurística, e custa.** Com K pequeno demais o ótimo local piora. K=20 é o padrão da literatura
e é o que medimos. A vizinhança é construída **uma vez por problema** — dentro do laço custaria mais
que o `2-opt` que ela veio acelerar.

## D2 — Filtro por delta, e ele é conservador de propósito

O delta de distância de um `2-opt` é O(1): saem `(a,b)` e `(c,d)`, entram `(a,c)` e `(b,d)`.

⚠️ **O delta não decide quem entra — decide quem vale avaliar.** Janela de tempo e jornada **não são
decomponíveis em O(1)**: reverter um trecho muda a hora de chegada de tudo o que vem depois. Quem
aceita continua sendo a avaliação completa, com penalidade. O filtro só descarta movimento que nem
encurta o caminho.

⚠️ Aresta desconhecida (`null` na matriz) devolve "vale avaliar". Recusar ali esconderia do `2-opt`
justamente o movimento capaz de tirar a rota de um trecho inalcançável.

⚠️ `NaN >= 0` é `false`: sem a guarda explícita de `Number.isNaN`, o filtro deixaria passar tudo em
silêncio e o ganho sumiria sem nenhum teste acusar.

## Medição

Mesma nuvem, mesma semente, orçamento de 30 s:

| paradas | antes (spec 104)        | depois                        |
| ------: | ----------------------- | ----------------------------- |
|     100 | 8 ger · 30,0 s · 465 km | **59 ger · 1,5 s · 457 km**   |
|     200 | 0 ger · 30,0 s · 678 km | **97 ger · 5,9 s · 638 km**   |
|     305 | 0 ger · 30,0 s · 856 km | **121 ger · 14,0 s · 800 km** |
|     500 | não chegava             | 129 ger · 30,1 s · `partial`  |
|    1000 | não chegava             | 1 ger · 30,3 s · `partial`    |

O caso do incidente (305 paradas) passou de `greedy` a `optimized`, em 14 s, com rotas **6,5% mais
curtas**. Os testes de referência contra ótimos publicados continuam passando — a granularidade não
degradou as instâncias pequenas.

## O que isto NÃO resolve

⚠️ **10.000 entregas numa instância só continua fora de alcance**, e a primeira parede não é o
solver:

- **A matriz.** 10⁴ paradas = 10⁸ células × 2 métricas × 8 bytes = **1,6 GB**, antes de qualquer
  otimização. Nenhum ajuste de solver contorna isso.
- **O regime.** É a faixa das _XL instances_. O estado da arte (AILS-II 0,07%, FILO2 0,21%) opera ali
  com orçamento de **horas**; HGS degrada para 1,36% e o autor diz que não é para acima de 5.000.

**O caminho é decomposição**, e temos a peça de negócio: `freight_regions` e `freight_region_cities`
já mapeiam cidade → zona. Dez mil entregas viram ~20 instâncias de 500, resolvidas em paralelo. E não
é atalho: a literatura de _territory design_ (Groër, Golden & Wasil) mostra que manter o motorista na
mesma região aumenta produtividade — o cluster vira ativo de operação.

Isso é spec própria.

## Aceite

1. 305 paradas saem `optimized` dentro do orçamento.
2. Nenhuma regressão nas instâncias de referência.
3. O filtro por delta nunca recusa movimento que a avaliação completa aceitaria.
