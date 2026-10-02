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

## T1.2b

Contratos ajustados pelas decisões do usuário (P1, P2/D4b, CA6) e pela validação do architect.
Nenhuma linha de `src/` mudou — a T1.3 implementa.

Arquivos:

- `test/trip-delivery-proof/punctuality-clock-corrected.contract.ts` — P1 (foto atrasada pela rede),
  novo `describe` da D4b, renomes e limpeza.
- `test/driver-trip/delivery-proof-clock-corrected.contract.ts` (novo, 12 testes), registrado em
  `test/driver-trip.contract.test.ts` — contrato no nível do caso de uso `attachDeliveryProof`.
- `test/fixtures/delivery-proof-world.fixture.ts` (novo) — `buildWorld`, `buildInput` e as constantes
  saíram de `test/driver-trip/delivery-proof.contract.ts` sem mudança de corpo; o contrato antigo só
  passou a importá-los.
- `test/fleet-domain/driver-score-missing-grace.contract.ts` — `describe` novo da janela da nota.
- `plan.md` § "Como a flag nasce": a flag é **só** `resolveOccurredAt(...).kind === 'corrected'`; a
  posição da entrega é decidida pela política (D4b).

O upload ganha `clockOffsetMs?: number` na T1.3; até lá o contrato do caso de uso monta o upload com
a interseção local `Partial<DeliveryProofUpload> & { clockOffsetMs?: number }` (sai na T1.3, junto com
as outras duas).

### Antes

```text
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts   → 308 pass, 4 fail (312)
$ bun --env-file=../../.env.test test ./test/fleet-domain.contract.test.ts          → 147 pass, 2 fail (149)
$ bun --env-file=../../.env.test test ./test/driver-trip.contract.test.ts           → 137 pass, 0 fail (137)
```

Os 4 + 2 vermelhos são os da T1.2.

### Depois (vermelho esperado)

```text
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts
(fail) ... (spec 232 D4) > CA1: foto na hora da entrega recebida 30 h depois, com relógio corrigido, é on_time   Expected "on_time"  Received "late"
(fail) ... (spec 232 D4) > no limite exato da janela (entrega + 60 min) é on_time                              Expected "on_time"  Received "late"
(fail) ... (spec 232 D4) > a distância continua pesando: foto na hora, mas fora do raio, é away                 Expected "away"     Received "late_and_away"
(fail) ... (spec 232 D4) > o piso de 24 h saiu: capturedAt 3 h antes da entrega, recebida 30 h depois, é on_time Expected "on_time" Received "late"
(fail) ... (spec 232 D4) > foto atrasada pela rede: tirada na entrega e recebida 10 dias depois, com a flag, é on_time  Expected "on_time" Received "late"
(fail) ... (spec 232 D4b) > flag ligada, recebida 30 min depois da entrega: away                              Expected "away"           Received "on_time"
(fail) ... (spec 232 D4b) > flag ligada, recebida 61 min depois da entrega: late_and_away                     Expected "late_and_away"  Received "on_time"
(fail) ... (spec 232 D4b) > flag ligada, recebida 30 h depois da entrega: late_and_away                       Expected "late_and_away"  Received "late"
(fail) ... (spec 232 D4b) > flag ligada e posição na entrega: vale a D4, recebida 30 h depois é on_time       Expected "on_time"        Received "late"
 312 pass
 9 fail
Ran 321 tests across 1 file.

$ bun --env-file=../../.env.test test ./test/fleet-domain.contract.test.ts
(fail) ... (spec 232 D5) > CA4: entrega de 30 h atrás recebida há 1 h, sem foto, ainda não penaliza
(fail) ... (spec 232 D5) > fronteira: exatamente 24 h desde o recebimento ainda não penaliza
 150 pass
 2 fail
Ran 152 tests across 1 file.

$ bun --env-file=../../.env.test test ./test/driver-trip.contract.test.ts
(fail) caso de uso ... > desvio válido, entrega com posição, foto recebida 30 h depois: on_time gravado      Expected "on_time"        Received "late"
(fail) caso de uso ... > foto da mercadoria com desvio válido, recebida 30 h depois, é on_time              Expected "on_time"        Received "late"
(fail) caso de uso ... > entrega sem posição (D4b) ... > desvio válido, recebida 30 min depois da entrega: away           Expected "away"           Received "on_time"
(fail) caso de uso ... > entrega sem posição (D4b) ... > desvio válido, recebida 61 min depois da entrega: late_and_away  Expected "late_and_away"  Received "late"
 145 pass
 4 fail
Ran 149 tests across 1 file.
```

Vermelho pelo motivo certo: as 15 falhas são assertivas de veredito/nota; nenhuma é import, sintaxe ou
tipo. Na foto, é o piso `recebimento − 24 h` ainda aplicado (D4) ou a distância que ainda não pesa
sem posição na entrega (D4b); no caso de uso, é a flag que ainda não nasce nem chega à política; no
ausente, o prazo ainda contado de `deliveredAt` (D5, herdado da T1.2).

Os que já existiam seguem verdes: **295** (trip-delivery-proof), **139** (fleet-domain) e **137**
(driver-trip, incluindo o `delivery-proof.contract.ts` que passou a importar a fixture). Contas:
312 = 295 + 12 da T1.2 + 1 (P1 sem a flag) + 4 (espelhos da D4b); 150 = 139 + 8 da T1.2 + 3 novos;
145 = 137 + 8 novos do caso de uso.

Filtrando só os novos:

```text
trip-delivery-proof -t "foto atrasada pela rede"                          →  1 pass, 1 fail
trip-delivery-proof -t "o relógio não vale"                               →  4 pass, 4 fail
trip-delivery-proof -t "relógio corrigido"                                → 13 pass, 5 fail (era 13/4; −1 de parede, +2 da P1)
driver-trip         -t "caso de uso: foto julgada pelo relógio corrigido" →  8 pass, 4 fail
fleet-domain        -t "não mexe na janela da nota"                       →  3 pass, 0 fail
fleet-domain        -t "contado do recebimento"                           →  8 pass, 2 fail
```

### O que já passa hoje, e o que trava

- **Política, P1 sem a flag** (`late`): CA2 com a hora de 10 dias — o piso continua para cliente antigo.
- **Política, espelhos da D4b** (flag ausente e `false`, sem posição na entrega → `on_time` 30 min,
  `late` 30 h): travam que a D4b só vale com a flag; a T1.3 não pode fazer a distância pesar para
  cliente antigo.
- **Caso de uso (b) futuro e (c) mais de 30 dias** (`late`): hoje passam por não haver flag. Depois da
  T1.3 discriminam a derivação errada "flag = o campo veio": com ela, o `capturedAt` cru (entrega +
  10 min) sem o piso daria `on_time`.
- **(d) sem desvio** (`late`): CA2 de ponta a ponta.
- **(e) canal `office`** (`not_required`): a D4 não chega ao escritório.
- **(g) fusão** (`late`, `late`): hoje a substituta já é `late` sozinha; depois da T1.3 ela seria
  `on_time` sozinha (caso a), e é a `mergeProofPunctuality` que tem de segurar o `late`. Substitui o
  teste de parede "mergeProofPunctuality não muda", removido.
- **(h) reenvio** com a mesma `attachmentKey`: devolve o veredito gravado, sem bucket nem `saveProof`.
- **(i) `saveProof.capturedAt`**: recebe a hora crua do aparelho (entrega + 2 h 10 min), não a
  corrigida — até a T1.5 decidir onde guardar o desvio.
- **Espelho do caso de uso** (sem desvio, sem posição na entrega, 30 min → `on_time`).
- **Nota (janela)**: entrega de 91 dias recebida há 1 h fica fora (`score: null`); entrega anterior ao
  `effectiveSince` e recebida depois dele fica fora; duas entregas sem foto ficam ordenadas por
  `deliveredAt` (a mais antiga recebida depois continua em segundo) e com `expiresAt = deliveredAt + 90
dias`. Conferido em `computeDriverScore`: o filtro (`isWithinWindow`, `effectiveSince`) e o `sort`
  usam `deliveredAt`; travam que a D5 só adia o prazo de "ausente".

### Limpeza

- "o teto de recebimento + 2 min também reprova…" → "a folga do teto é de 2 min, não mais…" (trava o
  tamanho da folga).
- "capturedAt 3 h antes… elevado a entrega − 2 min" → "o piso de 24 h saiu: capturedAt 3 h antes da
  entrega, recebida 30 h depois, é on_time" (o clamp inferior não é observável pelo veredito).
- Teste de parede "mergeProofPunctuality não muda" removido; trocado pelo caso real (g).
- "sem capturedAt" com a flag ganhou o comentário de que o caso de uso nunca o produz (sem `tappedAt`
  o resultado é `missing`).
- As interseções locais de tipo continuam; saem na T1.3.

### Gates

```text
apps/api-transportada$ bun run typecheck   → exit 0 (tsc inclui test/**)
apps/api-transportada$ bun run lint        → exit 0 (--max-warnings=0)
raiz$ bun run format:check                 → exit 0
```

Não feito aqui: prova por mutação — não há código novo para mutar; fica para a T1.3, que deve provar
em especial que (b)/(c) pegam a derivação "o campo veio" e que (g) pega a fusão desligada.

## T1.3 — a foto pela hora corrigida e o prazo de ausente do recebimento

Implementado: `hasCorrectedClock` em `classifyProofPunctuality` (D4 sem o piso de `missingAfterHours`; D4b sem
posição na entrega a referência é o recebimento e a entrega conta como longe), `deliveryReceivedAt` no
`DriverScoreDelivery` (D5: o prazo de "ausente" conta de `max(deliveredAt, deliveryReceivedAt)`),
`clockOffsetMs` no `DeliveryProofUpload` e a flag nascendo de `resolveOccurredAt(...).kind ===
'corrected'` no caso de uso, e `deliveryReceivedAt: row.recordedAt` no repositório da nota. `saveProof`
segue recebendo a hora crua. As interseções locais de tipo dos três contratos saíram.

Um defeito de fixture dos contratos da T1.2b, corrigido sem tocar em assertiva: em
`delivery-proof-clock-corrected.contract.ts`, `buildRequiredWorld(deliveryEventPosition = DELIVERY_POSITION)`
trocava o `undefined` explícito pelo valor padrão, então os casos "entrega sem posição" (j, k) rodavam COM
posição e só falhavam vermelhos por acaso (`on_time` em vez de `away`). Agora o helper usa `...args` e
`buildRequiredWorld(undefined)` é de fato a entrega sem posição.

### Verde

```text
apps/api-transportada$ bun --env-file=../../.env.test test --timeout 120000 ./test/trip-delivery-proof.contract.test.ts → 321 pass, 0 fail
                                                                                  ./test/fleet-domain.contract.test.ts → 152 pass, 0 fail
                                                                                  ./test/driver-trip.contract.test.ts  → 149 pass, 0 fail
apps/api-transportada$ bun run typecheck                      → exit 0
apps/api-transportada$ bun run lint                           → exit 0 (--max-warnings=0)
apps/api-transportada$ bun --env-file=../../.env.test run test → 8610 pass, 23 skip, 0 fail (8633 testes, 192 arquivos)
raiz$ bun run format:check                                    → exit 0
```

Os 15 vermelhos da T1.2/T1.2b ficaram verdes (9 + 2 + 4); os 23 `skip` da suíte inteira são de testes
condicionais que já existiam (nenhum deste lote).

### Integração (CA4 de ponta a ponta, contra o Postgres de teste)

Dois casos novos em `test/integration/driver-score.integration.ts` (já na lista do `test:integration`):
`captured_at = agora − 30 h`, `recorded_at = agora − 1 h`, sem foto → sem penalidade (nota 100); espelho
com `recorded_at = agora − 30 h` → `missing_proof` (nota 90).

```text
apps/api-transportada$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/driver-score.integration.ts
 10 pass
 0 skip
 0 fail
Ran 10 tests across 1 file.
```

### Prova por mutação (restaurada e conferida a cada uma)

| #    | Mutação                                                                 | Resultado                                                                                                                        |
| ---- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| i    | flag = `clockOffsetMs !== undefined` (em vez de `kind === 'corrected'`) | pegou: driver-trip 2 fail — casos (b) futuro e (c) mais de 30 dias                                                               |
| ii   | flag = `true` sempre                                                    | pegou: trip-delivery-proof 1 fail, driver-trip 4 fail (sem desvio continua late, (b), (c), espelho D4b)                          |
| iii  | remove a D4b de `isAway`                                                | pegou: trip-delivery-proof 3 fail, driver-trip 2 fail (away / late_and_away sem posição)                                         |
| iv   | remove a D4b de `resolveTimeReference`                                  | pegou: trip-delivery-proof 2 fail, driver-trip 1 fail (late_and_away: a foto de 10:00 não pode valer sem posição)                |
| v    | `max` → só `deliveredAt` no prazo de ausente                            | pegou: fleet-domain 2 fail (CA4 e a fronteira de 24 h)                                                                           |
| vi   | fusão (`mergeProofPunctuality`) desligada no caso de uso                | pegou: trip-delivery-proof 1 fail, driver-trip 2 fail — inclui o caso (g) "substituto corrigido depois de um late continua late" |
| vii  | `saveProof.capturedAt` recebe a hora corrigida                          | pegou: driver-trip 1 fail — caso (i) "saveProof recebe o capturedAt cru"                                                         |
| viii | D4 desligada (piso de 24 h sempre aplicado)                             | pegou: trip-delivery-proof 6 fail, driver-trip 2 fail (CA1, limite da janela, rede de 10 dias, cargo, …)                         |
| ix   | repositório sem `deliveryReceivedAt` (só a integração enxerga)          | pegou: driver-score.integration 1 fail — "tocada há 30 h e recebida há 1 h: ainda não penaliza"                                  |

Só a ordem de verificação da integração exige o Postgres; as oito primeiras rodam sem banco.

## T1.4 — os esquemas do motorista aceitam `tappedAt` e `clockOffsetMs`

Contrato novo: `test/driver-trip/clock-fields-schema.contract.ts` (registrado em
`test/driver-trip.contract.test.ts`, que já está no `package.json`). Cobre, para `arrive`, `deliver`,
`return` e as duas formas da ocorrência (`kind` e `occurrenceTypeId`): cliente antigo (o resultado não
ganha as chaves, nem `undefined` explícito), cliente novo (`tappedAt: Date`, `clockOffsetMs: number`),
um campo sem o outro, os extremos ±365 dias e zero, e 400 para fracionário, texto, `null`, `NaN` no
corpo cru, ±365 dias + 1 ms, `1e99`, `tappedAt` não ISO e campo desconhecido (`.strict()` vivo).
`depart`/`cancel-departure` seguem como eram (`clockOffsetMs` neles continua chave extra). No multipart
do comprovante: inteiro com sinal vira `number`, ausente/vazio não ganha a chave, e `abc`, `1.5`, `1e99`,
`1e3`, `+5`, ` 5`, `NaN`, `Infinity`, ±365 dias + 1 ms e 40 dígitos são 400 (`INVALID_REQUEST`, o mesmo
erro dos outros campos do multipart). Casos de rota (`route.execute` com `Request` real): os quatro
eventos JSON entregam `tappedAt`/`clockOffsetMs` à dependência, o cliente antigo não os leva, e o
`/proof` entrega o `clockOffsetMs` do multipart dentro do `upload` ao `attachProof`.

Implementação (só aceitar e carregar; nada é gravado, a T1.5 é quem grava): `eventClockFields` em
`me-trip.schema.ts` mesclado em `reportSchema`, `returnSchema` e `occurrenceBodySchema` (o `deliverySchema`
herda do `reportSchema`), sem tirar nenhum `.strict()`; `toEventClock` não devolve chave ausente
(`exactOptionalPropertyTypes`); `clockOffsetMs` do multipart lido em `delivery-proof.schema.ts` no molde
do `capturedAt` (`decimalText`, regex de até 11 dígitos, `z.int()` com o limite) e repassado a
`DeliveryProofUpload.clockOffsetMs`. Tipo e limite ficam em `occurred-at.policy.ts`
(`EventClockFields`, `CLOCK_OFFSET_LIMIT_MILLISECONDS = 365 dias`). As rotas `arrive`/`deliver`/`return`
passam a repassar o corpo inteiro à dependência (`...input`), e `ReportStopArrivalInput`,
`ReportDocumentOutcomeInput` e `ReportStopOccurrenceInput` ganharam `EventClockFields` (opcional, sem
uso nos casos de uso).

### Vermelho (antes do código)

```text
apps/api-transportada$ bun --env-file=../../.env.test test --timeout 120000 ./test/driver-trip.contract.test.ts
 178 pass
 28 fail
```

Os 28 são todos "aceitar": quatro por parser de evento (cliente novo, um sem o outro duas vezes, extremos),
três do multipart (inteiro vira número, extremos, texto inválido ainda aceito/ignorado) e cinco de rota. Os
casos de cliente antigo, de `.strict()` e de `depart` já nasciam verdes — são as travas que a mudança não
pode quebrar, e a mutação 1/2/6/9 abaixo prova que pegam.

### Verde

```text
apps/api-transportada$ bun --env-file=../../.env.test test --timeout 120000 ./test/driver-trip.contract.test.ts → 206 pass, 0 fail (149 + 57)
apps/api-transportada$ bun run typecheck                      → exit 0
apps/api-transportada$ bun run lint                           → exit 0 (--max-warnings=0)
apps/api-transportada$ bun --env-file=../../.env.test run test → 8667 pass, 23 skip, 0 fail (8690 testes, 192 arquivos)
raiz$ bun run format:check                                    → exit 0
```

Antes: 8610 pass / 23 skip; a diferença é exatamente os 57 casos novos. Nenhum snapshot do OpenAPI mudou
(o gerador deriva das rotas e a suíte inteira passou sem atualizar nenhum).

### Prova por mutação (restaurada e conferida byte a byte a cada uma)

| #   | Mutação                                                               | Resultado (driver-trip)                                                      |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | `.strict()` removido do `reportSchema`                                | pegou: 1 fail (arrive aceitava `foo`)                                        |
| 2   | `clockOffsetMs` obrigatório                                           | pegou: 14 fail (cliente antigo e um-sem-o-outro, nos quatro eventos e rotas) |
| 3   | sem o limite de ±365 dias no corpo JSON                               | pegou: 5 fail (um por parser de evento)                                      |
| 4   | `clockOffsetMs` fracionário aceito no corpo JSON (`z.int()`→`number`) | pegou: 5 fail                                                                |
| 5   | multipart ignora o `clockOffsetMs`                                    | pegou: 3 fail (parser: valor e extremos; rota `/proof` fim a fim)            |
| 6   | `tappedAt` obrigatório                                                | pegou: 14 fail                                                               |
| 7   | multipart sem o limite de ±365 dias                                   | pegou: 1 fail                                                                |
| 8   | multipart aceita fracionário/expoente (regex frouxa)                  | pegou: 1 fail                                                                |
| 9   | `toEventClock` devolve `clockOffsetMs: undefined` explícito           | pegou: 14 fail (cliente antigo ganha a chave)                                |
| 10  | rota `/arrive` descarta os campos do relógio                          | pegou: 1 fail (caso de rota `/arrive`)                                       |

## T1.5 — migration aditiva, a hora corrigida gravada e a leitura única do momento da entrega

### O que mudou

- **Migration** `apps/api-transportada/drizzle/20261002213734_delivered_moment_clock/` (`migration.sql`
  gerado pelo `db:generate` + cabeçalho, `snapshot.json`, `rollback.sql`): `trip_stop_events.occurred_at
timestamptz NULL`, `trip_stop_events.clock_offset_ms bigint NULL`, `trip_delivery_proofs.clock_offset_ms
bigint NULL` e o índice novo `trip_stop_events_company_delivered_moment_idx (company_id,
coalesce(occurred_at, captured_at, recorded_at)) WHERE kind = 'delivered'`. Sem backfill, sem DEFAULT,
  sem NOT NULL; o índice antigo `trip_stop_events_company_delivered_at_idx` fica (as outras seis
  leituras usam). Timestamp posterior ao último de `origin/staging` (`20261002120000_trip_canhoto_read_job`,
  conferido com `git fetch` + `git ls-tree`).
- **`bigint`, não `integer`** (decisão desta task): o esquema da T1.4 aceita desvio de até ±365 dias, e
  `integer` estoura em ±24,8 dias — aparelho com o relógio um mês errado daria `22003` e derrubaria o
  toque inteiro em vez de só gravar a correção.
- **Leitura única (risco 4):** `src/database/delivered-moment.support.ts` exporta `deliveredMomentSql`
  (`coalesce(occurred_at, captured_at, recorded_at)`), usada pelo **próprio índice** no schema TS e pelos
  quatro pontos: nota (`drizzle-driver-score.repository.ts`: filtro da janela no `distinct on`, no
  pré-filtro por motorista e o `deliveredAt` selecionado — a linha não faz mais `capturedAt ??
recordedAt` em TS), `findDeliveryContext` e `listPendingProofs` (filtro e `deliveredAt`). As outras
  leituras de `captured_at ?? recorded_at` não foram tocadas.
- **Gravação (riscos 1 e 2):** campo novo `correctedClock?: { occurredAt, clockOffsetMs }` em
  `recordEvent` — o `occurredAt` que a porta já tinha (sobrescreve `created_at`, escritório) não foi
  reusado. `resolveRecordedEventClock` (domínio, puro) chama `resolveOccurredAt` e devolve a **decisão**:
  `correctedClock` só quando `corrected`; o `tappedAt` cru vai sempre que veio (agora também em
  `arrived`/`delivered`/`returned`; o único leitor de `tapped_at` filtra `kind = 'departed'`). Chegada,
  entrega e devolução do motorista usam; o escritório segue com o caminho dele. A ocorrência de parada
  grava em `trip_stop_occurrences`, outro caminho — fora (a spec diz que só a entrega e a foto usam).
  Idempotência intocada: o reenvio devolve o evento já gravado.
- **Foto (risco 5):** `classifyPhotoPunctuality` devolve o veredito e o desvio aplicado; `saveProof` grava
  `clock_offset_ms` só quando `hasCorrectedClock` foi `true` (`null` no descarte, no cliente antigo, na
  assinatura e no escritório), e `captured_at` segue cru (trava da T1.3 mantida). A recaptura grava o dela.
- Comentários de `tapped_at` no schema e na porta atualizados (não é mais "só em departed").

### Vermelho (teste antes do código)

`test/integration/delivered-moment.integration.ts` (novo, registrado no `test:integration`), escrito antes
de qualquer linha de `src/`:

```text
apps/api-transportada$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/delivered-moment.integration.ts
(fail) ... CA3: tocada às 10:00 sem posição e recebida às 14:00, com os campos, é entregue às 10:00   TypeError (coluna occurred_at não existe no schema)
(fail) ... a janela de 90 dias da nota conta da hora corrigida, não do recebimento                     Expected { penalties: [], score: null } — Received missing_proof, deliveredAt = recebimento, score 90
(fail) ... a nota e a lista de pendências usam o mesmo instante na fronteira do effectiveSince        idem: a entrega das 10:00 entrou como sendo das 14:00, depois da ativação
(fail) ... (+ 7 casos que leem as colunas novas: TypeError de coluna inexistente)
 1 pass   (espelho da fronteira, sem os campos — trava de regressão)
 10 fail
```

Segundo vermelho, **com a migration e sem o código** (as colunas existem; só a gravação/leitura falta):

```text
(fail) CA3 ...                                   Expected occurredAt "…17:38:06.436Z"  Received undefined
(fail) janela de 90 dias ...                     Received missing_proof, score 90 (deliveredAt = recebimento)
(fail) descartada no futuro / velha demais ...   Expected tappedAt cru  Received undefined (o evento de entrega não gravava tapped_at)
(fail) reenvio ...                               Expected occurredAt  Received undefined
(fail) fronteira do effectiveSince ...           Received missing_proof, score 90
(fail) a chegada também grava ...                Expected occurredAt  Received undefined
(fail) foto com relógio corrigido ...            Expected clockOffsetMs 90000  Received null
 3 pass   (cliente antigo, espelho da fronteira, foto com correção descartada — travas)
 8 fail
```

Vermelho pelo motivo certo: a hora corrigida não era gravada nem lida.

### Verde

```text
apps/api-transportada$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/delivered-moment.integration.ts
 12 pass
 0 fail
Ran 12 tests across 1 file.
```

Casos: (a) CA3 — `occurred_at` = 10:00, `clock_offset_ms` = 90000, `tapped_at` cru, `created_at` =
`recorded_at` (o campo novo não sobrescreve `created_at`), e nota, `findDeliveryContext` e
`listPendingProofs` leem **o mesmo** 10:00 (f); com posição, a hora corrigida vence o `captured_at` cru do
GPS; a janela de 90 dias conta da hora corrigida (lida 90 d + 1 h depois dela: fora na nota e na lista;
o espelho sem os campos continua dentro); (b) cliente antigo — colunas nulas, momento = `recorded_at` nos
três; (c) correção descartada no futuro (+1 h) e velha demais (−31 d) — `occurred_at` e `clock_offset_ms`
nulos, `tapped_at` cru gravado, momento = `recorded_at` nos três; (d) reenvio pela mesma chave e por
chave nova não regrava nem cria evento; (e) `effectiveSince` entre a hora corrigida e o recebimento —
fora na nota **e** na lista (espelho sem os campos: dentro nos dois); chegada grava a hora corrigida; foto
grava `clock_offset_ms` só com a correção aceita.

O `recorded_at` do motorista nasce do `now()` do banco, então o teste usa o relógio real (não um `NOW`
congelado) e mede tudo relativo ao recebimento.

Contratos puros novos: `test/trip-schema/delivered-moment.contract.ts` (a expressão e a ordem; o índice
novo é montado com a mesma expressão da consulta e o antigo continua; colunas anuláveis e `bigint`),
`resolveRecordedEventClock` em `test/trip-delivery-proof/occurred-at.contract.ts` (4), caso de
`static-migration.contract.ts` para a pasta nova (aditiva, sem backfill, índice velho intocado, rollback
derruba o índice antes das colunas e remove a linha do journal), e (i)/(i2) em
`delivery-proof-clock-corrected.contract.ts` (o `saveProof` recebe o desvio aplicado; descartado e cliente
antigo, `null`).

### EXPLAIN (Postgres de teste, 65432)

Base descartável com as migrations, 20 000 eventos (4 000 `delivered`, metade com `occurred_at`),
`ANALYZE`. As consultas são as **reais**, capturadas pelo logger do drizzle ao chamar
`DrizzleDriverScoreRepository.readPenalties` e `DrizzleCurrentDriverTripRepository.listPendingProofs`, e
explicadas com os mesmos parâmetros. Com `enable_seqscan = on` (e também `off`) o plano é o mesmo:

```text
-- nota: o distinct on e o pré-filtro por motorista (alias driver_delivery)
Bitmap Heap Scan on trip_stop_events driver_delivery  (cost=86.29..585.61 rows=1333)
  Recheck Cond: ((company_id = '…') AND (COALESCE(occurred_at, captured_at, recorded_at) >= '2026-07-04 …'::timestamptz) AND (kind = 'delivered'))
  ->  Bitmap Index Scan on trip_stop_events_company_delivered_moment_idx  (cost=0.00..65.61 rows=1333)
        Index Cond: ((company_id = '…') AND (COALESCE(occurred_at, captured_at, recorded_at) >= '2026-07-04 …'::timestamptz))
Bitmap Heap Scan on trip_stop_events  (cost=65.94..555.27 rows=1333)
  ->  Bitmap Index Scan on trip_stop_events_company_delivered_moment_idx  (cost=0.00..65.61 rows=1333)
        Index Cond: ((company_id = '…') AND (COALESCE(occurred_at, captured_at, recorded_at) >= …))
-- listPendingProofs
Bitmap Heap Scan on trip_stop_events  (cost=65.94..555.27 rows=1333)
  ->  Bitmap Index Scan on trip_stop_events_company_delivered_moment_idx  (cost=0.00..65.61 rows=1333)
        Index Cond: ((company_id = '…') AND (COALESCE(occurred_at, captured_at, recorded_at) >= …))
```

Espelho, com a mutação M2 (ordem do `coalesce` trocada só na consulta; o índice do banco é o da
migration): o índice só casa o prefixo `company_id` (rows=4000, todo `delivered` da empresa) e a janela
vira `Filter: (COALESCE(captured_at, occurred_at, recorded_at) >= …)` — é a varredura que o risco 3
descreve. Volume pequeno: o plano prova que a expressão casa com o índice, não o ganho em produção.

### Prova por mutação (restaurada e conferida por sha256 a cada uma; `git diff` idêntico ao final)

| #   | Mutação                                                              | Resultado                                                                                                                    |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| M1  | leitura ignora `occurred_at` (helper volta a `captured ?? recorded`) | pegou: integração 4 fail (CA3, com posição, janela, fronteira); trip-schema 1 fail                                           |
| M2  | ordem do `coalesce` trocada (`captured` antes de `occurred`)         | pegou: integração 1 fail (com posição, a hora corrigida vence o GPS cru); trip-schema 1 fail; EXPLAIN perde o índice (acima) |
| M3  | grava `occurred_at` também quando a correção foi descartada          | pegou: integração 2 fail (descartada no futuro, velha demais); trip-delivery-proof 2 fail                                    |
| M4  | esquece `listPendingProofs`                                          | pegou: integração 4 fail (CA3, com posição, janela, fronteira do `effectiveSince`)                                           |
| M5  | esquece `findDeliveryContext`                                        | pegou: integração 2 fail (CA3, com posição)                                                                                  |
| M6  | reutiliza o `occurredAt` da porta (sobrescreve `created_at`)         | pegou: integração 6 fail (CA3, com posição, janela, reenvio, fronteira, chegada)                                             |
| M7  | esquece a nota (só o score segue `captured ?? recorded`)             | pegou: integração 3 fail (CA3, com posição, fronteira)                                                                       |
| M8  | a foto não grava o desvio que a julgou                               | pegou: integração 1 fail; driver-trip 1 fail                                                                                 |
| M9  | a foto grava o desvio mesmo com a correção descartada                | pegou: integração 1 fail; driver-trip 1 fail                                                                                 |
| M10 | a chegada não grava a correção                                       | pegou: integração 1 fail                                                                                                     |

### Gates

```text
apps/api-transportada$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/delivered-moment.integration.ts → 12 pass, 0 fail, 0 skip
raiz$ make migration-test                                     → 116 pass, 0 fail (8 arquivos; migra tudo, roda todos os rollback.sql em ordem inversa, migra de novo) — exit 0
apps/api-transportada$ bun run db:generate --name tmp         → {"status":"no_changes"}
apps/api-transportada$ bun run typecheck                      → exit 0
apps/api-transportada$ bun run lint                           → exit 0 (--max-warnings=0)
apps/api-transportada$ bun --env-file=../../.env.test run test → 8676 pass, 23 skip, 0 fail (8699 testes, 192 arquivos); antes 8667/23 — +9 novos
raiz$ bun run format:check                                    → exit 0
```

Integração dos arquivos que tocam o que mudou (um por vez, com `./` e `--env-file`, todos 0 skip):

```text
driver-score 10 · event-location-stamp 6 · delivery-proof-received-by 10 · delivery-proof-thumbnail 5 ·
delivery-proof-canhoto-review 13 · driver-delivery-proof-read 4 · me-trip 19 · me-trip-departure 12 ·
current-driver-trip-concluded-window 4 · trip-field-office 25 · trip-field-authorship 5 ·
field-trip-target 7 · delivery-proofs-by-trip 5 · whatsapp-driver-flow-actions 1 ·
whatsapp-operator-flow-actions 7 · stop-occurrence-photo 8 · mixed-cargo-end-to-end 1 ·
trip-auto-dispatch 8 · trip-occurrence-attachment 6 · me-location-consent 5   → todos pass, 0 fail
```

### Fica para decisão

- **CA3 × D4b.** A entrega **sem posição** com desvio aceito grava a hora corrigida (o CA3 pede isso). Com
  a D4b a foto dela é julgada pelo recebimento; como o momento da entrega agora é mais cedo, a mesma foto
  pode passar de `away` para `late_and_away`. E o `tappedAt` forjado (até 30 dias) numa entrega sem
  posição pode puxar o momento para antes do `effectiveSince` ou adiantar a saída da janela de 90 dias.
  Se a D4b ("sem posição, o relógio não vale") deve valer também para o evento, a regra é uma linha em
  `resolveRecordedEventClock`/use case — não foi feito, por contrariar o CA3.
- **T1.4 recusa desvio acima de ±365 dias com `400`.** Aparelho que zerou o relógio (1970) mandaria um
  desvio de décadas e teria todo relato recusado. A Fase 2 (app) precisa omitir o campo nesse caso, ou o
  esquema precisa descartar em vez de recusar.
