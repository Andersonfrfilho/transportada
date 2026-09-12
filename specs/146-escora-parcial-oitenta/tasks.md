# Spec 146 — Tarefas

| fase | modelo    |
| ---- | --------- |
| 1    | `opus` 🧠 |
| 2    | `sonnet`  |
| 3    | `haiku`   |

## Fase 1 — Escora parcial de 80% e o teto de estabilidade (🧠 `opus`)

> 🤖 Modelo: `opus`

- [ ] T1 🧠 — Contrato `apps/api-transportada/test/cargo-placement/brace-fraction.contract.ts`
      (G001) escrito e **vermelho**, importado em `test/cargo-volume.contract.test.ts` logo após
      `layers.contract.js` (linha 35 hoje). Casos (a)-(e) do critério de aceite.
- [ ] T2 🧠 — `MIN_BRACED_EDGE_FRACTION = 0.8` ao lado de `MIN_SUPPORTED_BASE_FRACTION` (`:29`);
      `isConfined` (`:2195-2238`) conta células de `bracedToward` (`:1907`) para
      `columnEnd`/`columnStart`/`lineStart` contra o `ceil` da D3 (arredonda células exigidas para
      cima); `lineEnd` (porta, `:1852`) intocado; docstring reescrito com a tabela medida (D6); T1
      verde. **Validar a regra de arredondamento e o caso `totalCells === 0` com `architect` (opus)
      antes de fechar a task.**
- [ ] T3 🧠 — Rodar `apps/api-transportada/tmp/occupancy-experiment/run.ts` nas três viagens
      (`5715dd82`, `803f6008`, `5530f6f1`); registrar colocadas/topo máximo/pilhas a 5 cm do teto
      em `evidence.md` (G003) — tolerância ±5 caixas contra 874 / 546 / 1451. Registrar também
      qualquer mudança no tempo do Atego (risco da fase 1 do plan.md).

## Fase 2 — Rótulo do teto de estabilidade (`sonnet`)

> 🤖 Modelo: `sonnet`

- [ ] T4 — `stabilityCeiling` em `UNPLACED_REASONS` (`:78`); `placeDeliveryBlock`/`packSlice`
      (`:3245-3296`, `bedFull` em `:3291`) distinguem piso esgotado de teto de estabilidade
      esgotado (D4), com contrato vermelho antes (G004). Se a distinção não for barata,
      `[NEEDS CLARIFICATION]` em vez de aproximar — parar e perguntar.
- [ ] T5 — Serialização em `drizzle-trip.repository.ts`; `tripResponse.validation.ts` e
      `trip.types.ts` do frontend; legenda (`TripCargoPanel` ou `TripCargoLayers.component.tsx` —
      conferir qual desenha o motivo); `trip.locale.json:240-247` e
      `trip.en.locale.json:189-196`; estender
      `apps/frontend-transportada/test/trip/cargo-layers.contract.ts` (G005). Typecheck e testes do
      frontend — as 15 falhas pré-existentes de `37436e4a` não contam contra a task.

## Fase 3 — Documentação (`haiku`)

> 🤖 Modelo: `haiku`

- [ ] T6 — Entrada ao final de `docs/domain/cargo-placement-defects.md` (depois de "Lição de
      método, que custou duas correções", linha 404/411 — só acrescentar); linha em
      `docs/ai-context/api-transportada.md` e em `apps/api-transportada/CLAUDE.md` (`:122`, seção
      "Carga: cubagem, capacidade e cargo placement") apontando para a spec 146; `evidence.md`
      fechado com o gate final (`bun run typecheck`, `bun test ./test/cargo-volume.contract.test.ts`,
      testes do frontend, G006).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/146-escora-parcial-oitenta/ (leia spec.md, plan.md e
tasks.md antes de começar). Trabalhe no worktree ../transportada-wt/cargo-missing-box, branch
work/cargo-missing-box. Uma task por vez, na ordem do tasks.md, contrato vermelho antes do código em
toda task que tem contrato.
Modelos: Fase 1 (T1–T3) 🧠 → opus, validar a regra de arredondamento da D3 e o caso `totalCells === 0`
com architect antes de codificar T2 · Fase 2 (T4–T5) → executor model=sonnet · Fase 3 (T6) → executor
model=haiku · revisão final → code-reviewer model=opus.
Cada task fecha com bun run typecheck + bun test ./test/cargo-volume.contract.test.ts (mais os testes
do frontend nas tasks que tocam nele) + commit isolado (sem push), evidência em
specs/146-escora-parcial-oitenta/evidence.md.
Não mude o vão de tombamento (catchGapM), STABLE_STACK_SLENDERNESS, o apoio de 80% da base, a célula
de 5 cm, peso nem DEFAULT_ROW_COUNT (D2). A porta (lineEnd) nunca ganha fração — continua 100% como
hoje. Teste novo entra na lista explícita de imports de test/cargo-volume.contract.test.ts. Pare e
pergunte antes de: push, deploy, migration, qualquer mudança nas regras protegidas da D2, qualquer
[NEEDS CLARIFICATION] (em especial a distinção bedFull/stabilityCeiling da T4, se não sair barata).
```
