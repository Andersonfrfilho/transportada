# Tasks

> 🤖 Modelo: `sonnet` (T003 é 🧠 — conferir FK e desenho do ator antes)

## Fase 1 — Entrada e mapeamento (puro)

> 🤖 Modelo: `sonnet`

- [x] T001 Fixture de JSONL real (3 linhas: `found` com cm/kg, `found_manual` com `lado1..3`, torta da 160) —
      `test/fixtures/package-box-catalog-capture.fixture.ts`
- [x] T002 Contrato do parser/mapper (CA01, CA02) antes → `package-box-catalog-capture.schema.ts` e
      `.mapper.ts` — testes verdes, entrada no `package.json`

## Fase 2 — Banco

> 🤖 Modelo: `sonnet` (T003 🧠)

- [x] T003 🧠 Conferir se `measured_by_user_id` tem FK; decidir o ator e registrar no `plan.md`
- [x] T004 Migration aditiva `'catalog'` nas duas CHECKs (+ ator se preciso) com rollback — `make migration-test` verde (CA07)
- [x] T005 `drizzle-package-box-catalog-import.repository.ts` com as escritas condicionais do plano

## Fase 3 — Caso de uso e CLI

> 🤖 Modelo: `sonnet`

- [x] T006 `import-package-box-catalog.use-case.ts` (sanidade → consenso → proposta/promoção, relatório)
- [x] T007 Integração CA03–CA06 — `bun --env-file=../../.env.test run test:integration` de dentro de
      `apps/api-transportada` (sem a flag a integração pula e não vale)
- [x] T008 CLI `src/cli/import-package-box-catalog.ts` (stdin, `--apply`, relatório JSON); conferir que entra na imagem
- [x] T009 `scripts/box-catalog-harvest/import-to-production.sh` (simulação padrão; `--apply` pede `IMPORTAR`)

## Fase 4 — Fechamento

> 🤖 Modelo: `sonnet`

- [x] T010 `make check` + evidência em `evidence.md`; README do `box-catalog-harvest` com o passo de importação

## Prompt de execução (OpenCode)

```text
Execute a spec specs/162-importar-medidas-de-caixa-coletadas/ (leia spec.md, plan.md e tasks.md, e o
CLAUDE.md da raiz, antes de tocar em código). Uma task por vez, na ordem do tasks.md; pare ao fim de
cada task e mostre o resultado.
Reuse sem alterar evaluatePackageBoxCatalogSanity e evaluatePackageBoxCatalogConsensus
(apps/api-transportada/src/nfe-documents/domain/).
Cada task fecha com teste antes da implementação, `bun run typecheck` verde, testes verdes e commit
isolado; registre a evidência em evidence.md. Teste novo entra na lista explícita do package.json.
Integração: `bun --env-file=../../.env.test run test:integration` de dentro de apps/api-transportada.
Nunca leia nem mostre .env/.env.test. Não rode nada contra produção, não faça deploy e não rode o
import-to-production.sh — pare e peça aprovação.
```
