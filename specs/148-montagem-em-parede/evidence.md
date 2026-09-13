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
