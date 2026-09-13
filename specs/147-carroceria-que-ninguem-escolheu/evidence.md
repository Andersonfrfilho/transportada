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

## T7 — Formulário da frota (frontend)

- **Serviço puro novo:** `apps/frontend-transportada/src/modules/fleet/shared/fleetVehicleBodyType.service.ts`.
  `isTractorUnitKind({role, vehicleType})` decide cavalo por `role === 'traction' && vehicleType ===
'tractor_unit'` — não pelo `vehicleType` cru — porque `vehicles.contract.ts` já tinha um teste
  (`'refuses a trailer carrying a vehicle type and a traction without one'`) que monta
  `role: 'trailer'` com `vehicleType: 'tractor_unit'` de propósito (para provar a regra "tipo só em
  quem traciona"); usar o discriminante certo faz esse resíduo inválido não contar como cavalo.
  `resolveVehicleBodyTypeForKindChange({previous, next})` é a regra do RF2: virar cavalo força
  `'00'`, sair do cavalo limpa para `''` (nunca herda o `00`), sem mudar nada quando o "tipo" (papel
  - `vehicleType`) não mudou — ficha antiga com `00` num tipo que carrega não é reescrita só porque
    o operador mexeu em outro campo (D2). `isVehicleBodyTypeMissing({bodyType, role, vehicleType})`
    bloqueia o envio: `''` (nunca escolhido) e `'00'` (ficha antiga intocada) contam igual fora do
    cavalo. `VEHICLE_BODY_TYPE_OPTIONS` é `MDFE_BODY_TYPE` sem o `'00'` — a opção não é "não
    escolhida ainda", é "não existe" fora do cavalo.
- **`vehicleFormPatch.service.ts`:** `composeVehicleFormPatch` ganhou a camada `bodyTypeDefaults`,
  guardada por `next.role === input.previous.role && next.vehicleType === input.previous.vehicleType`
  (só recomputa quando o papel ou o tipo mudam nesta chamada de `patch`), aplicada por último no
  `resolved` — vence qualquer coisa que a herança de marca ou o default do tipo tenham posto ali
  (nenhuma das duas mexe em `bodyType` agora, então não há conflito na prática).
- **`fleetForm.service.ts`:** `EMPTY_VEHICLE_FORM.bodyType` passou de `'00'` para `''` (RF2: sem
  valor inicial fora do cavalo — e o rascunho nasce com `vehicleType: ''`, que não é cavalo).
  `toVehicleBody` faz `state.bodyType as MdfeBodyType` com o comentário de que `submit()` já
  recusou o envio com `bodyType` vazio antes de chegar aqui — `FleetVehicleBody.bodyType` continua
  `MdfeBodyType` estrito (o corpo que **de fato** sobe à API nunca é vazio); é
  `FleetVehicleFormState.bodyType` que virou `'' | MdfeBodyType` (mesma forma que `color` e
  `vehicleType` já usavam no formulário).
- **`vehicleBrandDefaults.service.ts`:** `bodyType` saiu de `VEHICLE_BRAND_DEFAULT_FIELDS` e de
  `VEHICLE_BRAND_DEFAULT_BLANK` — o segundo Volvo da frota não herda a carroceria do primeiro.
- **`VehicleOperationFields.component.tsx`:** o campo de carroceria só renderiza quando
  `!isTractorUnitKind(state)`; quando renderiza, usa `VEHICLE_BODY_TYPE_OPTIONS` (sem `'00'`) e
  `placeholder={t('bodyTypeUnset')}` no lugar do `value` cru — mesmo padrão do campo de UF
  (`vehicleStateUnset`), sem precisar de `clearable`.
- **Bloqueio antes do 400:** não existe um arquivo `*.validation.ts` para o formulário de veículo
  neste módulo — os dois arquivos com esse sufixo (`fleetGuards.validation.ts`,
  `fleetResponse.validation.ts`) validam a **resposta da API**, não o envio. O padrão real do
  módulo para bloquear o `submit()` antes da chamada é uma função pura chamada inline no hook (como
  `listIncompleteVehicleOwnerFields` já fazia para o grupo do proprietário) — segui o mesmo molde:
  `useVehicleForm.hook.ts`'s `submit()` chama `isVehicleBodyTypeMissing(state)` **antes** do
  cheque do proprietário e devolve o feedback `bodyTypeRequired` sem chamar a API.
- **Mapa de erro por código:** `fleet.constant.ts`'s `FLEET_FEEDBACK_KEY_BY_ERROR` ganhou
  `FLEET_VEHICLE_BODY_TYPE_REQUIRED → 'bodyTypeRequired'` e
  `FLEET_VEHICLE_BODY_TYPE_NOT_APPLICABLE → 'bodyTypeNotApplicable'` — a mesma chave
  `bodyTypeRequired` cobre o bloqueio no cliente e o 400 que a API devolveria se ele escapasse.
  Chaves novas em `fleet.locale.json` **e** `fleet.en.locale.json` (acentuadas em pt-BR, cobertas
  por `test/shared/locale-accents.contract.ts`, que já roda na suíte geral): `bodyTypeRequired`,
  `bodyTypeNotApplicable`, `bodyTypeUnset`.
- **Fixture ajustada: 1.** `test/fleet/fleet.fixture.ts`'s `VEHICLE_DRAFT_BODY` (o que
  `toVehicleBody(createVehicleDraft())` devolve) tinha `bodyType: '00'` — virou `''`, porque o
  rascunho vazio não é mais cavalo por padrão. O tipo local `FleetVehicleBodyContract` (cópia por
  valor do contrato de corpo, só de teste) ganhou `''` na união de `bodyType` pelo mesmo motivo que
  já tinha `''` em `vehicleType`: representa o que a conversão devolve **sem** o guard de
  `submit()`, não o que chega à API.
- Vermelho→verde: `test/fleet/vehicle-body-type.contract.ts` (11 casos: discriminante do cavalo,
  opções sem `'00'`, força/limpa na troca de tipo, no-op sem troca, bloqueio de envio, formulário
  nasce vazio, marca não herda `bodyType`, campo some do componente, hook bloqueia antes do 400,
  mapa de erro + locale) escrito e importado em `test/fleet.contract.test.ts` (já na lista
  explícita do `package.json`) antes de `fleetVehicleBodyType.service.ts` existir —
  `bun test test/fleet.contract.test.ts` falhava com `Cannot find module
'.../fleetVehicleBodyType.service'`; depois de criar o arquivo e fiar tudo, dois testes
  **pré-existentes** quebraram por causa da mudança de default (`presentation-boundaries.contract.ts`
  esperava `bodyType: '00'` no rascunho vazio) e da minha própria asserção contra o comentário do
  código-fonte (corrigida para checar o array/objeto exportado, não o texto cru) — ambos corrigidos,
  depois verde.
- `bun run --cwd apps/frontend-transportada typecheck`: limpo (precisou alargar
  `FleetVehicleFormState.bodyType` para `'' | MdfeBodyType`, com o cast documentado em
  `toVehicleBody`, e alargar o tipo de teste `FleetVehicleBodyContract.bodyType` do mesmo jeito).
- `bun run --cwd apps/frontend-transportada test`: **3330 pass, 0 fail** (suíte inteira, sem
  regressão nos 3319 pré-existentes — a diferença de 11 é o arquivo de teste novo).
- `bunx prettier --check` e `bunx eslint` em todos os arquivos tocados: ok, sem avisos (o arquivo
  de teste novo precisou de `prettier --write` para quebrar duas linhas longas).

## T-cat — valores do catálogo aprovados pelo usuário (2026-09-13)

A pesquisa foi feita por dois agentes `opus` de documentação, só com leitura. As respostas foram
dadas pelo usuário nesta sessão, por pergunta com opções. É esta a aprovação que libera a T16.

| vehicle_type   | body_type | C × L × A (m)             | max_payload_kg | Fonte                                                                                                                                                                                                                             |
| -------------- | --------- | ------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toco`         | `01`      | 7,000 × 2,500 × **2,500** | 10685,000      | C×L e carga: [SINAPI 89265](https://orcamentor.com/composicao/89265/). Altura: **convenção** (ver abaixo)                                                                                                                         |
| `''` (carreta) | `04`      | 12,030 × 2,350 × 2,390    | 27600,000      | Contêiner 40' dry, [DSV](https://www.dsv.com/pt-br/nossas-solucoes/modais-de-transportes/transporte-maritimo/dimensoes-do-conteiner-de-transporte/dry-container), conferido na [Guia Log](https://www.guialog.com.br/medidas.htm) |
| `truck`        | `04`      | 5,900 × 2,350 × 2,390     | 25000,000      | Contêiner 20' dry, mesma fonte                                                                                                                                                                                                    |

**Altura de 2,50 m da carroceria aberta.** É convenção, porque nenhuma norma define altura de carga
para carroceria sem teto. O comentário da migration tem de dizer isso. O número se apoia em:

- anúncio de mercado: toco aberto de 6,00 × 2,50 m com 38 m³, o que dá cerca de 2,53 m
  ([Fullex](https://www.fullex.com.br/frota/toco-carroceria/14));
- teto legal: 4,40 m com carga ([CONTRAN 882/2021](https://www.legisweb.com.br/legislacao/?id=425133)).
  Com o assoalho a cerca de 1,30 m ([Guia Log](https://www.guialog.com.br/medidas.htm)), a folga é de
  uns 3,10 m, e os 2,50 m ficam dentro;
- dois paletes PBR empilhados.

A amarração é exigida pela [CONTRAN 945/2022](https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-contran/resolucoes/Resolucao9452022.pdf).

**Carga do toco aberto.** O usuário escolheu os 10.685 kg da SINAPI, e não os 6.000 kg do baú.

**Linhas que não entram**, por decisão do usuário ou por falta de fonte:

- granelera `03`, em qualquer tipo;
- carroceria aberta de truck, 3/4, VUC e carreta, porque não há medida de fabricante publicada;
- nada com `00`.

## T6b — a regra da carroceria desce ao domínio

O commit 4cfd2c90 (T6) pôs a regra "`00` só no cavalo; cavalo só aceita `00`" como `throw` direto
dentro do `superRefine` de `fleet-request.schema.ts` (`assertVehicleBodyType`). Isso destoa do
padrão do repositório: regra de domínio com código próprio de erro mora em política pura de
`domain/`, e é chamada na fronteira — o exemplo citado na task foi `driver-coverage.policy.ts`.

**A investigação corrigiu uma premissa da task.** `assertDriverCoverage` não é chamado por um caso
de uso — é chamado direto em `parseReplaceDriverRegionsRequest`
(`freight-regions/presentation/fleet-driver-region.schema.ts:47`), fora de qualquer `superRefine`,
como uma função pura de fronteira. Chamar `checkVehicleBodyType` dentro do caso de uso (como a task
pedia) quebraria o contrato HTTP existente: `test/fleet-http/vehicle-body-type.contract.ts` roda
contra `test/fixtures/fleet-http.fixture.ts`, cujo `createVehicle.execute`/`updateVehicle.execute`
são **stubs** que só registram a chamada e devolvem sucesso — nunca chegam a invocar o caso de uso
real. Uma regra que só existisse dentro do caso de uso nunca dispararia nesse teste, e o `400` viraria
`201`/`200` sem que o teste mudasse de expectativa (o que a task pedia para evitar). Segui então o
desenho **efetivamente encontrado**: a política mora em `fleet/domain/vehicle-body-type.policy.ts`
(`checkVehicleBodyType`, parâmetro único tipado `VehicleBodyTypeShape`) e é chamada nos dois parsers
de fronteira, `parseCreateVehicleRequest` e `parseUpdateVehicleRequest`
(`fleet/presentation/fleet.schema.ts`), no mesmo ponto onde `assertDriverCoverage` é chamado para
motorista. `assertVehicleBodyType` saiu do `superRefine` de `fleet-request.schema.ts`, que volta a
só validar forma (mais a regra `vehicleType`/`ownership`/combustível, que continua ali por não ter
código de erro próprio).

Comandos e evidência:

- `bun run --cwd apps/api-transportada typecheck`: limpo.
- `bun run --cwd apps/api-transportada test`: **5080 pass, 23 skip, 0 fail, 5103 testes** (suíte
  inteira) — inclui as 13 novas asserções de `test/fleet-domain/vehicle-body-type.contract.ts`
  (9 do `test.each` de tipos que não tracionam + 4 casos individuais), sem tocar em
  `test/fleet-http/vehicle-body-type.contract.ts` nem em `test/fleet-application/vehicles.contract.ts`
  (o caso de uso não ganhou a checagem, então não ganhou caso de erro novo).
- `npx prettier --write` e `npx eslint` nos arquivos tocados e criados: sem avisos.

Arquivos:

- `apps/api-transportada/src/fleet/domain/vehicle-body-type.policy.ts` (novo)
- `apps/api-transportada/src/fleet/presentation/fleet.schema.ts` (chama a política nos dois parsers)
- `apps/api-transportada/src/fleet/presentation/fleet-request.schema.ts` (remove `assertVehicleBodyType`
  e os símbolos que só ela usava)
- `apps/api-transportada/test/fleet-domain/vehicle-body-type.contract.ts` (novo)
- `apps/api-transportada/test/fleet-domain.contract.test.ts` (novo import)

## T8 — migration trip_trailer_vehicle (à mão)

**Por que à mão, e não `db:generate`.** As 35 migrations mais recentes do repositório (de
`20260902140000_cargo_volume_factors` a `20260910120000_vehicle_reference_every_type`) são
`migration.sql` + `rollback.sql` escritos à mão, sem `snapshot.json` — o próprio `drizzle/meta/`
não existe mais neste repositório. Confirmado lendo o migrator de fato usado
(`node_modules/.../drizzle-orm/migrator.js`, `readMigrationFiles`): ele lê os subdiretórios de
`drizzle/` direto (sem `_journal.json`), ordena por nome e extrai a data das 14 primeiras posições
do nome da pasta — é por isso que o precedente de nomear a pasta `YYYYMMDDHHMMSS_descricao` funciona
sem journal nenhum. Rodar `db:generate` hoje diffaria contra um snapshot desatualizado e
reintroduziria como "novas" cerca de dez migrations já aplicadas — o mesmo risco que o plan.md já
sinalizava. Segui o precedente das 35: SQL de mão, no formato de `20260907190000_cargo_placement_properties`
e `20260910120000_vehicle_reference_every_type` (tabulação, `ADD COLUMN IF NOT EXISTS`, `ADD
CONSTRAINT` nomeado igual ao Drizzle, `DROP ... IF EXISTS` no rollback na ordem inversa, bloco `DO $$`
apagando a própria linha do journal e conferindo `ROW_COUNT = 1`).

**Statements da migration** (`drizzle/20260913120000_trip_trailer_vehicle/migration.sql`), só ADD —
nenhum DROP/UPDATE/ALTER TYPE, nada em `body_type`:

1. `ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS default_trailer_vehicle_id uuid` — nula.
2. `ALTER TABLE trips ADD COLUMN IF NOT EXISTS trailer_vehicle_id uuid` — nula.
3. `ALTER TABLE fleet_vehicles ADD CONSTRAINT fleet_vehicles_company_default_trailer_fk FOREIGN KEY
(company_id, default_trailer_vehicle_id) REFERENCES fleet_vehicles (company_id, id) ON DELETE
RESTRICT ON UPDATE CASCADE` — auto-referente, pela mesma `fleet_vehicles_company_id_id_unique`.
4. `ALTER TABLE trips ADD CONSTRAINT trips_company_trailer_vehicle_fk FOREIGN KEY (company_id,
trailer_vehicle_id) REFERENCES fleet_vehicles (company_id, id) ON DELETE RESTRICT ON UPDATE
CASCADE`.
5. `ALTER TABLE fleet_vehicles ADD CONSTRAINT fleet_vehicles_default_trailer_tractor_only CHECK
(default_trailer_vehicle_id IS NULL OR vehicle_type = 'tractor_unit')`.
6. `ALTER TABLE fleet_vehicles ADD CONSTRAINT fleet_vehicles_default_trailer_not_self CHECK
(default_trailer_vehicle_id IS NULL OR default_trailer_vehicle_id <> id)`.
7. `ALTER TABLE trips ADD CONSTRAINT trips_trailer_not_vehicle CHECK (trailer_vehicle_id IS NULL OR
trailer_vehicle_id <> vehicle_id)`.
8. `CREATE UNIQUE INDEX IF NOT EXISTS trips_company_trailer_open_unique ON trips (company_id,
trailer_vehicle_id) WHERE trailer_vehicle_id IS NOT NULL AND status NOT IN ('completed',
'cancelled')`.

Os oito statements reproduzem, byte a byte no vocabulário SQL, as definições já escritas no schema
Drizzle (`trip.schema.ts`, `fleet.schema.ts`) — nenhuma foi inventada na migration.

**Rollback** (`rollback.sql`): bloco `DO $$` apagando a linha do journal (`RAISE EXCEPTION` se não for
exatamente uma), depois `DROP INDEX IF EXISTS`, os quatro `DROP CONSTRAINT IF EXISTS` (CHECKs antes
das FKs, ordem inversa da criação) e os dois `DROP COLUMN IF EXISTS` — devolve o esquema, nunca os
valores: cavalo com carreta padrão e viagem com carreta vinculada perdem o vínculo, sem forma de
redescobri-lo.

**`db:check`**: `Everything's fine 🐶🔥` — schema Drizzle e o SQL à mão continuam batendo.

**Asserções de migration** (`test/database-migration/`):

- `fleet-constraints.assertion.ts` — `assertDefaultTrailerConstraints` (novo), chamado do fim de
  `assertFleetConstraints`: FK cruzando empresa (`fleet_vehicles_company_default_trailer_fk`, 23503),
  `fleet_vehicles_default_trailer_not_self` (23514, veículo apontando pra si mesmo) e
  `fleet_vehicles_default_trailer_tractor_only` (23514, tentando declarar carreta padrão no
  implemento `trailerId`, que não é `tractor_unit`) — termina com uma atribuição válida
  (`vehicleId → trailerId`) e reset para `null`.
- `trip-constraints.assertion.ts` — `assertTrailerVehicleConstraints` (novo), chamado do fim de
  `assertTripConstraints`: FK cruzando empresa (`trips_company_trailer_vehicle_fk`, 23503),
  `trips_trailer_not_vehicle` (23514, carreta = próprio `vehicle_id`), e
  `trips_company_trailer_open_unique` (23505 na segunda viagem aberta com a mesma carreta; depois de
  marcar a primeira como `completed`, a terceira viagem com a mesma carreta entra sem erro).
- `static-migration.contract.ts` — acrescentada a entrada `20260913120000_trip_trailer_vehicle` na
  lista exaustiva de diretórios de migration que o contrato confere.
- `test/fleet-schema/vehicles.contract.ts` — `default_trailer_vehicle_id` entrou na lista exaustiva
  de colunas de `fleet_vehicles` e foi excluída de `requiredColumnNames` (nula por padrão).
- `test/fleet-infrastructure/vehicle-mapper.contract.ts` — fixture `RECORD` ganhou
  `defaultTrailerVehicleId: null` (o tipo inferido do schema passou a exigir o campo).

**Worker**: nenhuma cópia das colunas em `apps/worker-transportada/src/database/routing.schema.ts`
— por decisão da task (T8 só schema+migration da API; a cópia do worker, se vier a existir, é de
outra task). `bun run --cwd apps/worker-transportada typecheck` continua limpo porque o worker não
lê essas colunas.

**Gates:**

- `bun run --cwd apps/api-transportada db:check` → `Everything's fine 🐶🔥`.
- `bun run --cwd apps/api-transportada typecheck` → limpo.
- `bun run --cwd apps/api-transportada lint` → limpo (após remover o parâmetro `companyId` não usado
  em `assertDefaultTrailerConstraints`).
- `bunx prettier --check` nos seis arquivos tocados/criados → `All matched files use Prettier code
style!`.
- `bun run --cwd apps/api-transportada test` → **5080 pass, 23 skip, 0 fail, 37152 expect() calls,
  163 arquivos** (suíte sem Postgres — os testes de migration ficam `skip` sem
  `DRIZZLE_TEST_DATABASE_URL`).
- `make migration-test` (raiz do worktree, Postgres descartável via `postgres-up`) → **91 pass, 0
  fail, 1119 expect() calls, 8 arquivos** — inclui `database-migration.contract.test.ts`, que aplica
  a pasta `drizzle/` inteira (agora com a migration nova), roda as novas asserções de carreta,
  desfaz todos os rollbacks pós-identidade em cadeia, reaplica tudo do zero e desfaz de novo até a
  migration de identidade. Nenhuma falha de infraestrutura; nada destrutivo revelado.
- `bun run --cwd apps/worker-transportada typecheck` → limpo.

**Commit:** `feat(database): 147 T8 — a carreta ganha coluna na viagem e na frota`.

## T9 — Carreta padrão na ficha do cavalo (só API)

**Desenho seguido: pura no domínio (só forma), assíncrona no caso de uso (o que depende de outra
linha).** `checkVehicleDefaultTrailer` (`fleet/domain/vehicle-default-trailer.policy.ts`, novo) é
função pura, mesmo molde de `checkVehicleBodyType`/`checkVehicleDefaultTrailer` — só sabe recusar
`defaultTrailerVehicleId !== null` fora de `tractor_unit`, com `FleetVehicleDefaultTrailerRequiresTractorError`
(400 `FLEET_VEHICLE_DEFAULT_TRAILER_REQUIRES_TRACTOR`). Ela é chamada em `parseCreateVehicleRequest`/
`parseUpdateVehicleRequest` (`fleet/presentation/fleet.schema.ts`), no mesmo ponto de
`checkVehicleBodyType`, seguindo o precedente do T6b (regra pura na fronteira, não dentro do
`superRefine` do Zod).

As duas regras que **dependem de outra linha** ficam em `fleet-vehicles.use-case.ts`
(`assertDefaultTrailer`/`assertRoleChangeAllowed`), porque `parseCreateVehicleRequest` não tem acesso
ao banco:

- **O apontado existe/é carreta ativa da empresa** — `assertDefaultTrailer` chama
  `repository.findById({companyId, vehicleId: defaultTrailerVehicleId})` (método que já existia, já
  filtra por `company_id`): ausente → `FleetVehicleNotFoundError` (404, reuso do código existente,
  como a task pedia com "ou equivalente existente"); presente mas `role !== 'trailer'` ou
  `status !== 'active'` → `FleetVehicleDefaultTrailerNotATrailerError` (400
  `FLEET_VEHICLE_DEFAULT_TRAILER_NOT_A_TRAILER`, classe nova).
- **Trocar o `role` de uma carreta para `traction` quando ela é padrão de algum cavalo, ou está numa
  viagem aberta** — `assertRoleChangeAllowed`: só age quando `input.vehicle.role === 'traction'` e o
  veículo gravado (`repository.findById({companyId, vehicleId})`) tem `role === 'trailer'`; nesse
  caso chama o método novo do repositório `isTrailerInUse` e lança `FleetVehicleRoleChangeBlockedError`
  (409 `FLEET_VEHICLE_ROLE_CHANGE_BLOCKED`) se `true`.

**`isTrailerInUse` (`DrizzleFleetVehicleRepository`, método novo do `FleetVehicleRepositoryPort`)
faz duas consultas, não um `leftJoin`, porque são tabelas diferentes:** uma em `fleet_vehicles`
(`default_trailer_vehicle_id = :vehicleId`, mesma empresa) e uma em `trips`
(`trailer_vehicle_id = :vehicleId`, `status not in ('completed','cancelled')`, mesma empresa) — o
mesmo recorte do índice `trips_company_trailer_open_unique` (T8), espelhado na constante
`TRIP_CLOSED_STATUSES`. A segunda consulta é a primeira vez que o módulo `fleet` lê a tabela `trips`
diretamente — sem precedente dentro de `fleet/`, mas simétrico ao que `trips/infrastructure/
trip-occupancy.support.ts` já faz ao ler `fleet_vehicles` (cross-module read na camada de
infraestrutura, não pela porta do outro módulo). Reportado aqui por transparência, não é um bloqueio:
não há caso de uso de despacho nem regra fiscal envolvida, só uma leitura de existência.

**Tradução de violação do banco (23514/23505): não foi necessária.** As duas regras (apontado existe
e é carreta ativa; role-change bloqueado) são conferidas **antes** da escrita, no caso de uso — o
caminho que chegaria ao `INSERT`/`UPDATE` com dado inválido já foi barrado. `checkVehicleDefaultTrailer`
cobre a única regra puramente estrutural (`tractor_unit`) que também é CHECK
(`fleet_vehicles_default_trailer_tractor_only`) — redundante de propósito (a mesma defesa em
profundidade de `checkVehicleBodyType`/`FLEET_VEHICLE_BODY_TYPE_REQUIRED`). Não há CHECK para "é
carreta ativa" nem para "não está em uso" (exigem SELECT), então não há violação 23514 possível para
essas duas na escrita normal — só correria numa corrida entre duas requisições, e a task não pediu
tratar essa corrida na T9 (ao contrário da T10, onde o índice `trips_company_trailer_open_unique`
fecha a corrida por design).

**Campos e mapeamento:** `FleetVehicleInput.defaultTrailerVehicleId: string | null` (`fleet.port.ts`);
`fleet-request.schema.ts`'s `vehicleFieldsSchema` ganhou `defaultTrailerVehicleId: z.uuid().nullable()`;
`fleet.mapper.ts`'s `mapVehicle`/`toVehicleColumns` leem/escrevem a coluna já existente (T8); `fleet.routes.ts`'s
`serializeVehicle` publica o campo na resposta de POST/PUT/GET.

**Frontend — só o guard, nada de tela, como pedido:**

- `fleet.types.ts`'s `FleetVehicleDetail` ganhou `defaultTrailerVehicleId: null | string`.
- `fleet.constant.ts`'s `VEHICLE_DETAIL_KEYS` ganhou a chave (campo **obrigatório**, não opcional —
  ao contrário do padrão de `trip.constant.ts`'s `TRIP_DETAIL_OPTIONAL_KEYS`/spec 078 D2, que existe
  para tolerar uma API mais velha que o frontend numa janela de deploy separada; aqui a API e este
  guard sobem no mesmo commit/deploy, então não há tal janela a proteger). `VEHICLE_BODY_KEYS`
  **não** foi tocada — ela é compartilhada com `VEHICLE_FORM_KEYS` (o lado de escrita/tela), e a
  task pediu "nada de tela".
- `fleetResponse.validation.ts`'s `isVehicle` ganhou `isNullableString(value.defaultTrailerVehicleId)`.
- Fixtures (`test/fleet/fleet.fixture.ts`): `FleetVehicleDetailContract` e os seis literais
  `satisfies` desse tipo (`VEHICLE_DETAIL`, `NO_COSTS_VEHICLE_DETAIL` — herda por spread —,
  `FLEX_VEHICLE_DETAIL` — idem —, `DRIVER_OWNED_VEHICLE`, `INCOMPLETE_TRACTION_VEHICLE_DETAIL`)
  ganharam o campo; os dois últimos não espalham de `VEHICLE_DETAIL`, então precisaram do campo
  explícito.
- Contrato novo: `test/fleet/vehicle-default-trailer.contract.ts` (aceita `null`/uuid, recusa tipo
  errado, recusa ausência da chave — já que ela é obrigatória).

**Testes novos, contrato vermelho antes da implementação em cada um:**

- `test/fleet-domain/vehicle-default-trailer.contract.ts` (novo, API): tabela — 10 tipos não-cavalo
  recusam, `tractor_unit` aceita, `null` sempre aceita. Vermelho: `Cannot find module
'.../vehicle-default-trailer.policy'` antes do arquivo existir.
- `test/fleet-http/vehicle-default-trailer.contract.ts` (novo, API): só a regra pura de fronteira —
  o fixture HTTP usa stubs que não chamam o caso de uso real (confirmado lendo
  `test/fixtures/fleet-http.fixture.ts`, mesma limitação já registrada em `vehicle-body-type.contract.ts`
  da T6), então as regras assíncronas (existência/role/status, role-change) não são alcançáveis por
  aqui — cobertas em `test/fleet-application/vehicles.contract.ts` abaixo.
- `test/fleet-application/vehicles.contract.ts` (estendido): dois `describe` novos —
  `'default trailer'` (aceita carreta ativa da empresa; 404 quando `findById` devolve `null`; 400
  `NOT_A_TRAILER` quando existe mas `status: 'inactive'`) e `'role change away from trailer'` (409
  quando `isTrailerInUse` devolve `true`; sucesso quando `false`; **não** chama `isTrailerInUse`
  quando o `role` de entrada não é `'traction'` — provado usando a mesma stub com `trailerInUse: true`
  e conferindo que a chamada de `update` ainda teve sucesso).
- `test/fleet-schema/tenant-safety.contract.ts` (estendido): `'makes a default trailer pointer
unable to reach another tenant vehicle'`, a mesma FK composta já criada na T8, agora coberta aqui
  como a task pedia ("contrato de tenant").
- `test/integration/fleet-vehicle-repository.integration.ts` (estendido, contra Postgres real):
  `'reports a trailer in use by a default pointer or an open trip'` — cria duas carretas, aponta uma
  como padrão de um terceiro veículo (→ `true`), vincula a outra a uma viagem `draft` inserida
  direto na tabela `trips` (→ `true`), cancela a viagem (→ `false` de novo). Cobre as duas fontes de
  uso na mesma consulta dupla.
- `test/fixtures/fleet-application.fixture.ts`: `createVehicleRepositoryStub` ganhou `isTrailerInUse`
  (parâmetro `trailerInUse?: boolean`, default `false`).
- Fixtures ajustadas pelo campo novo obrigatório em `FleetVehicleInput` (schema `.strict()`/tipo
  exato): `test/fixtures/fleet-http-payload.fixture.ts`'s `CREATE_VEHICLE_BODY` (as demais —
  `CREATE_TRAILER_BODY`, `UPDATE_VEHICLE_BODY`, `VEHICLE` — herdam por spread),
  `test/fleet-domain/vehicle-measure.contract.ts`'s `VEHICLE_BODY`,
  `test/integration/fleet-vehicle-repository.integration.ts`'s `NO_COSTS_VEHICLE`,
  `src/database/local-trip-seed.constant.ts`'s seis entradas de `LOCAL_TRIP_SEED_VEHICLES`. Nenhuma
  migration, nenhum `UPDATE` em `body_type` ou em qualquer coluna existente — só literais de teste e
  seed ganhando `defaultTrailerVehicleId: null`.

**Gates:**

- `bun run --cwd apps/api-transportada typecheck` → limpo.
- `bun run --cwd apps/api-transportada lint` → limpo.
- `bun run --cwd apps/api-transportada test` → **5102 pass, 23 skip, 0 fail, 5125 testes** (suíte
  sem Postgres; eram 5080 antes da T9 — a diferença de 22 é os testes novos desta task).
- `DATABASE_URL=postgresql://transportada:transportada@localhost:55432/transportada bun test
./test/integration/fleet-vehicle-repository.integration.ts` → **5 pass, 0 fail, 17 expect() calls**
  (Postgres local disponível; rodou de fato, incluindo o teste novo de `isTrailerInUse`).
- `bun run --cwd apps/frontend-transportada typecheck` → limpo.
- `bun run --cwd apps/frontend-transportada lint` (`eslint .`) → limpo (um `@typescript-eslint/unbound-method`
  corrigido trocando métodos do tipo `FleetAdaptersModule` local por propriedades de função, mesmo
  molde já usado em `vehicle-cost-fields.contract.ts`).
- `bun run --cwd apps/frontend-transportada test` (suíte inteira) → **3331 pass, 0 fail, 33731
  expect() calls, 29 arquivos** (sem regressão).
- `npx prettier --check` em todos os arquivos tocados/criados desta task → `All matched files use
Prettier code style!`.

**Commit:** `feat(fleet): 147 T9 — o cavalo tem carreta padrão`.
