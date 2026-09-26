# Evidence — Spec 205 (o registro tardio pesa como foto atrasada)

Sessão de 2026-09-25/26, branch `work/driver-app`, worktree `pensive-borg-f59971`.

## T1 — tolerância do painel (antes de implementar, vista falhar)

```
$ bun test ./test/trip/late-registration-tolerance.contract.ts      # apps/frontend-transportada
(fail) linha do tempo tolera lateRegistration > aceita o item com lateRegistration booleano
(fail) comprovante tolera lateRegistration > aceita lateRegistration e receiverDocument mascarado
 6 pass
 2 fail
```

Depois de `hasKeys` com `lateRegistration` (e `receiverDocument`, que já saía da API desde a spec
082 e fazia o validador de chave exata recusar a lista inteira) opcionais:

```
$ bun test ./test/trip/late-registration-tolerance.contract.ts ./test/trip/timeline.contract.ts
 20 pass
 0 fail
```

## T2 — contratos da API (antes de implementar, vistos falhar)

```
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof/late-registration.contract.ts
 5 pass
 15 fail
```

As 15 falhas: a política sem `lateRegistration`, os três parsers recusando o campo (schema
`.strict()`), as rotas sem repassá-lo, o comprovante sem gravar o fato nem classificar `late`, o evento
sem o fato e a leitura do comprovante sem o campo. As 5 que passaram antes são as que provam que nada
mudou sem o campo (foto na hora continua `on_time`, foto opcional `not_required`, replay pela
`attachmentKey`, replay pela `Idempotency-Key`).

Durante a implementação, o parser do `/deliver` virou função própria (`parseDocumentDeliveryRequest`)
para a chegada (`/arrive`, que usa o mesmo corpo) continuar recusando o campo. O contrato ganhou esse
caso: 21 testes no total.

```
$ bun --env-file=../../.env.test test ./test/integration/me-trip.integration.ts -t "spec 205"
TypeError: Object.entries requires that input parameter not be null or undefined   # coluna inexistente
 0 pass
 1 fail
```

## T3 — migration

- `drizzle/20260926003822_late_registration/`: `migration.sql` (duas `ADD COLUMN` booleanas, `DEFAULT false NOT NULL`), `rollback.sql` (com a checagem de `ROW_COUNT`) e `snapshot.json` com
  `prevIds = da872ef3…`, encadeado depois da `20260926002743_delivery_proof_received_by` da spec 193.
  A primeira geração (`20260926001939`) tinha timestamp anterior ao da 193, que foi commitada no
  meio: foi apagada e gerada de novo depois dela. O `snapshot.json` da 193 no working tree, que tinha
  sido reencadeado nela, voltou ao blob do HEAD.
- `bun --env-file=../../.env run db:generate` → `{"status":"no_changes"}`.
- `make migration-test` (com as duas migrations, a da 193 e esta) → `111 pass, 0 fail`.
- `rollback.sql` provado num banco descartável: depois do migrate, as colunas existem em
  `trip_delivery_proofs` e `trip_stop_events`; depois do rollback, `[]` e 0 linha no journal; o
  migrate seguinte reaplica as duas.

## T6 — a última baixa sem "Cheguei" (D6, achado da revisão da 206)

Teste antes, visto falhar: `me-trip.integration.ts` › "a última baixa da parada sem chegada fecha a
parada com a chegada preenchida" — parada 1 com entrega tardia e devolução tardia por último,
parada 2 com a última entrega sem o campo, nenhuma com chegada.

```
$ bun --env-file=../../.env.test test ./test/integration/me-trip.integration.ts -t "sem chegada"
PostgresError: new row for relation "trip_stops" violates check constraint
"trip_stops_completed_requires_arrived_check"
 0 pass
 1 fail
```

Depois de `completeStopIfSettled` preencher a chegada vazia em todo canal:

```
$ bun --env-file=../../.env.test test ./test/integration/me-trip.integration.ts --timeout 120000
 11 pass
 0 fail
```

## T5 — gates (depois de implementar)

```
$ bun --env-file=../../.env.test test ./test/trip-delivery-proof/late-registration.contract.ts
 21 pass
 0 fail
$ bun --env-file=../../.env.test test ./test/integration/me-trip.integration.ts -t "spec 205"
 1 pass
 0 fail

# apps/api-transportada — contrato (descoberta padrão, 184 arquivos)
$ bun --env-file=../../.env.test test --timeout 120000
 7481 pass
 23 skip
 0 fail

# apps/api-transportada — integração, num Postgres 18 nativo descartável (127.0.0.1:65433,
# DRIZZLE_TEST_DATABASE_URL): o do Docker (65432) estava com outra sessão rodando a mesma suíte ao
# mesmo tempo, e a rodada ali deu 27 timeouts de 5 s em suítes que esta spec não toca
$ DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres \
    bun --env-file=../../.env.test run test:integration
 639 pass
 0 fail
Ran 639 tests across 116 files. [459.13s]

# raiz
$ bun run typecheck     → exit 0
$ bun run lint          → exit 0

# apps/frontend-transportada
$ bun run test          → 5358 pass, 0 fail  ·  test:hooks 54 pass, 0 fail
```

Os números acima são da rodada final, depois do D6 e com o trabalho de outras sessões na mesma
árvore. O commit sai por índice privado a partir do HEAD, só com os blocos desta spec; na árvore
extraída desse índice, o typecheck só acusa `test/trip-delivery-proof/received-by.contract.ts`, o
contrato vermelho da spec 193 T3.2 que já está no HEAD. Nessa mesma árvore: `late-registration`,
`driver-trip`, `trip-application` e `database-migration` dão 345 pass, 4 skip e 0 fail; o
`trip.contract.test.ts` do painel dá 1702 pass e 0 fail.
