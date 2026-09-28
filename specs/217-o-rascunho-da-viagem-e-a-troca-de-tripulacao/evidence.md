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

## T103 — O status derivado, provado no banco (🧠 `opus`)

`apps/api-transportada/test/integration/trip-crew-update.integration.ts` (já registrado na lista
explícita do `package.json`) ganhou quatro casos contra Postgres, além dos dois da 216, sobre
`DrizzleTripRepository.updateCrew` — que é o escritor real do status sob o lock:

- `awaiting_crew` + motorista e veículo → `trips.status = 'draft'`, `trips.vehicle_id` preenchido e
  uma linha em `trip_drivers`;
- `awaiting_crew` + **só veículo** → continua `awaiting_crew`, `vehicle_id` preenchido,
  `trip_drivers` vazio;
- `awaiting_crew` + **só motorista** → continua `awaiting_crew`, `vehicle_id` nulo, `trip_drivers`
  com a linha;
- a regressão: viagem `draft` + `crew: []` e `vehicleId: null` → volta para `awaiting_crew`,
  `trip_drivers` vazio, `vehicle_id` nulo.

Nos quatro, `expectStatusDerivedFromStoredCrew` reconfere a invariante de D1 contra o banco: o status
gravado é exatamente `resolveCrewStatus` do par que ficou nas linhas — nunca `draft` sem as duas
coisas.

O estado inicial `awaiting_crew` nasce da fixture (`createAwaitingCrewTrip`), com um `UPDATE` direto,
no molde do `route_planned` do teste da 216. **A criação por HTTP de viagem sem tripulação é a RF2** —
entra na T201/T202, e só então esses casos poderão partir de `POST /trips`.

```
$ bun --env-file=../../.env.test test ./test/integration/trip-crew-update.integration.ts \
    --timeout 120000
 6 pass / 0 fail / 27 expect() calls   # 0 skip: o --env-file é o que faz a suíte rodar em vez de pular
```

**Prova de que os casos novos prendem** (a T102 já havia entrado, então o verde sozinho não provaria
nada): mutação no repositório trocando o par resolvido pelo par cego de antes da 217 —
`crew: { hasDriver: true, hasVehicle: true }`, que é a promoção incondicional que o defeito 3
descreve:

```
 3 pass / 3 fail        # os três casos de par incompleto acusam "Expected: awaiting_crew / Received: draft"
```

Fonte restaurada em seguida (`git status` só com o arquivo de teste modificado).

## T104 — Não precisou de código

A T104 previa fazer `updateCrew` "parar de gravar `transition.nextStatus` cego". **Isso já havia
acontecido na T102**: `drizzle-trip.repository.ts:311-316` chama `checkTripTransition` com
`crew: { hasDriver: input.crew.length > 0, hasVehicle: input.vehicleId !== null }` — o par **resolvido**,
já sob o `SELECT … FOR NO KEY UPDATE` — e a linha 342 grava
`transition.outcome === 'applied' ? transition.nextStatus : tripRow.status`. Com `checkDefineCrew`
derivando o desfecho de `resolveCrewStatus`, esse `nextStatus` deixou de ser cego: ele **é** o status
do par.

Nenhuma mudança em `trip.use-case.ts` nem no repositório foi feita nesta task, deliberadamente. A
prova de que a ausência de código é a resposta certa, e não omissão, é a mutação registrada na T103:
reintroduzido o par cego, três dos quatro casos novos falham na hora.

```
$ bun run typecheck
$ bunx tsc --noEmit        # sem saída: limpo

$ bun --env-file=../../.env.test test test/trip-domain.contract.test.ts \
    test/trip-http.contract.test.ts test/trip-application.contract.test.ts --timeout 120000
 588 pass / 0 fail / 2055 expect() calls
```

## T105 — `allowed-actions` não precisou de regra nova (`sonnet` no `tasks.md`, feito com `opus`)

Teste novo em `test/trip-allowed-actions/policy.contract.ts`: viagem `awaiting_crew` recebe
`['cancel']` e **não** recebe `planRoute`. É a prova da RF6 — a visibilidade de "Planejar rota" sai da
máquina de estados, não de uma condição de tripulação na política de ações.

Nenhuma linha de produção mudou nesta task, o que é o ponto: a D1 tornou a RF6 consequência.

```
$ bun --env-file=../../.env.test test test/trip-allowed-actions.contract.test.ts --timeout 120000
 23 pass / 0 fail / 41 expect() calls
```

**Provado por mutação**, porque teste que nasce verde precisa mostrar que morde: removendo a guarda de
`awaiting_crew` de `checkTripTransition` (a que a 216 instalou), a asserção quebra —
`expect(awaitingCrew.trip).not.toContain('planRoute')` recebe `+1`, `22 pass / 1 fail`. Fonte
restaurada e `git status src/` limpo antes do commit.

## T201 — Teste de contrato: a criação aceita par incompleto (`sonnet`)

Dois níveis, porque a fixture HTTP genérica (`createTripHttpFixture`) devolve um `TRIP_DETAIL`
enlatado — o encanamento (schema) é provado ali, e a derivação real do status (par → status) só é
provada onde o caso de uso de verdade roda:

- `test/trip-http/create.contract.ts`: novos testes provam que `POST /trips` aceita `driverIds: []`
  e `vehicleId` ausente (sozinhos e juntos), com `201` e repassando exatamente o corpo ao caso de uso
  — nenhuma regressão do par completo. O teste antigo `'refuses an empty crew...'` (400 para
  `driverIds: []`) foi **substituído**, porque RF2 revoga exatamente essa trava; a metade que ainda
  vale (campo desconhecido → 400) ficou em `'rejects an unknown field'`.
- `test/trip-application/trip-use-case.contract.ts`: novo `describe` (`creates a trip deriving the
status from the crew composition`) exercita `TripUseCase.create` de verdade contra um repositório
  falso, cobrindo os quatro cenários do spec.md (linha 195-207): nenhum dos dois → `awaiting_crew`;
  só motorista → `awaiting_crew`; só veículo → `awaiting_crew`; os dois → `draft` (sem regressão). Um
  quinto caso prova que `vehicleId` **informado e não encontrado** continua `TripVehicleNotFoundError`
  — só a ausência do campo é "sem veículo ainda".

**Vermelho registrado antes do T202** (o teste da aplicação nem chegava a rodar — o próprio tipo
recusava `vehicleId: undefined` em `CreateTripInput`, que ainda era `string` obrigatório):

```
$ bun run typecheck
test/trip-application/trip-use-case.contract.ts(...): Argument of type '{ vehicleId: undefined; ... }'
  is not assignable to parameter of type 'CreateTripInput'.
```

## T202 — Implementação: o status de nascimento é o do par (`sonnet`)

Três pontos, RF2/RF3/D1:

- `trip-request.schema.ts`: `createTripSchema.driverIds` perdeu o `.min(1)` (agora `.default([])`);
  `vehicleId` virou `.optional()`. Comentário antigo que citava "mínimo 1" (T006/spec.md linha 66,
  já superado pela 217) reescrito.
- `trip.use-case.ts`: `CreateTripInput.vehicleId` virou `string | undefined`; `create()` **parou de
  lançar `TripVehicleNotFoundError` quando o veículo é `null`** (import removido) — `vehicle === null
? null : vehicle.id` desce ao repositório. `resolveTripVehicleForCreation` (herdada da 216) já
  distinguia "ausente" de "informado e não encontrado"; só a segunda continua erro.
- `drizzle-trip.repository.ts`: `create()` ganhou a mesma derivação de `updateCrew` —
  `resolveCrewStatus({ hasDriver: crew.length > 0, hasVehicle: vehicleId !== null })` — e o status
  derivado (não mais `'draft'` fixo) vai para o `INSERT trips.status` **e** para `recordTripCreation`.
  "Uma função, duas leitoras" (D1) agora vale para nascimento e troca.

```
$ bun run typecheck
$ bunx tsc --noEmit        # sem saída: limpo

$ bun --env-file=../../.env.test test test/trip-domain.contract.test.ts \
    test/trip-allowed-actions.contract.test.ts test/trip-application.contract.test.ts \
    test/trip-http.contract.test.ts --timeout 120000
 620 pass / 0 fail / 2112 expect() calls

$ bun --env-file=../../.env.test test ./test/integration/trip-crew-update.integration.ts --timeout 120000
 6 pass / 0 fail / 27 expect() calls
```

O vermelho do T201 fechou verde: os quatro cenários de RF2/RF3 e o quinto (veículo informado e não
encontrado) passam sem invenção — é exatamente a leitura de `resolveTripVehicleForCreation` +
`resolveCrewStatus` já existentes.
