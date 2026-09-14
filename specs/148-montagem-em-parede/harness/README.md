# Harness de medição da planta de carga

Scripts usados na spec 145 (D21–D26) para medir o empacotador `@adatechnology/cargo-placement` sobre
entradas reais de viagem, sem subir o app. Copiados do scratchpad da sessão que fez a medição. São scripts
de trabalho: ajuste caminhos e variáveis de ambiente antes de rodar.

## Entradas (`inputs/`)

A coluna `input` de `trip_cargo_layouts` (o `StoredCargoLayoutInput` completo que o worker passa a
`resolveCargoLayout`), exportada do Postgres local em 2026-09-13 e **anonimizada**: rótulo da parada,
cliente, números de nota e `documentId` foram trocados por marcadores. O empacotador não lê esses campos
(eles ficam fora do hash, D6), então as medições não mudam.

| Arquivo                 | Layout de origem | Paradas |
| ----------------------- | ---------------- | ------- |
| `atego-84-paradas.json` | `768f475f`       | 84      |
| `iveco-27-paradas.json` | `6b676625`       | 27      |
| `sprinter.json`         | `d665c086`       | 21      |
| `fiorino.json`          | `43f0218a`       | 10      |
| `accelo.json`           | `c5be7eaa`       | 24      |
| `iveco-antiga.json`     | `ce9bd380`       | 23      |

Rode com `enclosedBody: true, securesCargo: false, deliveryReachM: 2` para reproduzir a tabela da spec 148.
As entradas gravadas podem ter `securesCargo`/`enclosedBody` de quando foram calculadas: o `bench_reach.ts`
sobrescreve os dois (e `deliveryReachM` vem de `REACHES`, padrão `2`).

## Reproduzir a base (T1)

A partir da raiz do worktree do app, com o pacote em `feat/cargo-placement` @ `0925c14`:

```bash
cd specs/148-montagem-em-parede/harness
TAG=base bun bench_reach.ts               # uma linha JSON por veículo; dumps em ./dumps (fora do git)
bun check.ts dumps/base_*_r2_E.json       # apoio ≥ 80%, dentro do baú, sem colisão
bun tall.ts dumps/base_*_r2_E.json        # pilha alta: cabeceira + ≥ 1 lateral (80% da borda)
```

O `bench_reach.ts` importa o **fonte** do pacote (`$PKG/src/index.ts`, padrão
`~/Documents/personal/adatechnology-packages-wt/cargo-placement/packages/backend/cargo-placement`) e o
`test/cargo-placement/unloading-simulation.ts` dele. `ONLY=atego-84-paradas` roda um veículo só; `OUT` muda
a pasta dos dumps. `check.ts` e `tall.ts` imprimem `REPROVADO` quando há violação.

## Scripts

- `bench_reach.ts` — roda `resolveCargoLayout` em cada entrada e imprime uma linha JSON por veículo
  (`placed`, `fora`, `ms`, `rehandling`, `outOfReach`…). Variáveis: `PKG` (caminho do pacote a importar — a
  pasta `packages/backend/cargo-placement` de um worktree ou uma cópia), `TAG`, `REACHES` (ex.: `2` ou
  `0.6,1.2,2`), `EXTRA` (JSON mesclado na entrada, ex.: `{"enclosedBody":true}`). Ajuste a lista de entradas
  no topo do arquivo para os nomes de `inputs/`.
- `check.ts` — verificador de segurança sobre um layout calculado: apoio ≥ 80% (`MIN_SUPPORTED_BASE_FRACTION`),
  caixa dentro do baú e sem colisão.
- `tall.ts` — verificador da D23/D25: toda pilha alta (> `STABLE_STACK_SLENDERNESS` × a menor base) com encosto
  no sentido da cabeceira e em ≥ 1 lateral, com a vizinha contando quando cobre ≥ 80% da borda (união de
  intervalos — amostragem por passo erra na fronteira dos 80%).
- `classify.ts` — para cada caixa de fora, a regra que barra o melhor assento (pilha alta sem encosto, atrás de
  entrega anterior, sem apoio de 80% dentro da altura…).
- `diag.ts` — varredura geométrica independente (célula de 1 cm) do relevo final, com e sem a ordem de entrega.
- `support.ts`, `analyze.ts` — fração de apoio por caixa e perfil da carga (topo por trecho, piso ocupado).

## Números de referência (pacote `feat/cargo-placement` @ `0925c14`)

Baú fechado, alcance de 2 m: Atego 162, Iveco 27 paradas 11, Sprinter 6, Fiorino 4, Accelo 0, Iveco antiga 0
caixas de fora. Com a D25 (80% da borda, branch `wip/cargo-wall-building`): 162, 16, 4, 4, 0, 0, com a Atego
em 127 s.
