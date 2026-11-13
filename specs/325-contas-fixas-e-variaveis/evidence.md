# Evidência — 325 Contas

## T1.1 — contratos vermelhos (2026-11-13)

Comando (de dentro de `apps/api-transportada`):

```bash
bun --env-file=../../.env.test test ./test/expenses.contract.test.ts
```

Resultado: **0 pass, 22 fail** — vermelho pelo motivo certo (casos de uso e política de vencimento lançam
`not implemented`; `expenses.read`/`expenses.manage` ainda não existem na política de autorização).
`bunx tsc --noEmit` e `bunx eslint` limpos nos arquivos novos.

| Contrato                                    | Cobre                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `expenses/due-date.contract.ts`             | dia 31 em fev (28/29), mês de 30 dias, dia fora de 1–31                                  |
| `expenses/create-expense.contract.ts`       | RF1b/CA05b: motorista obrigatório/recusado; motorista e categoria de outra empresa → 404 |
| `expenses/settle-occurrence.contract.ts`    | baixa única (409), valor ≤ 0 (400), cancelada (409), outra empresa (404)                 |
| `expenses/generate-occurrences.contract.ts` | CA01: mês corrente + 3, rotina duas vezes sem duplicar, inativa, variável com uma        |
| `expenses/permissions.contract.ts`          | RF7/CA03: permissões declaradas, só `company-admin`                                      |

Decisões de forma fixadas pelo contrato (a T1.2/T1.4 seguem): a categoria carrega `requiresDriver`; a porta de
ocorrência tem `insertIfAbsent` (unique conta+competência, `ON CONFLICT DO NOTHING`); o `today` é injetado.

Pendência para a T1.4: a recorrência **quinzenal** tem duas datas por mês, mas a ocorrência é única por
(conta, competência) — a T1.2 precisa decidir a chave (ex.: competência `yyyy-mm` + `slot`). Não está coberta aqui.
