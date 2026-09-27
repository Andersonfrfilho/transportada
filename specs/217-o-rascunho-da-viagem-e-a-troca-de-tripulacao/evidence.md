# Evidência — 217, o rascunho da viagem e a troca de tripulação

> Uma seção por task, com o comando rodado e o que ele provou. Task sem evidência aqui não está
> fechada.

## T101 — Teste de contrato do status derivado do par (🧠 `opus`)

Arquivo novo `apps/api-transportada/test/trip-domain/crew-status.contract.ts`, registrado no
entrypoint `test/trip-domain.contract.test.ts` (a lista de imports é explícita — suíte não registrada
não roda).

Cobre, sobre `resolveCrewStatus` e `checkTripTransition({ action: 'defineCrew', crew })`:

- par completo → `draft`; qualquer metade → `awaiting_crew`;
- `awaiting_crew` + par completo → `applied` para `draft`;
- `awaiting_crew` + metade → `unchanged` (não promove, e não grava evento de status à toa);
- `draft` + par completo → `unchanged`;
- `draft` + par desfeito → `applied` para `awaiting_crew` (a regressão que hoje não acontece);
- `cancelled`/`completed` → `blocked`, qualquer que seja a composição.

**Vermelho registrado antes da implementação:**

```
$ bun --env-file=../../.env.test test test/trip-domain.contract.test.ts --timeout 120000
SyntaxError: Export named 'resolveCrewStatus' not found in module
  '.../src/trips/domain/trip-state.policy.ts'
 0 pass / 1 fail / 1 error
```

Falhou pelo motivo certo: a função e o parâmetro `crew` ainda não existem. Modelo usado: `opus`
(máquina de estados, conforme o `tasks.md`).
