# Evidence — spec 232

## T1.1

Contrato de `resolveOccurredAt` escrito antes da função:
`apps/api-transportada/test/trip-delivery-proof/occurred-at.contract.ts` (17 testes), registrado em
`test/trip-delivery-proof.contract.test.ts`. Função pura em
`apps/api-transportada/src/trips/domain/occurred-at.policy.ts`.

O `tasks.md` cita `test/trips/occurred-at.contract.ts`; o contrato foi para
`test/trip-delivery-proof/` por instrução do orquestrador, porque o entrypoint dessa pasta já está na
lista do `package.json` e nenhum entrypoint `test/trips.contract.test.ts` existe.

A tolerância do futuro reusa `DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS` (exatamente 2 min,
`field-delivery-timing.policy.ts:17`, afirmado no próprio contrato). A idade máxima é
`OCCURRED_AT_MAX_AGE_DAYS = 30`, sobre `MILLISECONDS_PER_DAY` de `shared/time.constant.ts`.

### Vermelho (antes da função)

```text
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts
# Unhandled error between tests
error: Cannot find module '../../src/trips/domain/occurred-at.policy.js'
  from '.../test/trip-delivery-proof/occurred-at.contract.ts'
 0 pass
 1 fail
 1 error
EXIT=1
```

Vermelho pelo motivo certo: o módulo não existia.

### Verde

```text
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts
 295 pass
 0 fail
 543 expect() calls
Ran 295 tests across 1 file.
EXIT=0

$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts -t resolveOccurredAt
 17 pass
 278 filtered out
 0 fail
```

Os 278 testes que já existiam no entrypoint seguem verdes; os 17 novos são de `resolveOccurredAt`.

Cobertura do contrato: correção com desvio positivo e negativo; desvio zero devolve o próprio
`tappedAt`; +2 min exatos vale e +2 min +1 ms é `future`; −30 dias exatos vale e −30 dias −1 ms é
`too_old`; `missing` por `tappedAt` ausente, `clockOffsetMs` ausente, `NaN`, `±Infinity` e
`Invalid Date`; desvio fora do alcance de `Date` (`±Number.MAX_SAFE_INTEGER`) vira `future`/`too_old`
em vez de erro ou de `Invalid Date` corrigido; a função não muta as entradas.

### Prova por mutação

Cada mutação aplicada com `sed` sobre `occurred-at.policy.ts`, contrato rodado com
`-t resolveOccurredAt`, arquivo restaurado da cópia. `shasum` antes e depois:
`ce8ae762660e1eff95e46224119899d4eb06aa65` (idêntico).

| #   | Mutação                                                    | Resultado            | Teste que pegou                                         |
| --- | ---------------------------------------------------------- | -------------------- | ------------------------------------------------------- |
| M1  | `occurredAt > latestAllowed` → `>=` (fronteira do futuro)  | 16 pass / **1 fail** | +2 min exatos ainda vale                                |
| M2  | `tappedAt + clockOffsetMs` → `tappedAt - clockOffsetMs`    | 9 pass / **8 fail**  | desvio positivo, desvio negativo, as quatro fronteiras… |
| M3  | descarte `too_old` removido                                | 15 pass / **2 fail** | −30 dias −1 ms; desvio fora do alcance de `Date`        |
| M4  | `!Number.isFinite(clockOffsetMs)` removido                 | 15 pass / **2 fail** | `NaN` e `±Infinity` contam como ausente                 |
| M5  | `occurredAt < earliestAllowed` → `<=` (fronteira da idade) | 16 pass / **1 fail** | −30 dias exatos ainda vale                              |
| M6  | `!Number.isFinite(tappedAt.getTime())` removido            | 16 pass / **1 fail** | `tappedAt` Invalid Date conta como ausente              |
| M7  | idade máxima 30 → 31 dias                                  | 16 pass / **1 fail** | −30 dias −1 ms descarta                                 |

Nenhuma mutação sobreviveu.

### Gates

```text
apps/api-transportada$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts  → 295 pass, 0 fail, exit 0
apps/api-transportada$ bun run typecheck                                                                → exit 0
apps/api-transportada$ bun run lint                                                                     → exit 0 (--max-warnings=0)
raiz$ bun run format:check                                                                              → exit 0
```
