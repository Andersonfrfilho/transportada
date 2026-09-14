# Spec 148 — Evidência

## T1 — a base reproduzida · 2026-09-13

Pacote `feat/cargo-placement` @ `0925c14` (worktree `adatechnology-packages-wt/cargo-placement`), sem
alteração. O harness importa o **fonte** (`packages/backend/cargo-placement/src/index.ts`); o `dist/` do mesmo
commit foi conferido (`CARGO_LAYOUT_POLICY_VERSION = "2"`, sem `wallBuilding`). Bun 1.3.14. Entradas de
`harness/inputs/` com `enclosedBody: true, securesCargo: false, deliveryReachM: 2` sobrescritos pelo script.

Comando (a partir da raiz do worktree do app):

```bash
cd specs/148-montagem-em-parede/harness
TAG=base bun bench_reach.ts
bun check.ts dumps/base_*_r2_E.json
bun tall.ts dumps/base_*_r2_E.json
```

| Veículo          | Colocadas | De fora | Esperado | Tempo  | Retrabalho | Fora do alcance | check (apoio/baú/colisão) | tall (pilhas altas / violações) |
| ---------------- | --------- | ------- | -------- | ------ | ---------- | --------------- | ------------------------- | ------------------------------- |
| Atego 84 paradas | 1303      | 162     | 162      | 65,7 s | 241        | 112             | 0 / 0 / 0                 | 868 / 0                         |
| Iveco 27 paradas | 433       | 11      | 11       | 3,8 s  | 51         | 15              | 0 / 0 / 0                 | 219 / 0                         |
| Sprinter         | 242       | 6       | 6        | 0,9 s  | 22         | 7               | 0 / 0 / 0                 | 119 / 0                         |
| Fiorino          | 90        | 4       | 4        | 0,2 s  | 21         | 0               | 0 / 0 / 0                 | 35 / 0                          |
| Accelo           | 500       | 0       | 0        | 2,2 s  | 0          | 0               | 0 / 0 / 0                 | 313 / 0                         |
| Iveco antiga     | 372       | 0       | 0        | 0,6 s  | 0          | 0               | 0 / 0 / 0                 | 233 / 0                         |

- Os seis números de caixas de fora batem com a tabela do Problema da spec; nenhuma divergência.
- `check.ts`: fração mínima de apoio 0,8 em todas; zero caixa abaixo de 80%, fora do baú ou em colisão.
- `tall.ts` (modo E, 80% da borda) com zero violações nas 6; também zero com `FRAC=1` (borda inteira).
- Retrabalho = caixas marcadas `needsRehandling`; fora do alcance = `outOfReach` (alcance de 2 m).
- Scripts ajustados para rodar do repositório: entradas lidas de `./inputs` (o JSON é o `input` direto, sem
  envelope), dumps em `./dumps` (ignorado no git), `REACHES` padrão `2`; `check.ts` passa a imprimir
  `REPROVADO` quando há violação.

Modelo: executado com `opus` (a tabela recomenda `sonnet`, sem cota até 2026-09-14 09:00; fallback da tabela).

## T2 — montagem em parede · 2026-09-13

Pacote `feat/cargo-placement` @ **`401a05d`** (pai `0925c14`), sem push e sem publicar. Harness da spec 148
(fonte do pacote, `enclosedBody: true, securesCargo: false, deliveryReachM: 2`). Modelo: `opus`.

### 1. Bisect da `wip/cargo-wall-building` (591c13c): D25 × `wallBuilding`

Cópias do fonte da wip no scratchpad: `d25` = wip sem as tentativas de parede; `wall` = wip com
`brace.enclosed = false` (sem D25); `both` = wip inteira.

| Variante             | Atego | Iveco 27 | Sprinter | Fiorino | Accelo | Iveco antiga | Violações |
| -------------------- | ----- | -------- | -------- | ------- | ------ | ------------ | --------- |
| base `0925c14`       | 162   | 11       | 6        | 4       | 0      | 0            | 0         |
| só D25               | 162   | **16**   | 4        | 4       | 0      | 0            | 0         |
| só `wallBuilding`    | 162   | 10       | 6        | 4       | 0      | 0            | 0         |
| D25 + `wallBuilding` | 162   | 10       | 1        | 4       | 0      | 0            | 0         |

- **A piora da Iveco 27 (11 → 16) é da D25.** A `wallBuilding` da wip, sozinha, leva a 10.
- **A Daily que perde 1 caixa fora do baú fechado é da D25 aplicada a todo veículo.** Na wip a D25 já está
  restrita ao baú fechado (`brace.enclosed`); com ela valendo em todo veículo (variante `d25all`, com os
  contratos de `0925c14`) caem:
  - `complement` › "Daily, Sprinter e Accelo desenham toda caixa pedida": **1 caixa `P2` `bedFull`**
    (esperado `[]`);
  - `exact-edges` › "RTC-4H67 Daily não desenha menos que com a célula de 5 cm": **480 desenhadas, mínimo
    481**;
  - também caem `brace-rises-alongside` (Daily e Atego a 50%: prateleira sobre vão) e os 6
    `enclosed-body` "sem baú fechado: quatro lados", que ainda descrevem a borda inteira.
- A `enclosed-body.contract.ts` da wip falha na própria wip (4 casos), e a de `0925c14` falha com a D25 (6
  casos "nenhuma pilha alta sem cabeceira ou lateral", juiz de borda inteira). A wip não foi herdada.

### 2. D9 — bloqueada

A D25 em todo veículo (D9) derruba `complement` e `exact-edges` (números acima). Os contratos não foram
alterados e a D25 **não entrou** no commit: está aguardando o usuário. A D25 só no baú fechado não é
decisão do usuário e também ficou de fora; ela aparece abaixo só como medida.

### 3. Contrato vermelho antes do código

`test/cargo-placement/wall-building.contract.ts` (baú 2,47 × 7,4 × 2,2, 60 caixas misturadas em 4
entregas, mais 60 iguais para o teste da fileira), no entrypoint `cargo-placement.contract.test.ts`:

- a primeira pilha de cada fileira fica no canto (face de trás do bloco ou fileira anterior + parede
  lateral);
- toda pilha alta tem encosto no sentido da cabeceira e numa lateral (carga misturada e uniforme);
- as pilhas sobem antes de a carga andar para a porta: o bloco ocupa menos que os **2,30 m** medidos no
  `0925c14` (a parede ocupa 1,90 m);
- sem `enclosedBody` o desenho é idêntico ao do `0925c14` (impressão digital `10303136107426709627`).

Vermelho no `0925c14`: 5 pass / **1 fail** (`Expected: < 2.299`, `Received: 2.3000000000000003`). Verde
depois: 6 pass / 0 fail. Com carga uniforme base e parede desenham igual; só a misturada separa as duas.

### 4. Medição (6 entradas, caixas de fora)

| Variante                              | Atego   | Iveco 27 | Sprinter | Fiorino | Accelo | Iveco antiga | Atego (tempo) | check / tall |
| ------------------------------------- | ------- | -------- | -------- | ------- | ------ | ------------ | ------------- | ------------ |
| `base` (`0925c14`)                    | 162     | 11       | 6        | 4       | 0      | 0            | 65,7 s        | 0 / 0        |
| `wall-mesma` (**adotada**, `401a05d`) | **138** | **0**    | **0**    | **0**   | 0      | 0            | **95,9 s**    | 0 / 0        |
| `wall-zigue`                          | 142     | 0        | 0        | 0       | 0      | 0            | 93,5 s        | 0 / 0        |
| `wall-mesma` + D25 (só baú fechado)   | 91      | 0        | 0        | 0       | 0      | 0            | 96,8 s        | 0 / 0        |

- `check.ts` (apoio ≥ 80%, dentro do baú, sem colisão) e `tall.ts` (modo E) com **zero violação** nas 24
  plantas.
- Tempo da Atego dentro da meta de 120 s em todas; medido rodando sozinho.
- Retrabalho (`needsRehandling`) / fora do alcance (`outOfReach`), Atego: base 241 / 112, `wall-mesma`
  **42 / 8**, `wall-zigue` 110 / 34, `wall-mesma` + D25 43 / 23. Iveco 27: base 51 / 15 → 0 / 0 nas
  paredes. Sprinter 22 / 7 → 0 / 0. Fiorino 21 / 0 → 0 / 0.
- **D8:** a mesma parede deixa 4 caixas a menos que o zigue-zague na Atego e empata no resto → adotada.
  O zigue-zague foi medido numa cópia no scratchpad (fileira ímpar, contada por `⌊y / largura⌋`, escolhe
  o último assento aceito a partir da outra parede) e não foi commitado.

`classify.ts` nas caixas de fora da Atego (`diag.ts` → `classify.ts`):

| Variante           | Pilha alta (D23) | Sem assento com 80% de apoio | Só sobre entrega anterior | Outro |
| ------------------ | ---------------- | ---------------------------- | ------------------------- | ----- |
| base               | 141              | 18                           | 0                         | 3     |
| `wall-mesma`       | 98               | 3                            | 0                         | 37    |
| `wall-zigue`       | 122              | 17                           | 0                         | 3     |
| `wall-mesma` + D25 | 86               | 3                            | 2                         | 0     |

A meta D3 (zero caixa de fora) **não fechou na Atego**: sobram 138, a maioria barrada pela D23 (pilha alta
sem encosto no melhor assento). Com a D25 cairia para 91; ela depende da D9.

### 5. Gates do pacote

- `bunx tsc --noEmit`: sem erro.
- `bun test ./test/cargo-placement.contract.test.ts` rodado sozinho: **211 pass, 0 fail** (0 linhas
  `(fail)`, contadas por string fixa). `exact-edges` e `complement` verdes.
- ⚠️ Com a máquina carregada (harness em paralelo), "Accelo misto" do `enclosed-body` estourou o limite de
  5 s do `bun test` — por tempo, não por violação: com `--timeout 60000` passa, e sozinho leva 3,0–3,4 s
  contra 2,6 s no `0925c14` (a tentativa de parede custa ~0,4–0,8 s ali). O Atego de 50 ms oscila como já
  oscilava.
- `CARGO_LAYOUT_POLICY_VERSION` '2' → '3' (a mesma entrada no baú fechado muda de desenho). `dist/` não
  recompilado (é da T4).

## T3 — D25 só no baú fechado · 2026-09-13 · ⚠️ bloqueada no gate

Decisão do usuário: a vizinha escora com 80% da borda **só com `enclosedBody`** (D9 reescrita). Por cima do
`401a05d`, na árvore do pacote, **sem commit**: os trechos da D25 da wip (`MIN_BRACED_EDGE_FRACTION = 0.8`,
`sideHolds` por fração, `brace.enclosed`), `createSupportMap` exportado para o contrato e
`CARGO_LAYOUT_POLICY_VERSION` '3' → '4'. Typecheck limpo.

- **Contrato vermelho antes:** `brace-edge-fraction.contract.ts` (da wip, sem mudança), no entrypoint. No
  `401a05d` (só com o `export`): 6 pass / **1 fail**, o caso "vizinha cobrindo 80% da borda — escorada".
  Com a D25: 7 / 7.
- **Harness (`TAG=t3`, sozinho):** Atego **91**, Iveco 27 0, Sprinter 0, Fiorino 0, Accelo 0, Iveco
  antiga 0; Atego em **89,7 s**; retrabalho / fora do alcance na Atego 43 / 23 (nos outros, 0 / 0).
  `check.ts` e `tall.ts` (80%) com zero violação nas 6.
- **`classify.ts`, Atego (91):** 86 pilha alta (D23), 3 sem assento com 80% de apoio, 2 só sobre entrega
  anterior.
- **Suíte:** 218 testes, **6 `(fail)`**, todos do `enclosed-body` › "nenhuma pilha alta sem cabeceira ou sem
  lateral" (Daily, Sprinter, Accelo e os três mistos). O juiz desse contrato exige a **borda inteira**; a
  D25 aceita 80%. Numa cópia com o juiz a 80% só no baú fechado (fora da porta e da borda < 25 cm, como
  `tall.ts`), o arquivo passa 15 / 15: as 6 falhas são exatamente pilhas escoradas entre 80% e 100% da
  borda. `complement`, `exact-edges` e `brace-rises-alongside` estão verdes.
- **Bloqueio:** o `enclosed-body` só fica verde mudando a expectativa do juiz (borda inteira → 80% no baú
  fechado), e isso foi vedado. **Nada commitado no pacote**; a diferença fica na árvore do pacote
  aguardando decisão.
- **"Accelo misto" (5 s):** medido de novo, sozinho, com a D25: 3,5 s e 3,7 s (junit). Com a máquina
  carregada, na suíte, 4,2 s. O timeout não foi alterado.

## Medição extra — fração da borda da D25 em 15% e 50% (só medição, sem commit)

Cópias do fonte no scratchpad, com `MIN_BRACED_EDGE_FRACTION` trocado; a árvore do pacote não foi
sobrescrita. Mesmas regras em tudo o mais.

| Fração | Atego | Iveco 27 | Sprinter | Fiorino | Accelo | Iveco antiga | Atego (tempo) | Retrabalho / fora do alcance (Atego) | check |
| ------ | ----- | -------- | -------- | ------- | ------ | ------------ | ------------- | ------------------------------------ | ----- |
| 80%    | 91    | 0        | 0        | 0       | 0      | 0            | 89,7 s        | 43 / 23                              | 0     |
| 50%    | 48    | 0        | 0        | 0       | 0      | 0            | 78,8 s        | 18 / 1                               | 0     |
| 15%    | 21    | 0        | 0        | 0       | 0      | 0            | 65,2 s        | 10 / 2                               | 0     |

Pilhas altas escoradas por menos de 80% da borda (`tall.ts` com `FRAC=0.8` sobre as plantas de cada
fração; com `FRAC` igual à fração usada, zero violação em todas):

| Fração | Atego     | Iveco 27 | Sprinter | Fiorino | Accelo   | Iveco antiga |
| ------ | --------- | -------- | -------- | ------- | -------- | ------------ |
| 50%    | 142 / 918 | 16 / 313 | 19 / 140 | 2 / 52  | 25 / 354 | 20 / 227     |
| 15%    | 231 / 956 | 36 / 302 | 25 / 145 | 2 / 52  | 25 / 364 | 37 / 230     |

- A 15%, a menor cobertura encontrada fica **entre 15% e 20%** da borda: com `FRAC=0.20` já aparecem
  violações (Atego 19, Iveco 27 6, Iveco antiga 13, Sprinter 5, Accelo 3); com `0.15`, nenhuma.
- `classify.ts` na Atego: a 15%, as 21 são pilha alta (D23); a 50%, 45 pilha alta + 3 sem assento com 80%
  de apoio.

### T3 fechada · 2026-09-13

Decisão do usuário: manter as regras (80%, D23/D25) e alinhar o juiz do `enclosed-body` à D25 aprovada, só
no baú fechado. Pacote `feat/cargo-placement` @ **`2121e2b`** (pai `401a05d`), sem push.

- Juiz do `enclosed-body.contract.ts`: no baú fechado, a vizinha escora cobrindo 80% da borda — o lado da
  porta e a borda de até 25 cm seguem exigindo a borda inteira (o mesmo critério do `tall.ts`). Fora do
  baú fechado, a borda inteira como antes. Nenhuma outra expectativa mudou.
- `bunx tsc --noEmit`: sem erro. `bun test ./test/cargo-placement.contract.test.ts` sozinho: **218 pass, 0
  `(fail)`** (inclui `brace-edge-fraction`, `wall-building`, `complement`, `exact-edges`,
  `brace-rises-alongside` e `enclosed-body`).
- Números da T3 (acima): Atego 91, os outros cinco 0, zero violação, Atego em 89,7 s.

## T3b — diagnóstico das 91 da Atego e enchimento progressivo · 2026-09-13 · ⚠️ não fechou

Pacote em `2121e2b` (T3), sem mudança commitada. Modelo: `opus`.

### Onde e por que sobram as caixas da Atego

Empacotador instrumentado numa cópia (motivo de cada assento recusado + ordem de colocação), relevo
reconstruído no instante da recusa. Tentativa vencedora: montagem em parede, 1331 caixas no mapa recomendado,
134 recusas (o complemento resgata parte; final 91).

- **O baú está cheio até a porta**: a frente da carga está em 7,40 m, o comprimento inteiro. As caixas de
  fora são das primeiras paradas a descer (1–16; mais recusas na 7, 45, na 9, 20, e na 15, 15), que entram
  por último e só achariam lugar **em cima** da carga.
- **98 das 134 recusas são gêmeas** (a memória de formato: o mesmo formato já falhou naquele instante e
  falharia de novo).
- **As 36 buscadas falham todas por falta de cabeceira**, e a lateral fica sempre boa:
  - **33**: a face atrás (de uma entrega posterior) é alta o bastante, mas cobre só **42–55%** da borda: o
    topo das entregas anteriores fica irregular com tamanhos misturados;
  - **3**: degrau de verdade (face atrás mais baixa que a contenção);
  - posição: 23 no topo (base ≥ 1,5 m), 12 no meio, 1 na fileira da frente.
- O rótulo "pilha alta (D23)" do `classify.ts` só quer dizer que o melhor assento seria de pilha alta; não
  distingue cabeceira de lateral nem degrau de cobertura parcial.

### Enchimento progressivo (tentativa extra no baú fechado)

Implementado numa árvore de trabalho e revertido (diff guardado no scratchpad da sessão,
`t3b-progressive.patch`):

- `reachedTopM` no mapa de apoio: a altura que as vizinhas alcançam em ≥ 80% da borda, no sentido da
  cabeceira e na lateral mais alta (a parede conta como teto);
- na busca da parede, a pilha só passa da altura estável até essa altura;
- é mais uma tentativa depois da parede.

Contrato `progressive-fill.contract.ts`: vermelho antes (7 fail, `reachedTopM` não existia), verde depois
(7/7).

| Medição                             | Atego   | Iveco 27 | Sprinter | Fiorino | Accelo | Iveco antiga | Atego (tempo) |
| ----------------------------------- | ------- | -------- | -------- | ------- | ------ | ------------ | ------------- |
| parede (T3, `2121e2b`)              | 91      | 0        | 0        | 0       | 0      | 0            | 89,7 s        |
| parede + progressiva (a que vencer) | 91      | 0        | 0        | 0       | 0      | 0            | **128,2 s**   |
| progressiva sozinha                 | **142** | 0        | 0        | 0       | —      | —            | 53,7 s        |

- `check.ts` e `tall.ts` com zero violação na rodada parede + progressiva; nela a progressiva nunca venceu (o
  desenho é o da T3).
- Sozinha ela piora a Atego (142, retrabalho 475, fora do alcance 264) e **espalha a entrega pelo
  comprimento**:

| Veículo  | Comprimento médio por entrega (parede → progressiva) | Altura máxima média do bloco (parede → progressiva) |
| -------- | ---------------------------------------------------- | --------------------------------------------------- |
| Atego    | 0,91 m → **2,09 m**                                  | 1,77 m → 1,45 m                                     |
| Iveco 27 | 0,77 m → 1,03 m                                      | 1,54 m → 1,33 m                                     |
| Sprinter | 0,75 m → 0,83 m                                      | 1,22 m → 1,08 m                                     |
| Fiorino  | 0,69 m → 0,90 m                                      | 1,16 m → 1,16 m                                     |

Accelo (0,76 m / 1,73 m) e Iveco antiga (0,94 m / 1,51 m) medidos só na parede.

- **Por que não fecha**: limitar a pilha à altura que as vizinhas já alcançaram faz a caixa recusada ir para
  a próxima fileira — a entrega avança para a porta em vez de subir, o oposto do bloco compacto que o usuário
  pediu. Com o bloco compacto obrigatório (a entrega não pode ocupar mais comprimento que na parede, com a
  exceção da entrega pequena que só cabe no piso), o que sobra é a própria montagem em parede, que já pega o
  assento aceito mais perto da cabeceira e sobe antes de avançar. Além disso, a tentativa extra estoura o
  tempo da Atego (128 s > 120 s) e deixa o "Accelo misto" do `enclosed-body` acima de 5 s (5,6 s), sem ganhar
  nenhuma caixa.
- **O que sobra não é degrau**: 33 das 36 recusas buscadas são cobertura parcial (42–55%) da face de trás,
  no topo da carga, com o baú cheio até a porta. Nenhuma regra foi mexida; a T3b segue aberta.

## T3c — passada final por cima, marcada, e `unplaced` por nota · 2026-09-13 · parte do pacote

Pacote `feat/cargo-placement` @ **`2e3aa67`** (passada final + `unplaced` por nota) e **`863bdf5`** (a passada
fura também a sombra), pai `2121e2b`, sem push. Tela, locale e a lista "caixas por cima" no app ficam
**pendentes** (fora desta rodada). Modelo: `opus`.

### O que entrou

- **D5/D6, `placeOverEarlierDeliveries`**: roda só no baú fechado com complemento, uma vez, sobre a tentativa
  que venceu. As caixas que nem a varredura nem o complemento colocaram, da maior para a menor, tentam todos
  os vãos em todas as orientações que `keepUpright` permite; fica o assento **mais alto**. Pode ficar por cima
  de qualquer entrega anterior e atrás de carga de entrega posterior (a sombra da spec 115 é ordem de
  descarga — a D5 deixa só esta passada furá-la). Sai com `needsRehandling`, e com `overEarlierDelivery` +
  `coversStops` quando cobre entrega anterior. A nota aparece dividida por `splitNotes`, que já conta pedaços
  pelo desenho. Continuam valendo 80% de apoio, D23/D25 a 80% no baú fechado, a porta sem escora, nada sobre
  caixa frágil ou não empilhável e o alcance de 2 m, medido de onde o conferente fica quando a primeira
  entrega coberta desce.
- **T7, `unplaced` por nota**: cada linha leva o `documentId` quando a caixa tem nota; sem nota, a linha é a
  do formato antigo (`count`, `label`, `reason`), e a soma por rótulo não muda.
- `PLACEMENT_REASONS` ganhou `overEarlierDelivery`: é a única expectativa alterada, no contrato do vocabulário
  fechado (`placement.contract.ts`). `CARGO_LAYOUT_POLICY_VERSION` '4' → '5'.

### Contratos vermelhos antes

- `over-earlier-delivery.contract.ts`: vermelho sem a função (`placeOverEarlierDeliveries` não existia); o caso
  "atrás de entrega posterior" vermelho antes de tirar a sombra da passada (1 fail). Depois: 5 / 5 — por cima
  da entrega 1 com `coversStops: [1]`; deitada quando `keepUpright` não proíbe; recusada com `keepUpright`;
  recusada sobre caixa frágil; atrás da entrega 3 com `needsRehandling` e sem `overEarlierDelivery`.
- `unplaced-by-note.contract.ts`: vermelho (as linhas sem `documentId`), depois 2 / 2.

### Gates

`bunx tsc --noEmit` sem erro; `bun test ./test/cargo-placement.contract.test.ts` sozinho: **225 pass, 0
`(fail)`**.

### Medição (harness da spec 148)

| Veículo      | De fora (T3 → T3c) | Por cima de entrega anterior | Atrás de entrega posterior | Retrabalho | Fora do alcance | Tempo  | check / tall |
| ------------ | ------------------ | ---------------------------- | -------------------------- | ---------- | --------------- | ------ | ------------ |
| Atego        | 91 → **82**        | 5                            | 4                          | 43 → 52    | 23              | 86,2 s | 0 / 0        |
| Iveco 27     | 0 → 0              | 0                            | 0                          | 0          | 0               | 0,6 s  | 0 / 0        |
| Sprinter     | 0 → 0              | 0                            | 0                          | 0          | 0               | 0,2 s  | 0 / 0        |
| Fiorino      | 0 → 0              | 0                            | 0                          | 0          | 0               | 0,03 s | 0 / 0        |
| Accelo       | 0 → 0              | 0                            | 0                          | 0          | 0               | 1,6 s  | 0 / 0        |
| Iveco antiga | 0 → 0              | 0                            | 0                          | 0          | 0               | 0,5 s  | 0 / 0        |

- Caixas que o conferente tira do caminho, por parada (Atego): **parada 3: 4, parada 7: 1**.
- `unplaced` da Atego: 22 linhas, todas com `documentId`.
- Nos outros cinco a passada não roda (nada sobra), e o desenho não muda.

### O que sobra na Atego (82) e por quê

Sonda com as regras do próprio pacote (`createSupportMap` real sobre a planta final, em todas as orientações
permitidas, com a sombra liberada como na passada):

| Regra que barra o melhor assento                                    | Caixas |
| ------------------------------------------------------------------- | ------ |
| alcance de 2 m (o conferente não chega nela na hora em que ela sai) | 66     |
| pilha alta sem lateral (escora de 24–74% da borda)                  | 10     |
| pilha alta sem cabeceira (escora de 20% da borda)                   | 3      |
| assento aceito no relevo final, que a busca gulosa não retentou     | 3      |

- `classify.ts` (rótulo antigo, que não separa os lados): 79 "pilha alta" + 3 sem assento com 80% de apoio.
- **A Atego não zera sem mexer em regra**: 66 das 82 dependem do alcance de 2 m (D24) e 13 da D23/D25. Nada
  foi afrouxado.
- Proposta, sem regra nova: repetir a passada sobre as recusadas enquanto alguma caixa entrar, porque um assento
  pode nascer quando outra caixa entra ao lado. Recupera no máximo as 3 da última linha.

## T3b — reorganização (D4), passada final em rodadas e prazo · 2026-09-13 · ⚠️ não fechou

Pacote `feat/cargo-placement` @ **`ae1e74c`** (pai `863bdf5`), sem push. Decisões do usuário: as caixas atrás
de carga de entrega posterior ficam aceitas e marcadas (`863bdf5` mantido); o alcance de 2 m não se afrouxa.
Modelo: `opus`.

### O que entrou

- **D4, `reorganizeForLeftovers`** (só no baú fechado, depois da passada final): para cada caixa de fora,
  tenta tirar do lugar até 12 caixas de entrega posterior, descobertas e em cuja pegada ela cabe, das mais
  perto da porta para dentro. Cada tentativa refaz o mapa de apoio sem a caixa tardia, assenta a caixa de fora
  pelas regras da passada final e manda a tardia para o assento mais fundo, fora do piso, que as regras dela
  aceitam: pilha de pé, sem pousar em entrega anterior nem em caixa frágil, sem carga posterior mais alta na
  frente, sem ficar na frente de entrega anterior acima da base dela, e ao alcance na parada dela. Depois
  confere de novo as pilhas altas vizinhas do lugar deixado e o alcance das caixas das paradas até a da caixa
  de fora. Só aceita a troca que tira uma caixa de fora; respeita o prazo.
- **D6, rodadas**: a passada final repete as recusadas enquanto alguma entrar.
- **Prazo nas passadas finais**: a decisão do arranjo empacota a profundidade sem prazo (a spec 145 exige que
  o arranjo não dependa do prazo) e o desenho reusa esse pacote, de modo que a passada final e a reorganização
  rodavam sem prazo (medido: Atego em 132 s com prazo de 120 s). Agora elas recebem `finishingDeadline`, que a
  varredura não lê, e o pacote guardado só é reusado por quem tem o mesmo prazo. O arranjo e o mapa
  recomendado não mudam (contrato).
- `CARGO_LAYOUT_POLICY_VERSION` '5' → '6'.

### Contratos vermelhos antes

- `reorganize-leftovers.contract.ts`: vermelho (a função não existia); depois 2 / 2 — a tardia sobe para o
  vão do fundo e a caixa de fora entra no lugar dela; sem baú fechado nada muda.
- `over-earlier-delivery.contract.ts`, rodadas: vermelho (a caixa larga ficava de fora); depois 6 / 6.
- `layout-deadline.contract.ts`: com prazo vencido, a caixa por cima ainda aparecia (1); depois 3 / 3 —
  nenhuma por cima, e o arranjo e o mapa recomendado iguais aos da chamada sem prazo.

### Gates

`bunx tsc --noEmit` sem erro; `bun test ./test/cargo-placement.contract.test.ts` sozinho: **231 pass, 0
`(fail)`**.

### Medição (harness da spec 148, prazo de 120 s como na produção)

| Veículo      | De fora (T3c → T3b) | Movidas pela reorganização | Por cima | Retrabalho | Tempo       | check / tall |
| ------------ | ------------------- | -------------------------- | -------- | ---------- | ----------- | ------------ |
| Atego        | 82 → **79**         | 0                          | 6        | 52 → 55    | **120,0 s** | 0 / 0        |
| Iveco 27     | 0 → 0               | 0                          | 0        | 0          | 0,6 s       | 0 / 0        |
| Sprinter     | 0 → 0               | 0                          | 0        | 0          | 0,2 s       | 0 / 0        |
| Fiorino      | 0 → 0               | 0                          | 0        | 0          | 0,03 s      | 0 / 0        |
| Accelo       | 0 → 0               | 0                          | 0        | 0          | 1,6 s       | 0 / 0        |
| Iveco antiga | 0 → 0               | 0                          | 0        | 0          | 0,5 s       | 0 / 0        |

- As 3 caixas a menos vêm das rodadas da passada final.
- Caixas que o conferente tira do caminho (por cima de entrega anterior), por parada: 3: 4, 7: 1, 11: 1.
- Retrabalho por parada da caixa (`needsRehandling`), Atego: 1: 2 · 3: 6 · 4: 1 · 7: 16 · 8: 2 · 9: 4 ·
  10: 9 · 11: 8 · 12: 2 · 15: 2 · 16: 3.
- `unplaced` da Atego: 20 linhas, todas com `documentId`.

### Por que a reorganização não troca na Atego

Instrumentada, com prazo folgado (360 s): 17 caixas de fora chegaram a ter candidatas, 153 trocas tentadas.
**146** falharam porque, mesmo com a caixa tardia fora, a caixa de fora continua sem assento válido; 7 porque a
tardia não achou assento no fundo; nenhuma por vizinha solta ou alcance quebrado. É geometria: o alcance de uma
caixa das primeiras paradas é medido de onde o conferente fica quando essa parada desce, na frente da carga
que ainda está no baú. Pela ordem de descarga, a faixa ao alcance das paradas 1–16 é ocupada por elas mesmas,
junto da porta, e as entregas tardias ficam atrás. O lugar que uma tardia libera fica atrás dessa carga e
continua a mais de 2 m da mão. A troca não alcança essas caixas sem mexer no alcance.

### O que sobra na Atego (79), pelas regras do pacote

| Regra que barra o melhor assento                            | Caixas |
| ----------------------------------------------------------- | ------ |
| alcance de 2 m (D24)                                        | 66     |
| pilha alta sem lateral (D23/D25, escora de 24–74% da borda) | 10     |
| pilha alta sem cabeceira (D23/D25, escora de 20% da borda)  | 3      |

A meta (zero caixa de fora) **não fecha sem mexer em regra**: 66 dependem do alcance de 2 m e 13 da D23/D25.
Nada foi afrouxado; a T3b segue aberta.

### T3b fechada no melhor resultado seguro · 2026-09-13

Decisão do usuário (2026-09-13): as **79** caixas de fora da Atego só entram mudando uma regra (66 pelo alcance
de 2 m, D24; 13 pela escora, D23/D25). Elas vão para a fila de revisão (D7/T7) e as regras ficam como estão. A
T3b fecha com o pacote `ae1e74c`.

## T4 — pacote no app, versão '6' e a tela da T3c · 2026-09-13

Modelo: `opus` (fallback do `sonnet`, sem cota). Pacote `feat/cargo-placement` @ `ae1e74c`, sem publicar.

### Pacote

`pnpm run build` sem erro. O `dist/` tem `CARGO_LAYOUT_POLICY_VERSION = "6"`, `overEarlierDelivery` em
`PLACEMENT_REASONS`, `coversStops?` em `PlacedBox` e `documentId?` em `UnplacedBox`.

### O que o app recusava

- **API e worker: nada.** A API lê a planta com o tipo do pacote e a reetiquetagem espalha a caixa e a linha do
  `unplaced` (`...box`, `...item`); o worker grava a planta que o pacote devolve. Contratos novos, verdes já na
  primeira execução: `cargo-layout-hash.contract.ts` (sem `policyVersion` o hash é o da versão do pacote
  instalado e outra versão o invalida — sem fixar o número), `cargo-layout-label.contract.ts` (mantém
  `coversStops`, `overEarlierDelivery` e o `documentId` do `unplaced`), `package-surface.contract.ts`
  (`PLACEMENT_REASONS` tem `overEarlierDelivery`) e, no worker, `handler.contract.ts` (grava como veio).
- **Frontend:** a validação é tolerante (valida a forma), mas os tipos não tinham `coversStops` nem o
  `documentId` do `unplaced`; a caixa `overEarlierDelivery` saía com o traço de cobre do `needsRehandling`; a
  chave da lista do `unplaced` (`label-reason`) repetia com o `unplaced` por nota; não existia lista "caixas por
  cima". Não há locale por motivo de posição (os motivos não viram texto), só a legenda das marcas.

### Tela da T3c

Contrato `test/trip/cargo-over-earlier.contract.ts` vermelho antes (`Cannot find module
cargoOverEarlier.service`), depois 8 / 8:

- `resolveCargoComplement`: `overEarlierDelivery` vence `needsRehandling`.
- Mapa 3D: `.faceOverEarlier`, traço cheio em `--color-fog` (sem tracejado, sem cobre, sem vermelho), com
  amostra na legenda (`CargoLegendSample mark="overEarlier"`).
- Lista "Caixas por cima" (`TripCargoOverEarlierList.component.tsx`, `buildOverEarlierDeliveryRows`): caixa,
  nota, entrega, entrega coberta e a parada em que sai do caminho (a primeira coberta), agrupada por caixa igual.
- Carga dividida: a caixa por cima conta na coluna "Divididas" e nas fichas (`buildCargoPrintSummary`), e fica
  fora da faixa da parada; a nota dividida em pedaços continua pelo `splitNotes` do pacote.
- Textos em `trip.locale.json` e `trip.en.locale.json`.

### Gates

| Gate                                                     | Resultado                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `bun run typecheck` (raiz)                               | sem erro                                                                     |
| API `bun run --cwd apps/api-transportada test`           | 5121 testes, **0** linhas `(fail)`                                           |
| worker `bun run --cwd apps/worker-transportada test`     | 1053 pass, **0** linhas `(fail)`                                             |
| frontend `bun run --cwd apps/frontend-transportada test` | **15** linhas `(fail)`, as 15 do design-system que já existiam; nenhuma nova |
| `bun run lint`                                           | sem erro                                                                     |
| build do frontend                                        | ok                                                                           |

Worker do worktree reiniciado com o `dist/` novo (os dois antigos, 80360 e 89824, parados); novo pid **71729**.

Commits: `e7ed7870` (contratos da API e do worker) · `9bcec7ad` (tela).
