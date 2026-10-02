# Evidência — Feature 223

## T1.1 — A API aceita a baixa sem canhoto (2026-10-01)

Vermelho primeiro: os dois casos novos no contrato falharam pelo motivo certo, apontando a linha da
policy (`office-delivery-proof.policy.ts:57`, `TripDeliveryProofPhotoRequiredError`).

Verde depois:

```
bun --env-file=../../.env.test test ./test/driver-trip.contract.test.ts
→ 136 pass, 0 fail, 497 expect()

DRIZZLE_TEST_DATABASE_URL=… bun --env-file=../../.env.test test \
  ./test/integration/trip-field-office.integration.ts \
  ./test/integration/trip-field-office-review.integration.ts
→ 42 pass, 0 fail, 171 expect()  (Postgres 18.4 descartável, migrations aplicadas)

bun --env-file=../../.env.test test            → 8481 pass, 23 skip, 9 fail
bun run typecheck (api)                        → limpo
bun run test / test:hooks (painel)             → 6176 pass + 180 pass, 0 fail
bun run typecheck (painel)                     → limpo
```

Os 9 vermelhos da suíte cheia são do catálogo de pedágio (spec 154) e são **ambientais**: o Docker
estava fora e eles pedem Postgres. Com o banco descartável apontado, o mesmo arquivo fecha em
`137 pass, 0 fail` — nada a ver com esta feature.

### Dois defeitos que só a integração pegou

O contrato passou com a policy aberta, mas a integração mostrou `proofPending: false` nos dois
casos: `resolveOutcomeProofSettings` devolvia `pendingSettings: undefined` quando o canal passava
`proof` mas não `resolveProofSettings`. A baixa passava sem canhoto **e sem dívida** — exatamente o
risco que a RF3 existe para fechar. Corrigido na fonte (a pendência sai da configuração do
escritório já resolvida), não na fixture; os contratos novos deixaram de passar
`resolveProofSettings` para provar isso.

## Fase 2 — baixa sem canhoto no painel (T2.1 a T2.4)

**Vermelho primeiro.** `test/trip-hooks/office-deliver-without-canhoto.contract.ts` foi escrito antes da
implementação, com quatro casos sobre o hook real (`renderHook` + `tripHookFakes`):

- RF6 — a baixa por nota monta `FormData` com `deliveredAt` e **sem `file`** (`form.get('file') === null`),
  com `Idempotency-Key`.
- RF7 — três notas viram três requisições, na ordem, com três chaves de idempotência distintas.
- RF7 — falha de uma nota (`TRIP_DOCUMENT_NOT_IN_FIELD`) não interrompe o lote: as três saem e só a
  que falhou volta na lista de pendentes.
- RF10 — conta sem `trip.reportOnBehalf` não emite requisição nenhuma: `TRIP_FORBIDDEN` do controller.

Primeira execução: **181 pass / 3 fail**, os três no mesmo ponto —
`rendered.result().batchFieldDeliverMutation` indefinido. Isto confirmou a medição da Fase 1: a mutação
por nota (`fieldDeliverDocumentMutation`) **já existia e nunca era chamada**; o que faltava era só o
leque em massa. O caso de RF6 passou de primeira por esse motivo.

**Verde depois de:** `batchFieldDeliverMutation` em `useTripWorkspace.hook.ts` (leque
`runFieldActionQueue({ concurrency: 3 })`, molde do `batchFieldReturnMutation`), botão "Baixar sem
canhoto" por nota em `TripStopList`, botão "Baixar N notas sem canhoto" em `TripStateActions`,
`handleBatchDeliver` em `TripDetail` (falha parcial reaproveita o resumo da devolução, com `action`
escolhendo a frase) e três chaves de locale (`actions.deliver` renomeada para não confundir com o
caminho do canhoto, `stateActions.batchDeliverWithoutProof`, `stateActions.batchDeliverPartialFailure`).

```
bun run typecheck   → limpo
bun run test        → 6176 pass / 0 fail   (contratos do painel)
bun run test:hooks  → 184 pass / 0 fail    (eram 180 antes desta fase)
```

Nenhum arquivo em `test/integration/**` foi tocado — a fase é só painel.
