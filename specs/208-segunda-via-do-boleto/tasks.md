# Tasks

| Fase | Tasks | Modelo   |
| ---- | ----- | -------- |
| 1    | T1–T2 | `sonnet` |

## Fase 1 — Catálogo de bootstrap

> 🤖 Modelo: `sonnet`

- [x] T1 Contrato antes do código: `OCCURRENCE_TYPE_CATALOG` contém "Cliente pediu segunda via do
      boleto" na etapa `delivery` — `test/trip-occurrence/catalog-seed.contract.ts` (CA1)
- [x] T2 Prova contra Postgres real: a linha semeada tem `attachment_mode = 'off'` e
      `leaves_document_behind = false` por default de coluna, sem escrita explícita —
      `test/integration/occurrence-type-catalog-seed.integration.ts` (CA2) — e o tipo novo não
      alcança empresa com catálogo parcial (CA3, já coberto pelo teste existente)

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/208-segunda-via-do-boleto/ (leia spec.md, plan.md
e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 1 → executor model=sonnet.
Cada task fecha com typecheck + testes (contrato e integração) + commit isolado, evidência em
evidence.md.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
