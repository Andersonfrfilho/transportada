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

## T203 — Regressão da 081, e um achado que a Fase 3 precisa saber (`sonnet`)

**A prova pedida:** `driverIds: []` continua criando a viagem certa a partir do par da sugestão
multi-veículo (081 RF-5: "par sem motorista... legítimo: metade da frota escalada, metade não").
Arquivo novo `test/routing-application/trip-composer-adapter.contract.ts` (registrado em
`test/routing-application.contract.test.ts`), exercitando `createTripComposer` com o `TripUseCase`
real e um repositório falso: `driverId: null` continua criando a viagem (mesma tradução
`driverIds: []` de sempre, `trip-composer.adapter.ts:78`, inalterada nesta spec) e, agora, ela nasce
**`awaiting_crew`** em vez de `draft` fixo — consequência direta de D1 pelo mesmo caminho de produção
que a sugestão multi-veículo usa.

```
$ bun run typecheck
$ bunx tsc --noEmit        # sem saída: limpo

$ bun --env-file=../../.env.test test test/routing-application.contract.test.ts --timeout 120000
 79 pass / 0 fail / 145 expect() calls
```

**⚠️ Achado, fora do escopo da Fase 2, registrado para a Fase 3 decidir.** Ao rodar
`bun run test:integration` inteiro para conferir a regressão de verdade contra Postgres, 10 dos 721
testes quebraram — todos causados por T202, nenhum por acaso:

1. `test/integration/trip-repository.integration.ts` e `test/integration/trip-lifecycle.integration.ts`
   (4 casos): helpers de seed que criavam viagem com `crew: []` **só por conveniência** (não testavam
   tripulação) e assumiam `draft` fixo. Corrigidos **nesta task**, dentro do escopo: `secondTrip` do
   primeiro passou a esperar `awaiting_crew` (é o que ela de fato é, par incompleto); `seedMinimalCompany`
   do segundo passou a semear um motorista, porque essas três suítes testam `close`/`cancel`/
   `batch-status` a partir de uma viagem `draft` de verdade, não a derivação do par.
2. **`test/integration/multi-vehicle-suggestion.integration.ts` (6 casos) — não corrigido, e é o
   achado real.** É o mesmo caminho de produção do T203 acima (`createTripComposer` → `TripUseCase`
   real → Postgres), só que **de ponta a ponta**: depois de criar, vincular e reordenar, o aceite
   sempre chama `planRoute` (`multi-vehicle-suggestion.use-case.ts:262`). Com a viagem nascendo
   `awaiting_crew` (par sem motorista, só veículo), `planRoute` agora recusa com 409
   `TRIP_CREW_NOT_DEFINED` (`checkTripTransition` bloqueia **toda** ação que não seja `defineCrew`/
   `cancel` em `awaiting_crew`, `trip-state.policy.ts:296-298`) — e o aceite inteiro lança.
   - **Isto é uma contradição real entre D1 e a 081**, não um teste desatualizado: a 081 (RF-5,
     "casos extremos") decidiu por escrito que grupo sem motorista é legítimo e chega a `route_planned`
     através deste mesmo fluxo. D1 decidiu, também por escrito (RF6/cenário 4), que `awaiting_crew`
     nunca oferece `planRoute`. As duas são corretas isoladamente; nunca foram conferidas juntas.
   - **Não corrigi**: mudar `checkTripTransition`, o gate de `planRoute`, ou o fluxo de aceite
     (pular `planRoute` quando incompleto? exigir motorista no aceite daqui pra frente? recongelar
     depois que o motorista for definido?) é decisão de arquitetura sobre estado já despachável —
     exatamente o que a Fase 3 (marcada `opus` inteira no `tasks.md`) existe para resolver, e "trocar
     o seed para sempre ter motorista" esconderia a regressão em vez de a registrar.
   - Arquivo deixado **vermelho de propósito** (6 falhas), com este parágrafo como registro. A T301
     (teste de contrato da Fase 3) e a decisão de quem revisar a Fase 3 precisam ler esta seção antes
     de tocar em `checkTripTransition`/`planRoute`/`multi-vehicle-suggestion.use-case.ts`.

```
$ bun --env-file=../../.env.test test ./test/integration/trip-repository.integration.ts \
    ./test/integration/trip-lifecycle.integration.ts --timeout 120000
 5 pass / 0 fail / 83 expect() calls

$ bun --env-file=../../.env.test run test:integration
 704 pass / 7 skip / 10 fail / 3993 expect() calls   # antes da correção acima
# depois de corrigir trip-repository/trip-lifecycle: os mesmos 10 caem para 6, todos em
# multi-vehicle-suggestion.integration.ts (não corrigido, ver acima)
```

Contrato e domínio inteiros (`bun --env-file=../../.env.test test`, sem filtro) seguem 100% verdes:
`7957 pass / 23 skip / 0 fail / 26093 expect() calls` — as 10 quebras são só de integração contra
Postgres, e 4 delas já fecharam.

## T204 — O aceite de sugestão desemboca no rascunho (🧠 `opus`)

Task que não estava no plano. Nasceu da T203: rodando a integração inteira, seis testes do aceite
multi-veículo ficaram vermelhos com `409 TRIP_CREW_NOT_DEFINED` disparado dentro de
`plan-trip-route.use-case.ts:116`. Conflito real entre a 081 RF-5 (grupo sem motorista é legítimo) e a
D1 desta spec (`awaiting_crew` não planeja rota) — **criado por esta spec**, que escreveu a task de
regressão da 081 pensando só no status de nascimento e não no passo seguinte do aceite.

Vermelho reproduzido por execução própria antes de tratar o relatório do executor como verdade:

```
$ bun --env-file=../../.env.test test ./test/integration/multi-vehicle-suggestion.integration.ts
 1 pass / 6 fail / 9 expect() calls
  status: 409, reason: "TRIP_CREW_NOT_DEFINED"
  at planTripRoute (src/trips/application/plan-trip-route.use-case.ts:116:11)
```

Decisão do dono do produto (D10): o rascunho tem que poder existir sem motorista e sem veículo, e o
aceite desemboca nele. `multi-vehicle-suggestion.use-case.ts` passou a planejar rota só quando
`resolveCrewStatus({ hasDriver: group.driverId !== null, hasVehicle: true }) === 'draft'` — a mesma
função do nascimento e da troca, terceira leitora da mesma regra.

A integração do aceite ficou mais forte do que era: além do status, passou a provar que
`planned_route` e `planned_toll` ficam nulos, ou seja, que a viagem é rascunho de verdade e não uma
`awaiting_crew` com rota velha pendurada.

```
$ bun run typecheck                                    # limpo
$ bun --env-file=../../.env.test test ./test/integration/multi-vehicle-suggestion.integration.ts
 7 pass / 0 fail / 40 expect() calls
```

O seed do teste não tem `driverId` em lugar nenhum (`grep driverId` → zero ocorrências): os grupos
nascem sem motorista, então `awaiting_crew` é o estado correto, não uma expectativa afrouxada para o
teste passar.

## T302 + T307 (implementação) + T309 — a troca vale até `route_planned` (🧠 `opus`)

Três tasks num commit porque o tipo as amarrou: trocar a assinatura de `checkTripTransition` deixa o
typecheck vermelho até que os dois chamadores passem `vehicleChanged`. Separá-las daria um commit que
não compila.

**O typecheck fez o trabalho de busca.** Ao remover `tripCrewAlreadyDefined`, ele apontou seis lugares,
incluindo dois mapas de mensagem do WhatsApp (`whatsapp-driver-flow.constant.ts:82`,
`whatsapp-operator-flow.constant.ts:111`) que uma busca por "crew" não teria achado. Todos passaram a
`TRIP_SEPARATION_STARTED`, com texto que diz o motivo real.

**Onde cada decisão foi gravada:**

- `isCrewSwappable(tripStatus)` — a janela da troca numa função só (D2/D6). `checkDefineCrew` a usa
  para recusar e `resolveTripAllowedActions` para oferecer: oferecer e recusar não podem divergir.
- `resolveNextCrewStatus` — o par decide, e o roteiro congelado só sobrevive se o veículo não mudou
  (D3-ter).
- `trip.use-case.ts:updateCrew` — a checagem prévia compara o veículo **pedido** com o da viagem,
  normalizando `null` dos dois lados: pedir troca sem veículo numa viagem que tem um é trocar o
  veículo (para nenhum). `hasRoute` aqui é aproximado pelo status, e o comentário diz por quê:
  `TripDetail` não expõe o carimbo do congelamento, e para `defineCrew` o bloqueio não depende de
  `hasRoute` — só o status resultante, que quem grava é a checagem sob lock.
- `drizzle-trip.repository.ts:updateCrew` — sob o lock, lê `vehicle_id` e `planned_route_frozen_at` do
  banco. É esta a decisão que vale sob concorrência.
- `trip-allowed-actions.policy.ts` — `defineCrew` entra **por fora** do filtro genérico, porque para
  ela `unchanged` também é "pode": trocar a tripulação de uma `draft` não muda o status, e copiar o
  filtro esconderia o botão na viagem mais comum.

**Testes da 216 que mudaram de verdade, não de expectativa:** o contrato do caso de uso afirmava
"recusa a troca depois do roteiro planejado" — comportamento que a D2 reverteu de propósito. Virou dois
testes: a troca **passa** em `route_planned`, e a recusa passou a ser a da separação, sem tocar no
repositório. Mesma coisa no contrato HTTP e na grade de `trip-state.contract.ts`.

```
$ bun run typecheck                                    # limpo
$ bun --env-file=../../.env.test test test/trip-domain.contract.test.ts \
    test/trip-http.contract.test.ts test/trip-allowed-actions.contract.test.ts \
    test/trip-application.contract.test.ts --timeout 120000
 628 pass / 0 fail / 2138 expect() calls
```

### ⚠️ O que **não** foi provado aqui, e não vou fingir que foi

O teste de integração da T307 (trocar só o motorista de uma viagem `route_planned` e conferir no banco
que `planned_route`, `planned_toll` e os carimbos ficam intactos) **está escrito e não rodou**. O
Postgres de teste local ficou sem slot de conexão — `PostgresError: sorry, too many clients already`,
`errno 53300` — depois de uma execução das 135 suítes de integração numa máquina com load 14. Nesse
estado nem `psql` entra, e 8 de 8 casos do arquivo falham por conexão, não por asserção. Reiniciar o
container foi barrado pelo classificador de permissões.

Lição registrada, porque já custou tempo antes: **a corrida completa de integração local, com banco
compartilhado e máquina carregada, não é evidência.** As execuções dirigidas valem (6 pass em
crew-update antes disso, 7 pass no aceite multi-veículo, 628 contratos agora). A prova da T307 sai na
CI, que tem banco dedicado, ou localmente depois de liberar as conexões.
