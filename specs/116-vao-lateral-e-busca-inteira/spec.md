# Spec 116 — O vão lateral segura a pilha, e a busca de lugar vai até a porta

> 🤖 Modelo: `opus` (empacotador — mudança de regra física, com medição em carga real)

## Contexto

A spec 115 deixou aberto: no Atego RTA-2F45 (baú 7,40 × 2,47 × 2,30 m, 85 paradas, arranjo em
profundidade), **982 de 1417** caixas desenhadas, **435 `bedFull`** e **24 paradas fora** (13–16,
21–40), com o baú a 48% do volume. A hipótese registrada era o arredondamento da célula de 5 cm.

## O que a medição mostrou (antes de mexer)

Instrumentando cada recusa na entrada real:

1. **Não era o baú cheio.** Só **4** buscas terminaram sem lugar, e todas por esgotar o teto fixo de
   64 fileiras (`MAX_SEAT_ATTEMPTS`). As outras **431** caixas foram recusadas pela memória de formato
   (`failedAt`) sem procurar — a gêmea da recusada herda a recusa enquanto nada entra.
2. **Cada fileira subia em pirâmide lateral**: 8, 8, 8, 7, 7, 7, 6, 6, 6, 5 caixas por camada. A
   caixa presumida de 0,261 m ocupa 0,30 m de célula; oito lado a lado deixam 7 cm até a parede, e a
   coluna da parede era tratada como **solta** — a esbeltez a travava.

## Requisitos

- **R1** — O teto de tentativas por caixa cresce com as fileiras da fatia: nenhuma busca desiste antes
  de visitar o baú inteiro.
- **R2** — Vão mais estreito que o giro da pilha (`3b/√10`, o topo andando até o centro de massa passar
  da aresta, no pior caso `h = 3b`) conta como apoio. Medido da face **real** da caixa, nunca da célula.
- **R3** — A porta continua não sendo parede: o caminho que chega à face aberta não apoia.
- **R4** — Nenhuma invariante regride nas quatro viagens reais: dentro do baú, nenhum par se cruzando,
  nada no ar, ordem de descarga (114 D4), pilha estável, `weightBalanced`, ≤ 50 ms.

## Fora do escopo

- A célula de 5 cm fica (ver "Experimentos recusados" na evidência).
- A escada da porta — a fileira da porta sobe só três vezes a base contada do piso — é física, e fica.
