# Evidência

## Medição local (2026-09-12, antes da spec)

Consultas somente leitura no Postgres local:

```sql
select role, vehicle_type, body_type, count(*),
       count(capacity_m3) filter (where capacity_m3 > 0) as with_capacity,
       count(*) filter (where cargo_length_m > 0) as with_dims
from fleet_vehicles group by 1,2,3 order by 1,2,3;
```

- 14 veículos, todos `role = 'traction'`: **nenhuma carreta**.
- 8 com `body_type = '00'` (3 `truck`, 3 `toco`, 2 `tractor_unit`), nenhum com m³ nem medidas.
- Os 8 têm marca, modelo e ano vazios. Foram criados em 26/08, 01/09 e 06/09, provavelmente como
  cadastro de teste.
- Só os 2 `tractor_unit` têm viagem (1 cada, ambas fechadas).
- `vehicle_volume_references`: 18 linhas, todas `02`/`05`. Sem `00`, `01`, `03`, `04` e sem
  `tractor_unit`.
- `information_schema`: a única coluna de veículo em `trips` é `vehicle_id`. `mdfe_*` e
  `route_suggestion*` também têm um `vehicle_id` só. Não existe coluna nem tabela de
  reboque/carreta/implemento.
- `fleet_vehicles.body_type` tem default `'00'`, e o CHECK aceita `00`–`05` sem amarrar ao tipo.

## T0 — Medição em produção (2026-09-12)

- Autorização: usuário, nesta sessão ("Autorizo a IA a ler").
- Caminho: o Postgres de produção (`Postgres-FDoz`) **não tem TCP proxy público**. Por isso a
  consulta rodou por `railway ssh -e production -s api -- bun -e <script>`, com `Bun.SQL`, uma
  conexão só e `default_transaction_read_only = on`. Só agregados, sem PII e sem segredo impresso.
  O script está no scratchpad da sessão e não foi versionado.

| role     | vehicle_type | body_type | status |   n | com m³ | com as 3 medidas | com referência |
| -------- | ------------ | --------- | ------ | --: | -----: | ---------------: | -------------: |
| traction | utility      | 02        | active |   3 |      3 |                0 |              3 |
| traction | van          | 02        | active |   3 |      3 |                0 |              3 |

- Viagens nos últimos 60 dias: **0** (a consulta voltou vazia).
- Empresas: 1.
- Conclusão: nenhum `00` e nenhuma carreta em produção. O defeito medido existe só no banco local.

## T0b — Respostas do usuário (2026-09-12)

- **Q1:** "todos e também deve pedir no cadastro e implementar no aplicativo". A medição por câmera
  ficou fora e vira spec própria, também por resposta do usuário.
- **Q1b (cavalo):** "se tem cavalo precisa do caminhão; ele não pode carregar apenas com o cavalo;
  pode cadastrar vários cavalos, mas pode carregar um por vez". Virou: cavalo com `00`, despacho
  exige carreta, uma carreta por viagem aberta.
- **Q2:** "adicionar na listagem de pendências para realizar a atualização; pode ser uma página onde
  ficam nossas pendências". Virou: página `/pendencias`.
- **Q3:** os dois (carreta padrão na frota e carreta na viagem).
- **Q4:** sim, com fonte citada. Os valores dependem de aprovação na T-cat.
- **Q5:** commit `c02325b6`.
- `grep -c 'NEEDS CLARIFICATION' spec.md` = 0 depois da edição.

## T1 — Contrato: `resolveVolumeReferenceKey` é o único construtor da chave

- Arquivo novo: `apps/api-transportada/test/trip-infrastructure/occupancy-reference-key.contract.ts`,
  por texto de fonte contra `trip-occupancy.support.ts`.
- Anexado ao entrypoint existente `test/trip-infrastructure.contract.test.ts` (já listado no
  `package.json` da app) — sem entrypoint novo.
- Comando: `bun test test/trip-infrastructure.contract.test.ts` (de dentro de
  `apps/api-transportada`).
- Resultado (vermelho esperado, antes da T2): 14 pass, 4 fail — as 4 falhas são os testes novos
  desta task; os 14 pré-existentes (document-link, route-geometry-\*) seguem verdes.
- `bun run --cwd apps/api-transportada typecheck`: limpo.
- `bunx prettier --check` nos dois arquivos alterados: ok.

## T2 — Ligar a ocupação à função

- `trip-occupancy.support.ts:112-127`: a chave da consulta de `vehicleVolumeReferences` passa a
  vir de `resolveVolumeReferenceKey({ traction: { bodyType: vehicle.bodyType, role: 'traction',
vehicleType: vehicle.vehicleType }, trailer: null })`. Comportamento idêntico (sem carreta, a
  função devolve a chave do próprio veículo — D4).
- `bun run --cwd apps/api-transportada typecheck`: limpo.
- `bun test test/trip-infrastructure.contract.test.ts` (de dentro de `apps/api-transportada`): 18
  pass, 0 fail — T1 (as 4 asserções novas) agora verde.
- `bun test test/cargo-volume.contract.test.ts test/fleet-domain.contract.test.ts
test/trip-infrastructure.contract.test.ts test/trip-application.contract.test.ts`: 475 pass, 0
  fail.
- Suíte completa: `bun run --cwd apps/api-transportada test`: **5047 pass, 23 skip, 0 fail** — rodou
  inteira, sem depender de Postgres.
- `bunx prettier --check` e `bunx eslint --max-warnings=0` no arquivo alterado: ok.

## T3 — `resolveCapacityUnknownReason` (domínio puro)

- Criado `test/trip-domain/capacity-unknown-reason.contract.ts` (tabela com 8 casos) e importado em
  `test/trip-domain.contract.test.ts`, **antes** de o módulo existir.
- Vermelho: `bun run --cwd apps/api-transportada test test/trip-domain.contract.test.ts` →
  `error: Cannot find module '../../src/trips/domain/capacity-unknown-reason.policy.js'`, com
  `2 fail` na suíte inteira (só os dois testes que dependem do módulo novo).
- Implementado `apps/api-transportada/src/trips/domain/capacity-unknown-reason.policy.ts`:
  `resolveCapacityUnknownReason({capacityM3, traction, trailer})`. O "carregador" é o mesmo que
  `resolveVolumeReferenceKey` usa (`trailer ?? traction`); `capacityM3 !== null` já resolvido pelo
  chamador (a ficha vence, mesmo com `body_type: '00'`); carregador com `'00'` e que não é
  `tractor_unit` → `bodyTypeMissing` (cobre também carreta antiga com `'00'`); `tractor_unit` sem
  carreta → `trailerMissing`; senão → `referenceMissing`. `trailer` já existe como parâmetro
  opcional/nulo para a Fase 4.
- Verde: `bun run --cwd apps/api-transportada test test/trip-domain.contract.test.ts` →
  **5055 pass, 23 skip, 0 fail** (8 casos novos de `resolveCapacityUnknownReason`, mais os 5047
  pré-existentes já reportados na T2).
- `bun run --cwd apps/api-transportada typecheck`: limpo.
- `bunx prettier --check` e `bunx eslint` nos três arquivos tocados: ok, sem avisos.

## T4 — Publicar `capacityUnknownReason`

- `trip-occupancy.support.ts`: `loadTripOccupancy` chama `resolveCapacityUnknownReason` com
  `{capacityM3: capacity?.capacityM3 ?? null, traction: {bodyType: vehicle.bodyType, vehicleType:
vehicle.vehicleType}, trailer: null}` e devolve `capacityUnknownReason` nos quatro pontos de
  retorno da função. No ramo "veículo não encontrado" (FK quebrada, hoje inalcançável em produção)
  o motivo fica `null` — não há candidato de tração para nomear.
- Encadeado até:
  - `trips/application/trip.port.ts`: `TripDetail.capacityUnknownReason: CapacityUnknownReason |
null`, ao lado de `occupancy` (não aninhado — a resposta não tem chave `cargo`, e `occupancy` e
    `cargoWeight` já são irmãos no nível raiz);
  - `trips/infrastructure/drizzle-trip.repository.ts`: repassado no retorno de `readTripDetail`;
  - `trips/presentation/trip.routes.ts`: `serializeTripDetail` inclui o campo na resposta de
    `GET/POST /trips` e `GET /trips/:id`;
  - `trips/infrastructure/trip-cargo-preview.query.ts` (`TripCargoPreviewContext`) e
    `trips/application/preview-trip-cargo.use-case.ts` (`TripCargoPreview`): mesma cadeia para a
    prévia de `POST /trips/cargo-preview`, que serializa o objeto direto (sem `serialize*`
    dedicado), então o campo já sai no JSON.
- Vermelho→verde parcial: como a task é fiação através de arquivos já existentes (não um módulo
  puro novo), o teste guiador foi o de integração (abaixo), escrito e rodado logo após a fiação —
  sem ele, `withReference.capacityUnknownReason` ficaria `undefined`/ausente do tipo e o teste não
  compilaria.
- **Integração contra Postgres** (havia Postgres local em `127.0.0.1:55432`, então rodou de fato):
  `test/integration/trip-capacity-unknown-reason.integration.ts` (banco descartável, migrations
  reais). Caso: truck `body_type: '00'` sem ficha → `occupancy: null` e
  `capacityUnknownReason: 'bodyTypeMissing'`; depois de `UPDATE fleet_vehicles SET body_type =
'02'` na mesma viagem (sem tocar a viagem) → `capacityUnknownReason: null` e
  `occupancy.capacitySource: 'reference'` (usa a linha `('truck','02')` de
  `vehicle_volume_references`, seedada por migration). Adicionado a `test:integration` do
  `package.json`.
  - `DATABASE_URL=postgresql://transportada:transportada@localhost:55432/transportada bun test
./test/integration/trip-capacity-unknown-reason.integration.ts` → **1 pass, 0 fail**.
  - Regressão dos vizinhos que montam `TripDetail`/ocupação:
    `./test/integration/trip-repository.integration.ts
./test/integration/trip-detail-query-count.integration.ts
./test/integration/mixed-cargo-end-to-end.integration.ts` → **3 pass, 0 fail**.
- Fixtures ajustadas por causa do campo novo obrigatório em `TripDetail`/`TripCargoPreviewContext`:
  `test/cargo-volume/cargo-preview.contract.ts`, `test/fixtures/trip-http-payload.fixture.ts`,
  `test/trip-application/trip-use-case.contract.ts` (todas ganharam `capacityUnknownReason: null`).
- `bun run --cwd apps/api-transportada typecheck`: limpo.
- `bun run --cwd apps/api-transportada test`: **5055 pass, 23 skip, 0 fail** (suíte sem Postgres,
  inalterada em contagem em relação à T3 — a task só adicionou fiação e um teste de integração, que
  não entra nessa lista).
- `bunx prettier --check` e `bunx eslint` em todos os arquivos tocados: ok, sem avisos.

## T5 — Painel nomeia o motivo (frontend)

- **Serviço puro** `apps/frontend-transportada/src/modules/trip/shared/capacityUnknownMessage.service.ts`:
  `resolveCapacityUnknownMessage({reason, vehicleId})` decide `{textKey, linkHref, linkLabelKey}`.
  `bodyTypeMissing`/`trailerMissing` levam à ficha do veículo por `buildFleetVehicleRoute` (deep
  link **já existente** em `fleet/shared/fleetRoute.service.ts` — não precisou de rota nova, e
  `linkLabelKey` reusa `cargoPlan.missingBedLink`, já existente). Hoje a viagem só conhece o
  veículo de tração (Fase 4 ainda não existe), então o link de `trailerMissing` aponta para a
  ficha do cavalo — é a única ficha que existe para editar. `referenceMissing` não tem link:
  o catálogo é quem falta, e não há campo na ficha que resolva.
- Vermelho→verde: `test/trip/capacity-unknown-message.contract.ts` (3 casos, um por motivo)
  escrito e importado em `test/trip.contract.test.ts` antes do serviço existir —
  `bun test test/trip.contract.test.ts` falhou com `Cannot find module
'.../capacityUnknownMessage.service'`; depois de criar o arquivo, verde.
- **Guard**: `trip.constant.ts` ganhou `CAPACITY_UNKNOWN_REASONS` (cópia por valor da API) e
  `'capacityUnknownReason'` em `TRIP_DETAIL_OPTIONAL_KEYS` (campo novo nasce opcional — spec 078
  D2 — porque a API sobe primeiro). `tripResponse.validation.ts`: `isDetail` tolera o campo
  ausente/`null`/um dos três valores; `tripCargoPreviewFromApi` (que não usa `hasKeys`, extrai
  campo a campo) ganhou a mesma validação e o campo no retorno.
- **`TripCargoPanel.component.tsx`**: prop nova `capacityUnknownReason` e prop nova obrigatória
  `vehicleId` (as três telas que montam o painel já tinham o id à mão). Quando `occupancy` é
  `null`, `TripCargoWeightPanel` (agora com `capacityUnknownReason`/`vehicleId`) delega a
  `TripCapacityUnknownHint`, que chama o serviço puro e imprime `t(message.textKey)` + o link
  quando existe; sem motivo (API antiga, janela entre os dois deploys) cai na mensagem genérica de
  sempre, inline, sem quebrar o painel.
  - ⚠️ `if (occupancy === null) return <TripCargoWeightPanel {...weightPanelProps} />` continua
    numa linha só (objeto de props montado na linha de cima) — `test/trip/occupancy.contract.ts`
    cobra por texto de fonte que a linha seja exatamente `if (occupancy === null) return`, e
    passar as três props separadas ali quebrava a linha em várias e reprovava esse contrato
    (achado durante a task, corrigido).
- Chaves novas em `trip.locale.json` (acentuadas, cobertas por
  `test/shared/locale-accents.contract.ts`, que já roda na suíte geral):
  `occupancy.capacityUnknownBodyType`, `occupancy.capacityUnknownTrailer`,
  `occupancy.capacityUnknownReference`. `trip.en.locale.json` não tem seção `occupancy` — nada
  para atualizar lá (relatado, não ignorado silenciosamente).
- Callers atualizados para passar `vehicleId`/`capacityUnknownReason`: `TripDetail.component.tsx`
  (`trip.vehicleId`/`trip.capacityUnknownReason`), `TripProposalDetail.component.tsx`
  (`view.vehicleId`/`cargo.preview?.capacityUnknownReason`), `TripQuickCreateDialog.component.tsx`
  (`quickCreate.vehicleId`/`cargoPreview.preview.capacityUnknownReason`).
- Fixtures/tipos de teste ajustados pelo campo novo obrigatório no contrato TS local:
  `test/trip/trip.fixture.ts` (`TripDetailContract` e `TRIP_DETAIL`), `test/trip-smoke.helper.ts`.
- `bun run --cwd apps/frontend-transportada typecheck`: limpo.
- `bun run --cwd apps/frontend-transportada test`: **3319 pass, 0 fail** (suíte inteira do
  frontend, sem regressão nos 3316 pré-existentes).
- `bunx prettier --check` e `bunx eslint` em todos os arquivos tocados: ok, sem avisos (um
  `@typescript-eslint/no-unnecessary-type-assertion` apareceu e foi corrigido removendo o cast
  redundante em `tripCargoPreviewFromApi`, com o import de tipo que ficou órfão removido junto).

## T6 — API recusa `00` em escrita nova

- **Descoberta de convenção, antes de implementar:** o texto da task citava `FLEET_DRIVER_REGION_CITY_REQUIRED`
  como exemplo de "código de validação Zod", mas essa classe (`freight-regions/domain/freight-region.error.ts`)
  é lançada de um **use-case/policy** (`driver-coverage.policy.ts`), não de dentro de um `superRefine` de
  schema. Dentro de `fleet-request.schema.ts` o padrão real, usado em toda `assertVehicleRules` e em
  `company-contacts.schema.ts`, é `context.addIssue({code: 'custom', message: '<frase>'})`, que
  `request-parsing.service.ts:parseAgainstSchema` sempre embrulha no código genérico `INVALID_REQUEST`
  (400) com `details: [{field, message}]` — nunca um código de topo específico.
  Como o critério de aceite 1 e a D1 pedem literalmente "responde 400 FLEET_VEHICLE_BODY_TYPE_REQUIRED"
  (um código de topo, não uma frase dentro de `details`), usei o **outro** padrão já existente no
  repositório: lançar a `ApiError` **diretamente** de dentro do `superRefine` (não via `addIssue`).
  Confirmado por teste que `zod@4.4.3`'s `safeParse` **não** captura um `throw` comum dentro de
  `refine`/`superRefine` — o erro atravessa `safeParse` cru — e é exatamente isso que
  `response.service.ts:42` espera: qualquer `ApiError`, de qualquer camada, vira
  `{error: {code, message, status}}`. Duas classes novas em `fleet/domain/fleet.error.ts`
  (`FleetVehicleBodyTypeRequiredError`, `FleetVehicleBodyTypeNotApplicableError`), seguindo o
  molde de `FleetVehicleNotFoundError` etc. — sem `codes.ts` centralizado neste repo; cada domínio
  guarda o código como string literal no próprio `*.error.ts`, que é a "centralização por domínio"
  que este código realmente pratica.
- **Discriminante da regra:** não usei `vehicleType === 'tractor_unit'` cru, e sim
  `role === 'traction' && vehicleType === 'tractor_unit'` — assim uma combinação já inválida por
  outra razão (ex.: `role: 'trailer'` com `vehicleType: 'tractor_unit'`, testada em
  `vehicles.contract.ts` na doc "refuses a trailer carrying a vehicle type…") não aciona a regra
  nova por engano e não muda o `code` que aquele teste já verificava (`INVALID_REQUEST`).
- `src/fleet/presentation/fleet-request.schema.ts`: `assertVehicleBodyType` chamada dentro de
  `assertVehicleRules` (usada por `createVehicleSchema` **e** `updateVehicleSchema`, então POST e
  PUT recusam igual).
- **Candidatura do agregado:** confirmado que `mapDeclaredDataToVehicleInput`
  (`aggregate-application-driver-mapping.policy.ts:295`, `bodyType: vehicle.bodyType ?? '00'`) grava
  direto via `drizzle-aggregate-application.repository.ts` — nunca chama `createVehicleSchema` nem
  `vehicleFieldsSchema`. Comportamento **não** mudou; o veículo da candidatura continua podendo
  nascer com `00` e cai na página de pendências da Fase 5, como pedido.
- **Nenhuma migration, nenhum `UPDATE` em `body_type`.**
- Teste de contrato novo: `test/fleet-http/vehicle-body-type.contract.ts` (importado em
  `test/fleet-http.contract.test.ts`, que já está na lista explícita do `package.json`, então não
  precisou editar o `package.json`). Vermelho antes da implementação: com `assertVehicleBodyType`
  comentada, `bun test ./test/fleet-http.contract.test.ts` falhava as 13 asserções novas do arquivo
  (as 9 do `test.each` de motorcycle/car/utility/van/vuc/three_quarter/toco/truck/other + trailer +
  a de `NOT_APPLICABLE` esperando `400` e recebendo `201`). Verde depois de implementar.
- **Fixtures existentes ajustadas: 2.** `test/fleet-http/vehicles.contract.ts` tinha dois testes
  que criavam veículo não-cavalo com `CREATE_VEHICLE_BODY` (que nasce `bodyType: '00'`) sem
  sobrescrever `bodyType`: `'carries the vehicle type through create, update and listing'` (vuc na
  criação, three_quarter na atualização) e `'accepts the types the SEFAZ list does not name and
refuses one outside the catalog'` (motorcycle/car). As três chamadas passaram a levar
  `bodyType: '02'`. Nenhuma outra fixture em `test/` cria veículo não-cavalo com `bodyType: '00'`
  passando por `createVehicleSchema`/`updateVehicleSchema` — os demais usos de `bodyType: '00'`
  (`fleet-domain/vehicle-capacity.contract.ts`, `trip-domain/capacity-unknown-reason.contract.ts`,
  `fleet-infrastructure/vehicle-mapper.contract.ts`, `integration/fleet-vehicle-repository.integration.ts`,
  `integration/trip-capacity-unknown-reason.integration.ts`) constroem objetos de domínio/linha de
  banco direto, sem passar pelo schema Zod da rota.
- `bun run --cwd apps/api-transportada typecheck`: limpo (precisou tirar `as const` do array
  `NON_TRACTOR_VEHICLE_TYPES` do novo teste — `bun:test`'s `test.each` exige `unknown[]` mutável,
  e `as const` produz uma tupla `readonly`).
- `bun run --cwd apps/api-transportada test`: **5067 pass, 23 skip, 0 fail** (suíte inteira, sem
  regressão — eram 5055 antes da T5; a diferença de 12 é este arquivo de teste novo).
- `bunx prettier --check` e `bunx eslint` nos arquivos tocados: ok, sem avisos.
