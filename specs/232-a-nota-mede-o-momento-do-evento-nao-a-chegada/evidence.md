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

## T1.2

Contratos escritos **antes** do código (a T1.3 implementa). Nenhuma linha de `src/` mudou.

- `apps/api-transportada/test/trip-delivery-proof/punctuality-clock-corrected.contract.ts` (17
  testes), registrado em `test/trip-delivery-proof.contract.test.ts`. Fixa o parâmetro opcional
  `hasCorrectedClock?: boolean` de `ClassifyProofPunctualityParams` (D4, CA1, CA2).
- `apps/api-transportada/test/fleet-domain/driver-score-missing-grace.contract.ts` (10 testes),
  registrado em `test/fleet-domain.contract.test.ts`. Fixa o campo opcional
  `deliveryReceivedAt?: Date | undefined` de `DriverScoreDelivery` (D5, CA4).

Os dois campos ainda não existem nos tipos. Para o `typecheck` seguir verde durante o vermelho, cada
contrato monta o parâmetro com uma interseção local (`ClassifyProofPunctualityParams & {
hasCorrectedClock?: boolean }`, `DriverScoreDelivery & { deliveryReceivedAt?: Date | undefined }`),
atribuível ao tipo de hoje sem cast. A interseção sai na T1.3, quando o campo entrar no tipo.

Defaults conferidos em `delivery-proof-settings.policy.ts` e afirmados no contrato: janela 60 min,
raio 300 m, `missingAfterHours` 24.

### Antes (sem os contratos novos)

```text
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts
 295 pass
 0 fail
$ bun --env-file=../../.env.test test ./test/fleet-domain.contract.test.ts
 139 pass
 0 fail
```

### Vermelho (com os contratos novos)

```text
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts
(fail) foto julgada pelo relógio corrigido (spec 232 D4) > CA1: foto na hora da entrega recebida 30 h depois, com relógio corrigido, é on_time
       Expected: "on_time"  Received: "late"
(fail) ... > no limite exato da janela (entrega + 60 min) é on_time
       Expected: "on_time"  Received: "late"
(fail) ... > a distância continua pesando: foto na hora, mas fora do raio, é away
       Expected: "away"  Received: "late_and_away"
(fail) ... > capturedAt 3 h antes da entrega é elevado a entrega − 2 min e fica on_time
       Expected: "on_time"  Received: "late"
 308 pass
 4 fail

$ bun --env-file=../../.env.test test ./test/fleet-domain.contract.test.ts
(fail) prazo de "foto ausente" contado do recebimento da entrega (spec 232 D5) > CA4: entrega de 30 h atrás recebida há 1 h, sem foto, ainda não penaliza
       toEqual: esperado { penalties: [], score: 100 }, recebido a penalidade missing_proof (score 90)
(fail) ... > fronteira: exatamente 24 h desde o recebimento ainda não penaliza
       idem
 147 pass
 2 fail
```

Vermelho pelo motivo certo: as seis falhas são assertivas sobre a regra nova; nenhuma é import,
sintaxe ou tipo. As quatro da foto são o piso `recebimento − 24 h` ainda aplicado (referência vira
entrega + 6 h); as duas do ausente são o prazo ainda contado de `deliveredAt`.

Os existentes seguem verdes: **295** e **139**, os mesmos de antes. Filtrando só os novos:

```text
-t "relógio corrigido"       → 13 pass, 4 fail, 295 filtered out
-t "contado do recebimento"  →  8 pass, 2 fail, 139 filtered out
```

Os testes novos que já passam hoje são travas de regressão, não regra nova: CA2 (sem a flag e com
`false`, a foto de 30 h continua `late`), foto 2 h depois continua `late`, +60 min +1 ms é `late`,
`late_and_away`, teto de recebimento + 2 min nos dois sentidos, `lateRegistration`, sem
`capturedAt`, `not_required`, `mergeProofPunctuality`; no ausente, sem `deliveryReceivedAt`,
recebida há 25 h, 24 h + 1 ms, recebimento anterior à entrega (o `max`) nos dois sentidos, foto
`late`/`on_time` e `expiresAt = deliveredAt + 90 dias`.

Limite conhecido: o piso `entrega − 2 min` não é observável pelo veredito (qualquer referência antes
da entrega não é tardia), então o caso "3 h antes" só prova que o piso de 24 h não empurra a foto,
não que o clamp inferior existe.

### Gates

```text
apps/api-transportada$ bun run typecheck   → exit 0
apps/api-transportada$ bun run lint        → exit 0 (--max-warnings=0)
raiz$ bun run format:check                 → exit 0
```
