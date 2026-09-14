# Spec 120 — Evidência

Entrada real: as quatro viagens de 2026-09-10 (`layout-inputs.json`, as mesmas das specs 115–119) e o
fixture `test/fixtures/real-mixed-cargo.fixture.ts`. Medições por script, nunca pelo desenho. Notas
sintéticas, porque a base não tem duas notas na mesma parada em quase nenhuma entrega: **chunks** (as
linhas da parada repartidas em pedaços contíguos, uma por nota da parada — o que `stampCargoNote`
produz) e **entry** (cada linha de produto uma nota — pessimista).

## Antes (`79ffb4c5`) × depois

| viagem   | desenhadas  | recomendado | complemento (motivo)                 | fora (`bedFull`) | paradas fora | ocupação      | ms (mediana de 9) |
| -------- | ----------- | ----------- | ------------------------------------ | ---------------- | ------------ | ------------- | ----------------- |
| RTC-4H67 | 441 → 481   | 441 → 443   | 0 → 38 (38 fora da mão, 31 remanejo) | 40 → 0           | 1,2,3 → —    | 57% → 62%     | 11,2 → 9,8        |
| RTE-6K89 | 252 → 252   | 252 → 252   | 0 → 0                                | 0 → 0            | — → —        | 44% → 44%     | 3,7 → 2,8         |
| RTA-2F45 | 1190 → 1269 | 1190 → 1190 | 0 → 79 (79 fora da mão, 26 remanejo) | 227 → 148        | 14 → 8       | 57,5% → 61,3% | 31,7 → 28,8       |
| RTD-5J78 | 500 → 500   | 500 → 500   | 0 → 0                                | 0 → 0            | — → —        | 42% → 42%     | 14,2 → 9,3        |

Nas quatro, antes e depois: **zero** fora do baú, zero pares se cruzando (AABB, folga 1e-6), zero no ar,
zero caixas sem apoio em qualquer passo da descarga, `weightBalanced` em todas.

- **Ordem de descarga:** zero pares furados entre caixas do mapa recomendado e das marcadas só
  `outOfReach`. Os pares furados existem só com `needsRehandling`: 116 na Daily, 421 no Atego.
- **Acesso na descarga:** o mapa recomendado sozinho passa a simulação da 118 nas quatro viagens (zero
  travadas). Com o complemento no baú, travam **exatamente** as caixas dele: 38 na Daily (entregas 1–4),
  79 no Atego (entregas 11–17) — nenhuma caixa recomendada trava por causa dele.
- **Notas (chunks):** Daily 3 inteiras/15 divididas (42 pedaços) → 5/17 (46); Sprinter 7/20 (45) → igual;
  Atego 9/70 (213) → 14/71 (219); Accelo 3/27 (95) → igual. O crescimento é das paradas que voltaram ao
  desenho. ⚠️ A divisão que sobra é quase toda da **parada**, não da nota: a carga sobe em parede e a
  entrega continua na parede seguinte, e os dois trechos só se tocam se a segunda subir à altura da
  primeira. Com uma nota por parada — o caso de 90% das paradas reais — nota dividida é parada dividida.

## Por que o Atego não volta aos 1347 de antes da 118

Aqueles 1347 eram **outra arrumação**: sem a regra da mão, as entregas mais cedo subiam nas paredes das
posteriores enquanto a varredura passava por elas. Com o mapa recomendado da 118 fixo, o que sobra de
espaço é fragmentado. Medido sobre a planta final: volume livre 10,58 m³ contra 8,67 m³ no `f126792f`,
e as tentativas de recuperá-lo:

| variante do complemento                                    | Atego | efeito colateral                   |
| ---------------------------------------------------------- | ----: | ---------------------------------- |
| pousar também em caixa recomendada da própria entrega      |  1269 | nenhuma caixa a mais               |
| escorar na carga inteira (e não só nas entregas que ficam) |  1269 | nenhuma caixa a mais               |
| **sem a esbeltez no complemento**                          |  1388 | **74 caixas sem apoio** — recusado |

O limite é físico: o que sobra só entra derrubando a pilha.

## Experimentos, com número

| experimento                                                     | resultado                                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complemento **só no fim**, em três degraus                      | Atego 1268, 334 ms — e 0 lugares de alcance sobravam no fim                                                                                       |
| Degrau do alcance no fim, varrendo fileiras (`scanRelaxedSeat`) | 0 caixas: 8872 candidatos recusados pela sombra                                                                                                   |
| **Alcance na hora** (`reachFallback`, escolhido)                | Atego +53, Daily +9 — o lugar que a varredura pré-118 usaria                                                                                      |
| Só o degrau da ordem, sem o do alcance                          | Atego 1272, mas as 82 viram `needsRehandling` — pior aviso, recusado                                                                              |
| Nota agrupando a **ordenação do mapa recomendado**              | chunks: Atego recomendado 1190 → 1185, pedaços 219 → 215, Accelo 95 → 85; entry: recomendado 1162 (−28) — **recusado**, tira caixa do recomendado |
| Encostar na nota no complemento (escolhido)                     | entry: Atego 210 → 199 pedaços; chunks: Daily 47 → 46                                                                                             |

## Tempo

Medido isolado (mediana de 9 rodadas, sem nada em paralelo): Daily 10,1 ms · Sprinter 2,6 ms · **Atego
31,5 ms** · Accelo 9,7 ms — margem de 18,5 ms no orçamento de 50 ms da tela. Numa rodada única logo após
o aquecimento (o que o contrato mede) o Atego deu 40,9 ms; com `typecheck` rodando em paralelo, 133 ms —
medir com a máquina ocupada não mede o empacotador.

Duas correções pagaram o complemento: a memória de um item do pacote em profundidade entre a decisão do
arranjo e o desenho (Daily 15 → 11 ms, Accelo 13,6 → 9,3) e as condições baratas antes da esbeltez, com
a gêmea procurando só em volta da última caixa que foi para longe da mão (Atego 62 → 31 ms).

## Espaço morto (spec 117), caso isolado

Sobre o **mapa recomendado**, um cubo de 10 cm a cada cinco paradas nas 85 do Atego: custo **185**
caixas presumidas para 17 cubos. O limite do contrato passou de uma coluna por cubo (170) para uma
coluna e uma caixa (187), com a razão escrita no teste: com a regra do alcance da 118 nenhum espaço morto
fica ao alcance da mão (0 de 17 cubos acharam um), então o cubo sempre senta na fileira e a vizinha perde
a caixa do topo. A soma das três densidades, que a 118 tinha introduzido, saiu: ela escondia que esta
densidade estourava sozinha.

## Contratos

- `test/cargo-placement/complement.contract.ts` (novo): as quatro viagens desenhando tudo que cabe de pé,
  o recomendado sozinho passando a 118, física e apoio na descarga com o complemento, só o complemento
  travando, só `needsRehandling` furando a ordem, e os pedaços por contato de face.
- Reescritos com a razão: `dead-space` (caso isolado, limite novo), `unloading` (acesso do mapa
  recomendado), `real-mixed-cargo` (a ordem vale fora do `needsRehandling`), `note-identity` (a nota não
  move caixa **do mapa recomendado**), `placement` (vocabulário com os dois motivos novos).
- Suíte `cargo-volume`: 262 pass, 0 fail. Frontend: 3259 pass, 0 fail.

## Não medido

- A tela: a API local roda do checkout principal; o desenho não foi conferido no navegador.
- O alcance de 0,6 m e o corredor de 0,6 m continuam declarados, não medidos com gente carregando.
- Nota real com duas notas na mesma parada: a base tem poucas, e as duas repartições usadas são
  sintéticas.
- Faixas (`lanes`) e carga amarrada não entram nas quatro viagens.
