# Revisão do roteirizador — o que temos, o que a literatura faz, e o que fazer

> Medido em 2026-09-09, a partir de um incidente real: uma montagem com 305 paradas produziu
> **6.655 km e 150 horas** de direção, repartidas em 7 viagens — uma delas com **207 notas**.

## 1. O que temos hoje

`worker-transportada/src/routing/domain/route-solver.ts` é um **algoritmo genético memético**
escrito aqui: cromossomo é uma permutação com separadores de veículo, população 40, torneio 4,
elitismo 2, _order crossover_, mutação por troca a 0,2, e **2-opt em todo indivíduo** antes de
entrar na população. Semeado por vizinho-mais-próximo. Determinístico por semente. Puro, sem I/O.

É trabalho honesto e bem escrito. O problema não é a implementação — é o **modelo** e a **escala**.

## 2. A medição que decide tudo

Instâncias euclidianas sintéticas, nuvem de 60 km, semente fixa, orçamento declarado de **30 s**:

| paradas | veículos | gerações | truncado | segundos reais |
| ------: | -------: | -------: | :------- | -------------: |
|      20 |        3 |       40 | não      |            0,6 |
|      50 |        4 |       44 | não      |            8,0 |
|     100 |        5 |   **10** | sim      |           31,5 |
|     200 |        6 |    **1** | sim      |           56,1 |
|     305 |        6 |    **0** | sim      |          123,2 |
|     345 |        6 |    **0** | sim      |          183,2 |

Três leituras, e cada uma é um defeito:

**a) O joelho está entre 50 e 100 paradas.** Até 50 o GA converge por estagnação. A partir de 100
ele é cortado pelo relógio.

**b) Acima de 200 paradas não existe algoritmo genético.** Com **0 gerações**, nada evoluiu: o
resultado é a semente gulosa com 2-opt parcial. Chamar isso de "o roteirizador otimizou" é falso.

**c) ⚠️ O orçamento de tempo é piso, não teto.** Declarado 30 s, gastou **183 s**. O `deadline` só é
conferido no topo do laço de gerações (`route-solver.ts:55`), e **uma** geração com 345 paradas leva
minutos. Quem configura 30 s espera 3 minutos e conclui que travou — foi exatamente o que aconteceu.

**Complexidade:** `improveWithTwoOpt` é O(n²) candidatos por passada, cada um com `reverseSegment`
O(n) e avaliação O(N) → ~O(n³) por indivíduo, e `refine` roda em 38 indivíduos por geração. Total
≈ **O(G · P · n³)**.

## 3. Os três buracos do modelo

### 3.1 Volume não existe no solver — e essa foi uma decisão, não um descuido

`RouteVehicleInput` tem `capacityKilograms` e nada mais. `RouteStopInput` tem `weightKilograms` e
nada mais. A ADR-0044 §9 é explícita: _"volume não entra no modelo — nem como restrição frouxa, nem
como aviso"_, porque a cubagem não vinha no XML e **restrição calculada sobre dado ausente produz um
número que parece restrição e não é**. Há até um contrato que falha se a palavra "volume" aparecer
na solução.

O raciocínio estava certo em 2026-08. **A premissa mudou:** as specs 075, 085, 088 e 093 construíram
o modelo cúbico inteiro — `resolveCargoVolume` estima por espécie, `nfe_package_boxes` guarda medida
de conferente, `resolveVehicleCapacity` devolve m³ da ficha com origem declarada, e a ocupação já
aparece na montagem marcada como `measured`/`partial`/`estimated`.

⚠️ A mesma ADR já previu o retorno: _"quando existir cadastro de cubagem por produto, ele volta"_.
Existe. Mas **reverter §9 é decisão de ADR**, não de implementação — e o argumento tem de encarar o
motivo original: uma restrição de volume alimentada por estimativa fraca é pior que nenhuma.

**É este o buraco que explica as 207 notas:** carga de supermercado é leve. 207 notas não estouram
peso, e volume não é conferido.

### 3.2 A função objetivo não sabe o que é uma viagem equilibrada

O fitness é a **soma** dos custos das rotas. Soma é indiferente a distribuição — e pior: concentrar
paradas próximas num veículo só **reduz** a distância total. O GA está fazendo exatamente o que a
função pede. 207 × 8 é o ótimo do objetivo que escrevemos.

Não há termo de variância, nem min-max (_makespan_), nem teto de paradas por rota, nem penalidade
por rota vazia — e de fato uma das 7 viagens nasceu **vazia**.

### 3.3 A semente empurra a sobra para o último veículo

`splitAcrossVehicles` enche o veículo 1 até a capacidade antes de abrir o próximo. É o **efeito de
fronteira** que a literatura de _cluster-first_ documenta: a última rota fica sistematicamente com a
pior ocupação. Aqui ele entra pela semente e o GA não tem operador que o desfaça — o 2-opt só
reordena **dentro** de cada rota; não existe _relocate_/_swap_ entre rotas.

## 4. Como isso se compara com o que se usa lá fora

Nosso problema, na taxonomia: **HFVRP de frota fixa, um depósito, capacidade multidimensional
(massa e volume)**, sem janelas obrigatórias e sem backhaul.

Qualidade publicada (X-instances, gap contra o melhor conhecido):

| método                            |                               gap | orçamento              |
| --------------------------------- | --------------------------------: | ---------------------- |
| HGS-CVRP (Vidal 2022, com SWAP\*) |                        **0,11 %** | n × 2,4 s              |
| PyVRP                             |                            0,22 % | n × 2,4 s              |
| OR-Tools (medição independente)   |                            ~3,5 % | segundos               |
| Clarke-Wright savings             |                            5–10 % | segundos               |
| **nosso GA acima de 200 paradas** | **efetivamente a semente gulosa** | estourando o orçamento |

Solvers de produção que modelam nosso caso **nativamente**:

| solver         | licença    | capacidade multi-dimensão                          | HTTP pronto        |
| -------------- | ---------- | -------------------------------------------------- | ------------------ |
| **VROOM** 1.15 | BSD-2      | ✅ `capacity` já é **array** (peso, volume, itens) | ✅ `vroom-express` |
| **PyVRP** 0.14 | MIT        | ✅ múltiplas _load dimensions_, base HGS           | ❌                 |
| OR-Tools 9.15  | Apache-2.0 | ✅ N `AddDimension`                                | ❌                 |
| jsprit         | Apache-2.0 | ✅ `Capacity` é vetor                              | ❌                 |

⚠️ **A diferença entre o nosso GA e o HGS não é de afinação, é de mecanismo:** o HGS gere
diversidade por distância entre indivíduos e usa o operador SWAP\*. É a diferença entre "alguns por
cento" e 0,11 %.

## 5. O que a matriz de distância NÃO é

O `OSRM_MAX_TABLE_SIZE` desta instalação é **2000** (`.env:149`), então 346 pontos passam
folgadamente — o padrão do OSRM é 100, e não é o nosso caso. Medição do mantenedor do OSRM: matriz
10.000 × 10.000 em ~8 s. **A matriz não é o gargalo. O gargalo é o solver.**

## 6. Recomendação, em ordem de valor por esforço

1. **Teto e degradação honesta** (barato, imediato). Acima de ~120 paradas o resultado não é
   otimização — ou recusamos, ou avisamos na tela que o roteiro é uma aproximação gulosa. Hoje ele
   se apresenta como sugestão otimizada, e não é.
2. **Fazer o orçamento ser teto** (barato). Conferir o `deadline` dentro do 2-opt, não só entre
   gerações. 30 s tem de significar 30 s.
3. **Equilíbrio na função objetivo** (médio). Teto de paradas por rota, ou termo de min-max. Sem
   isso, nenhuma troca de solver conserta o 207 × 8 — o objetivo é que está errado.
4. **Volume como segunda dimensão** (médio, e exige emendar a ADR-0044 §9). Barato no nosso GA e
   nativo em VROOM/PyVRP. A regra honesta: só restringir com volume `measured`; com `estimated`,
   avisar sem restringir — que é o que a §9 sempre quis dizer.
5. **Trocar o solver** (grande, e é uma decisão de produto). **VROOM** é o candidato natural:
   BSD-2, serviço HTTP pronto, `capacity` já é vetor, e já rodamos OSRM ao lado dele. Escrever HGS
   nosso é caminho de meses para chegar onde uma dependência chega hoje.

⚠️ Os itens 1 a 3 valem **mesmo que** o solver seja trocado — teto, honestidade e objetivo correto
são nossos, não do solver.
