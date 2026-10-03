# Evidence — spec 234

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
(fail) foto julgada pelo relógio corrigido (spec 234 D4) > CA1: foto na hora da entrega recebida 30 h depois, com relógio corrigido, é on_time
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
(fail) prazo de "foto ausente" contado do recebimento da entrega (spec 234 D5) > CA4: entrega de 30 h atrás recebida há 1 h, sem foto, ainda não penaliza
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
(fail) ... (spec 234 D4) > CA1: foto na hora da entrega recebida 30 h depois, com relógio corrigido, é on_time   Expected "on_time"  Received "late"
(fail) ... (spec 234 D4) > no limite exato da janela (entrega + 60 min) é on_time                              Expected "on_time"  Received "late"
(fail) ... (spec 234 D4) > a distância continua pesando: foto na hora, mas fora do raio, é away                 Expected "away"     Received "late_and_away"
(fail) ... (spec 234 D4) > o piso de 24 h saiu: capturedAt 3 h antes da entrega, recebida 30 h depois, é on_time Expected "on_time" Received "late"
(fail) ... (spec 234 D4) > foto atrasada pela rede: tirada na entrega e recebida 10 dias depois, com a flag, é on_time  Expected "on_time" Received "late"
(fail) ... (spec 234 D4b) > flag ligada, recebida 30 min depois da entrega: away                              Expected "away"           Received "on_time"
(fail) ... (spec 234 D4b) > flag ligada, recebida 61 min depois da entrega: late_and_away                     Expected "late_and_away"  Received "on_time"
(fail) ... (spec 234 D4b) > flag ligada, recebida 30 h depois da entrega: late_and_away                       Expected "late_and_away"  Received "late"
(fail) ... (spec 234 D4b) > flag ligada e posição na entrega: vale a D4, recebida 30 h depois é on_time       Expected "on_time"        Received "late"
 312 pass
 9 fail
Ran 321 tests across 1 file.

$ bun --env-file=../../.env.test test ./test/fleet-domain.contract.test.ts
(fail) ... (spec 234 D5) > CA4: entrega de 30 h atrás recebida há 1 h, sem foto, ainda não penaliza
(fail) ... (spec 234 D5) > fronteira: exatamente 24 h desde o recebimento ainda não penaliza
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

## T1.4b — o esquema do motorista nunca recusa o desvio de relógio por ser grande

Princípio (decisão do usuário, 03/10/2026): a rede e o relógio não são culpa do motorista; nenhum evento
é recusado por causa de relógio. Aparelho com o relógio errado por mais de um ano (zerado em 1970,
desvio ≈ +1,76e12 ms) é exatamente o que a medição corrige: `tappedAt (1970) + desvio` dá a hora certa.
O absurdo de verdade, `resolveOccurredAt` já descarta (`future` / `too_old`) sem recusar.

Contrato primeiro (`test/driver-trip/clock-fields-schema.contract.ts`): os casos "limite + 1" (JSON e
multipart) passam a afirmar **aceito e carregado**; novos: relógio em 1970 aceito no JSON (nos cinco
eventos) e no multipart, e `resolveOccurredAt` devolve `corrected` com a hora certa; `Number.MAX_SAFE_INTEGER`
aceito e `resolveOccurredAt` devolve `ignored`/`future`. Continuam 400: fracionário, texto, `null`, `1e99`,
`NaN` no corpo cru, `tappedAt` não ISO, campo desconhecido, `+5`/espaço/expoente/`Infinity` e 16 nines
(além do inteiro seguro) no multipart.

```text
VERMELHO (contrato novo, código da T1.4)
apps/api-transportada$ bun --env-file=../../.env.test test ./test/driver-trip.contract.test.ts ./test/trip-delivery-proof.contract.test.ts
  → 526 pass, 17 fail — os 15 do JSON (3 casos novos × 5 eventos) e os 2 do multipart, todos por ApiError 400
    INVALID_REQUEST em desvio aceito

Implementação: JSON `clockOffsetMs: z.int().optional()` (sem .min/.max); multipart regex `^-?\d{1,16}$`, teto
de texto 17, `.pipe(z.int())`; `CLOCK_OFFSET_LIMIT_MILLISECONDS` removida (sem outro uso).

VERDE
apps/api-transportada$ bun --env-file=../../.env.test test ./test/driver-trip.contract.test.ts ./test/trip-delivery-proof.contract.test.ts
  → 543 pass, 0 fail
apps/api-transportada$ bun run typecheck → exit 0
apps/api-transportada$ bun run lint      → exit 0 (--max-warnings=0)
```

| #   | Mutação                                   | Resultado      |
| --- | ----------------------------------------- | -------------- |
| 1   | limite de ±365 dias de volta no JSON      | pegou: 15 fail |
| 2   | limite de ±365 dias de volta no multipart | pegou: 2 fail  |
| 3   | JSON `z.int()` → `z.number()`             | pegou: 5 fail  |
| 4   | multipart `z.int()` → `z.number()`        | pegou: 1 fail  |
| 5   | regex do multipart de volta a 11 dígitos  | pegou: 2 fail  |

Todas restauradas; o verde acima é da árvore restaurada.

## T1.5b — sem posição no relato, a hora corrigida do evento não vale

A T1.5 gravava `occurred_at` e `clock_offset_ms` mesmo sem posição, porque o CA3 original dizia isso. A
decisão do usuário (03/10/2026), mais específica e posterior — "sem GPS, considera o horário que enviou"
(D4b) — vale também para o evento: relato sem posição não grava a hora corrigida nem o desvio, e a leitura
cai em `captured_at ?? recorded_at`. O `tapped_at` cru segue gravado (spec 206). `spec.md`: D3 ganhou a
frase, o CA3 foi reescrito (com posição → 10:00; sem posição → horário de envio).

Testes primeiro: `test/integration/delivered-moment.integration.ts` (CA3 vira o caso COM posição e ganha o
espelho SEM posição; janela de 90 dias, reenvio e fronteira do `effectiveSince` passam a mandar posição,
porque dependem da hora corrigida; chegada e devolução, com e sem posição) e
`test/trip-delivery-proof/occurred-at.contract.ts` (`resolveRecordedEventClock` com `hasLocation`: sem
posição devolve só a hora crua, mesmo com desvio plausível).

```text
VERMELHO (testes novos, código da T1.5)
apps/api-transportada$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/delivered-moment.integration.ts
  → 13 pass, 3 fail — entrega, chegada e devolução SEM posição: `expect(received).toBeNull()`
    (occurred_at gravado sem prova de lugar)

Implementação: `resolveRecordedEventClock` recebe `hasLocation`; sem posição devolve só `tappedAt`.
`document-outcome-steps.service.ts` (entrega e devolução) passa `report.location !== null`;
`report-stop-arrival.use-case.ts` (chegada) passa `input.location !== null`. Política da foto, esquema e
migration intocados.

VERDE
apps/api-transportada$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/delivered-moment.integration.ts
  → 16 pass, 0 fail, 0 skip (três execuções seguidas)
apps/api-transportada$ .../driver-score.integration.ts      → 10 pass, 0 fail
apps/api-transportada$ .../me-trip-departure.integration.ts → 12 pass, 0 fail
apps/api-transportada$ bun --env-file=../../.env.test test ./test/trip-delivery-proof.contract.test.ts ./test/driver-trip.contract.test.ts
  → 545 pass, 0 fail
apps/api-transportada$ bun run typecheck → exit 0
apps/api-transportada$ bun run lint      → exit 0 (--max-warnings=0)
apps/api-transportada$ bun --env-file=../../.env.test run test → 8689 pass, 23 skip, 0 fail (8712 testes, 192 arquivos); antes 8676/23
raiz$ bun run format:check → exit 0
```

Mutações (contrato puro `trip-delivery-proof` + integração `delivered-moment`):

| #   | Mutação                                                              | Resultado                  |
| --- | -------------------------------------------------------------------- | -------------------------- |
| 1   | ignorar a ausência de posição (volta ao comportamento da T1.5)       | pegou: 1 + 3 fail          |
| 2   | inverter a condição (`if (hasLocation) return tapped`)               | pegou: 2 + 8 fail          |
| 3   | chegada ignora a posição (`hasLocation: true` na chegada)            | pegou: 1 fail (integração) |
| 4   | entrega e devolução ignoram a posição (`hasLocation: true` no passo) | pegou: 2 fail (integração) |
| 5   | gravar o desvio mas não a hora (sem posição)                         | pegou: 2 + 5 fail          |

Todas restauradas; o verde acima é da árvore restaurada.

## T1.6 — o limite antifraude e a regra inquebrável registrados

Só documentação; nenhum código nem teste mudou.

- `docs/SECURITY.md`: entrada de 2026-10-03 "spec 234 — o relógio do aparelho vale mais para a nota",
  antes da entrada da spec 159. Registra a decisão do usuário, o que mudou na D3a da 159 T11 (o piso de
  `recebimento − missingAfterHours` deixa de valer para quem manda o desvio e tem posição na entrega), o
  limite honesto (relógio adulterado offline e `clockOffsetMs` forjável no corpo), a defesa que sobra
  (nunca futura +2 min, nunca com mais de 30 dias e a correção é descartada sem recusar o evento, foto no
  raio, sem posição o relógio não vale, cliente sem o desvio mantém o piso), as duas consequências aceitas
  (penalidade de "ausente" temporária; some o incentivo do prazo) e o achado fora do escopo: o
  `location.capturedAt` da entrega não tem limite e uma posição com 100 dias tira a entrega da janela de
  90 dias da nota.
- `docs/ai-context/api-transportada.md`: seção "O momento do evento do motorista (spec 234)" —
  `resolveOccurredAt`/`resolveRecordedEventClock`, os campos nos esquemas `.strict()`, a migration
  `20261002213734_delivered_moment_clock` (colunas e índice), `deliveredMomentSql` e os três pontos que a
  usam, `hasCorrectedClock` (D4/D4b) e `deliveryReceivedAt` (D5).
- `apps/api-transportada/CLAUDE.md`: um parágrafo `⚠️` depois do da nota do motorista, com a regra que
  não se negocia (momento só com posição e `corrected`; nunca recusa; leitura por `deliveredMomentSql`;
  API antes do app).
- `tasks.md`: T1.6 marcada.

Caminhos citados conferidos com `ls` (todos existem).

## Revisão R1/R2

Ajustes da revisão da Fase 1 (code-reviewer), commit A.

**R1 — a foto corrigida só vale com o evento também corrigido.** `hasCorrectedClock` olhava só a foto; o
`deliveredAt` do contexto pode ser o `captured_at` CRU (relógio do aparelho) quando o evento de entrega não
teve a correção aceita, e comparar foto corrigida com entrega crua inventa atraso (aparelho 2 h atrasado:
entrega em verdade − 2 h, foto em verdade + 5 min, diferença de 2 h 5 min, `late` sem atraso real).
`findDeliveryContext` devolve `isEventClockCorrected` (`occurred_at is not null` do evento de entrega) e o
caso de uso passa a exigir `occurred.kind === 'corrected' && (sem posição na entrega || evento corrigido)`.
Com posição e evento cru a foto segue a regra antiga (hora crua + piso). Sem posição, a D4b fica como estava.

**R2 — o desvio da linha da foto.** `clock_offset_ms` era gravado sempre que a flag era `corrected`, mas em
D4b o desvio julgou o recebimento, não a foto, e em recaptura o veredito gravado é a fusão com o anterior.
Agora só é gravado quando a correção foi USADA (flag efetiva e posição na entrega); nos demais casos, `null`.
O comentário de `trip.schema.ts` passou a dizer "o desvio que julgou esta foto, antes da fusão com a
anterior".

Testes primeiro (vermelho pelo motivo certo, `driver-trip`): 4 fail — evento cru com posição e foto
corrigida dava `late` (aparelho 2 h atrasado) e `on_time` recebida 30 h depois; D4b e evento cru gravavam o
desvio. Ajuste de MONTAGEM de cenário (nenhuma assertiva afrouxada): `buildRequiredWorld` do contrato
`delivery-proof-clock-corrected` passa a montar o evento corrigido por padrão (`isEventClockCorrected: true`),
e na integração `foto com relógio corrigido grava clock_offset_ms` a entrega passou a ser feita com posição e
hora corrigida (antes era sem posição, o que a D4b já desfaz). A fixture `delivery-proof-world` ganhou
`isEventClockCorrected` (padrão `false`).

```text
VERDE
apps/api-transportada$ bun --env-file=../../.env.test test ./test/driver-trip.contract.test.ts → 225 pass, 0 fail
apps/api-transportada$ .../trip-delivery-proof.contract.test.ts → 327 pass · fleet-domain → 152 pass · trip-schema → 150 pass, 0 fail
apps/api-transportada$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/delivered-moment.integration.ts
  → 18 pass, 0 fail, 0 skip (três execuções seguidas)
apps/api-transportada$ .../driver-score.integration.ts → 10 pass, 0 fail
apps/api-transportada$ bun run typecheck → exit 0 · bun run lint → exit 0
```

Mutações (restauradas; o verde acima é da árvore restaurada):

| #   | Mutação                                                          | Resultado                        |
| --- | ---------------------------------------------------------------- | -------------------------------- |
| 1   | remover a exigência do evento corrigido (`true`)                 | pegou: 3 fail (contrato)         |
| 2   | sempre gravar o desvio da foto (`occurred.kind === 'corrected'`) | pegou: 2 fail + 2 fail (integr.) |
| 3   | inverter `isEventClockCorrected` (`is null`)                     | pegou: 4 fail (integração)       |
| 4   | ignorar a posição ao gravar a auditoria (só `hasCorrectedClock`) | pegou: 1 fail (contrato)         |

## Revisão R3

**Defeito.** `z.iso.datetime()` aceita `0000-01-01T00:00:00Z`; o `tapped_at` cru era gravado e o Postgres
recusa o ano 0 (`22008`) → 500, e o app reenvia para sempre. Princípio: o relógio nunca recusa nem derruba o
evento. `toEventClock` (`me-trip.schema.ts`) agora omite o `tappedAt` de ano UTC menor que 1900
(`MINIMUM_TAPPED_AT_YEAR`); o desvio, se veio, segue (sem `tappedAt`, `resolveOccurredAt` trata como
`missing`). 1900 e 1970 continuam passando (aparelho com relógio zerado é o caso que a correção atende). O
`tappedAt` de `depart`/`cancel-departure` (spec 206) é obrigatório e tem esquema próprio: não foi tocado.

Testes primeiro (`test/driver-trip/clock-fields-schema.contract.ts`, por evento: arrive, deliver, return,
ocorrência nas duas formas):

```text
VERMELHO: bun --env-file=../../.env.test test ./test/driver-trip.contract.test.ts → 230 pass, 5 fail
  (tappedAt `0000-01-01` e `1899-12-31` chegavam ao resultado)
VERDE:    → 235 pass, 0 fail
apps/api-transportada$ .../integration/me-trip-departure.integration.ts → 12 pass, 0 fail, 0 skip
apps/api-transportada$ .../integration/delivered-moment.integration.ts  → 18 pass, 0 fail, 0 skip
apps/api-transportada$ bun run typecheck → exit 0 · bun run lint → exit 0
raiz$ bun run format:check → exit 0
```

| #   | Mutação                                     | Resultado      |
| --- | ------------------------------------------- | -------------- |
| 1   | nunca descartar (`true ? { tappedAt }`)     | pegou: 19 fail |
| 2   | piso em 1971 (derruba 1970)                 | pegou: 10 fail |
| 3   | `> 1900` em vez de `>= 1900` (derruba 1900) | pegou: 5 fail  |

Fora do pedido, registrado: `locationSchema.capturedAt` (`z.iso.datetime()`, a leitura do GPS que vai para
`trip_stop_events.captured_at`) tem a mesma forma do defeito — `0000-01-01` passaria o esquema. Não foi
alterado aqui; fica como achado.

## Revisão R4/R5

Só documentação e comentários; nenhuma instrução SQL, nenhum código de regra mudou.

- **R4a** O teto de ±365 dias saiu na T1.4b, mas ainda constava em `migration.sql`, `trip.schema.ts`, no
  contrato estático e no nome do teste de `trip-schema/delivered-moment.contract.ts`. Todos dizem agora: o
  desvio não tem teto no esquema (qualquer inteiro seguro; `resolveOccurredAt` descarta o absurdo) e é
  `bigint` porque `integer` estoura em ±24,8 dias. A migration não foi aplicada em lugar nenhum, e o
  contrato estático ignora linhas de comentário (`--`) ao comparar as instruções.
- **R4b** `plan.md` (`bigint`, e a flag com a exigência do R1), `tasks.md` (T1.5 `[x]`, T1.4b, T1.5b e
  R1–R5) e `spec.md` (ocorrência de nota e `proof/receiver` NÃO ganham os campos).
- **R4c** O índice antigo `coalesce(captured_at, recorded_at)` não serve "as outras leituras": o único uso
  restante é `drizzle-driver-field-report.repository.ts`, que lê `kind = 'arrived'` e não é atendido pelo
  índice parcial de `delivered`. Fica só para o rollback (a API velha precisa dele), a dropar numa migration
  futura depois de a API estabilizar — corrigido em `trip.schema.ts`, `migration.sql` e
  `delivered-moment.support.ts`, e registrado como pendência no fim do `plan.md`.
- **R4d** Lock: o `CREATE INDEX` sem `CONCURRENTLY` toma SHARE em `trip_stop_events`; a API em pé tem
  `statement_timeout` de 8 s, então passando disso o INSERT do motorista falha (`57014`) e o app reenvia —
  nada se perde. O comentário da migration diz isso e recomenda o deploy fora do horário de campo. Sem
  `lock_timeout` (decisão).
- **R5** `docs/SECURITY.md` (entrada de 2026-10-03): a frase "o veredito se reproduz" virou "a linha da foto
  guarda o desvio que julgou esta foto, antes da fusão com a anterior"; entrou a defesa do R1; e dois
  LIMITES ACEITOS, com cenário, marcados como decisão pendente do usuário — (1) assimetria da D4b e (2)
  desvio forjado empurra a entrega para trás. `docs/ai-context/api-transportada.md` ajustado ao R1/R2.

```text
raiz$ make migration-test → 116 pass, 0 fail
apps/api-transportada$ bun run db:generate --name tmp → {"status":"no_changes","dialect":"postgresql"}
apps/api-transportada$ bun --env-file=../../.env.test test ./test/trip-schema.contract.test.ts → 150 pass, 0 fail
apps/api-transportada$ bun --env-file=../../.env.test test ./test/database-migration.contract.test.ts → 76 pass, 0 fail
apps/api-transportada$ bun run typecheck → exit 0 · bun run lint → exit 0
raiz$ bun run format:check → exit 0
```

## T1.7 — deploy da API em staging confirmado (2026-10-02)

Run `37078098052`, commit `2f70e2460`: `conclusion=success`. Job `deploy-api` verde, com os passos
`Deploy API` e `Conferir migrations aplicadas` em `success` (a migration `delivered_moment_clock`
subiu pelo `preDeployCommand`); `deploy-client`, `deploy-frontend`, `deploy-driver` e
`mark-deployed` também verdes. Gates `integration-api (1..4)`, `integration-migration` e
`quality-app (api-transportada)` verdes na CI.

## T1.8 — GPS desligado pune em todo cliente (D4c)

Commits: `b6e43ce72` (contrato antes, vermelho) · `0234d784c` (implementação + integração) · este
(documentação e evidência).

**O sinal de canal.** `trip_stop_events.channel` (`src/database/trip.schema.ts:1175-1178`, `varchar(16)
not null default 'driver_app'`, CHECK `trip_stop_events_channel_check` e `channel <> 'office' or
on_behalf_of_driver_id is not null`, `:1317-1322`). Há um único escritor, `recordEvent`
(`drizzle-driver-field-report.repository.ts:784`), que grava `input.authorship.channel` — e a autoria
nasce de **como** a viagem foi achada (`deriveFieldAuthorship`, `field-trip-target.types.ts:78-90`):
`{ target }` só existe nas rotas do escritório e dá `office`; `{ driverId }` dá `driver_app` (ou
`whatsapp`, quando o localizador do WhatsApp diz). O motorista não escolhe o canal. Histórico sem a coluna
ficou `driver_app` pelo default, o que é verdade: antes da ADR-0067 não havia baixa do escritório.

- Motorista = `DRIVER_FIELD_CHANNELS` = `driver_app` + `whatsapp` (`trips/domain/trip-field-channel.constant.ts`).
  O WhatsApp **nunca** manda posição (`register-driver-flow-actions.ts:316`, `location: null`), então a foto
  sobre entrega do WhatsApp passa a ser `away`. Efeito prático na nota: nenhum — a nota só lê entrega
  `channel = 'driver_app'` (`drizzle-driver-score.repository.ts:154`, spec 159 T11 D2); muda o veredito
  gravado e exibido.
- `office` e `backoffice` não punem por falta de posição.

**Mudança.** `findDeliveryContext` seleciona `channel` e devolve `isDeliveryRecordedByDriver`; a porta e
`ClassifyProofPunctualityParams` ganham o campo **opcional** (ausente = regra anterior: só a D4b pune). Na
política, sem posição na entrega, `isAway` devolve `isDeliveryRecordedByDriver ?? hasCorrectedClock ===
true`. A referência de tempo não mudou (relógio alegado sem posição continua valendo o recebimento, também
na baixa do escritório). `lateRegistration` e `photoMode ≠ required` decidem antes da distância, como
antes. A penalidade é uma só por entrega (`late_and_away` pesa o mesmo `latePenaltyPoints`), e a fusão
`mergeProofPunctuality` segue pior-de-duas sem somar.

**Retroatividade: zero reescrita.** `classifyProofPunctuality` tem um único chamador
(`attach-delivery-proof.use-case.ts`), no anexo. A nota (`computeDriverScore` via
`DrizzleDriverScoreRepository.listDeliveries`) lê `trip_delivery_proofs.punctuality` gravada e nunca relê
posição para reclassificar. Nenhuma migration. Efeito só para frente: foto anexada depois da publicação
sobre entrega do motorista sem posição — inclusive a **substituta** de uma entrega antiga, que pela fusão
pior-de-duas leva o `away` para a linha (uma foto `on_time` antiga trocada depois vira `away`).

```text
ANTES
apps/api-transportada$ bun --env-file=../../.env.test test --timeout 120000
  → 8896 pass, 23 skip, 0 fail (8919 testes, 193 arquivos)

VERMELHO (contratos novos, código anterior — commit b6e43ce72)
apps/api-transportada$ bun test ./test/trip-delivery-proof.contract.test.ts ./test/driver-trip.contract.test.ts
  → 582 pass, 9 fail
    5× Expected "away"  Received "on_time"       (motorista sem posição, cliente antigo)
    1× Expected "late_and_away" Received "late"  (idem, foto fora da janela)
    2× Expected "on_time" Received "away"        (escritório + relógio corrigido)
    1× Expected "late"  Received "late_and_away" (escritório + relógio corrigido, 61 min)

VERDE
apps/api-transportada$ bun test ./test/trip-delivery-proof.contract.test.ts ./test/driver-trip.contract.test.ts
  → 591 pass, 0 fail
apps/api-transportada$ bun --env-file=../../.env.test test --timeout 120000
  → 8920 pass, 23 skip, 0 fail (8943 testes, 193 arquivos) — +24 (17 da política, 7 do caso de uso)
apps/api-transportada$ bun --env-file=../../.env.test test --timeout 120000 ./test/integration/delivery-proof-gps-off.integration.ts
  → 4 pass, 0 fail, 0 skip (Postgres do .env.test, 65432)
apps/api-transportada$ bun --env-file=../../.env.test test --timeout 120000 <8 arquivos tocados*>
  → 93 pass, 0 fail, 0 skip (174,7 s)
apps/api-transportada$ bun --env-file=../../.env.test run test:integration
  → 882 pass, 8 skip, 0 fail (890 testes, 154 arquivos, 1406 s, exit 0) — os 8 pulos são condicionais
    de arquivos que esta task não toca; a subsuíte tocada acima roda com 0 skip
apps/api-transportada$ bun run typecheck → exit 0 · bun run lint → exit 0 (--max-warnings=0)
raiz$ bun run format:check → exit 0
```

\* `delivery-proof-gps-off`, `delivered-moment`, `trip-field-office`, `me-trip`, `driver-score`,
`driver-delivery-proof-read`, `delivery-proofs-by-trip`, `event-location-stamp`.

Contratos: `test/trip-delivery-proof/punctuality-gps-off.contract.ts` (política: motorista sem posição com
cliente antigo e com relógio corrigido, escritório com e sem relógio, com posição no raio, foto sem
posição, `lateRegistration`, `photoMode` optional/off, e a regra anterior sem o canal);
`test/driver-trip/delivery-proof-clock-corrected.contract.ts` (caso de uso: o canal chega à política,
foto da mercadoria, substituta pontual de uma `away`); `test/integration/delivery-proof-gps-off.integration.ts`
(Postgres: app sem posição → `away`; app com posição → `on_time`; WhatsApp → `away`; baixa do escritório
sem canhoto, spec 223 → `on_time`). O fixture `delivery-proof-world.fixture.ts` só repassa o campo quando
informado (espalhamento condicional, sem parâmetro default que engula `undefined`).

Mutações (contrato `trip-delivery-proof` + `driver-trip`, e a integração nova), cada uma restaurada com
`git checkout` e conferida com `git diff --quiet`:

| #   | Mutação                                                         | Contrato | Integração |
| --- | --------------------------------------------------------------- | -------- | ---------- |
| M1  | inverte o canal no repositório (`!DRIVER_FIELD_CHANNELS.has`)   | 0 fail   | 4 fail     |
| M2  | tira a punição do cliente antigo (`(canal ?? true) && relógio`) | 6 fail   | 2 fail     |
| M3  | pune o escritório (`canal !== undefined \|\| relógio`)          | 6 fail   | 1 fail     |
| M4  | caso de uso não repassa o canal                                 | 4 fail   | 2 fail     |
| M5  | WhatsApp fora dos canais do motorista                           | 0 fail   | 1 fail     |
| M6  | repositório não informa o canal (o código antes da T1.8)        | 0 fail   | 4 fail     |
| M7  | sem o canal, a D4b some (`canal ?? false`)                      | 7 fail   | 0 fail     |

M1, M5 e M6 só a integração pega — o contrato usa dublê do repositório; é por isso que ela existe. M7 só o
contrato pega: o repositório real sempre informa o canal.

# Fase 2 — App: medir e mandar

Contagem de passes de `bun run --cwd apps/frontend-driver test` (script do package, nunca `bun test` cru):
**1048 pass / 0 fail antes** da fase, **1093 pass / 0 fail depois** (+45: 13 de `clock-offset.contract.ts`
e 32 de `event-clock-fields.contract.ts`; nenhum teste a menos, nenhum skip).

## T2.1 — contrato antes (commit `a220dc046`)

`test/driver-trip/clock-offset.contract.ts` (o desvio, o armazenamento, a medição pelo cliente) e
`test/driver-trip/event-clock-fields.contract.ts` (conjunto de `kind`, corpo, multipart, carimbo da fila,
drenagem), os dois registrados em `test/driver-trip.contract.test.ts`. Os contratos chamam `send`/`reportBody`
com um `fetch` capturado e leem o corpo (e o `FormData`); nenhum `toInclude` no texto-fonte.

Vermelho, em duas etapas:

```text
sem clockOffset.service.ts → "Cannot find module '../../src/modules/driver-trip/shared/clockOffset.service'"
                              120 pass, 1 fail, 1 error  (o módulo da feature não existe)
com um esqueleto neutro (compute → undefined, conjunto vazio, sem carimbo), só para ver as asserções:
                              948 pass, 23 fail — 16 × toBe, 7 × toEqual
  computeClockOffsetMs (4 de sinal/zero/inteiro), armazenamento, medição pelo Date (4), multipart (2),
  conjunto de kinds (2), reportBody com carimbo (2), fila (4), drenagem (3)
```

O esqueleto nunca foi commitado: o HEAD da T2.1 é vermelho por módulo ausente.

## T2.2 — implementação (commit `26c212a85`)

- `shared/clockOffset.service.ts` (novo): `computeClockOffsetMs` (servidor − aparelho, inteiro, `Date`
  ausente/ilegível não mede), `createClockOffsetStore` + o singleton `driverClockOffset` (só em memória),
  `CLOCK_FIELD_REPORT_KINDS` / `acceptsClockFields` / `buildClockFields` (a decisão de quais `kind` levam os
  campos mora aqui) e `toEventClockStamp` (item → carimbo).
- `driverTripClient.service.ts`: `request()` mede o `Date` de toda resposta `ok` contra o ponto médio do
  pedido (`recordClockOffset`); `send(report, stamp?)` e `reportBody(report, stamp?)` espalham `buildClockFields`
  em todo `case`, de modo que o conjunto é a única decisão; `attachProof` ganhou `clockOffsetMs` (texto no
  multipart, junto do `capturedAt` que já era a hora do toque); `stopOccurrencePhoto` leva o carimbo no reenvio
  da ocorrência (mesma rota `/stops/:id/occurrences`).
- `offlineQueue.service.ts` / `offlineAttachments.service.ts`: `QueuedReport.clockOffsetMs?` e
  `QueuedAttachment.clockOffsetMs?` carimbados na criação; a drenagem (`drainQueue`,
  `drainQueueWithAttachments`) entrega `toEventClockStamp(item)` ao `send`; a reconciliação do item recusado
  **mantém** o desvio (ela reconstrói o objeto campo a campo).
- `useDriverTrip.hook.ts`: lê `driverClockOffset.read()` ao enfileirar (quatro pontos) e ao criar o anexo, e
  repassa `stamp` e `clockOffsetMs` ao cliente.

```text
apps/frontend-driver$ bun run typecheck → exit 0 · bun run lint → exit 0
apps/frontend-driver$ bun run test → 1091 pass, 0 fail (1093 com os dois testes da T2.4)
```

## T2.3 — smoke Playwright (commit `3fde70d0e`)

Infra local presente (Keycloak em 58080, Chromium 1208, `.env` com a senha do `local-user`); rodou tudo, sem
pular nada:

```text
driver-app.smoke.spec.ts (VITE_SMOKE_AUTH_BYPASS=true, porta 53112) → 37 passed (33 de antes + 4 novos)
driver-service-worker.smoke.spec.ts → 2 passed
```

Os quatro testes novos: (1) com `Date` 1 h adiantado nas respostas, `arrive` e `deliver` levam `tappedAt`
(recente) e `clockOffsetMs` ≈ 3 600 000 (±15 s); (2) sem `Date`, os dois saem sem os campos; (3) o toque nasce
offline, antes de qualquer resposta, e o `Date` chega na mesma drenagem (resposta do `arrive`): o `deliver`
**continua sem os campos** — o carimbo é o da criação; (4) o multipart do `/proof` leva `clockOffsetMs` e
`capturedAt`. O dublê (`driver-trip-smoke.helper.ts`) ganhou `serverClockOffsetMs`/`setServerClockOffset` e
`formFields` (campos de texto do multipart).

⚠️ **Achado que o smoke provou: a API não expõe o `Date` ao navegador.** O `Date` não é um cabeçalho de
resposta liberado em chamada entre origens (`motorista.<zona>` → `api.<zona>`): o JavaScript só o lê se a
resposta trouxer `Access-Control-Expose-Headers: Date`. `apps/api-transportada/src/http/cors.service.ts`
(`applyCorsHeaders`) não o emite. O dublê do smoke o emite — e, sem essa linha, o teste (1) reprova:

```text
(helper sem 'access-control-expose-headers') → ✘ com resposta de Date, o corpo do deliver leva tappedAt…
    Expected: "number"  Received: "undefined"      (o app não mediu nada: o corpo sai sem os campos)
```

Em produção isso é **silencioso**: o app novo seguiria mandando o corpo sem os dois campos (comportamento de
hoje) e a spec inteira não faria efeito. Correção fora do escopo desta fase (a API não foi tocada): uma linha em
`applyCorsHeaders` + um caso em `test/cors.contract.test.ts`. **A T2.5 (publicar o app) não deve ir antes dela.**

## T2.4 — prova por mutação (commit `8af9abdab` traz os 2 testes que o M2b exigiu)

Cada mutante foi aplicado, o script `test` rodou, e o arquivo foi restaurado (`git status` limpo ao fim).

| #   | Regra                     | Mutante                                        | Reprova                                                                                                      |
| --- | ------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| M1  | sinal do desvio           | `aparelho − servidor`                          | 5: `computeClockOffsetMs` (atrasado, adiantado) e as 3 medições pelo cliente                                 |
| M2a | carimbar na criação       | `enqueueReport` não grava o desvio             | 3: `enqueueReport guarda o desvio`, `desvio zero fica gravado`, `o desvio do envio nunca troca o da criação` |
| M2b | …e não no envio           | `send` usa o último desvio medido pelo cliente | 2: `com carimbo, os campos são os do toque`, `sem carimbo… o desvio medido depois não entra`                 |
| M3a | conjunto de kinds         | `depart` entra no conjunto                     | 6: conjunto exato, `depart` leva os campos, `depart` com `tappedAt` próprio, sem desvio…                     |
| M3b | conjunto de kinds         | `return` sai do conjunto                       | 2: conjunto exato, kinds de fora                                                                             |
| M4  | ausência sem desvio       | `toEventClockStamp` devolve 0 sem desvio       | 2: `item antigo… sai sem carimbo`, `drainQueue também entrega o carimbo`                                     |
| M5  | só resposta `ok` mede     | mede também a recusada                         | 1: `resposta recusada pelo servidor não mede`                                                                |
| M6  | ponto médio               | usa só o início do pedido                      | 2: `lê o cabeçalho Date… ponto médio`, `o comprovante também mede`                                           |
| M7  | recusa não perde o desvio | a reconciliação do recusado o descarta         | 1: `o item recusado… guarda o desvio da criação`                                                             |
| M8  | multipart                 | `attachProof` não manda `clockOffsetMs`        | 2: `manda clockOffsetMs como texto inteiro`, `mantém o sinal e o zero`                                       |

A ligação do hook, que o contrato não alcança, é provada pelo smoke (mutante no hook, 3 testes novos rodados):

| #   | Mutante no `useDriverTrip.hook.ts`                                        | Reprova (smoke)                                           |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| M9  | o relato não leva `clockOffsetMs: driverClockOffset.read()` ao enfileirar | `com resposta de Date, o corpo do deliver leva tappedAt…` |
| M10 | o anexo nasce sem `clockOffsetMs`                                         | `o comprovante leva o desvio… no multipart`               |
| M11 | a drenagem não repassa `stamp` a `client.send`                            | `com resposta de Date, o corpo do deliver leva tappedAt…` |
| M12 | `sendAttachment` não repassa o desvio do anexo                            | `o comprovante leva o desvio… no multipart`               |
| M13 | o hook carimba com o último desvio medido, no envio                       | `o desvio é o de quando o toque nasceu…`                  |

```text
raiz$ bun run format:check → exit 0
```

## T2.4b — a API expõe o `Date` entre origens (achado do smoke da Fase 2)

`Date` não é cabeçalho de resposta liberado entre origens (só os "CORS-safelisted": `Cache-Control`,
`Content-Language`, `Content-Length`, `Content-Type`, `Expires`, `Last-Modified`, `Pragma`). Sem
`Access-Control-Expose-Headers: Date` o JavaScript do `motorista.<zona>` não lê o relógio da API, o
app nunca mede o desvio e a nota segue medindo a chegada — **sem nenhum erro visível**. O dublê do
smoke emitia o cabeçalho e escondia isso.

- Contrato `test/cors.contract.test.ts`: resposta real à origem confiada expõe `Date`; origem não
  confiada, ausência de `Origin` e preflight não expõem. Vermelho: `Received: null`.
- Correção: `CORS_EXPOSE_HEADERS` em `api.constant.ts`, aplicada em `applyCorsHeaders` dentro da
  mesma condição que já devolve `allow-origin`.
- Mutação: expor sem checar a origem derrubou 2 testes; restaurado, 96 pass / 0 fail.

## Fase 2 — ajustes da revisão (opus)

A API passou a expor o `Date` (`9bd3cfe67`, `CORS_EXPOSE_HEADERS`), o que fecha o achado da T2.3.

- **Item 1 (§10):** `send`, `reportBody` e os callbacks de `drainQueue`/`drainQueueWithAttachments` recebem um
  objeto `StampedReport` (`{ report, stamp }`), com `stamp: EventClockStamp | undefined` **obrigatório** — esquecê-lo
  é erro de tipo. Todos os chamadores e testes foram atualizados (37 chamadas em 11 contratos, mais os callbacks de
  drenagem). Mutante: o hook chamando `client.send({ report })` não compila
  (`TS2345 … not assignable to … { report; stamp }`).
- **Item 2 (L3):** `depart`, `cancelDeparture` e `dispatch` não espalham mais `clockFields` em `reportBody`; dois
  testes novos provam que o corpo deles é só o de sempre mesmo com carimbo.
- **Item 3 (L5):** `Number.isFinite(deviceNowMs)` saiu de `computeClockOffsetMs`; nenhum teste dependia dele.
- **Item 4 (L1):** `MAX_CLOCK_SAMPLE_ROUND_TRIP_MS = 5000`; `recordClockOffset` descarta a amostra quando a ida e a
  volta passam disso (3 testes novos: ≤ 5 s mede, > 5 s não substitui, o teto declarado).
- **Item 5 (L7):** `apps/api-transportada/CLAUDE.md` cita `access-control-expose-headers: Date`.

`bun run test` do frontend-driver: 1093 → **1098 pass**, 0 fail. Smoke: `driver-app.smoke.spec.ts` 37 passed,
`driver-service-worker.smoke.spec.ts` 2 passed.

| #   | Mutante                                                     | Resultado                                                                 |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| N1  | sem o teto de ida e volta                                   | reprova `pedido que levou mais de 5 s não substitui a medição anterior`   |
| N2  | teto exclusivo (`>=`)                                       | reprova `pedido que levou até 5 s ainda mede (o limite é inclusivo)`      |
| N3  | teto virou 60 s                                             | reprova o limite inclusivo e `o teto de 5 s é o declarado`                |
| N4  | `depart` no conjunto + spread de volta depois do `tappedAt` | 7 reprovam (conjunto exato, `depart` leva os campos, `tappedAt` próprio…) |
| N5  | a drenagem de anexos não entrega o carimbo                  | 2 reprovam (carimbo do toque, `drainQueueWithAttachments`)                |
| N6  | `drainQueue` não entrega o carimbo                          | reprova `drainQueue (a fila simples) também entrega o carimbo`            |
| N7  | o hook manda `{ report }` sem `stamp`                       | `tsc` falha (TS2345), antes de qualquer teste                             |

## T2.6 — o desvio guardado no aparelho por 24 h (D7)

Caso-alvo: abre com sinal às 7h (o `Date` mede), a aba é descartada, reabre às 10h **sem sinal** e a entrega sai
com `tappedAt`/`clockOffsetMs`.

- **Onde:** `localStorage` (`transportada.driver.clock-offset.v1`, `{ offsetMs, measuredAt }`), no
  `clockOffset.service.ts`. Escolhi `localStorage` e não IndexedDB porque a leitura é síncrona — o hook lê o
  desvio ao enfileirar, e uma leitura assíncrona deixaria a primeira entrega do boot offline sem ele (precedente
  do `occurrenceTypesCache`). Por isso o hook **não mudou**: `driverClockOffset.read()` já enxerga o valor
  persistido no primeiro toque.
- **Regras:** `createClockOffsetStore({ now, storage })`; `read()` devolve `undefined` se o registro é malformado
  (forma, `offsetMs` não inteiro), se passou de `CLOCK_OFFSET_MAX_AGE_MS` (24 h, limite inclusivo) ou se
  `measuredAt` está no futuro do relógio atual; `write()` substitui, persiste e tolera `localStorage` que lança
  (cota, modo privado). Do aparelho, não da conta: sem `subHash`, e o "Sair" não o apaga (não identifica ninguém
  e some sozinho em 24 h). O teto de 5 s de ida e volta continua: pedido lento não grava nem no aparelho.

Contagem de `bun run test` do frontend-driver: 1098 → **1124 pass**, 0 fail (+26 em
`clock-offset-persistence.contract.ts`).

Vermelho (commit `2105f4d01`): sem as constantes, "Export named 'CLOCK_OFFSET_STORAGE_KEY' not found"; só com as
constantes e sem comportamento, 995 pass / 9 fail (persistência entre sessões ×4, limite inclusivo, expiração da
mesma sessão, futuro, medição do cliente gravada, boot offline com o desvio de antes).

Smoke (`driver-app.smoke.spec.ts`, porta 53112): 38 passed (37 + o novo "o desvio medido antes de recarregar sem
sinal ainda vai no deliver feito offline"); `driver-service-worker.smoke.spec.ts`: 2 passed.

| #   | Regra                    | Mutante                                           | Reprova                                                          |
| --- | ------------------------ | ------------------------------------------------- | ---------------------------------------------------------------- |
| P1  | persiste                 | a medição não é gravada                           | 7 (sobrevive à sessão, instante guardado…)                       |
| P2  | limite de 24 h inclusivo | `<` no lugar de `<=`                              | `com exatas 24 h ainda vale`                                     |
| P3  | 24 h                     | validade de 48 h                                  | `o teto declarado é 24 h`                                        |
| P4  | expira                   | sem expiração                                     | `1 ms além das 24 h…`, `a mesma sessão aberta por mais de 24 h…` |
| P5  | futuro                   | aceita `measuredAt` no futuro                     | `…no futuro do relógio atual (relógio mexido), não`              |
| P6a | forma                    | aceita `offsetMs` fracionário                     | `offsetMs fracionário (a API recusa)`                            |
| P6b | forma                    | aceita qualquer registro                          | 3 (null, texto, fracionário)                                     |
| P7  | lê do aparelho           | a leitura só olha a memória                       | 7                                                                |
| P8a | leitura tolerante        | `getItem`/`JSON.parse` sem `try`                  | 2 (JSON inválido, armazenamento que lança)                       |
| P8b | escrita tolerante        | `setItem` sem `try`                               | `armazenamento que lança na escrita…`                            |
| P9  | teto de 5 s              | amostra lenta volta a ser gravada                 | 2 (D1 e D7)                                                      |
| S1  | liga o aparelho ao app   | o singleton `driverClockOffset` sem armazenamento | smoke `o desvio medido antes de recarregar…`                     |
