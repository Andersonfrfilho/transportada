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

## T102 — O status derivado do par, implementado (`sonnet` no `tasks.md`, feito com `opus`)

Desvio de modelo registrado: a task estava marcada `sonnet`, e foi feita com `opus` porque a
implementação mudou a **assinatura** de `checkTripTransition` — decisão de tipo, não digitação.

`trip-state.policy.ts` ganhou `TripCrewComposition`, `resolveCrewStatus` e um `checkDefineCrew` que
deriva o desfecho do par. `CheckTripTransitionParams` virou **união discriminada por `action`**: a
variante `defineCrew` exige `crew`. Assim é impossível, pelo tipo, perguntar "posso trocar a
tripulação?" sem dizer qual tripulação resulta — que era exatamente como o status passava a mentir.

Chamadores ajustados:

- `trip.use-case.ts:updateCrew` — a checagem prévia usa o par **pedido** (`driverIds.length > 0`,
  `vehicleId !== undefined`), não o resolvido, para não mudar a precedência do erro: resolver antes
  só para checar faria "veículo inexistente" passar à frente de "viagem em separação".
- `drizzle-trip.repository.ts:updateCrew` — sob o lock, com o par resolvido (`input.crew.length`,
  `input.vehicleId !== null`). É esta a checagem que decide o status gravado.
- `trip-allowed-actions.policy.ts` — a lista de ações oferecíveis ganhou o tipo
  `OfferableTripAction = Exclude<TripAction, 'defineCrew'>`. Nada a oferecer muda aqui: `planRoute`
  já carrega a regra de tripulação de graça, porque só se aplica em `draft`.
- `trip-domain/trip-state.contract.ts` (grade da 216) — passa `COMPLETE_CREW`; a grade continua com
  140 células e o par pela metade é assunto da suíte da 217.

```
$ bun run typecheck
$ bunx tsc --noEmit        # sem saída: limpo

$ bun --env-file=../../.env.test test test/trip-domain.contract.test.ts \
    test/trip-allowed-actions.contract.test.ts test/trip-application.contract.test.ts \
    test/trip-http.contract.test.ts --timeout 120000
 610 pass / 0 fail / 2094 expect() calls
```

O vermelho da T101 fechou verde sem que nenhuma das 610 asserções de domínio, ações permitidas,
aplicação e HTTP tenha regredido.
