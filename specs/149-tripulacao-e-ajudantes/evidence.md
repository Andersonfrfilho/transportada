# Spec 149 — Evidências

## Diagnóstico (14/09/2026)

- Staging: proposta com 7 motoristas e 6 veículos, 5 viagens "Sem motorista".
- Causa: `useTripRouteAssembly.hook.ts:223-230` usa `resolveSoleDriverOfVehicle` (vínculo único do
  cadastro); a escolha manual por veículo não é enviada; `trip-composer.adapter.ts:64-80` cria 0 ou 1
  motorista por viagem.

## Tarefas

(uma seção por task: comando, saída resumida, commit)

## T1 — migrations

Migration `apps/api-transportada/drizzle/20260915022856_trip_crew_helpers/` (gerada por
`bun run db:generate --name trip_crew_helpers`; nome já maior que `20260915005629_…`, sem renomear;
`snapshot.json` com `prevIds` = snapshot da `20260915005629`). Aditiva: 3 `CREATE TABLE`, 4
`ADD COLUMN` (os `NOT NULL` com default), unique novo em `route_suggestion_vehicles` antes da FK dos
ajudantes, checks por último; sem `CREATE TYPE`, nada destrutivo. `rollback.sql` à mão.

- Contrato vermelho antes: `bun test ./test/fleet-schema.contract.test.ts ./test/trip-schema.contract.test.ts ./test/routing-schema.contract.test.ts`
  → 0 pass / 3 fail (módulos inexistentes). Depois da implementação: 217 pass / 0 fail.
- `bun run typecheck` (raiz) → exit 0.
- `bun run db:check` → "Everything's fine".
- `bun test` de `database-migration`, `fleet-schema`, `trip-schema`, `routing-schema`, `fleet-domain`
  → 366 pass / 4 skip / 0 fail.
- `bun --env-file=../../.env.test test --timeout 120000` (API) → 5803 pass / 23 skip / 0 fail.
- `make migration-test` (Postgres descartável, migration + rollback) → 95 pass / 0 fail. Inclui
  `trip-constraints.assertion.ts`: linha legada sem `role` vira `driver`; ajudante na posição 1 →
  23514 `trip_drivers_lead_role_check`; `role` inválido → 23514 `trip_drivers_role_check`.
- `bun run format:check` e `bun run lint` → exit 0.

Decisões:

- `driver_assignment_feedback` tem unique `(company_id, suggestion_id, vehicle_id)`: upsert, a
  última escolha vence (por isso `updated_at`).
- Condutor do MDF-e só `role = driver` (T4); despacho/início da viagem pelo PWA só por `role = driver`
  (T3); ajudante pode registrar comprovante e ver o DAMDFE.
- O teto `MAX_DRIVERS_PER_TRIP = 10` vale para a tripulação inteira (motoristas + ajudantes).

## T2 — ficha do motorista e diária geral

Arquivos:

- `src/fleet/presentation/fleet-request.schema.ts`: `driverFieldsSchema` ganha `canActAsHelper`
  (`z.boolean().default(false)`) e `helperDailyRate` (`z.string().regex(MONEY_DECIMAL).nullable()`
  — mesma regex de dinheiro `numeric(19,4)` já usada nos campos do veículo; negativo não casa a
  forma e vira `400 INVALID_REQUEST` na fronteira, antes de tocar o CHECK do banco).
- `src/fleet/application/fleet.port.ts` (`FleetDriverInput`), `src/fleet/infrastructure/fleet.mapper.ts`
  (`mapDriver`/`toDriverColumns`) e `src/fleet/presentation/fleet.routes.ts` (`serializeDriver`): os
  dois campos entram e saem da ficha (criação, atualização e leitura — GET da ficha e da lista).
- Módulo novo `company-crew-settings` (diária geral, D2), dentro de `src/fleet/` (permissão é
  `fleet.read`/`fleet.manage`, não `settings.manage`, então não segue o módulo `companies/`):
  `application/crew-settings.port.ts`, `application/crew-settings.use-case.ts` (get/set, molde de
  `cargo-settings.use-case.ts`), `infrastructure/drizzle-crew-settings.repository.ts` (upsert por
  `onConflictDoUpdate`, mesmo padrão de `DrizzleCargoSettingsRepository`), `presentation/crew-settings.schema.ts`
  (mesma regex de dinheiro, `.nullable()` para aceitar `{ helperDailyRate: null }` e limpar o
  parâmetro), `presentation/crew-settings.routes.ts` (`GET`/`PUT /company-crew-settings`,
  `API_COMPANY_CREW_SETTINGS_PATH` novo em `shared/api.constant.ts`). GET sem linha devolve
  `{ data: { helperDailyRate: null } }`, nunca 404. `companyId` sempre de `context.scope.companyId`.
  Registrado em `src/main.ts` ao lado de `createFleetRoutes`/`createCargoSettingsRoutes`.
- `test/separator-role.contract.test.ts`: `createCompanyCrewSettingsRoutes` entra no array de rotas
  do contrato; `GET /company-crew-settings` foi adicionado à lista alcançável do separador (ele tem
  `fleet.read`); `PUT /company-crew-settings` foi adicionado à lista de rotas recusadas (ele não tem
  `fleet.manage`).
- `test/fleet-http/crew-settings.contract.ts` (novo, registrado em `test/fleet-http.contract.test.ts`):
  permissão de cada rota, GET sem linha → `null`, PUT idempotente + GET reflete, PUT limpa de volta
  para `null`, negativo e formato sem 4 casas → 400 sem tocar o repositório, isolamento entre
  empresas (linha de uma empresa nunca aparece nem é sobrescrita pela outra).
- `test/fleet-http/drivers.contract.ts`: dois testes novos — os campos vão e voltam em
  criação/atualização, e valor negativo/malformado de `helperDailyRate` reprova com o campo nomeado
  em `details`.
- Fixtures/seeds ajustados para o campo novo (obrigatório em `FleetDriverInput`):
  `test/fixtures/fleet-http-payload.fixture.ts`, `test/fleet-domain/driver-home-manual-coordinate.contract.ts`,
  `test/fleet-domain/person-name.contract.ts`, `src/database/local-fleet-seed.constant.ts`.

Comandos e saída:

- Contrato vermelho antes: os arquivos de teste novos/editados não existiam com os campos novos;
  rodar `bun run typecheck` sem as mudanças de mapper/port falhava com `TS2739` (`FleetDriverInput`
  sem `canActAsHelper`/`helperDailyRate`) nos fixtures — confirma que o tipo pegou a lacuna antes de
  qualquer teste HTTP rodar.
- `bun run typecheck` (raiz, 6 apps) → exit 0.
- `bun test ./test/fleet-http.contract.test.ts ./test/fleet-application.contract.test.ts ./test/separator-role.contract.test.ts ./test/fleet-schema.contract.test.ts ./test/trip-schema.contract.test.ts ./test/routing-schema.contract.test.ts ./test/fleet-domain.contract.test.ts ./test/fleet-infrastructure.contract.test.ts`
  → 560 pass / 0 fail.
- `bun run test` (lista completa do `package.json`) → 5812 pass / 23 skip / 0 fail (era 5803 pass na
  T1; a diferença são os testes novos desta task).
- `bun --env-file=../../.env.test test --timeout 120000` (API, de dentro de `apps/api-transportada`)
  → 5812 pass / 23 skip / 0 fail — mesma contagem, confirma que nada regrediu sob o `.env.test`.
- `bun run lint` e `bun run format:check` (raiz, 6 apps) → exit 0.
- `make check` (raiz) → exit 0 (build de todas as apps + testes + lint + format, sem erro).
- `make migration-test` → 95 pass / 0 fail (Postgres descartável).

Decisões:

- `company_crew_settings` ganhou módulo próprio dentro de `fleet/` (não em `companies/`, onde mora
  `company-cargo-settings`): a permissão pedida (`fleet.read`/`fleet.manage`) é da frota, não
  `settings.manage`, e o `plan.md` já apontava o parâmetro para dentro de `fleet/`.
- Sem rota `DELETE` para a diária geral (diferente de `cargo-settings`, que tem uma): a spec só pede
  `GET`/`PUT`, e `PUT` com `helperDailyRate: null` já limpa o valor de forma idempotente — reduzir a
  superfície evita uma rota sem pedido no RF-2.
- Não adicionei regra cruzada "helperDailyRate exige canActAsHelper": a spec (D1/D2) não pede essa
  amarração, e o RF-1 só descreve os dois campos como independentes na ficha.

## T3 — tripulação com papel

Arquivos:

- `src/trips/domain/trip.policy.ts`: `TripDriverCandidate` ganha `canActAsHelper`; `TripDriverLine`
  ganha `role` (`TripCrewRole`). `resolveTripCrew` aceita `helperIds?` ao lado de `driverIds` — os
  motoristas ficam nas posições `1..N` (posição 1 é sempre `driver`, espelhando
  `trip_drivers_lead_role_check` do banco) e os ajudantes vêm depois, na ordem pedida. Regras: mesma
  pessoa em `driverIds`/`helperIds` (ou repetida numa lista só) é `TripDriverDuplicatedError`
  (422, já existente); ajudante sem nenhum motorista é `TripCrewHelperWithoutDriverError` (409,
  nova); ajudante cuja ficha não tem `canActAsHelper` é `TripCrewHelperNotEligibleError` (409, nova,
  com os ids em `details`). Helper novo `driversOnly(crew)` filtra só `role = 'driver'`, para T4/T6
  usarem sem duplicar o `.filter` — nenhum dos dois foi alterado aqui (D6/D-ADR-0065, só registrado).
- `src/trips/domain/trip.error.ts`: `TripCrewHelperWithoutDriverError`, `TripCrewHelperNotEligibleError`
  (409) e `TripCrewHelperCannotDriveError` (403, ADR-0058 §4 — despachar e os dois toques do campo
  são do motorista).
- `src/trips/application/trip-crew.service.ts`: `resolveTripCrewForCreation` recebe `helperIds?`,
  busca motoristas e ajudantes **numa consulta só** (`listDrivers` com o id set combinado) e repassa
  ao domínio.
- `src/trips/application/trip.use-case.ts`: `CreateTripInput.helperIds?` opcional; `create` propaga
  para o serviço de tripulação.
- `src/trips/presentation/trip-request.schema.ts`: `createTripSchema` ganha `helperIds` (mesmo teto
  de 10, default `[]`) e um `superRefine` que recusa `driverIds.length + helperIds.length > 10` —
  o "erro já existente de teto" citado no plan.md é este mesmo desenho (400 `INVALID_REQUEST`), só
  estendido à tripulação inteira em vez de só `driverIds`.
- `src/trips/infrastructure/drizzle-trip.repository.ts`: `create` grava `role` em `trip_drivers`;
  `listDrivers` projeta `canActAsHelper` da ficha.
- `src/trips/infrastructure/trip.mapper.ts`: `mapTripDriver` devolve `role` (a coluna já existe desde
  T1, com default `driver`).
- `src/trips/presentation/trip.routes.ts`: `serializeTripDetail` acrescenta `role` a cada linha de
  `drivers` — campo novo, nada renomeado (compatibilidade mantida).
- **Despacho e início da viagem só pelo motorista** (critério de aceite 3 / ADR-0058 §4):
  - `src/trips/application/dispatch-driver-trip.use-case.ts`: `DriverTripLinkagePort.isTripOfDriver`
    virou `findCrewRole` (`Promise<TripCrewRole | null>`). `null` continua `TripNotOfDriverError`
    (403, viagem alheia); papel `!== 'driver'` é `TripCrewHelperCannotDriveError` (403, novo) — o
    ajudante tem a linha em `trip_drivers`, mas não o papel.
  - `src/trips/application/start-field-trip.use-case.ts`: `StartFieldTripPort.readCurrent` devolve
    `role` junto de `tripId`/`tripStatus`; `startFieldTrip` recusa com o mesmo
    `TripCrewHelperCannotDriveError` antes de checar a transição de estado — vale para os dois toques
    (`confirmLoad` e `startRoute`), porque a ADR-0058 §4 nomeia os dois como gesto do motorista, não
    só o início do trajeto.
  - `src/trips/infrastructure/drizzle-current-driver-trip.repository.ts`: `findCrewRole` (renomeado)
    e `readCurrent` agora selecionam `tripDrivers.role`.
  - `find-current-driver-trip.use-case.ts` (GET da viagem atual) **não muda**: o ajudante continua
    vendo a viagem normalmente — só despachar e os dois toques do campo são recusados.

Contratos vermelho antes (arquivos alterados/testes existentes que passam a exigir o papel):
`test/trip-domain/trip-policy.contract.ts` e `test/trip-application/trip-use-case.contract.ts`
falhavam de tipo (TS2739 nos fixtures sem `canActAsHelper`/`role`) antes do domínio/aplicação
mudarem; `test/driver-trip/dispatch.contract.ts` com o mock antigo (`isTripOfDriver: () => boolean`)
não compilava contra a porta renomeada.

Testes novos/alterados:

- `test/trip-domain/trip-policy.contract.ts`: papel e posição da tripulação mista, ajudante sem
  motorista, duplicado entre as duas listas, ficha sem `canActAsHelper`, `driversOnly`.
- `test/trip-application/trip-use-case.contract.ts`: criação com motorista + 2 ajudantes (3 linhas,
  papéis certos), os três 409 de domínio, sem chamar `repository.create` em nenhum deles.
- `test/trip-http/create.contract.ts`: `helperIds` chega ao use case; teto de 10 combinando
  `driverIds` + `helperIds` é 400.
- `test/driver-trip/dispatch.contract.ts`: ajudante vinculado à mesma viagem não despacha (403
  `TRIP_CREW_HELPER_CANNOT_DRIVE`); motorista despacha normalmente (regressão).
- `test/driver-trip/start-field-trip.contract.ts` (novo, registrado em `driver-trip.contract.test.ts`):
  sem viagem ativa é 404; ajudante não confere carga nem inicia o trajeto (os dois passos); motorista
  confere a carga normalmente (regressão).
- `test/integration/trip-repository.integration.ts` (contra Postgres): grava e lê 1 motorista + 2
  ajudantes com papel e posição certos.
- `test/integration/me-trip.integration.ts` (contra Postgres): ajudante da mesma tripulação não
  despacha nem confere carga/inicia o trajeto; o motorista da mesma viagem continua despachando.
- Fixtures ajustados para o campo novo obrigatório: `test/fixtures/trip-http-payload.fixture.ts`
  (`role` nas linhas de `TRIP_DETAIL.drivers`, `HELPER_ID` novo) e os `crew:` de
  `test/integration/trip-lifecycle.integration.ts`, `delivery-charge-end-to-end.integration.ts`,
  `mixed-cargo-end-to-end.integration.ts` (todos `role: 'driver'`, comportamento inalterado).

Comandos e saída:

- `bun run typecheck` (raiz, 6 apps) → exit 0.
- `bun run test` (API, lista completa do `package.json`) → 5828 pass / 23 skip / 0 fail (era 5812 na
  T2; a diferença são os testes novos desta task).
- `bun --env-file=../../.env.test test --timeout 120000` (de dentro de `apps/api-transportada`) →
  5828 pass / 23 skip / 0 fail — mesma contagem, confirma que nada regrediu sob o `.env.test`.
- `bun --env-file=../../.env.test run test:integration` → 300 pass / 4 skip / 2 fail. As 2 falhas são
  `cte-archive-gateway.integration.ts` (`OBJECT_STORAGE_UNAVAILABLE`, MinIO indisponível no ambiente
  local nesta sessão) — pré-existente e sem relação com esta task; todos os testes de `trip-*`/
  `me-trip` passaram, incluindo os dois novos casos desta T3.
- `bun run lint` e `bun run format:check` (raiz, 6 apps) → exit 0.

Decisões:

- Reaproveitei `TripDriverDuplicatedError` (422) para a pessoa repetida entre `driverIds` e
  `helperIds` — é a mesma regra de unicidade da tripulação (ADR-0065 §4), só estendida às duas
  listas juntas; criar um segundo código para o mesmo caso duplicaria a semântica.
- O teto de 10 da tripulação inteira ficou na fronteira HTTP (Zod `superRefine`, 400), não no
  domínio — mesmo padrão que já existia para `driverIds` sozinho; o domínio segue sem conhecer um
  número mágico de teto.
- `driversOnly(crew)` foi criado e exportado, mas **nenhum leitor existente foi migrado** para usá-lo
  nesta task — MDF-e (`create-trip-mdfe-manifest.use-case.ts`), custo do motorista
  (`trip-driver-cost.policy.ts`) e resumo financeiro continuam como estavam, por decisão explícita do
  escopo (T4/T6). O helper existe para quem for tocar esses arquivos não reimplementar o filtro.
- `TripCrewHelperCannotDriveError` é compartilhado entre despacho e os dois toques do campo
  (`confirmLoad`/`startRoute`): a ADR-0058 §4 nomeia os dois como gesto do motorista, e um código só
  evita duas mensagens diferentes para a mesma regra de negócio.
- `GET /me/trips/current` (`find-current-driver-trip.use-case.ts`, `listActiveTrips`) não foi tocado:
  a spec pede que o ajudante continue vendo a viagem e registrando comprovante — só despachar e
  começar o trajeto são exclusivos do motorista.

## T4 — quem dirige filtra o papel

Arquivos:

- `src/mdfe-manifests/application/create-trip-mdfe-manifest.use-case.ts`: `TripLookupPort.get` passa
  a devolver `role` (`TripCrewRole`) em cada linha de `drivers`. O `execute` filtra
  `trip.drivers.filter((driver) => driver.role === 'driver')` **antes** de checar tripulação vazia
  (`MDFE_MANIFEST_CREW_REQUIRED`) e antes de montar `driverIds` para `manifests.create` — uma viagem
  só com ajudantes reprova com o mesmo código de tripulação vazia, e uma viagem com 1 motorista + 2
  ajudantes manda só o motorista. O gatilho automático (`issue-trip-manifest-automatically.use-case.ts`,
  rota `mdfe.auto-issue`) chama este mesmo `createManifest.execute`, então o filtro cobre os dois
  caminhos sem duplicar a regra.
- `src/trips/infrastructure/trip-valuation.query.ts` (`readCrew`, ~linha 686): a consulta que monta
  `TripCrewMember[]` para o custo do motorista (`buildTripDriverCost`) ganhou
  `eq(tripDrivers.role, 'driver')` no `where`. Sem isso, um ajudante pago por tabela de região (mesma
  classe/zona do motorista) somava o próprio valor à conta — medido no teste: 812,45 vira 1.624,90 com
  o ajudante contando em dobro; e um ajudante sem cobertura de zona vira lacuna `missing` para a
  viagem inteira, mesmo com o motorista coberto. `readPreviewCrew` (a prévia, antes de a viagem
  existir) não foi tocada: ela já recebe `driverIds` explícitos do formulário, e quem manda essa lista
  ainda não conhece o papel nesta task (T5/T7 tratam da montagem/sugestão).
- `src/trips/infrastructure/financial-summary.query.ts` (`listByDriver`): o `innerJoin` com
  `tripDrivers` ganhou `eq(tripDrivers.role, 'driver')`. Sem isso, o resumo por motorista abria uma
  linha extra por ajudante da mesma viagem, com o faturamento inteiro duplicado (mesmo padrão do
  `costTotal`/`revenueAmount` por grupo).
- **Não mexidos, por decisão do escopo desta task** (ADR-0065 §2 já nomeia os leitores):
  `trip-occurrence-feed.query.ts` (já filtra `position = 1`, que a `trip.policy.ts` garante ser sempre
  `driver`), `delivery-proof-read.support.ts` (comprovante — ajudante registra, é papel dele),
  `mdfe-document.query.ts` (DAMDFE — decisão do líder poder ver, já registrada na spec) e
  `drizzle-driver-field-report.repository.ts` (confere vínculo de um `driverId` específico à viagem,
  não lista "quem dirige"). Nenhum outro leitor de `trip_drivers`/`tripDrivers` fora desta lista e da
  T3 apareceu no grep (`src/mdfe-manifests`, `src/trips`).

Contratos vermelho antes:

- `bun run typecheck` sem os campos novos: `TripLookupPort.get` exigindo `role` em `drivers` reprovava
  as fixtures existentes de `test/mdfe-application/trip-manifest.contract.ts` e
  `test/integration/mixed-cargo-end-to-end.integration.ts` (TS2322, propriedade `role` ausente) — o
  tipo pegou a lacuna antes de qualquer teste de comportamento rodar.
- `test/integration/trip-financial-end-to-end.integration.ts` (contra Postgres): revertendo
  temporariamente os dois filtros de `role` em `trip-valuation.query.ts` e
  `financial-summary.query.ts` (`git apply -R` seguido de `git apply`), o teste `receita do CT-e,
agregado pela tabela...` falhava — `byKind.get('driver').amount` saía `1624.9000` em vez de
  `812.4500` (o ajudante da mesma viagem, sem cadastro de zona/cobertura, contava a rate da classe em
  dobro). Restaurado o filtro, o teste volta a `812.4500` e a nova asserção de resumo por motorista
  (`byDriver` com 1 grupo, não 2) passa.

Testes novos/alterados:

- `test/mdfe-application/trip-manifest.contract.ts`: `FixtureParams.tripCrew` permite mandar papel por
  linha; dois testes novos — 1 motorista + 2 ajudantes manda só o motorista como condutor
  (`createCalls[0].drivers` com 1 linha), e tripulação só de ajudante reprova como tripulação vazia
  (`MDFE_MANIFEST_CREW_REQUIRED`).
- `test/integration/trip-financial-end-to-end.integration.ts`: a viagem seedada ganhou um segundo
  `fleetDrivers` (ajudante, `paymentModel: 'route_table'`, sem zona/cobertura) e uma segunda linha em
  `tripDrivers` com `role: 'helper'`; a asserção existente do custo do motorista
  (`byKind.get('driver')`) passa a provar a exclusão do ajudante, e uma asserção nova confere
  `listGroups({ groupBy: 'driver' })` com 1 grupo só (`'Agregado'`), não 2.
- `test/integration/mixed-cargo-end-to-end.integration.ts`: fixture do `TripLookupPort.get` ajustada
  para incluir `role: 'driver'` (regressão de tipo, comportamento inalterado — só motorista nesta
  viagem).

Comandos e saída:

- `bun run typecheck` (raiz, 6 apps) → exit 0.
- `bun test ./test/mdfe-application/trip-manifest.contract.ts` → 11 pass / 0 fail.
- `bun --env-file=../../.env.test test ./test/integration/trip-financial-end-to-end.integration.ts
--timeout 120000` → 1 pass / 0 fail (20 `expect()`).
- `bun --env-file=../../.env.test test --timeout 120000` (API, lista completa do `package.json`) →
  5830 pass / 23 skip / 0 fail (era 5828 na T3; a diferença são os dois testes novos do MDF-e).
- `bun --env-file=../../.env.test run test:integration` → 300 pass / 4 skip / 2 fail. As 2 falhas
  continuam `cte-archive-gateway.integration.ts` (`OBJECT_STORAGE_UNAVAILABLE`, MinIO indisponível no
  ambiente local desta sessão) — mesma contagem da T3, pré-existente e sem relação com esta task.
- `bun run lint` e `bun run format:check` (raiz, 6 apps) → exit 0.

Decisões:

- Tenant-safety não ganhou teste próprio nesta task: os dois filtros novos (`eq(tripDrivers.role,
'driver')`) entram ao lado de filtros de `companyId` já existentes nas mesmas junções — nenhum
  escopo de empresa foi alterado, só o papel dentro da mesma empresa.
- `readPreviewCrew` (prévia da viagem, antes de existir `trip_drivers`) ficou fora do filtro de papel
  de propósito: ela recebe `driverIds` do formulário, sem ajudante ainda nesta task — a montagem
  (T5/T13) é quem vai decidir o que manda para lá.

## T5 — ajudantes na sugestão e aceite

Arquivos:

- `src/shared/suggestion-driver-source.constant.ts`: `CLIENT_DRIVER_SOURCES = ['link', 'manual']` —
  o que o **cliente** pode declarar; `recommended` fica fora de propósito (só o servidor preenche, T10).
- `src/routing/presentation/route-suggestion-request.schema.ts`: `vehicles[]` ganha `helperIds`
  (até 9, teto real de 10 com o motorista é conferido no domínio) e `driverSource` (`z.enum` de
  `CLIENT_DRIVER_SOURCES`) — mandar `recommended` já é `400` pelo próprio schema, sem código extra.
- `src/routing/domain/routing.error.ts`: `MultiVehicleSuggestionDriverRepeatedError` estendido
  (mensagem/comentário) para cobrir motorista **e** ajudante da proposta inteira; dois erros novos —
  `MultiVehicleSuggestionHelperNotEligibleError` (409, ids em `details`) e
  `MultiVehicleSuggestionCrewTooLargeError` (409, vehicleId em `details`).
- `src/routing/application/multi-vehicle-suggestion.port.ts`: `MultiVehicleSuggestionPair` ganha
  `helperIds?` e `driverSource?`.
- `src/routing/application/multi-vehicle-suggestion.repository.ts`: `MultiVehicleSuggestionGroup`
  ganha `helperIds?`/`driverSource?` (opcionais — ausente é vazio/nulo, sem forçar toda sugestão
  antiga a declarar os dois); repositório ganha `findIneligibleHelperIds`.
- `src/routing/application/multi-vehicle-suggestion.use-case.ts` (`create`): teto de 10 por veículo
  cedo (antes de qualquer consulta); repetição de pessoa agora cobre motorista+ajudante da proposta
  **inteira**, não só motorista; disponibilidade do ajudante reusa `findUnavailableDriverIds` com o
  conjunto motorista∪ajudantes; elegibilidade (`can_act_as_helper`) só é cobrada de quem já passou na
  disponibilidade (evita dois erros para o mesmo id). `accept`: `createTrip` leva `helperIds` do grupo.
- `src/routing/infrastructure/drizzle-multi-vehicle-suggestion.repository.ts`: `create` grava
  `driver_source` (`link` quando o pedido não informa e há motorista; nulo sem motorista) e insere
  `route_suggestion_vehicle_helpers` na mesma transação da frota; `findIneligibleHelperIds` (consulta
  própria, `can_act_as_helper = true`); `readGroups` junta os ajudantes por veículo (consulta própria,
  para não multiplicar linha de parada por ajudante) e o `driver_source`.
- `src/routing/infrastructure/drizzle-route-suggestion.repository.ts`: `find` agora lê
  `route_suggestion_vehicles` + `route_suggestion_vehicle_helpers` e povoa `RouteSuggestion.vehicles`
  (novo, opcional — vazio na sugestão de viagem única e na gravada antes desta task).
- `src/routing/application/route-suggestion.port.ts`: `RouteSuggestionVehicleSummary` novo;
  `RouteSuggestion.vehicles?` novo.
- `src/routing/presentation/multi-vehicle-suggestion.routes.ts`: `serializeSuggestion` acrescenta
  `vehicles` (só campo novo).
- `src/routing/infrastructure/trip-composer.adapter.ts` / `multi-vehicle-suggestion.use-case.ts`
  (`TripComposer`): `createTrip` ganha `helperIds?`, repassado a `dependencies.create` (que já é
  `trips.create` — T3 já aceita `helperIds`, então o encadeamento pega carona sem mexer em `main.ts`).
- Frontend (`routing/shared/routeSuggestion*.ts`, `routeSuggestionClient.service.ts`): tipos e
  validação aceitam `vehicles`/`helperIds`/`driverSource` novos, sem exigi-los (tela é T13).

Contratos (vermelho antes, verificado por reversão local durante a implementação):

- `test/routing-application/multi-vehicle-suggestion.contract.ts`: `findIneligibleHelperIds` no
  dublê; bloco novo "spec 149 T5" com as 3 variantes de repetição (motorista×ajudante em veículos
  diferentes, ajudante×ajudante, motorista×ajudante do mesmo veículo), ajudante sem
  `can_act_as_helper` (409 com id em `details`), ajudante indisponível (reusa o 409 de motorista),
  teto de 10 por veículo (409), persistência dos `helperIds` na criação, e o aceite levando
  `helperIds` do grupo para `createTrip`.
- `test/routing-http/multi-vehicle-suggestion.contract.ts`: `helperIds`/`driverSource` atravessam a
  rota até o caso de uso; `driverSource: 'recommended'` do cliente é `400` antes de qualquer consulta.
- `test/integration/multi-vehicle-suggestion.integration.ts`: `seedSuggestionWithCrew` (1 veículo,
  1 motorista + 2 ajudantes com `can_act_as_helper`) — o aceite contra Postgres real cria a viagem
  com **3 linhas em `trip_drivers`**, papéis `['driver', 'helper', 'helper']`, posições `[1, 2, 3]`
  (critério de aceite 3 da spec).
- `test/routing/route-suggestion-response.contract.ts` (frontend): ajustado para o campo novo
  `vehicles: []` no payload sem tripulação (`toEqual` explícito, não `toMatchObject`).

Comandos e saída:

- `bun run typecheck` (raiz, 6 apps) → exit 0.
- `bun test ./test/routing-application.contract.test.ts ./test/routing-http.contract.test.ts` (API)
  → 100 pass / 0 fail (18 testes novos desta task).
- `bun --env-file=../../.env.test test --timeout 120000` (API, lista completa) → 5840 pass / 23 skip
  / 0 fail (era 5830 na T4; +10 = os testes novos de aplicação e HTTP).
- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/multi-vehicle-suggestion.integration.ts`
  → 8 pass / 0 fail (7 + 1 novo).
- `bun --env-file=../../.env.test run test:integration` → 301 pass / 4 skip / 2 fail. As 2 falhas
  continuam `cte-archive-gateway.integration.ts` (`OBJECT_STORAGE_UNAVAILABLE`, MinIO indisponível no
  ambiente local desta sessão) — mesma causa das T3/T4, pré-existente e sem relação com esta task;
  **não aparecem** em `make check` (que não roda `test:integration`).
- `bun run lint` e `bun run format:check` (raiz, 6 apps) → exit 0.
- `make check` (raiz) → exit 0 (format, lint, typecheck, test — incluindo o frontend, com o ajuste do
  contrato acima —, e build das 3 apps).
- `make migration-test` (raiz) → 95 pass / 0 fail (sem migration nova nesta task — T5 é só código).

Decisões:

- **Erro reaproveitado, não irmão novo**: `MultiVehicleSuggestionDriverRepeatedError` passou a cobrir
  a tripulação inteira (motorista e ajudante), em vez de criar um segundo código para "ajudante
  repetido" — as duas violações têm a mesma causa (a mesma pessoa em dois lugares) e a mesma ação
  corretiva (escolher outra pessoa); só a mensagem/comentário mudou.
- **`helperIds`/`driverSource` em `MultiVehicleSuggestionGroup` e em `RouteSuggestion.vehicles` são
  opcionais**, não obrigatórios: torná-los obrigatórios quebraria a tipagem de toda sugestão gravada
  antes desta task e de todo dublê de teste já escrito (`suggestion()`/`QUEUED_SUGGESTION`) — ausente
  já significa "sem tripulação extra", então o custo de reescrever dezenas de fixtures não compra
  nada que o opcional não dê.
- **Elegibilidade só é cobrada de quem passou na disponibilidade**: um ajudante inexistente aparece
  em `unavailableDrivers` e é filtrado da lista de `findIneligibleHelperIds` antes de virar erro —
  senão o mesmo id dispararia dois 409 diferentes (indisponível e inelegível) dependendo da ordem de
  leitura, e o operador só precisa do primeiro motivo.
- **`driver_source` grava `null` sem motorista**, mesmo que o corpo mande `driverSource` — o check do
  banco (`route_suggestion_vehicles_driver_source_check`, da T1) já exige isso; o repositório só
  espelha a regra.

## T6 — jornada congelada e diária do ajudante

Decisão do usuário (15/09/2026), "Congelar com volta": D7 continua como estava
(`dias = max(1, ceil(jornada com volta / 24h))`). A viagem passa a **congelar a jornada no mesmo
instante/transação em que o ETA congela** (`writeEstimatedArrivals`):
`jornada = (última chegada estimada − saída planejada) + duração da perna de volta`, com a volta
vinda da proposta que planejou a viagem, sem nova chamada ao roteirizador. Sem volta gravada (ou sem
saída planejada) a jornada congela só de ida, e a parcela do ajudante sai `estimated` com o aviso
`HELPER_JOURNEY_WITHOUT_RETURN`. Sem jornada nenhuma (roteiro nunca planejado) e com ajudante na
tripulação, a parcela é `missing` com `HELPER_JOURNEY_UNKNOWN` — nunca zero.

### De onde vem a volta em cada caminho de planejamento

Investigado ponto a ponto (não assumido): `writeEstimatedArrivals`
(`src/trips/infrastructure/drizzle-trip-route.repository.ts:145-206`) tem **um único chamador em
produção** — `TripComposer.applyEstimatedArrivals` (`trip-composer.adapter.ts`), chamado só pelo
aceite da proposta multi-veículo (`multi-vehicle-suggestion.use-case.ts` `accept()`). O outro
caminho citado no pedido original, `POST /trips/:id/route-suggestions` (sugestão de rota para
viagem já existente, `routing/application/route-suggestion.use-case.ts` `accept()`), **nunca
chamou `writeEstimatedArrivals`** — ele só reordena `trip_stops` e marca a sugestão `accepted`;
não existe ETA congelado nesse caminho hoje, spec 149 à parte. Confirmado por grep negativo
(`writeEstimatedArrivals`/`applyEstimatedArrivals` não aparecem em `route-suggestion.use-case.ts`)
e por leitura completa do `accept()` desse arquivo. Como não há ETA ali, também não há jornada para
congelar — comportamento consistente (nada se congela em nenhum dos dois campos), não uma lacuna
nova desta task. Registrado aqui para quem for estender o congelamento a esse segundo caminho no
futuro: ele precisa de infraestrutura de ETA que ainda não existe, e a sugestão de rota de viagem
única não tem colunas de perna de volta (`route_suggestion_stops`/`route_suggestions`) — só
`route_suggestion_vehicles` (P2) tem `return_distance_meters`/`return_duration_seconds`.

No único caminho real (aceite multi-veículo): `multi-vehicle-suggestion.use-case.ts` `accept()`
passou a buscar `dependencies.multiVehicle.readVehicleRoads({ companyId, suggestionId })` (a
mesma consulta que T7/`read-suggestion-valuation.use-case.ts` já usa) **em paralelo** com
`readGroups`, monta `returnLegSecondsByVehicle` com `isReturnPlanned(road.endPolicy)` (de
`suggestion-valuation.policy.ts`) e passa `returnLegSeconds` para `applyEstimatedArrivals` →
`writeEstimatedArrivals`, que calcula `jornada = (max(chegadas) − saída planejada) + volta` na
mesma transação que já grava `estimated_arrival_frozen_at`/`eta_departure_at`. Ordem manual
(`isManualOrder`) não confia nas horas do solver — nem na jornada: `returnLegSeconds` sai `null`
nesse caso, igual ao comportamento de `arrivals` vazio já existente.

### Arquivos

- **Migration 1** — `apps/api-transportada/drizzle/20260915110144_trip_planned_journey/`
  (`bun run db:generate --name trip_planned_journey`; pasta maior que a última da T5,
  `20260915022856_trip_crew_helpers`; `snapshot.json` com `prevIds` = id do snapshot anterior,
  conferido). Aditiva: 2 `ADD COLUMN` nulas (`trips.planned_journey_seconds bigint`,
  `trips.planned_journey_includes_return boolean`) + 2 `CHECK` (par nasce/morre junto; segundos
  `>= 0`). `rollback.sql` à mão, molde da T1.
- **Migration 2** — `apps/api-transportada/drizzle/20260915110748_trip_helper_financial_kind/`.
  Não estava no plano original — apareceu ao rodar `bun run typecheck`: o congelamento do
  resultado financeiro (`freezeTripFinancialResult`, ADR-0049 §5) tem o próprio catálogo fechado
  de `kind` (`TRIP_FINANCIAL_PARCEL_KINDS`, `trip-financial.schema.ts`, com `CHECK` no banco em
  `trip_financial_parcels`), **separado** de `TRIP_COST_KINDS` da valuation — sem acrescentar
  `'helper'` ali, fechar uma viagem com ajudante quebraria em runtime com violação de `CHECK`
  (`trip_financial_parcels_kind_check`), não em tempo de compilação. Migration só alarga o `IN
(...)` do `CHECK` (`DROP CONSTRAINT` + `ADD CONSTRAINT` com a lista +1) — aditiva no sentido do
  padrão do repo (nenhum dado apagado, só um valor novo passa a ser aceito); `rollback.sql`
  registra o aviso de que reverter com linha `'helper'` já gravada quebra a constraint estreitada.
- `apps/api-transportada/src/database/trip.schema.ts`: as duas colunas novas + os dois `check`.
- `apps/api-transportada/src/database/trip-financial.schema.ts`: `'helper'` em
  `TRIP_FINANCIAL_PARCEL_KINDS`.
- `apps/api-transportada/src/trips/domain/trip-valuation.policy.ts`: `'helper'` em
  `TRIP_COST_KINDS`; três gaps novos (`HELPER_DAILY_RATE_MISSING`, `HELPER_JOURNEY_WITHOUT_RETURN`
  — entra em `ADVISORY_GAPS`, `HELPER_JOURNEY_UNKNOWN`).
- `apps/api-transportada/src/trips/domain/trip-helper-cost.policy.ts` (novo, puro):
  `buildTripHelperCost` — Σ(própria ?? geral) × dias, `resolveHelperDayCount` exportada (D7,
  reuso previsto pela T7). Partial (parte com diária, parte sem) segue o padrão
  `ausentes/total` de `buildIcmsParcel` (`trip-tax.policy.ts`): soma só quem tem valor, `detail`
  é a razão crua.
- `apps/api-transportada/src/trips/application/read-trip-valuation.use-case.ts`: `helperCrew`,
  `helperCompanyDailyRate`, `journeySeconds`, `journeyIncludesReturn` em `TripValuationContext`;
  `buildCostParcels` chama `buildTripHelperCost` pelo seam único `buildValuationFromContext`.
- `apps/api-transportada/src/trips/infrastructure/trip-valuation.query.ts`: `readHelperCrew`
  (espelha `readCrew`, filtra `role = 'helper'`, lê `fleet_drivers.helper_daily_rate`) e
  `readHelperCompanyDailyRate` (uma linha de `company_crew_settings`, sem N+1) — as duas entram
  no `Promise.all` de `readContext`, tenant-filtradas pelo mesmo `companyId` do resto do arquivo.
  `readPreviewContext` (prévia sem viagem) não foi tocada: sem `trip_drivers`, não há ajudante
  nem jornada ainda — fora do escopo desta task (T13 decide o que a montagem manda para lá).
- `apps/api-transportada/src/trips/infrastructure/drizzle-trip-route.repository.ts`:
  `writeEstimatedArrivals` ganha `returnLegSeconds?` e calcula/grava `plannedJourneySeconds`/
  `plannedJourneyIncludesReturn` na mesma transação do ETA.
- `apps/api-transportada/src/routing/infrastructure/trip-composer.adapter.ts`,
  `src/routing/application/multi-vehicle-suggestion.use-case.ts`, `src/main.ts`: `returnLegSeconds`
  atravessa `TripComposer.applyEstimatedArrivals` → `TripComposerDependencies.writeEstimatedArrivals`
  → repositório real, calculado no `accept()` via `readVehicleRoads` + `isReturnPlanned`.

### Testes novos/alterados

- `test/trip-financial/helper-cost.contract.ts` (novo): critérios 4 e 5, 0 ajudantes, parcial
  (`ausentes/total`), jornada desconhecida (`HELPER_JOURNEY_UNKNOWN`), sem volta (`estimated` +
  `HELPER_JOURNEY_WITHOUT_RETURN`), `resolveHelperDayCount` (9h→1, 24h→1, 24h01→2).
- `test/trip-valuation/read-valuation.contract.ts`: parcela `helper` pelo seam
  `buildValuationFromContext` (própria vencendo geral, e zero sem ajudante).
- `test/trip-valuation/driver-zone-table-price.contract.ts`: `ADVISORY_GAPS` atualizado (3 itens).
- `test/database-migration/static-migration.contract.ts`: as duas pastas novas na lista por
  extenso.
- `test/database-migration/trip-constraints.assertion.ts`: os dois `CHECK` novos de
  `trips.planned_journey_*` (par nasce/morre junto; `>= 0`).
- `test/routing-application/multi-vehicle-suggestion.contract.ts`: `returnLegSeconds` chega a
  `applyEstimatedArrivals` (com e sem `endPolicy` de volta) e sai `null` sem `vehicleRoads`.
- `test/integration/multi-vehicle-suggestion.integration.ts` (contra Postgres): 3 casos novos —
  com volta gravada (`planned_journey_seconds` = ida + volta, `includes_return = true`), sem volta
  gravada (só ida, `includes_return = false`), sem saída planejada nem ETA (os dois campos `null`).
  `buildUseCase` ganhou `{ freezesEta: true }` para religar o repositório real de
  `writeEstimatedArrivals` nestes três casos — por padrão a integração continua sem conferir ETA
  (comentário original da spec 107), e os outros testes do arquivo não foram afetados.
- Frontend (`apps/frontend-transportada`): `parcel.helper`/`gap.HELPER_*` em
  `trip-financials/locales/tripFinancials(.en).locale.json` **e** em
  `trip/locales/trip(.en).locale.json` (o contrato `valuation-gap-labels.contract.ts` cobra as
  duas telas); `ADVISORY_GAPS` em `valuationLedger.service.ts` (cópia por valor, conferida contra
  o fonte da API por `valuation-ledger-advisory.contract.ts`). A validação de resposta
  (`tripValuationResponse.validation.ts` e a cópia em `routing/shared/`) já é permissiva — `kind`/
  `gap` desconhecidos não eram rejeitados, então nenhuma mudança de tipo foi necessária ali. Tela
  completa (select de ajudantes, painel) é T14, fora do escopo.

### Gates (todos em primeiro plano, com o resultado esperado no próprio comando)

- `bun run typecheck` (raiz, 6 apps) → exit 0.
- `bun run db:check` → "Everything's fine".
- Contratos da T6 (`trip-financial`, `trip-valuation`, `routing-application`,
  `database-migration`) → 312 pass / 4 skip / 0 fail.
- `bun --env-file=../../.env.test test --timeout 120000` (API, lista completa) → 5853 pass / 23
  skip / 0 fail (era 5840 na T5; +13 = os contratos novos desta task).
- `bun --env-file=../../.env.test test --timeout 120000` nos três arquivos de integração tocados
  (`multi-vehicle-suggestion`, `trip-financial-end-to-end`, `trip-repository`) → 14 pass / 0 fail.
- `make migration-test` (Postgres descartável, as duas migrations + rollback) → 95 pass / 0 fail,
  exit 0.
- `bun run lint` (raiz, 6 apps) → exit 0.
- `bun run format:check` (raiz) → exit 0.
- `bun run --cwd apps/frontend-transportada test` → 3620 pass / 0 fail.
- `bun run --cwd apps/frontend-transportada typecheck` → exit 0 (incluído no `bun run typecheck`
  da raiz acima).

Decisões:

- **Segunda migration não planejada**: o typecheck pegou a lacuna antes de qualquer teste rodar
  (`TripFinancialParcel.kind` não aceitava `'helper'`) — sinal de que o congelamento do resultado
  financeiro (fase de fechamento da viagem, ADR-0049 §5) tem um catálogo de `kind` **próprio**,
  não o mesmo `TRIP_COST_KINDS` da valuation ao vivo. Widening de `CHECK IN (...)` é aditivo no
  padrão já usado neste repo (não apaga dado, só aceita um valor novo); ficou em pasta própria
  (não dentro de `trip_planned_journey`) porque toca tabela e motivo diferentes.
- **A fórmula da jornada usa `última chegada − saída planejada`, não a soma das pernas do
  roteirizador** (`sumVehicleTrip`, usado por T7/`read-suggestion-valuation.use-case.ts`): o pedido
  original é explícito nessa fórmula, e ela reaproveita dado que `writeEstimatedArrivals` já
  recebe (`arrivals`, `plannedDepartureAt`) sem precisar buscar `trip_stops`/pernas de novo — só a
  duração da volta (`returnLegSeconds`) veio de fora, de `readVehicleRoads`.
- **`resolveHelperDayCount` foi exportada** de `trip-helper-cost.policy.ts` de propósito: a T7
  (parcela na valuation da sugestão) precisa da mesma conta de dias sem reimplementá-la.
- **`readPreviewContext` não ganhou `helperCrew`/jornada**: a prévia (antes de a viagem existir)
  não tem `trip_drivers` nem `writeEstimatedArrivals`; T13 decide o que a montagem manda para lá.
