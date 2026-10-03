# Evidência — Feature 241

## Fase 0

### T0.2 — a 239 ainda não criou `items_mode`

Conferido em `origin/staging` = `83813b1758b09e6e070e8b63679ed244374c086a` (2026-10-03):

```text
$ git grep -n -i -E "items_mode|itemsMode" origin/staging -- apps packages
(nenhuma linha; saída vazia)
```

Nem `items_mode` nem `itemsMode` existem em `apps/` ou `packages/`. Logo a 241 vai antes da 239 e
cria a coluna com `DEFAULT 'optional'`. A 239 (só em `work/spec-239`, sem código) **precisará** tirar
o `ADD COLUMN items_mode` da migration dela e o default `off` do plano. **Registrado, não
executado**: a spec da 239 não foi editada aqui.

### T0.3 — medição em staging e produção: PENDENTE, pede autorização

Medir em produção (Postgres-Hqfu) é ação em produção e exige o usuário; esta sessão não a executou.
As três perguntas, só leitura, sobre `company_occurrence_types`:

1. Quantos tipos têm o nome exato da segunda via do boleto e **qual `redelivery_policy` cada um tem**
   (a migration a zera para `unset`; política ≠ `unset` avisa o usuário antes da etapa 2).
2. O nome "Cliente pediu prorrogação do boleto" já existe?
3. Quantos tipos renomeados ficariam de fora do `UPDATE` da migration?

Status: **pendente, pede autorização.** Task T0.3 segue desmarcada.
