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

## T10 — Domínio e rota `PUT /trips/:id/trailer`

**`checkTripAcceptsTrailer` (`trips/domain/trip-trailer.policy.ts`, novo) — molde de
`checkTripDocumentTransition`, não de `resolveTripVehicle`.** A T9 usou o molde de política que
lança direto (`checkVehicleBodyType`); aqui segui o outro molde já existente no mesmo domínio,
`checkTripDocumentTransition`, porque a tabela pedida ("contrato em tabela, estado × tipo") é
melhor servida por um outcome discriminado do que por exceção — a mesma ordem de portões do
comentário daquela função (idempotente → estado da viagem → regra específica):

```ts
export type TripTrailerAssignmentOutcome =
  | { readonly outcome: 'allowed' }
  | { readonly outcome: 'blocked'; readonly reason: TripTransitionBlock }
  | { readonly outcome: 'requiresTractor' }
  | { readonly outcome: 'unchanged' }
```

1. Mesmo valor (`nextTrailerVehicleId === currentTrailerVehicleId`) → `unchanged`, antes de tudo —
   é o que sustenta a idempotência pedida, incluindo em viagem já fechada.
2. Estado da viagem → **reusa `checkTripAcceptsLinkage`** (o mesmo portão de vincular/desvincular
   nota), como a task pedia. Bloqueia troca e desvínculo depois de `dispatched`.
3. Só então a regra específica: `nextTrailerVehicleId !== null && tractionVehicleType !==
'tractor_unit'` → `requiresTractor`. **Desatrelar (`null`) nunca exige cavalo** — só o portão de
   estado se aplica, porque um truck jamais teve carreta para começar (a regra de criação já
   impede isso) e um cavalo que virou truck no meio do caminho não deveria travar ao só limpar o
   campo.

A existência/role/status ativo do apontado (404/400) fica fora daqui — exige `SELECT`, como na T9 —
e mora no caso de uso.

**Erros novos em `trips/domain/trip.error.ts`:** `TripTrailerRequiresTractorError` (400
`TRIP_TRAILER_REQUIRES_TRACTOR`), `TripTrailerNotATrailerError` (400 `TRIP_TRAILER_NOT_A_TRAILER`),
`TripTrailerInUseError` (409 `TRIP_TRAILER_IN_USE`). Carreta inexistente/de outra empresa reusa
`TripVehicleNotFoundError` (404), como a task sugeria ("ou equivalente existente").

**`trip.use-case.ts`'s `setTrailer`** — busca a viagem (`findTripOrThrow`), o veículo tracionado
(`repository.findVehicle`, que ganhou `vehicleType`/`defaultTrailerVehicleId` na leitura), chama
`checkTripAcceptsTrailer` e trata os quatro desfechos; quando `nextTrailerVehicleId !== null` busca
o veículo apontado pelo **mesmo** `findVehicle` (ele já filtra por `company_id` — reuso integral,
sem método novo de existência) e confere `role === 'trailer' && status === 'active'`; faz a
checagem prévia de uso (`isTrailerInOpenTrip`, novo método) antes de escrever; por fim chama
`repository.setTrailer`, que **re-confere o portão de estado dentro da transação** com `for
('update')`, no mesmo desenho de `linkDocument` — a leitura do use-case não tem lock e pode estar
velha entre a checagem e a escrita.

**Criar a viagem de um cavalo copia a carreta padrão** — `resolveDefaultTrailerForCreation`
(`trip.use-case.ts`): só copia se `vehicleType === 'tractor_unit'` e `defaultTrailerVehicleId !==
null`; se a padrão já estiver em viagem aberta (`isTrailerInOpenTrip` sem `excludingTripId` — a
viagem ainda não tem id), a viagem nasce com `trailerVehicleId: null`, **nunca com erro** — a
padrão é só sugestão (T8 adendo, item 7). `CreateTripRecord.trailerVehicleId` é campo obrigatório
agora (não opcional), e `TripVehicleCandidate` ganhou `vehicleType`/`defaultTrailerVehicleId` para
o use-case decidir sem consulta extra.

**Trocar o veículo da viagem: confirmado N/A, com contrato de texto de fonte.** `grep` em
`drizzle-trip.repository.ts` confirma que o único `.update(trips)` fora de `setTrailer` é
`close()` (`status: 'completed'`) — não existe caminho de escrita para `vehicleId`. Registrado
aqui como a task pedia; **não** criei o contrato de texto de fonte "falha se `set({ vehicleId`
aparecer sobre `trips` sem limpar `trailerVehicleId`" porque não há hoje nenhuma ocorrência de
`set({ vehicleId` no arquivo para ancorar um guard negativo sem alvo — fica como pendência para
quem criar essa rota, anotada aqui e não esquecida.

**`isTrailerInUse` (fleet, T9) e `isTrailerInOpenTrip` (trips, T10) são funções irmãs, não a
mesma.** A de fleet responde "esta carreta está pendurada em algo" (default de outro cavalo OU
viagem aberta) para bloquear a troca de `role`; a de trips responde só "está em viagem aberta,
excluindo esta" (ou, na criação, sem exclusão) para decidir se um `PUT /trips/:id/trailer` pode
escrever. Reaproveitar uma pela outra acoplaria os dois módulos por um método com semântica
diferente em cada lado — mantive duas consultas curtas, cada uma no módulo dono da tabela que
decide.

**`readTripTrailer` (novo, `drizzle-trip.repository.ts`)** — uma consulta a mais **só quando a
viagem tem carreta** (`if (trailerVehicleId === null) return null`, sem ida ao banco): lê
`{bodyType, id, plate}` de `fleet_vehicles` pela mesma `company_id`. A maioria das viagens não tem
carreta hoje (frota local não tem nenhuma — T0), então o custo extra é zero no caso comum.

**Rota `PUT /trips/:id/trailer`** (`trip.routes.ts`, `TRIP_MANAGE_POLICY`, molde idêntico ao de
`PUT /trips/:id/mdfe-requirement`): corpo `{trailerVehicleId: uuid | null}`
(`setTripTrailerSchema`, `trip-request.schema.ts`), devolve `200 {data: TripDetail}`. Wired em
`main.ts` como `setTripTrailer: { execute: (input) => trips.setTrailer(input) }`.

**`test/separator-role.contract.test.ts`: rota nova entra por decisão escrita**, como a task
exigia — o separador tem `trip.manage`, e montar a viagem inclui escolher a carreta (mesmo
raciocínio já registrado no CLAUDE.md para o resto da montagem). A posição exata no array espelha
a ordem real de declaração das rotas em `createTripRoutes` (a última posição, depois de `POST
/trips/cargo-preview`), não uma ordem alfabética — confirmado rodando o teste vermelho primeiro e
copiando a posição real.

**Tenant:** `test/trip-schema/tenant-safety.contract.ts` ganhou a asserção da FK composta
`trips_company_trailer_vehicle_fk` (já existia desde a T8; faltava o teste dela). Integração nova
prova o isolamento de verdade: `repository.findVehicle` para a carreta de outra empresa devolve
`null` (não `403`, como a spec pede).

**Frontend — só o guard, nada de tela:**

- `trip.types.ts` ganhou `TripTrailer` e `TripDetail.trailer: TripTrailer | null`.
- `trip.constant.ts`: `trailer` entrou em `TRIP_DETAIL_OPTIONAL_KEYS` (ao contrário do campo da T9
  no módulo fleet, aqui usei o padrão opcional de verdade — `trip.constant.ts` já tinha o mecanismo
  pronto de `hasKeys({allowed, required})`, ao contrário de `fleet.constant.ts`, que usa
  `hasOnlyKeys`+`hasEveryKey` sem noção de opcional — e o próprio comentário do arquivo, spec 078
  D2, documenta exatamente esta situação: campo novo nasce opcional até a API estar garantidamente
  no ar). Nova constante `TRIP_TRAILER_KEYS = ['bodyType', 'id', 'plate']`.
- `tripResponse.validation.ts`: `isDetail` ganhou a cláusula opcional de `trailer`, e a função nova
  `isTrailer` (`hasExactKeys` + três `isString`).
- Fixtures: `test/trip/trip.fixture.ts` (`TripDetailContract` + `TRIP_DETAIL`),
  `test/trip-smoke.helper.ts` (`tripDetail()`, anotado com o mesmo aviso da spec 075 sobre o tipo
  escrito à mão não se enumerar sozinho).
- Contratos novos: `test/trip/occupancy-optional.contract.ts` ganhou um `describe` irmão do de
  `occupancy` (D2) cobrindo ausência/presença/forma errada de `trailer` — reusei o arquivo
  existente por ser exatamente o mesmo padrão (spec 078 D2), em vez de duplicar a infraestrutura de
  teste num arquivo novo.

**Gates:**

- `bun run --cwd apps/api-transportada typecheck` → limpo.
- `bun run --cwd apps/api-transportada lint` → limpo.
- `bun run --cwd apps/api-transportada test` → **5122 pass, 23 skip, 0 fail, 5145 testes** (suíte
  sem Postgres; eram 5102 antes da T10 — a diferença de 20 é os testes novos desta task).
- `DATABASE_URL=... bun test ./test/integration/trip-repository.integration.ts` → **2 pass, 0
  fail, 55 expect() calls** (o teste pré-existente do arquivo + o novo de T10, ambos rodaram contra
  Postgres local de verdade — create com/sem carreta, tenant, idempotência, `TripTrailerInUseError`
  por índice único, `TripStateTransitionNotAllowedError` pelo re-check transacional, desvínculo).
- `DATABASE_URL=... bun test ./test/integration/delivery-charge-end-to-end.integration.ts
./test/integration/mixed-cargo-end-to-end.integration.ts
./test/integration/trip-lifecycle.integration.ts` → **3 pass, 0 fail** (as três fixtures ganharam
  `trailerVehicleId: null` na criação; sem regressão).
- `bun run --cwd apps/frontend-transportada typecheck` → limpo.
- `bun run --cwd apps/frontend-transportada test` (suíte inteira) → **3334 pass, 0 fail, 33736
  expect() calls, 29 arquivos** (sem regressão; eram 3331 antes da T10).
- `npx prettier --check` em todos os arquivos tocados/criados desta task → `All matched files use
Prettier code style!`.

**Commit:** `feat(trips): 147 T10 — a viagem escolhe a carreta`.

## T11 — Despacho exige carreta

**A regra mora em `checkTripTransition`/`checkDispatch` (`trip-state.policy.ts`), como o plan.md
pedia — não num check separado no caso de uso.** `CheckTripTransitionParams` ganhou
`requiresTrailer?: boolean` (opcional, e só lido por `checkDispatch` — as outras ações continuam
ignorando o campo, comportamento idêntico ao de antes da feature). Ordem dos portões dentro de
`checkDispatch`, na mesma linha do comentário de `checkTripDocumentTransition` ("a ordem destes
portões é decisão, não acaso"): cancelado/completo → já despachado (`unchanged`) → sem roteiro
(`TRIP_HAS_NO_ROUTE`) → **então** sem carreta (`TRIP_TRAILER_REQUIRED`) → aplicado. O roteiro vem
antes porque sem parada nenhuma a carreta nem chegaria a importar — provado no contrato "the route
gate comes before the trailer gate".

**`TRIP_TRANSITION_BLOCK.tripTrailerRequired` é um `TripTransitionBlock` como os demais**, e por
isso `TRIP_TRANSITION_BLOCK_MESSAGES` (`trip.error.ts`, tipado `Record<TripTransitionBlock,
string>`) precisou de uma entrada para ele — mesmo essa mensagem **nunca chegando ao cliente**: o
comentário no próprio arquivo documenta que `dispatchTrip` intercepta esse motivo específico
**antes** de embrulhá-lo no genérico `TripStateTransitionNotAllowedError`, e lança
`TripTrailerRequiredError` (409 `TRIP_TRAILER_REQUIRED`) — código de topo dedicado, como a task
pedia, não `STATE_TRANSITION_NOT_ALLOWED` com o motivo em `details`.

**`DispatchTripPreconditions.requiresTrailer`** (novo campo, obrigatório — ao contrário do opcional
no domínio, aqui é sempre calculado): `drizzle-trip-route.repository.ts`'s `readRequiresTrailer`
(nova função) faz um `innerJoin` de `trips` com `fleetVehicles` pela mesma empresa, e devolve
`vehicleType === 'tractor_unit' && trailerVehicleId === null`. Consulta a mais só dentro de
`readPreconditions` (que já faz duas outras consultas próprias) — não em `readRouteState`, que é
compartilhada com o fluxo de planejar rota e não devia aprender uma regra que só o despacho usa.

**O snapshot de despacho ganha `trailer: {vehicleId, plate} | null`, lido na mesma transação.**
`buildRouteSnapshot` agora lê `trips.trailerVehicleId` primeiro (mesma transação de sempre) e, só
quando não é `null`, busca `plate` em `fleet_vehicles` (`readTrailerSnapshot`, nova função) — mesmo
padrão de "uma consulta a mais só quando existe" que `readTripTrailer` já usa na T10. Confirmado
por `grep` que **nenhum leitor de produção** decodifica o jsonb `tripDispatchSnapshots.snapshot`
hoje — os quatro arquivos que importam `tripDispatchSnapshots`
(`automatic-manifest-notifier.gateway.ts`, `drizzle-trip-location.repository.ts`,
`occurrence-notifier.gateway.ts`, `stop-occurrence-notifier.gateway.ts`) só leem as colunas de
metadado (`actorUserId`, `dispatchedAt`), nunca a coluna `snapshot` em si. Por isso "todo leitor
trata `trailer` ausente como `null`" não exigiu nenhuma mudança de código agora — só o tipo
`RouteSnapshot.trailer: RouteSnapshotTrailer | null`, documentado como o contrato futuro; o
primeiro leitor real dessa chave já a encontra tipada como nulável.

**Fixtures de integração ajustadas: quatro arquivos tinham cavalo (`tractor_unit`) despachando sem
carreta.** `test/integration/trip-lifecycle.integration.ts`,
`test/integration/delivery-charge-end-to-end.integration.ts`,
`test/integration/mixed-cargo-end-to-end.integration.ts` e `test/integration/me-trip.integration.ts`
ganharam um veículo `role: 'trailer'` a mais e uma chamada a `tripRepository.setTrailer` (ou o
campo `trailerVehicleId` direto no `insert` que já fazia à mão, em `me-trip.integration.ts`) antes
do primeiro `dispatchTrip` que esperava sucesso — **um cuidado**: em
`delivery-charge-end-to-end.integration.ts`, a carreta precisou entrar **antes** do primeiro
`dispatchTrip` (o que testa `TRIP_HAS_UNSCHEDULED_STOPS`), senão o portão da carreta dispararia
primeiro e mudaria o código do erro esperado por aquele teste — a ordem dos portões descrita acima
(roteiro → carreta → …) não inclui o agendamento do cliente, que é checado depois, no caso de uso.

**Testes novos, contrato vermelho antes da implementação:**

- `test/trip-domain/trip-state.contract.ts` (estendido): `describe('dispatch requires a trailer on
a tractor unit')` — bloqueia com `requiresTrailer: true`; o portão do roteiro vem primeiro; despacha
  normalmente com `requiresTrailer: false`; as demais ações ignoram o campo (comparado par a par,
  com e sem `requiresTrailer: true`); viagem já despachada continua `unchanged` independente da
  carreta. A grade de 90 células pré-existente (`action × tripStatus × hasRoute`) não foi tocada —
  ela nunca passa `requiresTrailer`, então cai no `undefined` que preserva o comportamento antigo.
- `test/trips/plan-and-dispatch.contract.ts` (estendido): `createDispatchFakePort` ganhou o
  parâmetro `requiresTrailer` (default `false`, preservando os testes existentes) e um teste novo,
  `'refuses to dispatch a tractor unit without a trailer'`, checando `TripTrailerRequiredError`
  (status 409).
- `test/integration/trip-lifecycle.integration.ts` (novo `testWithPostgres`): `'gates dispatch on a
tractor unit without a trailer'` — cavalo sem carreta → 409 `TRIP_TRAILER_REQUIRED`; atrela a
  carreta → despacha; truck (não-cavalo) despacha sem nunca precisar de carreta, e o snapshot dele
  trai `trailer: null`. Rodou de fato contra Postgres local.

**Gates:**

- `bun run --cwd apps/api-transportada typecheck` → limpo.
- `bun run --cwd apps/api-transportada lint` → limpo.
- `bun run --cwd apps/api-transportada test` → **5128 pass, 23 skip, 0 fail, 5151 testes** (suíte
  sem Postgres; eram 5122 antes da T11 — a diferença de 6 é os testes novos de domínio e de
  aplicação desta task).
- `DATABASE_URL=postgresql://transportada:transportada@localhost:55432/transportada bun test
./test/integration/trip-lifecycle.integration.ts ./test/integration/delivery-charge-end-to-end.integration.ts
./test/integration/mixed-cargo-end-to-end.integration.ts ./test/integration/me-trip.integration.ts
./test/integration/trip-repository.integration.ts ./test/integration/fleet-vehicle-repository.integration.ts
./test/integration/trip-capacity-unknown-reason.integration.ts
./test/integration/trip-detail-query-count.integration.ts` → **19 pass, 0 fail, 212 expect() calls**
  (rodou de fato; cobre os quatro arquivos ajustados mais o teste novo do portão da carreta, sem
  regressão nos vizinhos que também mexem em viagem/veículo).
- `npx prettier --check` em todos os arquivos tocados desta task → `All matched files use Prettier
code style!`.

**Commit:** `feat(trips): 147 T11 — o cavalo não sai sem carreta`.

## T12 — Ocupação lê a carreta

**`loadTripOccupancy` ganhou `trailerVehicleId: string | null` como parâmetro, e uma quarta consulta
condicional** (`trip-occupancy.support.ts`): só executa quando `trailerVehicleId !== null` (a
maioria das viagens não tem carreta — T0), lendo as mesmas colunas físicas do veículo de tração
(`bodyType`, `capacityM3`, `cargoHeightM/LengthM/WidthM`, `vehicleType`) da carreta, sempre com
`company_id` no `where`. Sem N+1: continua uma consulta ao veículo, uma à referência, uma aos
fatores, uma aos volumes — mais essa quinta, só quando existe carreta, exatamente como o RNF pedia.

**`carrier = trailer ?? vehicle` é o único ponto onde a "ficha de quem carrega" é decidida**, e
todo o resto da função que antes lia `vehicle` para capacidade/dimensões passou a ler `carrier`:
`resolveVehicleCapacity` (medidas → `capacity_m3` → referência), `toBedDimensions` (as duas
chamadas, no ramo sem ocupação e no de sucesso) e `resolveDimensions` (a origem `measured` do
`capacityDimensions`). `loadingAccess` e `maxPayloadKg` **continuam vindo do veículo de tração** —
nenhum dos dois foi mencionado no RF5/plan.md como devendo migrar para a carreta, e mexer neles
seria escopo que a task não pediu.

**`resolveVolumeReferenceKey` e `resolveCapacityUnknownReason` já aceitavam `trailer` desde a T1/T3
— só faltava alguém preencher o parâmetro com dado de verdade**, exatamente como os comentários dos
dois arquivos já anunciavam ("Fase 4 passa a preencher `trailer`"). Nenhuma mudança de assinatura
foi necessária nessas duas funções.

**As duas chamadoras de `loadTripOccupancy` foram ajustadas de formas diferentes, por motivos
diferentes:**

- `drizzle-trip.repository.ts`'s `readTripDetail` já tinha `record.trailerVehicleId` em mãos (a
  T10 já lê essa coluna da mesma linha de `trips` para montar `trailer: {id, plate, bodyType}`) —
  só passou o valor adiante, sem consulta nova.
- `trip-cargo-preview.query.ts`'s `readCargoPreviewContext` passa `trailerVehicleId: null` sempre,
  **de propósito**: a prévia (`POST /trips/cargo-preview`) acontece **antes** de a viagem existir —
  não há `trips.trailer_vehicle_id` para ler. Mostrar a sugestão da carreta padrão do veículo ali
  seria antecipar a P3 (seletor de carreta na tela "Nova viagem", frontend, fora do escopo desta
  task de API) — registrado aqui como decisão consciente, não esquecimento.

**Dependência da spec 145 (branch `work/cargo-missing-box`): reportada aqui, arquivo nenhum da 145
foi tocado**, como a task exigia. `trip-cargo-layout-input.support.ts` daquela branch lê hoje só
`trips.vehicleId` para decidir se o gatilho lazy da D7 precisa invalidar a planta congelada; com a
carreta podendo mudar (`PUT /trips/:id/trailer`, T10) sem que `vehicleId` mude, esse leitor **não
percebe** a troca — a planta ficaria com a escala da carreta antiga. Quem mexer na 145 depois desta
spec precisa estender aquele leitor para também observar `trips.trailerVehicleId`. Não perguntei ao
usuário sobre isso nesta task porque a instrução foi explícita ("não edite nada da 145... só relate
no evidence") — a pergunta em si (se cabe editar) fica para quando alguém for de fato tocar a 145.

**Testes novos, contrato vermelho antes da implementação:**

- `test/integration/trip-capacity-unknown-reason.integration.ts` (estendido, novo
  `testWithPostgres`): cavalo (`tractor_unit`) sem carreta → `occupancy: null` e
  `capacityUnknownReason: 'trailerMissing'`; depois de `repository.setTrailer` com uma carreta
  `body_type: '02'` sem ficha própria → `capacityUnknownReason: null`,
  `occupancy.capacitySource: 'reference'`, e `occupancy.capacityDimensions` batendo com a linha
  `('', '02')` do catálogo (14,270 × 2,460 × 2,700 m, seedada desde a migration
  `20260902150000_vehicle_volume_references`) — nunca com uma referência de `tractor_unit`, que não
  existe no catálogo (093 P4). Rodou de fato contra Postgres local.
- Regressão: todos os testes de integração que já exercitavam `loadTripOccupancy` indiretamente
  (`trip-repository.integration.ts`, `trip-detail-query-count.integration.ts`,
  `mixed-cargo-end-to-end.integration.ts`, `trip-lifecycle.integration.ts`,
  `delivery-charge-end-to-end.integration.ts`, `me-trip.integration.ts`) continuam verdes sem
  ajuste — nenhum deles tinha carreta antes desta task, e `trailerVehicleId: null` reproduz
  exatamente o comportamento anterior (a quarta consulta nem roda).

**Gates:**

- `bun run --cwd apps/api-transportada typecheck` → limpo.
- `bun run --cwd apps/api-transportada lint` → limpo.
- `bun run --cwd apps/api-transportada test` → **5128 pass, 23 skip, 0 fail, 5151 testes** (suíte
  sem Postgres; contagem idêntica à da T11 — T12 não acrescentou teste de unidade novo, só
  integração, que fica fora dessa lista).
- `DATABASE_URL=postgresql://transportada:transportada@localhost:55432/transportada bun test
./test/integration/trip-capacity-unknown-reason.integration.ts` → **2 pass, 0 fail, 9 expect()
  calls** (o teste pré-existente da T4 + o novo desta task, ambos verdes).
- Regressão: `DATABASE_URL=... bun test ./test/integration/trip-repository.integration.ts
./test/integration/mixed-cargo-end-to-end.integration.ts ./test/integration/trip-detail-query-count.integration.ts
./test/integration/trip-lifecycle.integration.ts ./test/integration/delivery-charge-end-to-end.integration.ts
./test/integration/me-trip.integration.ts` → **14 pass, 0 fail, 195 expect() calls**.
- `npx prettier --check` nos quatro arquivos tocados → `All matched files use Prettier code style!`.

**Commit:** `feat(trips): 147 T12 — a ocupação do cavalo é a da carreta`.

## T9 (frontend)

**Escopo: só a ficha do veículo (módulo `fleet`), como a task pedia.** A T9 da API já existia
(`FleetVehicleDetail.defaultTrailerVehicleId`, `FLEET_VEHICLE_DEFAULT_TRAILER_REQUIRES_TRACTOR`,
`FLEET_VEHICLE_DEFAULT_TRAILER_NOT_A_TRAILER`, `FLEET_VEHICLE_ROLE_CHANGE_BLOCKED` — ver seção
"T9 — Carreta padrão na ficha do cavalo (só API)" acima); esta parte fecha o formulário.

**`resolveVehicleDefaultTrailerForKindChange` (`fleetVehicleBodyType.service.ts`, novo) é o mesmo
molde de `resolveVehicleBodyTypeForKindChange`, e mora no mesmo arquivo** por serem as duas faces da
mesma regra (D3): sair do cavalo apaga a carreta padrão, nunca a carrega escondida para um tipo que
não tem o campo; virar cavalo não inventa uma. `vehicleFormPatch.service.ts`'s
`composeVehicleFormPatch` chama as duas funções lado a lado, com o mesmo gatilho (`role`/`vehicleType`
mudou).

**`VehicleOperationFields.component.tsx` ganhou o select "Carreta padrão"**, visível só quando
`isTractorUnitKind(state)` — ao lado de onde o `bodyType` desaparece para o cavalo, porque as duas
mostram/escondem pelo mesmo teste. As opções vêm de `useVehicleSelectOptions` (hook do próprio
módulo, já reusado cross-module por `trip/`) sobre `vehicles.filter(role === 'trailer' && status ===
'active')` — **sem endpoint novo**, a mesma frota que `VehicleModelFields` já recebe. `clearable`:
opção vazia é "sem padrão", como a spec pede. `VehicleForm.component.tsx` passou `vehicles` adiante.

**Campos e mapeamento:** `FleetVehicleFormState.defaultTrailerVehicleId: string` (`''` é "ainda não
escolhido"); `FleetVehicleBody.defaultTrailerVehicleId: null | string` migrou para o tipo
compartilhado (`FleetVehicleBody`), e `FleetVehicleDetail` deixou de redeclarar a mesma chave —
duplicata inofensiva, mas sem razão de existir depois que o campo passou a ser parte do corpo de
escrita. `VEHICLE_BODY_KEYS` e `VEHICLE_FORM_KEYS` ganharam a chave; `VEHICLE_DETAIL_KEYS` já a tinha
(T9-API) e não duplica mais. `fleetForm.service.ts`: `EMPTY_VEHICLE_FORM.defaultTrailerVehicleId =
''`; `toVehicleFormState` lê `vehicle.defaultTrailerVehicleId ?? ''`; `toVehicleBody` escreve `null`
quando `''`, o uuid quando escolhido — enviado sempre, inclusive fora do cavalo (sempre `null` ali,
porque o campo nem aparece e a limpeza ao trocar de tipo garante isso).

**Os três códigos de erro novos da API mapeados em `fleet.constant.ts`'s
`FLEET_FEEDBACK_KEY_BY_ERROR`** (`defaultTrailerRequiresTractor`, `defaultTrailerNotATrailer`,
`roleChangeBlocked`), com rótulo pt-BR acentuado e inglês em `fleet.locale.json`/`fleet.en.locale.json`
— mesmo padrão do T7 (`bodyTypeRequired`/`bodyTypeNotApplicable`).

**Testes novos, contrato vermelho antes da implementação:**

- `test/fleet/vehicle-default-trailer-form.contract.ts` (novo): `resolveVehicleDefaultTrailerForKindChange`
  (limpa saindo do cavalo, não inventa entrando, não faz nada sem mudança de tipo);
  `EMPTY_VEHICLE_FORM.defaultTrailerVehicleId === ''`; `toVehicleBody` mapeando `''`→`null` e uuid→uuid;
  `toVehicleFormState` mapeando `null`→`''`; o componente só mostra o campo em `isTractorUnitKind`
  (texto de fonte); os três códigos de erro têm rótulo nos dois locales.
- `test/fleet/fleet.fixture.ts`: `FleetVehicleBodyContract` ganhou `defaultTrailerVehicleId: null |
string` (a chave saiu de `FleetVehicleDetailContract`, que já a tinha — mesma limpeza do tipo de
  produção); `VEHICLE_BODY` e `VEHICLE_DRAFT_BODY` ganharam `defaultTrailerVehicleId: null`
  (`AGGREGATE_VEHICLE_BODY`/`FLEX_VEHICLE_BODY`/`INCOMPLETE_TRACTION_VEHICLE_BODY` herdam por spread).

**Gates:**

- `bun run --cwd apps/frontend-transportada typecheck` → limpo.
- `bun run --cwd apps/frontend-transportada lint` → limpo.
- `bun run --cwd apps/frontend-transportada test` (suíte inteira) → **3341 pass, 0 fail, 33773
  expect() calls, 29 arquivos** (eram 3334 antes desta task — 7 testes novos, sem regressão).
- `bun test apps/frontend-transportada/test/fleet.contract.test.ts` → **538 pass, 0 fail, 6645
  expect() calls** (isolado).
- `npx prettier --write` nos arquivos tocados/criados → sem diff além da própria formatação.

**Commit:** `feat(fleet): 147 T9 — a ficha do cavalo escolhe a carreta padrão`.

## T13

**`SetTripTrailerInput` (`trip.types.ts`, novo) e `setTripTrailer` no `tripClient.service.ts`** —
molde idêntico a `setTripMdfeRequirement`: `PUT /trips/:id/trailer` com `{trailerVehicleId: uuid |
null}`, resposta `{data: TripDetail}` lida por `adapters.tripDetailFromApi` (já existente, sem
mudança — `trailer` já era aceito por `isDetail` desde a T10). `useTripWorkspace.hook.ts` ganhou
`setTripTrailer` no `TripController` (gate `trip.manage`, como todo write de viagem) e
`setTrailerMutation` — **no mesmo hook de sempre, sem pasta `mutations/`**, como o CLAUDE.md exige —
com `onSuccess: invalidate` (a mesma invalidação de `tripKey`+`listKey` que `setMdfeRequirementMutation`
usa, não `invalidateDocumentLink`).

**Avaliado e decidido: nenhuma invalidação de chave da frota.** A task pedia para avaliar se trocar a
carreta "afeta a frota — a carreta 'em uso' muda a lista de carretas disponíveis". `FleetVehicleDetail`
não carrega nenhum indicador de "em uso" (nem por design: a T9-API decidiu que uma carreta pode ser
padrão de vários cavalos, e a exclusividade de verdade só existe por viagem aberta, verificada no
servidor a cada escrita — T10/T11). A lista de carretas que o select oferece (`useVehicleSelectOptions`
sobre `role === 'trailer' && status === 'active'`) não muda com o vínculo de viagem nenhuma, então
invalidar `'fleet-vehicles'` não mudaria nada visível — só custaria uma consulta a mais em toda troca
de carreta. Registrado aqui como decisão consciente, não esquecimento.

**`TripDetail.component.tsx`**: `isTractorUnit` deriva do `vehicles` já carregado (mesmo padrão de
`vehicleType` que `TripCargoPanel` já usa), e `trailerOptions` (hook `useVehicleSelectOptions`, **cross-
module reuso do `fleet/`**, já usado por `trip/` antes desta task) é chamado **antes** dos `return`
condicionais do componente — junto de `useRouteSuggestion`, pela mesma regra de hooks. O select
aparece só para o cavalo, com `clearable` (desatrelar é `null`), `disabled={!canManage ||
!isEditable}` — `isTripEditable` é a mesma função que já trava vincular/desvincular nota, e o backend
(T10) reusa exatamente `checkTripAcceptsLinkage` para o mesmo portão, então as duas travas nunca
divergem por desenho. Hint muda entre "pode ser trocada até o despacho" e "não pode mais ser trocada"
conforme `isEditable`.

**`TripStateActions.component.tsx`** ganhou `requiresTrailer: boolean` (calculado em `TripDetail` como
`isTractorUnit && (trip.trailer ?? null) === null` — o `?? null` cobre a janela em que `trailer` é
opcional na resposta, spec 078 D2). O botão "Despachar" fica `disabled` e um aviso
(`stateActions.trailerRequired`, "O cavalo não sai sem carreta.") aparece **antes** do clique — espelho
do `409 TRIP_TRAILER_REQUIRED` do backend (T11), no mesmo espírito do aviso de notas não carregadas que
já existia ao lado.

**`TripQuickCreateDialog.component.tsx`**: só **informa**, nunca deixa escolher — a API já copia a
carreta padrão do cavalo ao criar a viagem (T10, sem input no corpo de criação). O texto usa
`selectedVehicle.defaultTrailerVehicleId` (campo que a T9 trouxe para `FleetVehicleDetail`) resolvido
contra a própria `vehicles` já carregada, sem requisição nova: "nasce com a carreta padrão: {placa}"
ou "não tem carreta padrão — nasce sem carreta" quando `defaultTrailerVehicleId` é `null` ou aponta
para um veículo fora da lista.

**`TripCargoPanel`/`resolveCapacityUnknownMessage` (motivo `trailerMissing`, T5) confirmados
coerentes, sem mudança.** O link já apontava para `buildFleetVehicleRoute(vehicleId)` — a ficha do
**cavalo**, que desde a T9 tem o campo "Carreta padrão" nela. Nada a corrigir.

**`test/trip/state-gates.contract.ts` confirmado sem mudança**: o select de carreta reusa
`isTripEditable`, que já está coberto ali; nenhum gate novo foi inventado no frontend (o backend
também reusa `checkTripAcceptsLinkage`, não criou uma política nova para a carreta).

**Erros novos mapeados em `trip.constant.ts`'s `TRIP_FEEDBACK_KEY_BY_ERROR`**
(`trailerRequiresTractor`, `trailerNotATrailer`, `trailerInUse`, `trailerRequired`), com rótulo
pt-BR acentuado e inglês em `trip.locale.json`/`trip.en.locale.json`, mais `detail.trailer*`,
`stateActions.trailerRequired` e `creation.trailerDefault*`.

**Testes novos, contrato vermelho antes da implementação:**

- `test/trip/trip-trailer.contract.ts` (novo, 7 testes): o cliente HTTP faz `PUT
/trips/:id/trailer` com `{trailerVehicleId}` (uuid e `null`); a mutação é `trip.manage` como toda
  escrita de viagem; `setTrailerMutation` mora em `useTripWorkspace.hook.ts` e invalida a viagem;
  o select do detalhe só aparece para `tractor_unit` e trava por `isTripEditable` (texto de fonte);
  o botão de despacho desabilita e avisa antes do clique (texto de fonte); o diálogo de criação só
  informa, nunca chama `setTripTrailer` (texto de fonte, guarda negativa); os quatro códigos de erro
  têm rótulo nos dois locales.

**Gates:**

- `bun run --cwd apps/frontend-transportada typecheck` → limpo.
- `bun run --cwd apps/frontend-transportada lint` → limpo.
- `bun run --cwd apps/frontend-transportada test` (suíte inteira) → **3348 pass, 0 fail, 33809
  expect() calls, 29 arquivos** (eram 3341 antes desta task — 7 testes novos, sem regressão).
- `bun test apps/frontend-transportada/test/trip.contract.test.ts` → **715 pass, 0 fail, 17211
  expect() calls** (isolado).
- `bun run --cwd apps/frontend-transportada build` → build de produção verde (avisos de chunk >500 kB
  pré-existentes, não relacionados a esta task).
- `npx prettier --write` nos arquivos tocados/criados → sem diff além da própria formatação.

**Commit:** `feat(trip): 147 T13 — a viagem de cavalo mostra e troca a carreta`.

## T16 — catálogo 01/04 (migration à mão)

- Pasta `drizzle/20260913130000_vehicle_reference_open_and_container/`, à mão como as 35 anteriores (ver T8). `INSERT … ON CONFLICT DO NOTHING` de três linhas aprovadas na T-cat: `('toco','01')` 7,000×2,500×2,500 m / 10.685 kg (SINAPI 89265; altura por convenção, dita no comentário), `('','04')` contêiner 40' dry 12,030×2,350×2,390 / 27.600 kg, `('truck','04')` contêiner 20' dry 5,900×2,350×2,390 / 25.000 kg (DSV, conferido na Guia Log). Rollback apaga só as três chaves e a entrada do journal.
- Registrada em `static-migration.contract.ts`. Não há teste de conteúdo do catálogo (só forma, em `test/fleet-schema/vehicle-volume-references.contract.ts`).
- Gates: `db:check` ok; `make migration-test` 91 pass/0 fail; typecheck limpo; api test 5128 pass/23 skip/0 fail, 37328 expect() calls.
- ⚠️ Efeito colateral encontrado: a sugestão de ficha (spec 093, `vehicleSuggestion.service.ts`) casa o catálogo só por `vehicleType` e pega a primeira linha em ordem de `body_type`; com `('toco','01')`, todo toco novo passaria a receber a sugestão da carroceria aberta em vez do baú. Corrigido na T16b.

## T16b — a sugestão casa pela carroceria

- `resolveVehicleSuggestion`/`fromReference` (`vehicleSuggestion.service.ts`) ganham `bodyType` no input: a referência agora casa por `(vehicleType, bodyType)`, nunca só por tipo. Sem carroceria escolhida (`''`) ou com `'00'` (não aplicável — só o cavalo), `fromReference` devolve `null` sem consultar o catálogo — a carroceria é obrigatória fora do cavalo (D1), e sem ela qualquer linha seria palpite.
- Precedência da 093 intacta: veículo da frota com a mesma marca e modelo já medido continua vencendo a referência, e a referência continua vencendo a ausência.
- `SUGGESTION_TRIGGERS` (`vehicleFormPatch.service.ts`) ganha `bodyType` ao lado de `brand`/`model`/`vehicleType` — trocar só a carroceria depois do tipo agora reavalia a sugestão. `resolveVehicleSuggestion` passa a receber `bodyType: corrected.bodyType`. `applyVehicleSuggestion` não mudou: continua entrando só em campo em branco, então reavaliar a sugestão nunca sobrescreve o que o operador já digitou.
- Contrato vermelho antes em `test/fleet/vehicle-suggestion.contract.ts`: `REFERENCES` ganhou `('toco','02')` baú 7,00×2,50×2,40, `('toco','01')` aberta 7,00×2,50×2,50 e `('truck','04')` contêiner 20' — as duas linhas de `toco` provam que a chave errada (só tipo) sempre acertaria a primeira em ordem. Cinco testes novos em "a referência casa pela carroceria" (toco+02 → baú; toco+01 → aberta; toco sem carroceria e toco+`00` → sem sugestão de referência; truck+04 → 20') e dois em "Vehicle form patch composition" (trocar a carroceria depois do tipo reavalia; e não sobrescreve campo já medido). Chamadas pré-existentes de `resolveVehicleSuggestion`/`composeVehicleFormPatch` ganharam `bodyType: '02'` para continuar exercitando a mesma referência de antes.
- Gates: `bun run --cwd apps/frontend-transportada typecheck` limpo; `lint` limpo; `test` → **3355 pass, 0 fail, 33818 expect() calls, 29 arquivos** (eram 3348 antes — 7 testes novos, sem regressão); `build` verde (avisos de chunk >500 kB pré-existentes); `npx prettier --write` nos três arquivos tocados → sem diff de conteúdo, só a formatação do prettier.
- Nada em `docs/ai-context` ou em contrato afirmava "a sugestão casa só por `vehicleType`" em texto — a única afirmação estava no comentário de `fromReference` citado acima, reescrito nesta task. Ajuste de documentação/spec sobre a mudança de comportamento fica para a T17.

**Commit:** `fix(fleet): 147 T16b — a sugestão do catálogo casa pela carroceria`.

## T14 — `GET /pending-items` (API)

Módulo novo `apps/api-transportada/src/pending-items/`, quatro camadas mínimas (sem `domain/` — a
consulta é a própria regra, expressa como filtro SQL, e não há política pura a isolar):

- `application/pending-item-source.port.ts`: `PendingItemSourcePort` (`kind`, `requiredPermission`,
  `list`) e os tipos `PendingItem`/`PendingItemPage`. Hoje um `PendingItemKind` só,
  `vehicleBodyTypeMissing`.
- `application/list-pending-items.use-case.ts`: filtra as fontes pela permissão do chamador
  (`context.permissions`) e delega para a primeira que sobra. Sem fonte permitida, devolve
  `{items: [], nextCursor: null}` — nunca `403` no caso de uso, que é a página genérica de D2.
- `infrastructure/drizzle-fleet-body-type-pending-item.source.ts`: `buildFleetBodyTypePendingItemFilters`
  (exportada para o teste de tenant-safety, no molde de `buildDocumentListFilters` do nfe-documents) +
  `createFleetBodyTypePendingItemSource`. Filtro: `company_id = ctx`, `vehicle_type <> 'tractor_unit'`
  (alcança a carreta, que tem `vehicle_type = ''`, sem precisar nomeá-la), `body_type = '00'`,
  `status = 'active'`. **Decisão tomada nesta task, sem linha correspondente na spec:** só veículo
  `active` — pendência de veículo inativo não é trabalho para ninguém corrigir agora. `label` é a
  placa crua (RF9 já frisa: não é PII, e o texto "Veículo {placa} sem carroceria informada" é
  responsabilidade do frontend/T15).
- `presentation/pending-items.{routes,schema}.ts`: `GET /pending-items`, paginação por cursor via
  `readPaging`/`readListQuery` (`src/http/request-parsing.service.ts`) — o teto de 100 e a validação
  de cursor opaco já vêm de lá, sem reimplementar.

**Decisão registrada (pedida no prompt como ponto de checagem):** a spec e o plan.md dizem que a
rota deve aceitar "qualquer membro autenticado da empresa" porque a filtragem é por fonte, não por
rota. A infraestrutura de rotas (`router.service.ts`/`defineRoute`) **não tem** essa política — toda
`RouterRoute` exige uma `RouteAuthorizationPolicy` (`{permission, scope}`), sem opção de "autenticado
sem permissão específica". Segui a instrução de usar `fleet.read` (a mesma permissão da única fonte
hoje) e relatar: na prática, hoje isso é equivalente ao desenho pretendido — quem não tem
`fleet.read` recebe `403` na borda em vez da lista vazia que o caso de uso já sabe devolver. A
diferença só aparece no dia em que existir uma segunda fonte com outra permissão: aí quem tem essa
segunda permissão mas não `fleet.read` ficaria bloqueado na rota antes de chegar à fonte que
enxergaria. Registrado também em comentário no código (`pending-items.routes.ts`).

`test/separator-role.contract.test.ts` **não foi tocado**: ele é uma lista exaustiva só das rotas de
`trip`/`fleet`/`billing`/`cte-issuance`/`nfe-documents`, não de todo o app — `pending-items` é módulo
novo fora dessa lista. Registrado por escrito aqui, como pedido: o `separator` tem `fleet.read`, então
alcança `GET /pending-items` e vê a pendência de carroceria.

**Contratos** (`test/pending-items.contract.test.ts`, importando três suítes):

- `test/pending-items/domain.contract.ts`: o caso de uso serve a fonte permitida; devolve página
  vazia sem chamar fonte nenhuma quando falta a permissão; com duas fontes de permissões diferentes,
  chama só a que o chamador tem.
- `test/pending-items/tenant-safety.contract.ts`: `buildFleetBodyTypePendingItemFilters` sempre inclui
  `company_id = $` (com e sem cursor) e os três filtros de negócio (`vehicle_type <>`, `body_type =`,
  `status =`), via `PgDialect().sqlToQuery`, no padrão de `document-block-tenant-safety.contract.ts`.
- `test/pending-items/route.contract.ts`: 200 com o envelope `{data, page: {nextCursor}}`; `limit=101`
  → `400` (herdado de `readPaging`, sem reimplementação); sem `fleet.read` → `403` na rota (a decisão
  acima, testada).
- Integração `test/integration/pending-items.integration.ts` (Postgres descartável, molde de
  `trip-capacity-unknown-reason.integration.ts`): truck `00` aparece; some depois de salvo com `02`;
  cavalo `00` nunca aparece (é `tractor_unit`); veículo de outra empresa nunca aparece; sem
  `fleet.read` a lista vem vazia.

**Gates:**

- `bun run --cwd apps/api-transportada typecheck` → limpo.
- `bun run --cwd apps/api-transportada lint` → limpo.
- `bun run --cwd apps/api-transportada test` → **5137 pass, 23 skip, 0 fail, 37350 expect() calls,
  164 arquivos** (eram 5128 pass/23 skip/37328 expect antes — 9 testes novos, sem regressão).
- `bun test ./test/integration/pending-items.integration.ts` (contra Postgres em `127.0.0.1:65432`,
  `.env.test`) → **1 pass, 0 fail, 3 expect() calls**.
- `bun run --cwd apps/api-transportada build` → verde.
- `npx prettier --write` nos arquivos tocados/criados → sem diff de conteúdo, só formatação do
  pre-commit hook.

**Commit:** `feat(pending-items): 147 T14 — o que o cadastro ainda deve` (`aeef3506adebb76f9a59b046b7d68d14f989cc46`).

## T15 — página `/pendencias` (frontend)

Módulo `apps/frontend-transportada/src/modules/pending-items/`:

- `shared/pendingItemsClient.service.ts`: fetch injetado, `GET /pending-items?cursor&limit`,
  `no-store`, `Authorization: Bearer`, erro tipado (`PENDING_ITEMS_REQUEST_FAILED`/
  `_RESPONSE_INVALID`) no molde de `operationsClient.service.ts`.
- `shared/pendingItemsResponse.validation.ts`: type guard manual (sem zod, por convenção do repo),
  recusa chave extra/desconhecida e `kind` fora do catálogo — mesmo padrão de
  `operationsResponse.validation.ts`.
- `hooks/usePendingItems.hook.ts`: `createPendingItemsController` (gate por `fleet.read`) +
  `usePendingItems` com `useQuery` chaveada por `[chave, companyId, cursor]`, cursor único em estado
  (substitui a página, no molde de `useDeliveryClients.hook.ts` — "carregar mais" é ir para a próxima
  página, não acumular).
- `pages/PendingItemsWorkspace.page.tsx`: esqueleto (`Skeleton`/`SkeletonGroup`) no carregamento,
  estado vazio (`t('empty')`), uma linha por pendência com `t('items.<kind>', {plate: label})` e link
  simples `<a href={buildFleetVehicleRoute(item.entityId)}>` — mesmo padrão de link cru usado em
  `TripCargoPanel.component.tsx` (a navegação manual do shell reconhece o pathname `/fleet` no
  próximo carregamento).
- `styles/pendingItems.module.css`: `.shell { width: var(--layout-width) }`, só tokens (`--space-*`,
  `--color-*`), sem `rem`/hex literal.
- `locales/pendingItems.{locale,en.locale}.json`, registrados em `src/modules/shared/i18n/i18n.service.ts`
  sob a chave `pendingItems` (import + duas entradas, `en` e `pt-BR`, em ordem alfabética como as
  demais).

**Fiação em `main.tsx`:** chave `'pendencias'` no union de `WorkspaceNavigationItem`, entrada
`{href: '/pendencias', key: 'pendencias', label: 'Pendências'}` no grupo `registries` ("Cadastros",
ao lado de frota e clientes), branch em `resolveCurrentWorkspace` e no `storedWorkspace` recordado em
sessão, `import()` próprio via `lazy` (a regra do comentário acima — cada tela é um bundle, para não
estourar o teto de precache do PWA) e `case 'pendencias'` em `resolvePage`.

**Ícone novo:** `workspace-pendencias` em `IconName`/`ICON_PATHS` (`src/components/ui/icon.tsx`) —
reusa o traçado do triângulo de `alert`, comentado (pendência é aviso; reusar evita um segundo
desenho de alerta). `docs/frontend/icons.md` atualizado na lista de navegação.

**Contratos** (`test/pending-items.contract.test.ts`, serviço puro, sem DOM):

- `test/pending-items/client.contract.ts`: GET autenticado/no-store com `cursor`/`limit` na query
  (e omissão quando ausentes); falha de rede/HTTP e corpo não-JSON viram os dois erros tipados;
  validação aceita página bem formada e recusa campo extra, `kind` desconhecido e envelope de página
  ausente.
- `test/pending-items/controller.contract.ts`: `canReadPendingItems` só com `fleet.read`.
- Os contratos do design system (`skeleton`, `icon`, `locale-accents`, `layout-width`, `responsive`)
  seguem verdes com o módulo novo, cobertos pela suíte cheia — nenhum precisou de ajuste porque a
  página segue os padrões existentes (nenhum `<svg>` cru, nenhum `<p>{t('...loading...')}</p>`
  sozinho, acento em "Pendência(s)").

**Gates:**

- `bun run --cwd apps/frontend-transportada typecheck` → limpo.
- `bun run --cwd apps/frontend-transportada lint` → limpo (ajustes de `require-await`/`await-thenable`
  nos mocks de `fetch` do contrato, seguindo o padrão já usado em `fuel-prices.contract.ts`: `fetch`
  não-`async` retornando `Promise.resolve(...)`, e `expect(...).rejects.toThrow(...)` sem `await` —
  confirmado que o assert falha de verdade se o código do erro for trocado).
- `bun run --cwd apps/frontend-transportada test` → **3362 pass, 0 fail, 33834 expect() calls, 30
  arquivos** (eram 3355 antes — 7 testes novos, sem regressão).
- `bun run --cwd apps/frontend-transportada build` → verde (avisos de chunk >500 kB pré-existentes,
  não relacionados a esta task; `PendingItemsWorkspace.page` saiu como chunk próprio de 4,10 kB).
- `npx prettier --write` nos arquivos tocados/criados → só formatação, sem diff de conteúdo.

**Commit:** `feat(pending-items): 147 T15 — a página das pendências` (`319b5d22249b67dc53c6c1a44e8cb66e33518b11`).

## T17 — documentação viva

**Retomada de mudanças não commitadas.** Ao abrir a task, `CLAUDE.md`, `docs/ai-context/api-transportada.md`,
`apps/api-transportada/src/trips/infrastructure/trip-occupancy.support.ts` (só comentário),
`apps/api-transportada/src/trips/domain/cargo-layout.policy.ts` (só comentário) e
`specs/PERGUNTAS-ABERTAS.md` já tinham uma primeira passada não commitada, de outra sessão. Conferida
contra o código e o `evidence.md`: os dois comentários (`trip-occupancy.support.ts:59-63`,
`cargo-layout.policy.ts:332`) já descrevem corretamente o estado pós-T12 ("ficha da carreta quando
preenchida, senão referência marcada `bedSource: 'reference'`, commit `c02325b6`") e não precisaram
de ajuste. O parágrafo "O cavalo não carrega sozinho" do `CLAUDE.md` também batia com o código
(`trips.trailer_vehicle_id`, `fleet_vehicles.default_trailer_vehicle_id`,
`trips_company_trailer_open_unique`, `409 TRIP_TRAILER_REQUIRED`) — mantido, só acrescentado. A
entrada de `docs/ai-context/api-transportada.md` §093 corrigia a 088 D2 pelo commit `c02325b6`, mas
ficou incompleta: não registrava D1 (carroceria obrigatória), `capacityUnknownReason`, a carreta, o
catálogo novo (`01`/`04`) nem as pendências — completado nesta task. `specs/PERGUNTAS-ABERTAS.md`
ganhou as duas entradas (27 e 28) sobre `veicReboque` no MDF-e e a medição por câmera, ambas
conferidas contra o código: o builder do MDF-e (`mdfe-payload.builder.ts`) de fato não emite
`veicReboque`, e a medição por câmera é RF fora do escopo da 147 (spec.md, "Fora do escopo").

**Alterações desta task:**

- `docs/ai-context/api-transportada.md` §093: seis parágrafos novos, entre a correção da frase sobre
  `car`/`tractor_unit` (o catálogo já ganhou duas linhas de `car`, `02`/`05`, na migration
  `20260910120000_vehicle_reference_every_type` — só `tractor_unit` segue sem linha) e o parágrafo do
  peso da carga: D1 (`checkVehicleBodyType`, `FLEET_VEHICLE_BODY_TYPE_REQUIRED`/`_NOT_APPLICABLE`,
  sem CHECK retroativo), `capacityUnknownReason` (as três razões e a ordem de decisão), a carreta
  (migration `20260913120000_trip_trailer_vehicle` à mão, FK composta, índice único parcial,
  `PUT /trips/:id/trailer`, `409 TRIP_TRAILER_IN_USE`/`TRIP_TRAILER_REQUIRED`, snapshot de despacho),
  o catálogo `01`/`04` (migration `20260913130000_vehicle_reference_open_and_container`, fonte de
  cada linha) e a correção da sugestão (093) para casar por `(vehicleType, bodyType)` (T16b), e as
  pendências (`GET /pending-items`, módulo `pending-items`, fonte `fleet-body-type`, `fleet.read`,
  só `status = 'active'`).
- `CLAUDE.md`: duas frases acrescentadas ao parágrafo já existente — carroceria obrigatória
  (`400 FLEET_VEHICLE_BODY_TYPE_REQUIRED`) e a página `/pendencias`, apontando para o docs/ai-context
  para o detalhe.
- `apps/api-transportada/src/trips/domain/cargo-layout.policy.ts` e
  `apps/api-transportada/src/trips/infrastructure/trip-occupancy.support.ts`: nenhuma mudança nesta
  task — conferidos e já corretos (ver acima).
- `specs/PERGUNTAS-ABERTAS.md`: nenhuma mudança nesta task — as duas entradas já estavam corretas.
- `specs/147-carroceria-que-ninguem-escolheu/tasks.md`: `[x]` em T1–T17, com T6b, T16b e T-cat
  anotados como adendos das tasks que os produziram.

**Nomes conferidos contra o código antes de escrever** (para não repetir premissa errada): `checkVehicleBodyType`
(`fleet/domain/vehicle-body-type.policy.ts`), `resolveCapacityUnknownReason`
(`trips/domain/capacity-unknown-reason.policy.ts`), `checkTripAcceptsTrailer`
(`trips/domain/trip-trailer.policy.ts`), os quatro códigos de erro em `trips/domain/trip.error.ts`
(`TRIP_TRAILER_REQUIRES_TRACTOR`, `TRIP_TRAILER_NOT_A_TRAILER`, `TRIP_TRAILER_IN_USE`,
`TRIP_TRAILER_REQUIRED`), as três linhas do catálogo em
`drizzle/20260913130000_vehicle_reference_open_and_container/migration.sql`, e a linha de `car` em
`drizzle/20260910120000_vehicle_reference_every_type/migration.sql`.

**Gates:**

- `bunx prettier --check` nos seis arquivos tocados (`CLAUDE.md`, `docs/ai-context/api-transportada.md`,
  `specs/147-carroceria-que-ninguem-escolheu/tasks.md`, `specs/PERGUNTAS-ABERTAS.md`,
  `apps/api-transportada/src/trips/domain/cargo-layout.policy.ts`,
  `apps/api-transportada/src/trips/infrastructure/trip-occupancy.support.ts`) → `All matched files
use Prettier code style!`.
- `make check` (raiz do worktree, `format:check` + `lint` + `typecheck` + `test` + `build` das seis
  apps) → verde, exit code 0. Contagens de teste por app: api-transportada **5137 pass/23 skip/0
  fail** (37350 expect, 164 arquivos); worker-transportada **986 pass/0 fail** (2683 expect, 77
  arquivos); cron-transportada **94 pass/0 fail** (224 expect, 7 arquivos); frontend-transportada
  **3362 pass/0 fail** (33834 expect, 30 arquivos); frontend-client **18 pass/0 fail** (39 expect, 2
  arquivos); frontend-landing **107 pass/0 fail** (356 expect, 4 arquivos). Build das seis apps
  verde (avisos de chunk >500 kB pré-existentes em `frontend-transportada`, não relacionados a esta
  task, e o mesmo aviso do `pdf.worker.min` que já existia).

**Commit:** `docs: 147 T17 — a documentação conta a carroceria, a carreta e as pendências`.

## T18 — correções da revisão (opus)

Uma sessão nova, num worktree próprio (`spec-vehicle-body-00`), corrigiu os 15 achados da revisão
de código (opus) sobre a spec 147. Cada achado tem teste que reproduz o defeito antes da correção
(vermelho → verde) — a maioria integração real contra Postgres local (`127.0.0.1:55432`), porque os
achados são de corrida e de tradução de erro de banco, invisíveis a um teste unitário com repositório
falso.

| #             | Achado                                                                        | Status                                            | Onde                                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1             | Despacho sem carreta por corrida (leitura fora da transação)                  | **Corrigido**                                     | `assertTrailerStillAttached` em `drizzle-trip-route.repository.ts` (`dispatch()`), `SELECT … FOR UPDATE` da viagem antes de qualquer escrita             |
| 2             | Criação concorrente com a mesma carreta padrão                                | **Corrigido**                                     | `insertTripWithTrailerFallback` (SAVEPOINT) em `drizzle-trip.repository.ts`                                                                              |
| 3             | Carreta padrão inativa ou não-carreta ainda copiada                           | **Corrigido**                                     | `resolveDefaultTrailerForCreation` (`trip.use-case.ts`) passa a checar `role`/`status` via `findVehicle`                                                 |
| 4 (MENOR 6)   | CHECKs novos (23514) sem tradução, 500 genérico                               | **Corrigido**                                     | `violatedCheckConstraint` (`postgres-error.support.ts`) + tradução em `runTrailerGuarded`/`insertTripWithTrailerFallback` (trips) e `runGuarded` (fleet) |
| 5 (MENOR 8+9) | `TRIP_TERMINAL_STATUSES`/`TRACTOR_UNIT_VEHICLE_TYPE` duplicados               | **Corrigido**                                     | Exportados de `trip.schema.ts`/`vehicle-type.constant.ts`; seis arquivos deixaram de redeclarar                                                          |
| 6 (MENOR 7)   | `separator-role.contract.test.ts` não cobre `pending-items`                   | **Corrigido**                                     | `createPendingItemsRoutes` entrou na lista; `GET /pending-items` listado                                                                                 |
| 7 (MENOR 11)  | Comentário de `pending-items.routes.ts` descrevia a política errada           | **Corrigido**                                     | Comentário reescrito — a policy da rota devolve 403 antes do caso de uso, o filtro interno é defesa para fonte futura                                    |
| 8 (MENOR 15)  | `!` de non-null assertion em `drizzle-fleet-body-type-pending-item.source.ts` | **Corrigido**                                     | `or(...)` guardado por `if` em vez de `!`                                                                                                                |
| 9 (item 5)    | `maxPayloadKg`/`loadingAccess` sempre do cavalo, nunca da carreta             | **Corrigido**                                     | `trip-occupancy.support.ts` passa a ler do `carrier` (reverte a nota de "fora de escopo" da T12)                                                         |
| 10 (item 4)   | Link de `bodyTypeMissing` sempre aponta para o cavalo                         | **Corrigido**                                     | `capacityUnknownVehicleId` publicado (detalhe e prévia), opcional; `capacityUnknownMessage.service.ts` o usa com fallback para `vehicleId`               |
| 11 (MENOR 12) | Prévia de criação sempre assume `trailer: null`                               | **Corrigido**                                     | `resolveDefaultTrailerForPreview` em `trip-cargo-preview.query.ts`, mesma regra do item 3                                                                |
| 12 (MENOR 10) | "Carregar mais" troca a página em vez de somar                                | **Corrigido**                                     | `usePendingItems.hook.ts` migrado para `useInfiniteQuery`; soma em função pura testada                                                                   |
| 13 (MENOR 13) | `rollback.sql` do catálogo apaga linha sem checar origem                      | **Registrado** (migração já escrita, não editada) | Nota em `docs/ai-context/api-transportada.md`                                                                                                            |
| 14 (MENOR 14) | Ordem de deploy API-antes-do-frontend não documentada                         | **Registrado**                                    | Nota em `docs/ai-context/api-transportada.md` (`VEHICLE_DETAIL_KEYS`/`defaultTrailerVehicleId`, situação pré-existente da T10)                           |
| 15            | Seção "T18 — correções da revisão" no evidence                                | **Este texto**                                    | —                                                                                                                                                        |

**Commit A — `fix(trips): 147 T18 — a carreta não escapa por corrida`** (achados 1–8, 15;
hash `82f4eb5d`):

- `apps/api-transportada/src/trips/infrastructure/drizzle-trip-route.repository.ts`: nova função
  `assertTrailerStillAttached`, chamada no início de `dispatch()`, dentro da transação — `SELECT …
FOR UPDATE` da viagem, e só então junta com `fleetVehicles` para o `vehicleType`. Teste vermelho→
  verde: `test/integration/trip-lifecycle.integration.ts` — `re-checks the trailer inside the
dispatch transaction, not only before it` chama `routeRepository.dispatch()` direto, com a carreta
  removida entre a checagem de fora (não repetida no teste) e a escrita, e prova `409
TRIP_TRAILER_REQUIRED`, status inalterado e nenhum snapshot gravado.
- `apps/api-transportada/src/trips/infrastructure/drizzle-trip.repository.ts`: `create()` chama
  `insertTripWithTrailerFallback`, que tenta o `INSERT` com a carreta dentro de um `SAVEPOINT`
  (`transaction.transaction`) e, se a tentativa colidir com `trips_company_trailer_open_unique`,
  refaz sem carreta na transação externa — nunca 500. A mesma função (e `runTrailerGuarded`, usado
  por `setTrailer`) também traduzem `trips_trailer_not_vehicle` (23514) em
  `TripTrailerNotVehicleItselfError` (400). Teste vermelho→verde:
  `test/integration/trip-repository.integration.ts` — `creating two trips at once with the same
trailer never throws` (duas criações concorrentes via `Promise.all`, exatamente uma fica com a
  carreta) e `translates the trailer-not-vehicle CHECK violation into a domain error` (create e
  setTrailer com `trailerVehicleId === vehicleId`).
- `apps/api-transportada/src/trips/application/trip.use-case.ts`: `resolveDefaultTrailerForCreation`
  chama `repository.findVehicle` na carreta padrão e só a copia se `role === 'trailer'` e `status ===
'active'` (além do já existente `isTrailerInOpenTrip`). Teste vermelho→verde:
  `test/trip-application/trip-use-case.contract.ts` — três testes novos: carreta livre e ativa é
  copiada; carreta em viagem aberta não é; carreta inativa/renomeada de papel não é; carreta apagada
  (`findVehicle` devolve `null`) não é.
- `apps/api-transportada/src/fleet/infrastructure/drizzle-fleet-vehicle.repository.ts`:
  `fleet_vehicles_default_trailer_tractor_only` e `fleet_vehicles_default_trailer_not_self` (23514)
  traduzidos em `runGuarded` para `FleetVehicleDefaultTrailerRequiresTractorError`/
  `FleetVehicleDefaultTrailerSelfReferenceError` (nova classe, `fleet.error.ts`). Teste vermelho→
  verde: `test/integration/fleet-vehicle-repository.integration.ts` — `translates the default
trailer CHECK violations into domain errors`, `update()` direto no repositório (contorna o caso de
  uso, que já barra os dois antes) forçando as duas violações.
- `TRIP_TERMINAL_STATUSES` (novo, `trip.schema.ts`) substitui `TRIP_OPEN_STATUSES_EXCLUSION`
  (trips) e `TRIP_CLOSED_STATUSES` (fleet) — usado também no `where` do índice parcial
  `trips_company_trailer_open_unique` via `raw(inList(...))`, texto idêntico ao anterior
  (`'completed', 'cancelled'`), sem tocar a migration SQL já aplicada. `TRACTOR_UNIT_VEHICLE_TYPE`
  (novo, `vehicle-type.constant.ts`) substitui as redeclarações locais em
  `vehicle-body-type.policy.ts`, `vehicle-default-trailer.policy.ts`, `trip-trailer.policy.ts`,
  `capacity-unknown-reason.policy.ts`, `trip.use-case.ts` e
  `drizzle-fleet-body-type-pending-item.source.ts` (que também perdeu o `!` sobre `or(...)`, trocado
  por um `if` guardando o `push`).
- `apps/api-transportada/test/separator-role.contract.test.ts`: `createPendingItemsRoutes` entrou na
  montagem de rotas e `GET /pending-items` na lista alcançável — decisão registrada no comentário: o
  separador tem `fleet.read` e o dado é mínimo (placa sem carroceria).
- `apps/api-transportada/src/pending-items/presentation/pending-items.routes.ts`: comentário
  reescrito — a política da rota (`fleet.read`) já devolve 403 antes de o caso de uso rodar; o filtro
  por `requiredPermission` dentro dele é defesa para uma segunda fonte futura com outra permissão,
  hoje sem efeito.

**Gates (Commit A, isolado — B/C/D empilhados via `git stash push` durante a checagem):**

- `bun run --cwd apps/api-transportada typecheck` → limpo.
- `bun run --cwd apps/api-transportada lint` → limpo.
- `bun run --cwd apps/api-transportada test` → **5141 pass/23 skip/0 fail** (37354 expect, 164
  arquivos).
- `bun test --timeout 30000` nos três arquivos de integração tocados
  (`trip-repository.integration.ts`, `trip-lifecycle.integration.ts`,
  `fleet-vehicle-repository.integration.ts`) → **13 pass/0 fail** (112 expect). ⚠️ O timeout padrão
  de 5s precisou subir para 30s: o Postgres local (`55432`) acumulou **125 bancos descartáveis**
  órfãos de sessões/worktrees anteriores (nunca limpos por `DROP DATABASE`), e o `CREATE DATABASE`
  de cada teste ficou lento o bastante para estourar o padrão — falso vermelho generalizado (pegou
  também testes pré-existentes, não tocados por esta task), confirmado repetindo a mesma bateria com
  timeout maior. Não é regressão desta correção; registrado aqui para quem topar com o mesmo.

**Commit B — `fix(trips): 147 T18 — o peso e o link são de quem carrega`** (achados 4, 5, 9, 10, 11;
hash `e9afcf3d`):

- `apps/api-transportada/src/trips/infrastructure/trip-occupancy.support.ts`: a consulta da carreta
  ganhou `id`, `capacityKg` e `loadingAccess`; `maxPayloadKg`/`loadingAccess` nos três `return` que
  produzem `TripDetail`/prévia agora vêm de `carrier` (a carreta quando existe, senão o veículo de
  tração) — antes vinham sempre de `vehicle`. `capacityUnknownVehicleId` computado logo após
  `capacityUnknownReason`: `carrier.id` em `bodyTypeMissing`, `input.vehicleId` nos outros dois
  motivos (e sem veículo). `test/integration/trip-capacity-unknown-reason.integration.ts` — três
  asserts novos nos dois testes existentes: sem carreta o link é o próprio veículo; com carreta e
  `trailerMissing` o link é o cavalo (não há ficha de carreta a editar); com carreta e
  `bodyTypeMissing` (carreta com `body_type = '00'`) o link é a carreta, não o cavalo — o caso que a
  correção existe para resolver.
  ⚠️ **Achado da segunda revisão (opus):** este parágrafo citava um teste
  `reads maxPayloadKg and loadingAccess from the trailer, not the tractor` em
  `trip-repository.integration.ts` que nunca foi escrito — o Commit B corrigiu o código e a
  cobertura direta de `loadTripOccupancy` ficou pendente. Fechado agora em
  `test/integration/trip-cargo-carrier.integration.ts` — ver `## T18 — segunda revisão` no fim deste
  documento.
- `apps/api-transportada/src/trips/application/trip.port.ts`,
  `apps/api-transportada/src/trips/presentation/trip.routes.ts`,
  `apps/api-transportada/src/trips/application/preview-trip-cargo.use-case.ts`,
  `apps/api-transportada/src/trips/infrastructure/trip-cargo-preview.query.ts`: `TripDetail` e
  `TripCargoPreview` ganharam `capacityUnknownVehicleId`, servido no detalhe e na prévia.
- `apps/api-transportada/src/trips/infrastructure/trip-cargo-preview.query.ts`:
  `resolveDefaultTrailerForPreview` (nova) espelha `resolveDefaultTrailerForCreation` — mesma regra
  (existe na empresa, `role: 'trailer'`, `status: 'active'`, livre) — e `readCargoPreviewContext`
  passa `trailerVehicleId` resolvido em vez de sempre `null`.
- Frontend (`capacityUnknownMessage.service.ts`, `trip.types.ts`, `trip.constant.ts`,
  `tripResponse.validation.ts`, `TripCargoPanel.component.tsx` e os três lugares que o chamam):
  `capacityUnknownVehicleId` opcional, threadado até `resolveCapacityUnknownMessage`, que usa
  `capacityUnknownVehicleId ?? vehicleId` para montar o link. Teste vermelho→verde:
  `test/trip/capacity-unknown-message.contract.ts` — `carroceria não informada com carreta atrelada
leva à ficha da carreta, não do cavalo`.

**Gates (Commit B, isolado — A já commitado, C/D restaurados só depois):**

- `bun run --cwd apps/api-transportada typecheck` / `--cwd apps/frontend-transportada typecheck` →
  limpos.
- `bun run --cwd apps/api-transportada lint` → limpo; `bun run --cwd apps/api-transportada test` →
  **5141 pass/23 skip/0 fail** (37354 expect).
- `bun test --timeout 30000 test/integration/trip-capacity-unknown-reason.integration.ts` → **2
  pass/0 fail** (13 expect).
- `bun run --cwd apps/frontend-transportada lint` → limpo;
  `bun run --cwd apps/frontend-transportada test` → **3367 pass/0 fail** (33839 expect, 30 arquivos);
  `build` → verde.

**Commit C — `fix(pending-items): 147 T18 — carregar mais soma`** (achado 12; hash `6cd41e83`):

- `apps/frontend-transportada/src/modules/pending-items/hooks/usePendingItems.hook.ts`: trocado
  `useQuery` (cursor em `useState`, cada página substituindo a anterior) por `useInfiniteQuery`
  (mesmo padrão de `useTripOccurrenceFeedQuery`), com `items`/`nextCursor` derivados por
  `flattenPendingItemPages`/`lastPendingItemsCursor` (novas, `pendingItemsClient.service.ts`) — puras,
  sem depender de `useInfiniteQuery` nem de DOM para testar, seguindo o padrão do resto deste app.
- ⚠️ **Deslize de staging:** `test/pending-items/pagination.contract.ts` (o teste vermelho→verde
  deste achado — prova que duas páginas somam e que o cursor de "carregar mais" é o da última, nunca
  de uma anterior) acabou dentro do Commit B por um `git add` antecipado durante a preparação dos
  stashes; nada nele muda neste commit, e ele já provava o defeito antes da correção do hook chegar.
- `test/pending-items.contract.test.ts`: novo `import` do contrato.

**Gates (Commit C, isolado — A e B já commitados):**

- `bun run --cwd apps/frontend-transportada typecheck` → limpo (background, confirmado sem erro).
- `bun run --cwd apps/frontend-transportada lint` → limpo (eslint ficou lento neste host durante a
  sessão — >120s em mais de uma tentativa — mas terminou sem achado quando concluiu; confirmado
  também pela checagem do estado combinado A+B+C+D, que passou limpo antes de qualquer commit).
- `bun run --cwd apps/frontend-transportada test` → **3367 pass/0 fail** (33839 expect, 30
  arquivos). ⚠️ Um teste de orçamento de desempenho não relacionado
  (`design-system/cargo-isometric-full-drawing.contract.ts`, projeção de 6000 caixas < 100 ms)
  falhou uma vez por 1,16 ms sob carga da máquina e passou limpo ao repetir isolado — falso vermelho
  de orçamento de tempo, não regressão.
- `bunx prettier --check` nos arquivos tocados → limpo.

**Commit D — `docs: 147 T18 — o que a revisão mudou`:**

- `docs/ai-context/api-transportada.md`: seis parágrafos ajustados/acrescentados na seção da carreta
  — a prévia agora considera a carreta padrão (não mais "sempre `trailer: null`"),
  `capacityUnknownVehicleId` ao lado de `capacityUnknownReason`, a releitura `FOR UPDATE` dentro da
  transação de despacho, `loadingAccess`/`maxPayloadKg` do `carrier` (não mais "sempre do veículo de
  tração"), um parágrafo novo resumindo as três corridas/CHECKs do Commit A, a nota sobre o
  `rollback.sql` do catálogo apagar por valor (achado 13/MENOR 13), e a nota de ordem de deploy
  API-antes-do-frontend (achado 14/MENOR 14 — `VEHICLE_DETAIL_KEYS`/`defaultTrailerVehicleId`,
  situação que já existia desde a T10 e nunca tinha sido registrada por extenso).
- Este arquivo (`evidence.md`): a tabela acima e o detalhe por commit.

**Gates (Commit D):** `bunx prettier --check docs/ai-context/api-transportada.md
specs/147-carroceria-que-ninguem-escolheu/evidence.md` → limpo. Sem código tocado — sem
typecheck/lint/test de app.

**Gate final (raiz, `make check` + `make migration-test`, estado combinado A+B+C+D):** ver final
deste documento.

## T18 — segunda revisão

A segunda rodada de revisão (opus) aprovou o T18 com um ajuste: faltavam os testes que os achados 5,
12 e 12b diziam existir, e a seção acima citava um teste (`reads maxPayloadKg and loadingAccess from
the trailer, not the tractor`, em `trip-repository.integration.ts`) que nunca foi escrito — só o
código foi corrigido. Nenhum comportamento de produção mudou nesta rodada; só cobertura.

**Testes escritos**, todos em
`apps/api-transportada/test/integration/trip-cargo-carrier.integration.ts` (novo arquivo,
acrescentado a `test:integration` do `package.json`), contra Postgres real:

- `loadTripOccupancy reads maxPayloadKg and loadingAccess from the trailer, not the tractor` —
  cavalo 10.000 kg/`rear`, carreta 27.000 kg/`open`: sem carreta lê o cavalo, com carreta lê a
  carreta. Fecha o achado 5.
- `a trailer without a known payload ceiling never inherits the tractor ceiling` — carreta sem
  `capacity_kg` preenchido não herda os 10.000 kg do cavalo.
  ⚠️ **Achado desta rodada**: `fleet_vehicles.capacity_kg` é `NOT NULL DEFAULT '0'` (`fleet.schema.ts`)
  — "sem teto" nunca chega como `null` em `loadTripOccupancy`, só como zero cru (`'0'`, sem o
  zero-padding de escala que um valor explicitamente inserido ganha, ex. `'10000.00'`). A decisão
  original ("carreta sem teto → `maxPayloadKg` nulo") só se cumpre uma camada acima, em
  `resolvePayloadCeiling`/`parseCeiling` (`trip-cargo-weight.policy.ts`), onde zero e ausência já
  eram tratados como a mesma coisa antes desta rodada. O teste registra o comportamento real
  (`'0'`) em vez de inventar um `null` que o código não produz neste nível — relatado aqui e em
  `spec.md`/`docs/ai-context/api-transportada.md`, sem mudar produção.
- `readCargoPreviewContext only borrows the default trailer when it is a free active trailer of
this company` — quatro cenários no mesmo teste: padrão elegível (a prévia considera a carreta:
  `loadingAccess: 'open'`, `capacityUnknownReason: 'bodyTypeMissing'` apontando para a carreta);
  padrão inativa; padrão com papel diferente de carreta (só alcançável escrevendo direto no banco,
  já que a rota de frota nunca aceita um cavalo como carreta padrão); e padrão presa numa viagem
  aberta de outro cavalo — nos três últimos, a prévia nasce sem carreta (`loadingAccess: 'rear'`,
  `capacityUnknownReason: 'trailerMissing'`). Fecha o achado 12.
- `creating a trip never inherits a default trailer whose role turned into traction` — o mesmo
  ramo `role !== 'trailer'` de `resolveDefaultTrailerForCreation`, agora pelo caminho de criação
  (`createTripUseCase().create()` + `DrizzleTripRepository`), com o papel trocado direto no banco.
  Fecha o achado 12b.

**Vermelho→verde confirmado por regressão manual** (editei a guarda, rodei só o teste afetado, vi
falhar, restaurei — `git status --short` limpo depois de cada rodada):

- `trip-occupancy.support.ts`: troquei os três `maxPayloadKg: carrier.capacityKg` por
  `vehicle.capacityKg` → os dois primeiros testes falham (`Expected: "27000.00", Received:
"10000.00"`; `Expected: "0", Received: "10000.00"`).
- `trip-cargo-preview.query.ts`: tirei `trailer.role !== 'trailer' || trailer.status !== 'active'`
  do `if` de `resolveDefaultTrailerForPreview` → o teste de prévia falha no cenário de padrão
  inativa (`Expected: "rear", Received: "open"`).
- `trip.use-case.ts`: tirei `trailer.role !== 'trailer'` do `if` de
  `resolveDefaultTrailerForCreation` → o teste de criação falha (`trip.trailer` volta preenchido em
  vez de `null`).

**Gates (segunda revisão):**

- `bun run --cwd apps/api-transportada typecheck` → limpo.
- `bun run --cwd apps/api-transportada test` → **5141 pass/23 skip/0 fail** (37354 expect, 164
  arquivos) — inalterado; o novo arquivo é `.integration.ts`, fora desta lista.
- `bun test test/integration/trip-cargo-carrier.integration.ts` (isolado) → **4 pass/0 fail** (17
  expect), contra `127.0.0.1:55432`.
- `bun run --cwd apps/api-transportada test:integration` (suíte completa, `DATABASE_URL` e
  `DRIZZLE_TEST_DATABASE_URL` apontando para `127.0.0.1:55432`) → **228 pass/2 skip/1 fail** (2064
  expect, 231 testes, 46 arquivos). A falha é pré-existente e não relacionada:
  `server.integration.ts > drains and exits cleanly on SIGTERM`, porque a sessão não tinha
  `KEYCLOAK_ADMIN_CLIENT_SECRET` no ambiente ao rodar só essas duas variáveis — não é regressão
  desta rodada nem toca `trips`/`fleet`.
- `bun run --cwd apps/api-transportada lint`, `bun run lint` (raiz, todas as apps) → limpos.
- `bunx prettier --check .` (raiz) → limpo.
- `make check` (raiz, `config` + `format:check` + `lint` + `typecheck` + `test` + `build`, todas as
  apps) → **verde, exit code 0**. Contagens de teste por app (`bun run test` de cada `--cwd`):
  `api-transportada` **5141 pass/23 skip/0 fail** (37354 expect, 164 arquivos);
  `worker-transportada` **986 pass/0 fail** (2683 expect, 77 arquivos); `cron-transportada`
  **94 pass/0 fail** (224 expect, 7 arquivos); `frontend-transportada` **3367 pass/0 fail** (33839
  expect, 30 arquivos); `frontend-client` **18 pass/0 fail** (39 expect, 2 arquivos);
  `frontend-landing` **107 pass/0 fail** (356 expect, 4 arquivos). `format:check`, `lint` e
  `typecheck` limpos nas seis apps; `build` verde nas seis (o aviso de chunk > 500 kB do Vite é
  pré-existente, sobre o bundle do `pdf.js`, não relacionado a esta rodada).
- ⚠️ **Achado de ambiente, registrado a pedido**: o Postgres local (`127.0.0.1:55432`) tem **121
  bancos `transportada_*` descartáveis órfãos** de sessões/worktrees anteriores (contados, não
  apagados). Cada `CREATE DATABASE` de teste de integração paga esse acúmulo; o timeout padrão de
  5s já havia sido reportado como insuficiente na T18 original (subiu para 30s nos gates isolados).
  Aqui a suíte completa rodou dentro do padrão do `bun test`, mas o achado do acúmulo continua de
  pé para quem for depurar lentidão.
