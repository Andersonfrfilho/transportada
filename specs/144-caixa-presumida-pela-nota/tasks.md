# Spec 144 — Tarefas

| fase | modelo    |
| ---- | --------- |
| 1    | `opus` 🧠 |
| 2–4  | `sonnet`  |

## Fase 1 — Regra do resíduo (🧠 `opus`)

> 🤖 Modelo: `opus`

- [ ] T1 🧠 — Contrato `test/cargo-volume/document-box-estimate.contract.ts` (G001) escrito e
      **vermelho**, importado em `test/cargo-volume.contract.test.ts`.
- [ ] T2 🧠 — `resolveDocumentCargoEstimate` em `cargo-volume.policy.ts` (D2, `bigint` escalado);
      T1 verde; `resolveMeasuredCargoVolume` intocada e seus chamadores conferidos por grep.

## Fase 2 — Caixa presumida pela nota até o empacotador (`sonnet`)

> 🤖 Modelo: `sonnet`

- [ ] T3 — `cargo-layout-conservation.contract.ts` estendido com a nota sem ficha e com `qVol` (G002,
      inclusive o m³ fechando com a fatia) — vermelho antes de T4/T5.
- [ ] T4 — `CargoPlanBox.estimatedVolumeM3` e `productCode`; `loadMeasuredItems` seleciona
      `nfeProducts.code`; `loadTripOccupancy` usa a função de T2 e carimba o volume presumido nas
      caixas sem ficha, nos dois caminhos (prévia e detalhe).
- [ ] T5 — `toPlacementBoxes` com a precedência D1 (G003) + caso em `cargo-layout.contract.ts`;
      T3 verde.
- [ ] T6 — G006: rodar os contratos de placement existentes (viagens reais e Atego da fixture) e
      registrar caixas colocadas antes/depois em `evidence.md`.

## Fase 3 — Lista do que falta medir (`sonnet`)

> 🤖 Modelo: `sonnet`

- [ ] T7 — `pendingMeasurements` em `ResolvedCargoLayout`, `TripCargoLayoutView`, mapper do
      repositório e resposta da prévia (G004), com contrato antes (`cargo-layout.contract.ts` e
      `cargo-preview.contract.ts`); `documentNumber` carimbado também na prévia.
- [ ] T8 — Frontend: `trip.types.ts`, `tripResponse.validation.ts` (chave opcional),
      `TripCargoPanel` listando produto, código, nota e caixas com atalho para a fila de medição,
      locales pt/en (G005). Typecheck e testes do frontend.

## Fase 4 — Documentação e gate (`sonnet`)

> 🤖 Modelo: `sonnet`

- [ ] T9 — `docs/ai-context/api-transportada.md`, `apps/api-transportada/CLAUDE.md`,
      `docs/domain/cargo-placement.md` se aplicável (G008); `evidence.md` fechado.
- [ ] T10 — Gate: `bun test ./test/cargo-volume.contract.test.ts`, `bun run typecheck`,
      `make check` (G007). Perf de 50 ms do Atego 1417 é pré-existente: anotar, não mascarar.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/144-caixa-presumida-pela-nota/ (leia spec.md, plan.md
e tasks.md antes de começar). Trabalhe no worktree ../transportada-wt/cargo-missing-box, branch
work/cargo-missing-box (já tem da30f9a0 e 1ca4b17a). Uma task por vez, na ordem do tasks.md,
contrato vermelho antes do código em toda task que tem contrato.
Modelos: Fase 1 (T1, T2) 🧠 → opus, validar a aritmética da D2 com architect antes de implementar ·
Fases 2–4 (T3–T10) → executor model=sonnet · revisão final → code-reviewer model=opus.
Cada task fecha com bun run typecheck + bun test ./test/cargo-volume.contract.test.ts + commit isolado
(sem push), evidência em specs/144-caixa-presumida-pela-nota/evidence.md.
Não mude apoio de 80%, escora, célula de 5 cm, peso nem DEFAULT_ROW_COUNT (D6). Teste novo entra na
lista explícita do package.json / do agregador. Pare e pergunte antes de: push, deploy, migration,
qualquer regra de negócio fora de D1–D5, qualquer [NEEDS CLARIFICATION].
```
