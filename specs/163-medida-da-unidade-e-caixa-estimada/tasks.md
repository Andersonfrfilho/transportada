# Tasks

> 🤖 Modelo: `sonnet` (T007 é 🧠 — mapear consumidores da cubagem com `opus` antes)

## Fase 1 — Políticas puras

> 🤖 Modelo: `sonnet`

- [x] T001 Contrato + `package-box-estimate.policy.ts` (CA01, CA02)
- [ ] T002 Contrato + `package-box-unit-sanity.policy.ts` (CA03) e conferência caixa × unidade (CA04, reusando códigos da 160)
- [ ] T003 Contrato + `package-box-cubage-dimensions.policy.ts` (real > estimada > nada)

## Fase 2 — Banco e caso de uso

> 🤖 Modelo: `sonnet`

- [ ] T004 Migration aditiva RF01 + schema TS — `make migration-test` verde; `db:generate` sem diferença
- [ ] T005 `record-package-box-unit.use-case.ts` + repositório (grava unidade, recalcula estimativa, nunca toca medida real)
- [ ] T006 Integração CA05, CA06 — `bun --env-file=../../.env.test run test:integration`

## Fase 3 — Consumo e API

> 🤖 Modelo: `sonnet` (T007 🧠)

- [ ] T007 🧠 Mapear leitores de `length_mm` e trocar por `resolveBoxDimensionsForCubage`; marcar "contém caixa estimada"
- [ ] T008 Rota para informar a unidade + API da fila/detalhe com `unit`, `estimate`, `isEstimated` (contrato)

## Fase 4 — Captura e importação

> 🤖 Modelo: `sonnet`

- [ ] T009 Importador da 162 aceita linha "Unidade" e `unitEdges` (RF05) — contrato
- [ ] T010 Userscript Alt+U + servidor local `found_unit_manual` (RF06)

## Fase 5 — Tela e fechamento

> 🤖 Modelo: `sonnet`

- [ ] T011 UI da fila: selo "Estimada", arranjo, medir/confirmar (RF09)
- [ ] T012 🧠 Revisão de design e usabilidade da fila, com print (CA08)
- [ ] T013 `make check` + `evidence.md`

## Prompt de execução

```text
Execute a spec specs/163-medida-da-unidade-e-caixa-estimada/ (leia spec.md, plan.md, tasks.md e o
CLAUDE.md da raiz antes de tocar em código). Uma task por vez, na ordem; pare ao fim de cada uma.
Teste de contrato antes da implementação; `bun run typecheck` e testes verdes; commit isolado;
evidência em evidence.md; teste novo na lista explícita do package.json.
Integração: `bun --env-file=../../.env.test run test:integration` de dentro de apps/api-transportada.
A estimativa NUNCA preenche length_mm/width_mm/height_mm nem measurement_source.
Não altere package-box-catalog-sanity.policy.ts nem -consensus.policy.ts.
Nunca leia .env/.env.test. Não rode nada contra staging/produção e não faça deploy — pare e peça.
A Fase 4 depende da spec 162 estar concluída; se não estiver, pare antes da T009.
```
