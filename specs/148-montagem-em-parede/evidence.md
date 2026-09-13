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
