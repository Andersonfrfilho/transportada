# 035 — Evidência

## Levantamento anterior às tasks

O que foi conferido no código, não de memória, antes de escrever a spec:

- **`fleet_vehicles` não tem marca, modelo, ano, eixos nem número de frota.** Colunas hoje:
  `id, company_id, plate, renavam, role, status, tare_weight_kg, capacity_kg, capacity_m3,
wheel_type, body_type, state, ownership, owner_tax_id, owner_name, owner_state, owner_rntrc,
owner_tax_regime, version, created_at, updated_at`.
- **A consulta por placa já devolve marca, modelo e ano.** `vehicle-lookup-payload.policy.ts` mapeia
  `marca`/`brand` → `brand`, `modelo`/`model` → `model`, `ano`/`anomodelo` → `modelYear`, e ainda
  quebra o campo combinado `"MARCA/MODELO"` no separador `/`.
- **O frontend descarta os três de propósito.** `fleet.constant.ts`, `VEHICLE_LOOKUP_FORM_KEYS`, com
  o comentário: _"Campos da consulta por placa que existem no formulário; marca, modelo e ano não têm
  campo."_
- **O botão de consulta está depois dos dez campos.** `VehicleForm.component.tsx` renderiza
  `<VehicleIdentityFields>` inteiro e só então o bloco `lookupAction`.
- **`ownership` está no bloco errado.** É o último campo de `VehicleIdentityFields`, mas é ele que
  decide se `VehicleOwnerFields` aparece.
- **Veículo sem rodado é salvável e não emite MDF-e.** `mdfe-payload.builder.ts:148` lança
  `MdfePayloadMissingWheelTypeError` quando `wheelType === ''`; o cadastro aceita vazio.
- **O `cInt` do `veicTracao` sai vazio hoje.** O builder preenche `placa`, `tara`, `tipoCarroceria`,
  `tipoRodado`, `capacidadeKg` e o bloco de proprietário — `cInt` não aparece em nenhum lugar de
  `mdfe-manifests/`.
- **Nenhum campo de eixos no pacote fiscal.** `@adatechnology/fiscal-provider`, `veicTracao`:
  `cInt`, `placa`, `RENAVAM`, `tara`, `capKG`, `capM3`, `tpProp`, `tpVeic`, `tpRod`, `tpCar`, `UF`.
  Zero ocorrência de `categComb`, `valePed` ou `eixo` no pacote inteiro.
- **FIPE não cobre implemento.** A base tem `carros`, `caminhoes` e `motos`; semirreboque e carreta
  não estão em nenhuma delas.
- **O espelho da BrasilAPI é instável** — respondeu `429` embrulhado num `500` na primeira chamada
  da sondagem. Daí a decisão 4 da spec.

## T000 — padrão e UX da tela atual

Contrato escrito antes da implementação: `apps/frontend-transportada/test/fleet/screen-standards.contract.ts`,
importado por `test/fleet.contract.test.ts` (já na lista literal do `package.json`). Primeira execução
com o contrato pronto e nada implementado: **33 pass, 6 fail**, com `ENOENT` em
`FleetTableSkeleton.component.tsx`, `FleetEmptyState.component.tsx` e
`VehicleOperationFields.component.tsx` — vermelho pelos motivos certos.

O que estava fora do padrão, conferido no código:

- **Barra de filtro desalinhada.** `<input type="search">` na métrica cheia (`--field-height`, 3rem) ao
  lado de dois `Select` `compact` (2.4rem). O módulo `fleet` era o único sem nenhuma ocorrência de
  `--field-height-compact` — `billing`, `nfse-invoice`, `cte-batch`, `operations`, `mdfe-manifest` e
  `nfe-workspace` já usavam.
- **Foco invisível.** Nenhuma regra `input:focus` no módulo; `company-settings` e `cte-profiles`
  declaram o anel de cobre.
- **Sem os resets de campo.** Faltava `min-width: 0` (valor longo estourava a coluna do grid),
  `border-radius: 0`, e havia `font-family: inherit` em vez de `font: inherit`.
- **Carregamento fora de `docs/frontend/loading.md`.** `FleetStatusHint` imprimia a frase "Carregando
  frota" e o painel renderizava `null` enquanto a lista era `undefined` — o piscar que a regra proíbe.
- **Estado vazio real era invisível.** `createFleetViewModel` só devolve `status: 'empty'` quando
  veículos **e** motoristas estão vazios; 0 veículos com 3 motoristas mostrava um `<thead>` sozinho,
  sem uma palavra.
- **Ordem do formulário contra a ordem do trabalho.** O botão "Buscar pela placa" vinha **depois** dos
  dez campos que ele preenche, e `ownership` era o último campo do bloco de identificação, longe do
  bloco que ele comanda.

O que foi feito:

- `fleet.module.css`: métrica compacta para `.filterBar input`, métrica cheia para
  `.fieldGrid input`/`.plateRow input`, os três resets nas duas, anel de foco `2px` em cobre com
  `outline-offset`, e as classes `.plateRow`, `.skeletonTable`, `.skeletonRow`, `.emptyState`.
  `.lookupAction` foi removida — o botão saiu do bloco solto.
- `FleetTableSkeleton.component.tsx`: `SkeletonGroup` com 4 linhas × `columnCount` colunas (a coluna de
  ações entra na conta quando o operador pode gerenciar), no lugar da frase de carregamento.
- `FleetEmptyState.component.tsx`: título, motivo e o botão que resolve — ação opcional por ausência da
  prop, com `IconName` explícito (não existe ícone de caminhão na biblioteca; o botão carrega `add` ou
  `close`).
- `FleetStatusHint`: `loading` e `empty` mapeados para `null` — carregar é esqueleto, vazio é convite.
  A dica sobrou para `error` e `forbidden`, que continuam sendo texto.
- `VehiclePanel`/`DriverPanel`: corpo próprio por aba, com três saídas — esqueleto, vazio (dois textos
  distintos: "nada cadastrado" com o botão de cadastrar, "nenhum resultado para este filtro" com
  "Limpar filtros") e a lista.
- Formulário em três blocos: `VehicleIdentityFields` (placa + consulta ao lado, renavam, UF),
  `VehicleOperationFields` (função, rodado, carroceria, tara, capacidades) e `VehicleOwnerFields`
  (propriedade primeiro; os campos de proprietário só quando não é próprio).
- Locales pt-BR/en: `vehicleOperationLegend`, `vehicleOwnershipLegend`, `clearFilters`, e os quatro
  textos de vazio. `vehicleOwnerLegend` saiu junto com o consumidor.
- `test/fleet/vehicle-lookup.contract.ts` passou a procurar a consulta por placa em
  `VehicleIdentityFields` — ela mudou de lugar, e o contrato antigo apontava para `VehicleForm`.

Verificação:

```
bun test test/fleet.contract.test.ts   → 39 pass, 0 fail (250 expect)
bun run test                           → 1043 pass, 0 fail (5167 expect, 17 arquivos)
bun run typecheck (tsc --noEmit)       → sem saída
bun run lint (eslint .)                → sem saída
bunx prettier --check                  → verde após --write em 2 arquivos
```

`bun test` sem argumento falha em `test/responsive.smoke.spec.ts` ("Playwright Test did not expect
test() to be called here") — é o spec de Playwright sendo varrido pelo runner do Bun, alheio a esta
task; a lista literal do `package.json` não o inclui.

## T001 — contrato vermelho

`test/fleet-schema/vehicles.contract.ts` passou a exigir `brand`, `model`, `fleet_number`,
`model_year` e `axle_count`, os dois checks de faixa (aceitando `0` como "não informado") e os três
checks de tamanho. `test/database-migration/static-migration.contract.ts` ganhou o teste
`versions the fleet vehicle model fields as an additive migration with a guarded rollback`, com o
diretório localizado por `.find(name => name.endsWith('_fleet_vehicle_model_fields'))` — a lista
literal completa (`preserves baseline and identity bytes...`) só recebe o nome exato do diretório em
T002, quando o timestamp da migration já existe em disco.

Primeira execução, antes de tocar em `fleet.schema.ts`:

```
bun test test/fleet-schema.contract.test.ts test/database-migration.contract.test.ts
→ 5 fail (colunas/checks ausentes em fleetVehicles; diretório de migration inexistente)
```

Vermelho pelos motivos certos: `columnNames`/`columnSqlTypes` sem as cinco colunas,
`checkSqlByName` devolvendo `undefined` para os cinco checks novos, e
`directories.find(...)` devolvendo `undefined`.

## T004 — contrato do segmento e do gateway FIPE

O texto da task cita `test/fleet/vehicle-catalog-segment.contract.ts` e
`test/fleet/fipe-catalog-gateway.contract.ts`, mas a app não tem diretório `test/fleet/` — a
convenção real (confirmada nos quatro entrypoints existentes: `fleet-schema`, `fleet-application`,
`fleet-infrastructure`, `fleet-http`) separa por camada. A própria T015 introduz `test/fleet-domain/`
como diretório novo "na convenção já usada por `billing-domain/`, `mdfe-domain/` e afins" — então o
teste de política pura de T004 é o primeiro a abrir esse diretório, e o do gateway entra em
`test/fleet-infrastructure/`, que já existe. Caminhos usados:

- `test/fleet-domain/vehicle-catalog-segment.contract.ts` (novo diretório e novo entrypoint
  `test/fleet-domain.contract.test.ts`, adicionado à lista literal do `package.json` entre
  `fleet-schema` e `fleet-application`, mesma posição de `billing-domain`/`cte-batch-domain`).
- `test/fleet-infrastructure/fipe-catalog-gateway.contract.ts` (`import` novo em
  `test/fleet-infrastructure.contract.test.ts`, entrypoint já listado — sem mudança no
  `package.json` para este arquivo).

```
bun test ./test/fleet-domain.contract.test.ts ./test/fleet-infrastructure.contract.test.ts
→ 0 pass, 2 fail, 2 errors
```

Vermelho pelos motivos certos — os quatro arquivos de implementação de T005 ainda não existem:

```
Cannot find module '../../src/fleet/domain/vehicle-catalog-segment.policy.js'
Cannot find module '../../src/fleet/infrastructure/cached-vehicle-catalog.gateway.js'
```

O gateway de teste também referencia `fleet-vehicle-catalog.port.ts` (tipo `FleetVehicleCatalogPort`)
e `FleetVehicleCatalogFailedError` em `fleet.error.ts`, ambos igualmente pendentes de T005.

## T005 — implementação do catálogo FIPE

`vehicle-catalog-segment.policy.ts`, `fleet-vehicle-catalog.port.ts`,
`fipe-vehicle-catalog.gateway.ts` (molde de `http-vehicle-lookup.gateway.ts`, sem token — a
BrasilAPI é pública) e `cached-vehicle-catalog.gateway.ts` (decorador com `now` injetável, chave
`${segment}:${brand ?? ''}`, TTL 24 h no sucesso e 60 s convertendo falha em
`{items: [], source: 'unavailable'}` sem nunca relançar). `FleetVehicleCatalogFailedError` (502)
acrescentada a `fleet.error.ts` no molde de `FleetVehicleLookupFailedError`.

```
bun test ./test/fleet-domain.contract.test.ts ./test/fleet-infrastructure.contract.test.ts
→ 23 pass, 0 fail (43 expect)

bun run typecheck
→ sem erros

bun run lint
→ sem erros (--max-warnings=0)
```

## T006 — contrato de rota do catálogo

`test/fleet-http/vehicle-catalog-routes.contract.ts` (caminho corrigido de `test/fleet/`, mesma
razão de T004) exercitando `GET /fleet/vehicle-catalog/brands` e `/models` via
`fleet-catalog-http.fixture.ts` novo — fixture próprio em vez de estender
`fleet-http.fixture.ts`, para o `import` do módulo de rota ainda inexistente não derrubar as
outras suítes de `test/fleet-http.contract.test.ts`. Casos: `fleet.read` sozinho basta (200),
sem `fleet.read` nenhum é 403, `trailer` devolve `{items: [], source: 'none'}`, provedor fora do
ar devolve `200` com `source: 'unavailable'` — nunca 5xx. A serialização da rota traduz o item do
domínio (`label`/`value`) para o formato do contrato HTTP (`name`/`code`), igual ao resto do
módulo faz para `FleetVehicle`.

Nenhuma entrada nova na lista literal do `package.json`: o teste chega pelo entrypoint
`test/fleet-http.contract.test.ts`, já listado.

```
bun test ./test/fleet-http.contract.test.ts
→ 35 pass, 5 fail (102 expect)
```

Vermelho pelo motivo certo — as 35 suítes existentes de `fleet-http` continuam verdes; as 5 novas
falham só porque `src/fleet/presentation/fleet-catalog.routes.ts` (T007) ainda não existe:

```
Cannot find module '../../src/fleet/presentation/fleet-catalog.routes.js'
```

## T007 — `FLEET_VEHICLE_CATALOG_URL`, rotas e fiação em `main.ts`

`fleet-catalog.routes.ts` tinha bug de fabricação: os dois handlers devolviam o payload cru em
vez de `{ data: ... }`, quebrando o contrato de envelope que `responseData()` espera de toda
rota HTTP do app — corrigido antes de fechar T006 verde.

`fleet.routes.ts` ganhou `vehicleCatalog: { isAvailable(): boolean }` no `Dependencies` do
módulo (irmão do `vehicleLookup` já existente, mesmo padrão de capability mínima em vez do
use-case completo) e o handler de `GET /fleet/capabilities` passou a devolver
`{ vehicleCatalog, vehicleLookup }`.

`main.ts` ganhou a fiação completa: `FLEET_VEHICLE_CATALOG_URL` chega como `vehicleCatalog` no
config (`ApiEnvironment`); quando `null`, um stub null-object de `FleetVehicleCatalogPort`
devolve `{items: [], source: 'unavailable'}` para `listBrands`/`listModels` sem nunca propagar
`null` para as rotas; quando configurado, `createFipeVehicleCatalogGateway` (BrasilAPI, sem
token) entra atrás de `createCachedVehicleCatalogGateway`. `createFleetCatalogRoutes` monta o
array de rotas junto de `createFleetRoutes`, e a capability `vehicleCatalog.isAvailable` é
`vehicleCatalog !== null` no config bruto. `.env.example` ganhou
`FLEET_VEHICLE_CATALOG_URL=` comentado — vazio desliga o recurso e os campos viram texto livre.

Adicionar o campo obrigatório em `Dependencies` quebrou dois fixtures que constroem o objeto à
mão: `test/fixtures/fleet-http.fixture.ts` (faltava `vehicleCatalog` inteiro, 500 em runtime) e
duas suítes de integração que montam `ApiEnvironment` completo por fora do bootstrap
(`test/integration/auth-me.integration.ts`, `test/integration/server.integration.ts` — faltava
`vehicleCatalog: null,`, erro de typecheck). Os três ganharam a propriedade que faltava; o
fixture ganhou também `vehicleCatalogAvailable` (espelhando `vehicleLookupAvailable`) e um teste
novo dedicado ("tells the workspace that the vehicle catalog is off") em
`vehicle-lookup.contract.ts`, porque as duas suítes de capabilities já existentes só verificavam
`vehicleCatalog` de carona ao testar o toggle de `vehicleLookup`.

```
bun test ./test/fleet-http.contract.test.ts
→ 41 pass, 0 fail (mais um teste novo em relação ao vermelho de T006)

bun run typecheck
→ limpo nas 4 apps

bun run lint
→ limpo

make config
→ 16 pass, 0 fail

bun run test (apps/api-transportada)
→ 2382 pass, 7 skip, 0 fail, 9564 expect() em 2389 testes, 96 arquivos
```

Nenhuma regressão em nenhuma suíte da app. T007 fecha verde.

## T002 — colunas, checks e migration

`src/database/fleet.schema.ts`: `brand`/`model`/`fleet_number` como `text().notNull().default('')`
com check de tamanho (`<= 60`/`<= 120`/`<= 20` — convenção do repositório, nunca `varchar(n)`, ver
precedente `fleet_drivers_name_check`); `model_year`/`axle_count` como `integer().notNull().default(0)`
com check `= 0 or between …` (precedente de `integer()` em `company-fiscal-profile.schema.ts`).
`plan.md` tinha `varchar(60)` etc. na Fase A — corrigido durante a implementação para bater com o
padrão real do schema (zero ocorrência de `varchar(` em `src/database/*.schema.ts`).

Migration gerada por
`bun run --cwd apps/api-transportada db:generate --name fleet_vehicle_model_fields` →
`drizzle/20260813151612_fleet_vehicle_model_fields/migration.sql`, cinco `ADD COLUMN` e cinco
`ADD CONSTRAINT`, nenhum `DROP`. `rollback.sql` escrito à mão no molde de
`20260811164234_billing_description_templates/rollback.sql` — derruba os cinco checks e as cinco
colunas na ordem inversa, guarda o hash e recusa se a linha de journal não bater.

Verificação:

```
bun test test/fleet-schema.contract.test.ts test/database-migration.contract.test.ts
→ 58 pass, 0 fail, 3 skip (384 expect)

bun run --cwd apps/api-transportada db:check
→ Everything's fine 🐶🔥 (sem drift)

make migration-test
→ 39 pass, 0 fail (527 expect) — migration e rollback validados em Postgres descartável
```

O worker não copia `fleet_vehicles` — nada a espelhar lá.

## T003 — sondagem do provedor (BrasilAPI, espelho da FIPE)

A sondagem anterior chamou `/api/fipe/preco/v1/{codigoMarca}` com um código de marca inventado e
recebeu "recurso não encontrado" — `preco` espera `codigoFipe` (marca+modelo+ano), não código de
marca. O endpoint de modelos por marca não está nos caminhos óbvios (`marcas`, `preco`, `tabelas`,
`anos`) — achado inspecionando o próprio código-fonte do BrasilAPI no GitHub
(`pages/api/fipe/veiculos/v1/[vehicleType]/[makerCode].js`), não documentação de terceiro.

**1. `GET https://brasilapi.com.br/api/fipe/marcas/v1/caminhoes`** — `200`, corpo real (truncado):

```json
[{"nome":"AGRALE","valor":"102"},{"nome":"CHEVROLET","valor":"103"},{"nome":"FIAT","valor":"104"},{"nome":"FORD","valor":"105"},{"nome":"GMC","valor":"106"},{"nome":"MARCOPOLO","valor":"108"}, …]
```

Código real capturado da resposta: `AGRALE` → `"102"` (não inventado).

**2. `GET https://brasilapi.com.br/api/fipe/veiculos/v1/caminhoes/102`** — `200`, corpo real
(completo, 43 modelos):

```json
[
  { "modelo": "10000 / 10000 S  2p (diesel) (E5)", "valor": "5986" },
  { "modelo": "10000 LX 2p (diesel) (E5)", "valor": "7529" },
  { "modelo": "13000 Turbo 2p (diesel)", "valor": "4448" },
  { "modelo": "13000 Turbo 3-Eixos 2p (diesel)", "valor": "4513" },
  { "modelo": "14000 / 14000 S 2p (diesel) (E5)", "valor": "5987" },
  { "modelo": "14000 / 14000 S 6x2 2p (diesel) (E5)", "valor": "5988" },
  { "modelo": "14000 LX 2p (diesel) (E5)", "valor": "7530" },
  { "modelo": "1600 D-RD 2p (diesel)", "valor": "3110" },
  { "modelo": "1600 D-RS 2p (diesel)", "valor": "3111" },
  { "modelo": "1800 D-RD 2p (diesel)", "valor": "3112" },
  { "modelo": "1800 D-RS 2p (diesel)", "valor": "3113" },
  { "modelo": "4500 D-RD 2p (diesel)", "valor": "3114" },
  { "modelo": "4500 D-RS 2p (diesel)", "valor": "3115" },
  { "modelo": "5000 D-RD 2p (diesel)", "valor": "3116" },
  { "modelo": "5000 D-RS 2p (diesel)", "valor": "3117" },
  { "modelo": "6000 D CD RS/ RD 3p (diesel)", "valor": "3118" },
  { "modelo": "6000 D CS 2p (diesel)", "valor": "3119" },
  { "modelo": "6000 Furgovan 2.8 TDI RS/ RD 4p", "valor": "3120" },
  { "modelo": "7000 D 2p (diesel)", "valor": "3121" },
  { "modelo": "7000 D-RD CD 4p (diesel)", "valor": "3122" },
  { "modelo": "7000 DX 2p (diesel)", "valor": "3123" },
  { "modelo": "7500 TD 2p (diesel)", "valor": "3124" },
  { "modelo": "7500 TDX 2p (diesel)", "valor": "3125" },
  { "modelo": "8000 Furgovan 4.3 TDI 145cv Aut 4p", "valor": "3126" },
  { "modelo": "8000 Furgovan 4.3 TDI Mec 4p", "valor": "3127" },
  { "modelo": "8500 E-tronic CE 2p (diesel)", "valor": "4084" },
  { "modelo": "8500 Turbo 2p (diesel)", "valor": "3128" },
  { "modelo": "8500 Turbo CD 3p (diesel)", "valor": "4757" },
  { "modelo": "8700 / 8700 S 2p (diesel) (E5)", "valor": "5989" },
  { "modelo": "8700 LX 2p (diesel) (E5)", "valor": "7531" },
  { "modelo": "8700 TR 2p (diesel) (E5)", "valor": "5990" },
  { "modelo": "9200 Turbo 2p (diesel)", "valor": "3129" },
  { "modelo": "A10000 2p (diesel) (E5)", "valor": "7532" },
  { "modelo": "A10000 2p (diesel) (E6)", "valor": "10873" },
  { "modelo": "A10000 4X4 2p (E6)", "valor": "12043" },
  { "modelo": "A15000 4x2 2p (E6)", "valor": "11701" },
  { "modelo": "A18000 4x2 2p (E6)", "valor": "11702" },
  { "modelo": "A7500 2p (diesel)(E5)", "valor": "7873" },
  { "modelo": "A8700 2p (diesel) (E5)", "valor": "7533" },
  { "modelo": "A8700 2p (diesel) (E6)", "valor": "10874" },
  { "modelo": "MARRUÁ AM 300 2.8 CS TDI Diesel (E5)", "valor": "6704" }
]
```

Forma confirmada: marcas → `{nome, valor}[]`; modelos → `{modelo, valor}[]` — chave de modelo é
`modelo`, não `nome`, e `valor` em ambos os corpos é string, não number. `fipe-vehicle-catalog.gateway.ts`
mapeia os dois: `{items: [{label, value}], source: 'fipe'}` no formato de
`FleetVehicleCatalogPort`. Sem paginação nos dois corpos — a base inteira volta de uma vez.
`FLEET_VEHICLE_CATALOG_URL` aponta para `https://brasilapi.com.br` (default `''`, capacidade
desligada até configurar).

## T008 — contrato vermelho (marca, modelo, ano-modelo, eixos, frota → HTTP e MDF-e)

`test/fleet-http/vehicles.contract.ts` ganhou dois testes: `carries brand, model, modelYear,
axleCount and fleetNumber through create and update` (round-trip dos cinco campos por `POST` e
`PATCH`, verificado contra `createVehicleCalls`/`updateVehicleCalls` capturados pelo fixture — o
corpo de resposta é a fixture estática `VEHICLE` e não reflete o input) e `validates axleCount
between 2 and 9 and modelYear between 1900 and 2100, zero meaning not-informed` (faixa aceitando
`0` como "não informado", rejeitando `axleCount: 1` e `modelYear: 2101`).
`test/mdfe-domain/payload-builder.contract.ts` ganhou `carries the fleet number as codigoInterno,
omitted when the vehicle has none` (o `fleetNumber` do veículo de tração vira `<cInt>` no payload
do MDF-e, omitido quando vazio) — o teste usa
`{...params().vehicle, fleetNumber: 'ROTA-01'} as BuildMdfePayloadParams['vehicle']` para simular a
forma pós-T009 do veículo sem tocar `mdfe-payload.types.ts` ainda.

```
bun test ./test/fleet-http.contract.test.ts ./test/mdfe-domain.contract.test.ts
→ 102 pass, 3 fail, 230 expect() calls, Ran 105 tests across 2 files
```

Vermelho pelos motivos certos:

- `carries brand, model, modelYear...`: `expect(createResponse.status).toBe(201)` — `Received: 400`.
  `vehicleFieldsSchema` tem `.strict()`; os cinco campos ainda não declarados são chaves
  desconhecidas e o schema rejeita a requisição inteira antes de chegar ao use case.
- `validates axleCount between 2 and 9...`: `expect(inRangeResponse.status).toBe(201)` —
  `Received: 400`, mesmo motivo (`.strict()` rejeitando `axleCount`/`modelYear` como chaves
  desconhecidas). As asserções de fora-de-faixa (`axleCount: 1`, `modelYear: 2101` → 400) já são
  verdadeiras hoje pelo motivo errado, mas o teste como unidade falha na primeira asserção, antes de
  alcançá-las — vermelho genuíno.
- `carries the fleet number as codigoInterno...`:
  `expect((withFleetNumber.veiculoTracao as Record<string, unknown>).codigoInterno).toBe('ROTA-01')`
  — `Received: undefined`. `buildTractionVehicle()` em `mdfe-payload.builder.ts` não lê nem emite
  `codigoInterno` hoje.

```
bun run typecheck
→ sem erros — confirma que o cast `as BuildMdfePayloadParams['vehicle']` no teste de MDF-e compila
  sem tocar os tipos que só T009 estende.
```

## T009 — implementação (schema, mapper, repositório, view-model, rotas, MDF-e)

`fleet.routes.ts` importa `parseCreateVehicleRequest`/`parseUpdateVehicleRequest`/
`FleetVehicleFields` de `fleet.schema.ts`, que por sua vez reexporta de
`fleet-request.schema.ts` sem tocar o corpo do schema — confirmado antes de editar, para não
mudar o arquivo errado. `FleetVehicleFields` é `z.infer<typeof vehicleFieldsSchema>`, então
estender `vehicleFieldsSchema` propaga o tipo para a rota sem mapeamento manual.

Campos adicionados aos cinco pontos da cadeia, na ordem alfabética já usada em cada objeto:

- `fleet-request.schema.ts`: `axleCount`/`modelYear` como `z.number().int()` com `.refine` aceitando
  `0` ("não informado") ou a faixa (`2..9`/`1900..2100` — mesmas constantes de T002, redeclaradas
  aqui porque o repositório não reexporta constante de camada de banco para a de apresentação,
  precedente `DRIVER_NAME_MAX_LENGTH`/`NAME_MAX_LENGTH`); `brand`/`model`/`fleetNumber` como
  `z.string().trim().max(N)`. Todos **obrigatórios** (sem `.optional()`/`.default()`) — nenhum campo
  existente de `vehicleFieldsSchema` usa isso, e vazio/zero já é valor explícito válido no schema
  (`renavam`, `wheelType`), então o padrão certo é sentinela obrigatório, não campo opcional.
- `fleet.port.ts`: os cinco campos em `FleetVehicleInput` — `FleetVehicle` já estende esse tipo, sem
  edição própria.
- `fleet.mapper.ts`: `mapVehicle()` e `toVehicleColumns()` ganharam os cinco campos, lendo/gravando
  as colunas de `fleet_vehicles` que T002 já criou.
- `fleet.routes.ts`: `serializeVehicle()` ganhou os cinco campos na resposta HTTP.
- `mdfe-payload.types.ts`: `fleetNumber: string` em `MdfePayloadVehicle`; `codigoInterno?: string`
  em `MdfePayloadTractionVehicle` — espelho do `cInt` do pacote fiscal, sem camada de tradução
  intermediária (confirmado que `veiculoTracao` só aparece neste arquivo e no builder).
- `mdfe-payload.builder.ts`: `buildTractionVehicle()` ganhou
  `...(vehicle.fleetNumber.length > 0 ? { codigoInterno: vehicle.fleetNumber } : {})`, no molde dos
  outros campos opcionais do mesmo objeto (`renavam`, `capacidadeKg`, `capacidadeM3`).
- `mdfe-issuance-payload.query.ts`: `fleetNumber: fleetVehicles.fleetNumber` no `.select()` e no
  objeto `vehicle` devolvido por `loadManifestAndVehicle()`.

Fixtures atualizadas para satisfazer os tipos agora obrigatórios:

- `test/fixtures/fleet-http-payload.fixture.ts`: `CREATE_VEHICLE_BODY` ganhou
  `axleCount: 0, brand: '', fleetNumber: '', model: '', modelYear: 0` — como as 27 chamadas de
  `test/fleet-http/vehicles.contract.ts` espalham esse objeto (nunca hardcodam a lista de campos),
  nenhum site de chamada precisou mudar. `UPDATE_VEHICLE_BODY`/`VEHICLE` herdam por spread.
  `test/fixtures/fleet-application.fixture.ts` só importa `VEHICLE` daqui — nenhuma edição própria.
- `test/mdfe-domain/payload-builder.contract.ts` e `test/mdfe-application/issuance.contract.ts`:
  os dois objetos `vehicle: {...}` de base ganharam `fleetNumber: ''` (achado só no typecheck, não
  no test runner — `toEqual` não reclama de propriedade ausente, `tsc` sim).

Verificação:

```
bun test ./test/fleet-http.contract.test.ts ./test/mdfe-domain.contract.test.ts
→ 105 pass, 0 fail (237 expect)

bun run typecheck
→ sem erros (achou e corrigiu os dois fixtures de MDF-e listados acima)

bun test ./test/fleet-schema.contract.test.ts ./test/mdfe-application.contract.test.ts
→ 75 pass, 0 fail (239 expect) — contrato de tenant-safety e de aplicação MDF-e continuam verdes

bun run test
→ 2385 pass, 7 skip, 0 fail (9574 expect, 96 arquivos) — nenhuma regressão

bun run lint
→ sem erros (--max-warnings=0)
```

## T010 — contrato vermelho (bloco de modelo no formulário do frontend)

`test/fleet/vehicle-model-fields.contract.ts` (novo, registrado em `test/fleet.contract.test.ts`
entre `vehicle-lookup` e `workspace-tabs`, ordem alfabética já usada ali) ganhou seis testes:

- `places the model block between identity and operation in the vehicle form` — lê
  `VehicleForm.component.tsx` como texto (`readApplicationFile`, molde de
  `vehicle-lookup.contract.ts`) e compara o índice de `<VehicleIdentityFields`, `<VehicleModelFields`
  e `<VehicleOperationFields` na string.
- `fills brand, model and model year from the plate lookup without inventing fields` — estende o
  teste já existente de `applyVehicleLookup`/`createVehicleDraft` (import futuro de
  `fleetForm.service`) para também esperar `brand`/`model`/`modelYear` de `VEHICLE_LOOKUP` (a fixture já
  trazia esses três campos, preparados numa fase anterior) e confirma que um retorno vazio da consulta
  não apaga marca/modelo já digitados — mesma convenção não-destrutiva do restante do preenchimento.
- `clears the model when the brand changes` — chama uma função pura nova, `applyVehicleBrand(state,
brand)`, esperada em `fleetForm.service.ts`.
- `decides free text versus catalog by capability and role` — chama `canUseVehicleCatalogFields({
role, vehicleCatalogEnabled })`, também esperada em `fleetForm.service.ts`: `false` quando
  `vehicleCatalogEnabled` é `false` ou `role` é `'trailer'`.
- `degrades to free text fields when the catalog is unavailable or the vehicle is a trailer` — lê
  `VehicleModelFields.component.tsx` (ainda inexistente) e confirma que o texto do componente
  referencia `canUseVehicleCatalogFields` e `FleetField` (o campo de texto livre do design system da
  tela).
- `names the model block fields in both locales` — `JSON.parse` de `fleet.locale.json`/
  `fleet.en.locale.json` e confere que `vehicleModelLegend`, `brand`, `model`, `modelYear` e
  `fleetNumber` já existem como string nos dois idiomas.

```
bun test ./test/fleet.contract.test.ts
→ 39 pass, 6 fail, 254 expect() calls, Ran 45 tests across 1 file
```

Vermelho pelos motivos certos:

- `places the model block...`: `expect(modelIndex).toBeGreaterThan(identityIndex)` —
  `Received: -1`. `<VehicleModelFields` ainda não existe em `VehicleForm.component.tsx`.
- `fills brand, model and model year...`: `toMatchObject` falha — `filled` não tem `brand`/`model`/
  `modelYear`, porque `VEHICLE_LOOKUP_FORM_KEYS` (o que `applyVehicleLookup` de fato copia) ainda não
  inclui os três campos.
- `clears the model when the brand changes`: `TypeError: applyVehicleBrand is not a function` — a
  função não existe em `fleetForm.service.ts`.
- `decides free text versus catalog...`: `TypeError: canUseVehicleCatalogFields is not a function` —
  idem.
- `degrades to free text fields...`: `ENOENT` ao abrir
  `src/modules/fleet/components/VehicleModelFields.component.tsx` — o componente não existe.
- `names the model block fields...`: `expect(typeof dictionary[key]).toBe('string')` —
  `Received: "undefined"`. Nenhuma das cinco chaves existe ainda nos locales.

```
bun run typecheck
→ sem erros — o teste novo compila (tipos locais do contrato, sem depender de exports que só T011
  cria) sem tocar nenhum arquivo de implementação.
```

## T011 — implementação: quarto bloco do formulário (marca/modelo/catálogo FIPE)

Estendido nesta task (camada de aplicação, já com `fleet.constant.ts`/`fleet.types.ts`/
`fleetForm.service.ts`/`fleetGuards.validation.ts`/`fleetResponse.validation.ts`/
`fleetCatalogClient.service.ts`/`useVehicleCatalog.hook.ts` prontos de um passo anterior desta
mesma task):

- `VehicleModelFields.component.tsx` (novo) — fieldset com legenda `vehicleModelLegend`; marca e
  modelo alternam entre `Select` (catálogo FIPE, quando `canUseVehicleCatalogFields` autoriza) e
  `FleetField` (texto livre, caminhão/reboque sem catálogo); ano do modelo, eixos e número da frota
  sempre em `FleetField`. Troca de marca aciona `applyVehicleBrand` (limpa o modelo escolhido antes).
- `VehicleForm.component.tsx` — `<VehicleModelFields catalog={catalog} state={form.state}
onChange={form.patch} />` inserido entre `<VehicleIdentityFields>` e `<VehicleOperationFields>`;
  prop `catalog: VehicleCatalogController` acrescida a `VehicleFormProps`.
- `FleetWorkspace.page.tsx` — `useVehicleCatalog({ companyId, permissions })` instanciado uma vez em
  `FleetWorkspacePage`, roteado por `FleetEditorPanel` até `VehicleForm`, no mesmo padrão já usado
  por `vehicleLookup`.
- `fleet.locale.json` / `fleet.en.locale.json` — `vehicleModelLegend`, `brand`, `model`, `modelYear`,
  `axleCount`, `fleetNumber` adicionados nos dois idiomas.

```
bun test ./test/fleet.contract.test.ts
→ 42 pass, 3 fail, 259 expect() calls, Ran 45 tests across 1 file
```

As 3 falhas eram em `vehicle-lookup.contract.ts`, um contrato de uma task anterior à T010/T011 que
ficou com duas suposições defasadas assim que o catálogo entrou:

- `capabilitiesFromApi`/`getFleetCapabilities` passaram a exigir as duas chaves de
  `FLEET_CAPABILITY_KEYS` (`vehicleCatalog` e `vehicleLookup`) — o teste antigo só mockava/esperava
  `vehicleLookup`, e `hasEveryKey` rejeitava o objeto incompleto com `FLEET_RESPONSE_INVALID`.
- `fills the vehicle form from the lookup without inventing fields` ainda esperava que
  `applyVehicleLookup` **não** preenchesse `brand`/`model`/`modelYear` — exatamente o oposto do que
  o próprio contrato da T010 (`vehicle-model-fields.contract.ts`, teste `fills brand, model and model
year from the plate lookup...`) exige. A extensão de `VEHICLE_LOOKUP_FORM_KEYS` na T011 é o que
  corrige esse comportamento; o teste antigo é quem estava desatualizado.

Corrigido: `vehicle-lookup.contract.ts` passou a mockar/esperar `{ vehicleCatalog, vehicleLookup }`
nas três chamadas de capabilities (`createRecordingClient`, `createLookupClient`,
`FleetCapabilitiesContract`) e a incluir `brand`/`model`/`modelYear` no objeto esperado de
`fills the vehicle form from the lookup without inventing fields`, alinhando com a mesma consulta
sintética (`VEHICLE_LOOKUP`) e com o contrato mais novo da T010.

Também estendido `test/fleet/fleet.fixture.ts`: `FleetVehicleBodyContract` ganhou `axleCount:
number`, `brand: string`, `fleetNumber: string`, `model: string`, `modelYear: number` (números no
contrato de detalhe/corpo da API — distintos dos mesmos campos como `string` no contrato de
formulário e no de consulta por placa); `VEHICLE_BODY` e `VEHICLE_DRAFT_BODY` ganharam valores
sintéticos para os cinco campos nesse formato numérico. `AGGREGATE_VEHICLE_BODY` herda os campos por
spread de `VEHICLE_BODY`, sem precisar de edição própria.

```
bun test ./test/fleet.contract.test.ts
→ 45 pass, 0 fail, 271 expect() calls, Ran 45 tests across 1 file
```

```
bun run typecheck
→ sem erros
bun run lint
→ sem erros
bun run test
→ 1061 pass, 0 fail, 5214 expect() calls, Ran 1061 tests across 17 files
```

## T012 — aviso de campo exigido pelo MDF-e no formulário e marca de incompleto na listagem;

colunas novas em `VehicleList`, ano e eixos ocultos por padrão

Duas frentes independentes na mesma task.

**A — completude do rodado.** `fleetForm.service.ts` parava de coagir `wheelType` para `'01'`
quando o veículo de tração era salvo sem escolha — `EMPTY_VEHICLE_FORM.wheelType` e
`toVehicleFormState` passaram a preservar `''`; `toVehicleBody` continua zerando o campo para
papéis que não são `traction`. `fleet.types.ts` tipou `wheelType` como `'' | MdfeWheelType` em
`FleetVehicleBody` e `FleetVehicleFormState`. Nova função pura
`vehicleCompleteness.service.ts#isVehicleIncompleteForMdfe` — `role === 'traction' && wheelType ===
''` — consumida tanto pelo hint do formulário quanto pela marca da listagem, para as duas
superfícies nunca divergirem sobre o que conta como incompleto. `FleetField.component.tsx` ganhou
`clearable`/`placeholder` opcionais em `FleetSelectFieldProps` (spread condicional por causa de
`exactOptionalPropertyTypes`); `VehicleOperationFields.component.tsx` usa os dois no campo de tipo
de rodado e mostra `t('wheelTypeRequiredHint')` abaixo do `fieldGrid` quando o veículo é de tração
e o rodado está vazio — nunca bloqueia o salvamento, só avisa.

**B — colunas de marca/modelo/ano/eixos.** Reaproveitado o motor genérico já existente
`shared/tableColumnPreferences.service.ts` (o mesmo do `cte-batch`) atrás de um wrapper de domínio
`fleetVehicleTable.service.ts` (`FLEET_VEHICLE_COLUMN_KEYS`, chave de storage
`fleet.vehicleColumns`, `modelYear`/`axleCount` ocultos por padrão só quando não há preferência
salva) e do hook `useVehicleColumns.hook.ts`. `VehicleColumnsMenu.component.tsx` é o menu de
reordenar/mostrar-ocultar, mesmo padrão estrutural do `CteItemColumnsMenu`. `VehicleList.component.tsx`
passou a receber `columns: readonly FleetVehicleColumnKey[]` (agora obrigatório) e a desenhar as
colunas dinâmicas entre "Propriedade" e "Capacidade", além do selo `incompleteBadge` dentro da
célula de status quando `isVehicleIncompleteForMdfe` é verdadeiro. `VehiclePanel.component.tsx`
ganhou o botão de alternância do menu de colunas no `panelHeading` e passa
`columns.visibleColumns` adiante; `FleetWorkspace.page.tsx` instancia `useVehicleColumns()` uma
vez e entrega o controller ao painel.

Chaves de locale novas em `fleet.locale.json`/`fleet.en.locale.json`: `wheelTypeUnset`,
`wheelTypeRequiredHint`, `vehicleIncomplete`, `columns.{title,brand,model,modelYear,axleCount}`,
`column.{moveUp,moveDown}` — acentuação pt-BR conferida contra `locale-accents.contract.ts`.

```
bun test test/fleet.contract.test.ts
→ (incluído na varredura completa abaixo)

bun run typecheck
→ sem erros
bun run lint
→ sem erros
bun test test/frontend-contract.test.ts test/design-system.contract.test.ts test/shared.contract.test.ts \
  test/keycloak-auth-provider.test.ts test/company-settings.contract.test.ts test/identity.contract.test.ts \
  test/nfe-workspace.contract.test.ts test/cte-batch.contract.test.ts test/freight.contract.test.ts \
  test/cte-profiles.contract.test.ts test/cte-issuance.contract.test.ts test/billing.contract.test.ts \
  test/operations.contract.test.ts test/fleet.contract.test.ts test/mdfe-manifest.contract.test.ts \
  test/trip.contract.test.ts test/nfse-invoice.contract.test.ts
→ 1070 pass, 0 fail, 5260 expect() calls, Ran 1070 tests across 17 files
  (as 10 falhas vermelhas da T012 — wheelType/completude + colunas — agora verdes; sem regressão)
```

## T013 — contrato vermelho (colunas de custo e consumo)

`test/fleet-schema/vehicles.contract.ts`: as sete colunas novas (`average_consumption`,
`cost_per_kilometer`, `acquisition_amount`, `monthly_installment_amount`,
`annual_vehicle_tax_amount`, `annual_insurance_amount`, `costs_updated_at`) entram no array de
`columnNames` (entre `owner_tax_regime` e `version`); novo teste de tipo exige `numeric(19, 4)`
para os quatro campos monetários, `numeric(6, 2)` para `average_consumption`,
`numeric(12, 4)` para `cost_per_kilometer` — nunca `double precision` — e
`timestamp with time zone` para `costs_updated_at`; novo teste de check exige
`fleet_vehicles_cost_check` com `>= 0`. `costs_updated_at` fica fora de `requiredColumnNames`
(mesmo padrão de `billing_invoice_items.cancelled_at`): só existe timestamp depois do primeiro
custo informado, e não há "vazio" para `timestamp` como há `''` para texto — por isso o teste
`'requires every column...'` passou a filtrar essa coluna antes de comparar.

`test/database-migration/static-migration.contract.ts`: `20260813160512_fleet_vehicle_cost_fields`
entra na lista literal de diretórios (o que já derruba o primeiro teste, por ainda não existir);
novo teste dedicado `'versions the fleet vehicle cost and consumption fields...'` exige `ADD
COLUMN` para as sete colunas e o check `fleet_vehicles_cost_check`, sem SQL destrutivo, com
`rollback.sql` guardado por nome+hash e sem `CASCADE` — mesmo molde do teste da T011
(`fleet_vehicle_model_fields`).

```
bun run --cwd apps/api-transportada test
→ 5 fail (esperado — vermelho):
  Drizzle migrations > preserves baseline and identity bytes while versioning additive fiscal migrations
  Drizzle migrations > versions the fleet vehicle cost and consumption fields as an additive migration with a guarded rollback
  fleet vehicle schema > stores every field the MDF-e vehicle group demands, without typing at issuance
  fleet vehicle schema > keeps cost and consumption fields in exact decimal, never binary float
  fleet vehicle schema > keeps every cost and consumption field non-negative
  (nenhuma outra suíte afetada)
```

## T014 — colunas, migration e rollback (custo e consumo)

`src/database/fleet.schema.ts`: sete colunas novas em `fleetVehicles`, entre `ownerTaxRegime` e
`version` — `averageConsumption` (`numeric(6, 2)`), `costPerKilometer` (`numeric(12, 4)`), quatro
campos monetários via helper local `moneyColumn = (name) => numeric(name, { precision: 19, scale:
4 })` (`acquisitionAmount`, `monthlyInstallmentAmount`, `annualVehicleTaxAmount`,
`annualInsuranceAmount`) e `costsUpdatedAt` (`timestamp('costs_updated_at', { withTimezone: true
})`, sem `.notNull()`). Todos os seis campos numéricos usam `.default('0')` (string, não number —
convenção já usada em `mdfe.schema.ts`). Novo `check('fleet_vehicles_cost_check', ...)` logo depois
de `fleet_vehicles_capacity_check`, exigindo `>= 0` nos seis campos numéricos numa única expressão.

Migration gerada via `bun run db:generate --name fleet_vehicle_cost_fields` →
`drizzle/20260813181604_fleet_vehicle_cost_fields/migration.sql` (timestamp real, diferente do
inicialmente suposto em T013 — `static-migration.contract.ts` corrigido para o diretório real).
Conteúdo: sete `ADD COLUMN` aditivos + `ADD CONSTRAINT fleet_vehicles_cost_check`, sem `DROP`.

`rollback.sql` escrito à mão no molde de `20260813151612_fleet_vehicle_model_fields/rollback.sql`:
`DROP CONSTRAINT IF EXISTS` do check, `DROP COLUMN IF EXISTS` das sete colunas em ordem reversa à
declaração, bloco `DO $$ ... DELETE FROM "drizzle"."__drizzle_migrations" WHERE "name" =
'20260813181604_fleet_vehicle_cost_fields" AND "hash" = '7b6806cf...' ... GET DIAGNOSTICS ...
RAISE EXCEPTION ... END $$;` guardado por nome+hash (sha256 do `migration.sql` via `shasum -a
256`), tudo dentro de `BEGIN;`/`COMMIT;`, sem `CASCADE`. Armadilha corrigida: o bloco `DO` exige
delimitador de dólar duplicado (`$$`), não simples (`$`) — `psql`/Postgres devolve `syntax error at
or near "$"` com o delimitador simples.

```
bun test test/database-migration.contract.test.ts
→ 32 pass, 3 skip, 0 fail (313 expect)

bun test test/fleet-schema.contract.test.ts
→ 29 pass, 0 fail (90 expect)

make migration-test
→ 44 pass, 0 fail (552 expect) — aplica, restringe, faz rollback e reaplica a migration em
  Postgres descartável

bun run db:check
→ "Everything's fine 🐶🔥" — sem drift entre schema e migrations
```

## T015 — contrato vermelho (custo mensal fixo)

`test/fleet-domain/vehicle-cost.contract.ts` (entrypoint `test/fleet-domain.contract.test.ts`, já na
lista literal do `package.json`): `deriveMonthlyFixedCost` = `parcela + (IPVA + seguro) / 12`,
`half_up`, sem float; `0` em todo campo devolve "sem informação". Este teste já é verde desde T013 —
a política de domínio (`vehicle-cost.policy.ts`) foi implementada antes deste ciclo.

`test/fleet-http/vehicle-cost.contract.ts` (novo, registrado em `test/fleet-http.contract.test.ts`):
cinco casos — os seis campos chegam ao use case tanto no `POST` quanto no `PATCH`; valor negativo em
qualquer um dos seis é recusado com `400` e **todos** os campos inválidos voltam de uma vez em
`error.details[].field` (via `invalidRequest(details)`, já existente em
`request-parsing.service.ts`); `monthlyFixedCost`/`costsUpdatedAt` no corpo da requisição são
recusados (campo derivado, nunca aceito como input); sem custo informado, o view-model expõe os seis
zeros e nenhuma coluna de total.

`test/fixtures/fleet-http-payload.fixture.ts` estendido: `CREATE_VEHICLE_BODY` ganhou os seis campos
de custo com `0`; `VEHICLE` ganhou `costsUpdatedAt: null` e `monthlyFixedCost: null`;
`responseApiError()` passou a expor `error.details` (antes descartado pelo helper).

`test/integration/fleet-vehicle-repository.integration.ts` (novo, registrado em `test:integration`
do `package.json`, molde de `trip-repository.integration.ts` — `withDisposableDatabase` por
Postgres descartável): dois casos — `costsUpdatedAt` fica `null` na criação sem custo informado e
não-nulo quando algum custo é informado; em `update`, `costsUpdatedAt` só muda quando algum dos seis
campos de custo muda de valor (trocar `brand` sozinho não move o carimbo).

```
bun test test/fleet-http.contract.test.ts
→ 36 pass, 12 fail (120 expect) — vermelho esperado: schema/mapper/repositório ainda não conhecem
  os seis campos de custo nem os dois campos derivados

bun test test/fleet-domain.contract.test.ts
→ 8 pass, 0 fail (12 expect) — política de domínio (T013) permanece verde, não afetada por este ciclo

bun test ./test/integration/fleet-vehicle-repository.integration.ts
→ 0 pass, 2 skip, 0 fail — sem DATABASE_URL de teste neste ambiente; tipo já vermelho (abaixo)

bunx tsc --noEmit 2>&1 | grep -i fleet
→ 11 erros: test/fixtures/fleet-http-payload.fixture.ts (costsUpdatedAt desconhecido em
  FleetVehicle) e test/integration/fleet-vehicle-repository.integration.ts (acquisitionAmount,
  costPerKilometer desconhecidos em FleetVehicleInput; costsUpdatedAt desconhecido em FleetVehicle)
```

Vermelho confirmado exatamente no escopo do custo do veículo, sem falha inesperada fora dele.

## T016 — implementação (custo mensal fixo)

Campos de custo (`acquisitionAmount`, `monthlyInstallmentAmount`, `annualVehicleTaxAmount`,
`annualInsuranceAmount`, `averageConsumption`, `costPerKilometer`) e os dois campos derivados
(`monthlyFixedCost`, `costsUpdatedAt`) atravessam toda a camada:

- `fleet.port.ts` — seis campos em `FleetVehicleInput`; `costsUpdatedAt`/`monthlyFixedCost`
  só em `FleetVehicle` (resposta), nunca aceitos como entrada.
- `fleet-request.schema.ts` — três regex por escala (`MONEY_DECIMAL` reaproveitado de
  `freight-rule-mutation.schema.ts`; `COST_PER_KILOMETER_DECIMAL` e `CONSUMPTION_DECIMAL`
  derivados por analogia à precisão/escala da coluna). `createVehicleSchema`/`updateVehicleSchema`
  continuam `.strict()`, então `monthlyFixedCost`/`costsUpdatedAt` no corpo da requisição já
  são rejeitados como chave desconhecida sem lógica extra. `parseBody()` já agrega todos os
  `issues` do zod em `error.details[]` — nenhum código novo era necessário para "todos os erros
  de uma vez".
- `fleet.mapper.ts` — `mapVehicle()` expõe os seis campos (pass-through de string, sem conversão
  — ao contrário de peso/capacidade, as colunas `numeric` sem `mode: 'bigint'` já entram/saem como
  string) mais `monthlyFixedCost` (via `deriveMonthlyFixedCost`) e `costsUpdatedAt`
  (`?? null`). `toVehicleColumns()` devolve as seis colunas; `costsUpdatedAt` fica de fora do
  Omit porque depende de comparação com o valor anterior, calculada no repositório.
- `drizzle-fleet-vehicle.repository.ts` — `create()` grava `costsUpdatedAt: hasInformedCosts(...)
? new Date() : null`; `update()` grava um `CASE WHEN <algum dos seis campos mudou> THEN now()
ELSE costs_updated_at END` via `sql` do drizzle-orm, comparando cada coluna atual com o valor
  recebido (`ne(...)` combinados por `or(...)`) — só belisca a data quando o custo realmente muda.
- `fleet.routes.ts` — `serializeVehicle()` expõe os seis campos de entrada mais
  `costsUpdatedAt`/`monthlyFixedCost` na resposta HTTP.

Verificação (verde):

```
bun test test/fleet-http.contract.test.ts
→ 48 pass, 0 fail (136 expect)

bun test test/fleet-domain.contract.test.ts
→ 8 pass, 0 fail (12 expect)

bun test test/fleet-schema.contract.test.ts
→ 29 pass, 0 fail (90 expect) — tenant-safety incluso, continua verde

bun test test/fleet-infrastructure.contract.test.ts test/fleet-application.contract.test.ts
→ 50 pass, 0 fail (100 expect)

bun test ./test/integration/fleet-vehicle-repository.integration.ts
→ 0 pass, 2 skip, 0 fail (sem banco de teste neste ambiente — mesmo padrão de auto-skip
  já usado pelas outras suítes de integração do repo)

bunx tsc --noEmit
→ 0 erros

bunx eslint src/fleet/infrastructure/drizzle-fleet-vehicle.repository.ts \
  src/fleet/presentation/fleet.routes.ts src/fleet/application/fleet.port.ts \
  src/fleet/presentation/fleet-request.schema.ts src/fleet/infrastructure/fleet.mapper.ts \
  --max-warnings=0
→ sem saída (limpo)
```

T015 vermelho fechado em verde; nenhuma regressão em tenant-safety ou fora do escopo de custo.

## T017 — contrato vermelho (bloco de custo no formulário)

`test/fleet/vehicle-cost-fields.contract.ts` (registrado em `test/fleet.contract.test.ts`) fixa oito
comportamentos: adaptação exata dos seis campos + `monthlyFixedCost`/`costsUpdatedAt` na resposta
(quatro recusas com `FLEET_RESPONSE_INVALID` — campo ausente, número em lugar de string decimal),
ida para a API na escala fiscal com zero para o que ficou em branco, volta para edição com zero
virando campo vazio, derivação do custo fixo mensal pela regra do domínio, resumo em moeda com
zero lido como "não informado", colunas de custo ocultas por padrão com célula formatada, ordem dos
cinco blocos no formulário e as chaves nos dois locales.

Vermelho por ausência: `src/modules/fleet/shared/fleetVehicleCost.service.ts` e
`src/modules/fleet/components/VehicleCostFields.component.tsx` não existiam (o
`loadFutureModule`/`Bun.file` falha em `ENOENT`), `FLEET_VEHICLE_COLUMN_KEYS` tinha cinco chaves e
nenhum dos doze rótulos de custo estava nos locales.

## T018 — implementação (bloco de custo no formulário)

Primitivas decimais novas em `src/modules/shared/decimalAmount.service.ts` — `zeroAmount`,
`isZeroAmount`, `parseTypedAmount`, `toTypedAmount`, `divideAmount` — sobre `bigint`, com
arredondamento meio-para-cima próprio (`rescaleHalfUp`/`divideHalfUp`): o `rescale` que já existia
só sabia subir de escala. Nenhum `Number` no caminho do dinheiro. Regra de separador: vírgula
presente faz do ponto separador de milhar (`'150.000,50'` → `'150000.5000'`); sem vírgula, o ponto é
decimal — é o mesmo texto que a API devolve, então o ciclo digitar→salvar→reabrir fecha.

- `fleetVehicleCost.service.ts` (novo) — `VEHICLE_COST_FIELD_SCALE` declara escala de API e de
  formulário por campo (dinheiro 4/2, consumo 2/2, custo por km 4/**4** — arredondar a quarta casa
  na tela esconderia dígito que o cálculo de frete usa), `toVehicleCostBody`/`toVehicleCostFormState`,
  `deriveMonthlyFixedCost` (prestação + (IPVA + seguro) ÷ 12, testando as **três entradas** para
  zero em vez do total, como a API), `summarizeVehicleCosts` e `formatCostReferenceDate`.
- `fleet.types.ts` / `fleet.constant.ts` — `FleetVehicleCostFields` e `FleetVehicleCostSummary`;
  `VEHICLE_COST_KEYS` compõe `VEHICLE_BODY_KEYS`, `VEHICLE_DETAIL_KEYS` e `VEHICLE_FORM_KEYS`, que a
  validação de forma exata (`hasOnlyKeys` + `hasEveryKey`) consome.
- `fleetGuards.validation.ts` / `fleetResponse.validation.ts` — `isDecimalString` e
  `isNullableDecimalString`: número em lugar de string decimal reprova a resposta inteira.
- `fleetForm.service.ts` — os seis campos nascem `''` em `EMPTY_VEHICLE_FORM`; o spread do custo vai
  **por último** em `toVehicleBody`/`toVehicleFormState` (spread reinicia o grupo de ordenação de
  chaves do lint).
- `fleetVehicleTable.service.ts` — duas colunas novas, ocultas por padrão, e
  `readFleetVehicleColumnValue` centraliza a leitura da célula (o helper privado de
  `VehicleList.component.tsx` saiu): custo zerado é "não informado", não `R$ 0,00`, que afirmaria
  custo nenhum.
- `VehicleCostFields.component.tsx` (novo) — quinto e último bloco do formulário, seis campos
  opcionais mais o resumo em leitura (`<dl>`) com custo fixo mensal e custo por km, e a data de
  referência dos custos pelo idioma ativo do i18n. `.costSummary` em `fleet.module.css` só com
  `--space-*` e `color-mix`.
- Locales — doze rótulos em `fleet.locale.json` (acentuados) e `fleet.en.locale.json`, mais
  `columns.costPerKilometer` e `columns.monthlyFixedCost`.

Verificação (verde):

```
bun test ./test/fleet.contract.test.ts (frontend)
→ 68 pass, 0 fail (413 expect) — inclui os 8 casos de custo

bun run --cwd apps/frontend-transportada test
→ 1133 pass, 0 fail (5510 expect) — contrato de acentuação incluso

bun run --cwd apps/api-transportada test     → 2434 pass, 0 fail
bun run --cwd apps/worker-transportada test  → 430 pass, 0 fail
bun run --cwd apps/cron-transportada test    → 128 pass, 0 fail

bun run typecheck    → 0 erros nas quatro apps
bun run lint         → limpo (--max-warnings=0)
bun run format:check → All matched files use Prettier code style!
```

## Ajustes de UI pedidos durante a execução (fora da numeração de tasks)

Quatro pedidos do usuário atendidos no frontend, cada um com contrato escrito vermelho antes:

- **Ícone do app e 🚧 duplicado** — `environmentFavicon.service.ts` trocava o favicon por um SVG
  só com 🚧 _e_ prefixava o título com 🚧: a aba mostrava dois avisos e nenhuma marca. Renomeado
  para `environmentBadge.service.ts`, agora só marca o título. Contrato:
  `test/shared/deployment-environment.contract.ts` (`application icon`, `environment badge`).
- **Tela de frota espremida** — a segunda coluna do grid ficava reservada mesmo sem editor aberto
  (filho `null` não colapsa track de grid). Split agora é condicional em `[data-editor-open='true']`.
- **Dois botões iguais** — o "Novo veículo" do estado vazio duplicava o do cabeçalho do painel;
  removido. Contratos dos dois itens em `test/fleet/screen-standards.contract.ts`.
- **Número da frota opcional + cadastros no menu** — o campo alimenta o `<cInt>` do MDF-e, que é
  opcional: virou `optional` com hint no formulário (não foi removido). Frota e Perfis CT-e saíram
  de "Administração" para o grupo novo "Cadastros" na navegação. Contratos em
  `test/shared/navigation-groups.contract.ts` e `test/fleet/screen-standards.contract.ts`.

- **Copyright em todas as páginas** — `ApplicationFooter.component.tsx` em `foundation` é a única
  fonte do texto (ano vem de `getFullYear()`, nunca fixo) e está montado nas **três raízes de
  render**: o shell autenticado (`src/main.tsx`) e as duas telas anônimas (`FirstAccess.page.tsx`,
  `PasswordReset.page.tsx`), que sobem root próprio e nunca veriam o rodapé do shell. A regra
  `.application-footer` usa `width: var(--layout-width)` — fecha na mesma borda do cabeçalho — e
  não é `position: fixed`, para não flutuar sobre a tabela. Contrato em
  `test/design-system/application-footer.contract.ts`.

- **Usuário local com todas as permissões** — `LOCAL_IDENTITY_ROLES` tinha cinco papéis e faltava
  `driver`, o único com `trip.read`/`trip.report`: o usuário do seed não conseguia exercitar viagens.
  Com os seis papéis, a união cobre **todo** `CompanyPermission`. `companies.manage` fica de fora de
  propósito — é de plataforma, reservada e sem rota consumidora (ADR-0021). O realm não mudou:
  `local-user` segue sem `realmRoles`, a autorização vem da membership no banco. Contrato em
  `test/authorization.contract.test.ts` (`grants the local seed user every company permission`);
  `ensureMembershipRoles` só insere o que falta, então `db:seed:local` concede o papel novo sem
  recriar nada.

```
bun run --cwd apps/frontend-transportada test
→ 1119 pass, 0 fail (5402 expect), 17 arquivos

bun run --cwd apps/api-transportada test        → 2433 pass, 12 skip, 0 fail
bun test ./test/keycloak-realm.contract.test.ts → 16 pass, 0 fail
bun run --cwd apps/api-transportada db:seed:local
→ membership_roles: company-admin, driver, finance, fiscal, operator, viewer

bun run --cwd apps/frontend-transportada typecheck   → 0 erros
bun run --cwd apps/frontend-transportada lint        → sem saída (limpo)
```

O seletor de marca/modelo não precisou de código novo: só de `FLEET_VEHICLE_CATALOG_URL`
(BrasilAPI/FIPE, pública, sem token) no `.env` — a API precisa reiniciar para lê-la.

- **Cor do veículo** — campo livre com teto de 30 caracteres em vez de enumeração: o CRLV imprime
  nome ("Branca"), não código, e cada provedor de placa escreve do seu jeito — uma lista fechada
  transformaria uma grafia divergente em impedimento de cadastro. A coluna
  `fleet_vehicles.color text not null default ''` entra pela migration aditiva
  `20260814131353_fleet_vehicle_color` (com `fleet_vehicles_color_check`), e o rollback ao lado
  derruba check e coluna guardado por nome + sha256 e `deleted_migrations <> 1`. A consulta por
  placa preenche a cor junto de marca/modelo/ano — `vehicle-lookup-payload.policy.ts` aceita
  `cor`/`corVeiculo`/`color` (as chaves são normalizadas, então `COR` casa) e `formatField` não
  toca no valor, preservando a grafia do provedor. Campo que o provedor não devolveu não apaga o
  que o operador já digitou. Na tabela a coluna nasce **oculta** com `modelYear` e `axleCount` —
  cor é dado de conferência, não de varredura.

```
bun run --cwd apps/api-transportada test       → 2434 pass, 12 skip, 0 fail (9775 expect)
bun run --cwd apps/frontend-transportada test  → 1123 pass, 0 fail (5434 expect)
bun run --cwd apps/worker-transportada test    → 430 pass, 0 fail
bun run --cwd apps/cron-transportada test      → 128 pass, 0 fail
bun run typecheck    → 0 erros nas quatro apps
bun run lint         → limpo (--max-warnings=0)
bun run format:check → All matched files use Prettier code style!
```

- **A lista de marcas vinha vazia e calada** — `EMPTY_VEHICLE_FORM` nasce com `wheelType: ''`, e é o
  rodado que resolve o segmento do provedor: sem ele a API responde `{items: [], source: 'none'}` e
  o operador via um select vazio, sem saber se estava carregando, se o catálogo não tinha marcas ou
  se algo falhou — exatamente o que a decisão 3 desta spec proibia. O rodado é escolhido no bloco
  seguinte do formulário ("Capacidade e operação"), e a ordem dos blocos é contrato
  (`identity < model < operation`), então reordenar não era caminho.

  A escolha do campo passou a sair de uma regra pura só,
  `resolveVehicleCatalogFieldMode({hasCatalogFailure, role, vehicleCatalogEnabled, wheelType})`
  → `'list' | 'blocked' | 'text'`, chamada duas vezes em `VehicleModelFields.component.tsx`: uma
  para decidir se vale perguntar ao provedor (`enabled` das duas queries) e outra para decidir o que
  desenhar. `'blocked'` desenha o select desabilitado com a dica que **nomeia o campo que falta**;
  `'text'` cobre catálogo desligado, reboque (decisão 3) e provedor indisponível (decisão 4 — nunca
  impede cadastrar), com a dica de indisponibilidade na marca; `'list'` desenha o esqueleto
  enquanto a busca corre, porque select vazio durante o carregamento é indistinguível de catálogo
  sem marcas. O erro é ponto fixo estável: falhou → `'text'` → query desabilitada → o erro
  permanece, sem laço de re-tentativa (`retry: false`).

```
bun test ./test/fleet.contract.test.ts (cwd apps/frontend-transportada)
→ 71 pass, 0 fail (431 expect)
bun run --cwd apps/frontend-transportada test  → 1141 pass, 0 fail (5543 expect)
bun run --cwd apps/frontend-transportada build → dist + sw.js gerados
bun run typecheck → 0 erros nas quatro apps
bun run lint      → limpo (--max-warnings=0)
bunx prettier --check apps/frontend-transportada/{src/modules/fleet,test/fleet}
→ All matched files use Prettier code style!
```

### A dica mandava o operador para o bloco seguinte

A correção acima acertava o sintoma e errava a ergonomia: o aviso da marca dizia
`Escolha o tipo de rodado em "Capacidade e operação"` — ou seja, para preencher o segundo bloco do
formulário era preciso descer até o terceiro e voltar. Campo que decide outro campo vem antes dele.

- **Função no conjunto** e **Tipo de rodado** saíram de `VehicleOperationFields` e entraram em
  `VehicleIdentityFields`, junto com a dica de rodado obrigatório para o MDF-e. É o lugar
  semanticamente certo: os dois dizem _o que o veículo é_, como placa, Renavam e UF; o bloco de
  operação ficou com _o que ele carrega_ (carroceria, tara, capacidades). A ordem dos blocos no
  formulário não mudou — `identity < model < operation` continua fixada por contrato.
- Com o rodado escolhido antes, `'blocked'` deixa de ser o estado inicial normal do formulário e
  passa a valer só para quem deixou o rodado em "Não informado" — que é opção legítima, e por isso
  a dica continua existindo, agora sem nomear bloco nenhum.

### O provedor caía e a lista ficava calada de novo

`createCachedVehicleCatalogGateway` engole a falha do provedor por desenho — _"TTL longo no sucesso,
curto na falha — nunca deixa o erro escapar"_ — e responde **200** com `{items: [], source:
'unavailable'}`. Logo `brandsQuery.isError` nunca fica `true` numa queda da FIPE, e o degrade da
decisão 4 que a correção anterior entregou não disparava: o select voltaria a ficar vazio e sem
motivo, o sintoma original.

- `hasVehicleCatalogFailure({isError, source})` lê as duas formas da falha — rejeição da query e
  `source: 'unavailable'` na resposta. O vocabulário já existia no contrato
  (`FLEET_VEHICLE_CATALOG_SOURCE`), só não era lido.
- `source: 'none'` **não** é falha: é ausência de segmento (reboque ou rodado em branco), que é
  `'blocked'`, não `'text'`.

```
bun test ./test/fleet.contract.test.ts (cwd apps/frontend-transportada)
→ 73 pass, 0 fail (442 expect)
bun run --cwd apps/frontend-transportada test  → 1143 pass, 0 fail (5554 expect)
bun run typecheck → 0 erros nas quatro apps
bun run lint      → limpo (--max-warnings=0)
bunx prettier --check apps/frontend-transportada/{src/modules/fleet,test/fleet}
→ All matched files use Prettier code style!
```

## A placa digitada não parecia uma placa

O campo de placa aceitava sete caracteres sem mostrar em que formato eles caem. Quem digita olhando
para o CRLV não tem como conferir a posição — no padrão Mercosul (`AAA1A11`) a quarta posição é
dígito e a quinta é letra, e é exatamente ali que o erro de digitação passa. A miniatura ao lado do
campo desenha as sete posições e se preenche conforme o operador digita: o formato aparece antes do
conteúdo, e o que ainda falta fica visível como base de caractere vazia.

- `describePlateCharacters` é a regra pura: passa pelo `normalizePlate` que já existia (maiúsculas,
  fora `[A-Z0-9]`) e distribui em sete posições, cortando o excesso. O hífen do padrão antigo
  desaparece na normalização — os dois padrões têm sete caracteres impressos, então uma miniatura
  serve aos dois sem saber qual é qual.
- `PlateThumbnail` é desenho em CSS, não `<svg>` — SVG cru fora de `src/components/ui/` é proibido e
  o contrato do design system reprova. A miniatura é `aria-hidden="true"`: ela espelha o campo ao
  lado, e anunciar de novo faria o leitor de tela ler a placa duas vezes.
- As cores (faixa azul, corpo claro, tinta preta) e a proporção são do documento oficial, não do
  tema escuro da aplicação: entram como `--color-plate-*` e `--plate-*` no `:root`, e o contrato
  proíbe hexadecimal dentro do CSS do módulo.
- `Mercosul`, `BRASIL` e `BR` vão para os dois dicionários com o mesmo valor: é o que está impresso
  na placa brasileira, e isso não muda com o idioma da tela.

A primeira versão desenhava a faixa com `MERCOSUL` e `BRASIL` nas duas pontas e caracteres
monoespaçados pequenos — parecia uma legenda, não uma placa. A referência é o documento impresso:
`Mercosul` pequeno à esquerda, **`BRASIL` em negrito no centro** (é o país que domina a faixa), a
bandeira à direita, e `BR` no rodapé da margem esquerda do corpo. Os sete caracteres passaram a
ocupar quase toda a largura interna, em negrito, como na placa.

- A bandeira é desenho puro em CSS: base verde, `::before` girado 45° para o losango amarelo e
  `::after` circular para o disco azul, recortados pelo `overflow: hidden` do elemento. Emoji na UI
  de produto é proibido, e a bandeira aqui é ~10 × 7 px — texto não sobreviveria a esse tamanho.
- `--font-plate` entrou no `:root` porque a placa não usa a tipografia da aplicação: ela usa
  grotesca condensada, e é isso que faz o desenho ser reconhecido como placa antes de ser lido.
- A geometria saiu da proporção impressa (400 × 130 mm): `--plate-width: 10rem` /
  `--plate-height: 3.25rem`, faixa em ~21% da altura, sete posições de `0.78em` a `1.4rem`
  preenchendo ~125 dos 156 px internos.

```
bun test ./test/fleet.contract.test.ts (cwd apps/frontend-transportada)
→ 5 fail antes da implementação (contrato vermelho), depois 78 pass, 0 fail (480 expect)
bun run --cwd apps/frontend-transportada test  → 1148 pass, 0 fail (5592 expect)
bun run typecheck → limpo nas três apps de backend e no frontend
                    (o único erro do frontend vem de test/notification/settings-catalog.contract.ts,
                     arquivo não versionado e fora desta feature — typecheck limpo sem ele)
bun run lint      → limpo (--max-warnings=0)
bunx prettier --check apps/frontend-transportada/{src/modules/fleet,src/styles/index.css,test/fleet}
→ All matched files use Prettier code style!
```

## Correção — o formulário gravava o código FIPE no lugar do nome

Descoberto ao dirigir a UI construída de verdade (build com `VITE_SMOKE_AUTH_BYPASS=true`, preview em
`localhost:53100`, endpoints de frota mockados por `page.route`) e cadastrar um veículo de ponta a
ponta. O `POST /fleet/vehicles` saía com `"brand": "103"` e `"model": "1"`: os códigos FIPE da Volvo e
do FH 540 6x4.

- A causa era o `toCatalogOptions` local do `VehicleModelFields`, que mapeava `value: option.code`.
  Marca e modelo são **texto** no cadastro, no CRLV e no MDF-e — `state.brand` guardando código
  entregava `103` ao fiscal, e a API não tem tradução de volta: `fleet-request.schema.ts` valida
  `z.string().trim().max(60)` e o `fleet.mapper.ts` persiste `record.brand` como veio.
- Trocar só o `value` para o nome quebraria a lista de modelos: o endpoint do catálogo é indexado por
  código. Por isso a opção passou a valer nome (`toVehicleCatalogOptions`) e o código voltou a ser
  resolvido a partir do nome escolhido, na hora da consulta (`resolveVehicleCatalogCode`), a partir
  dos itens já carregados.
- Guardar `brandCode`/`modelCode` no estado do formulário foi descartado: `toVehicleFormState` só
  recebe nomes do detalhe do veículo, e a edição de um veículo existente ficaria sem código.
- O `disabled` e o esqueleto do select de modelo continuam presos a `state.brand`, não a `brandCode`:
  query desabilitada reporta `isLoading: false` no TanStack v5, então marca sem correspondência no
  catálogo mostra select vazio e habilitado, nunca esqueleto eterno.

```
bun test test/fleet.contract.test.ts (cwd apps/frontend-transportada)
→ 2 fail antes da implementação (contrato vermelho), depois 80 pass, 0 fail (488 expect)
bun run typecheck → limpo nas quatro apps
bun run lint      → limpo (--max-warnings=0)

POST /fleet/vehicles depois da correção:
  "brand": "Volvo", "model": "FH 540 6x4", "modelYear": 2022, "axleCount": 3,
  "plate": "EMP0A14", "renavam": "12345678901", "role": "traction", "wheelType": "03"
lista depois de salvar:
  EMP0A14 · Tração · Próprio da transportadora · Volvo · FH 540 6x4 · 27000 kg · ATIVO
```

O aparato de Playwright usado nessa verificação era temporário e foi removido — ele provou o payload
que sai do navegador e o que a tabela mostra, **não** a persistência no banco (a API estava mockada).

## A placa sai em maiúsculas já na digitação

O campo devolvia ao operador exatamente o que ele digitava, então `emp0a14` ficava minúsculo na tela
enquanto a miniatura ao lado mostrava `EMP0A14` — duas grafias da mesma placa na mesma linha. O
`normalizePlate` só entrava no envio.

- `toPlateInput` muda **só o caixa**. Remover caractere durante a digitação (hífen, espaço, símbolo)
  encurtaria o valor controlado e moveria o cursor sozinho no meio da palavra; o `normalizePlate`
  continua removendo o hífen do padrão antigo no `toVehicleBody`, que é onde isso importa.
- Ficou em `fleetPlate.service.ts`, ao lado do `describePlateCharacters`, porque é a mesma regra de
  apresentação da placa. Um `uppercase` como prop do `FleetField` serviria a um campo só e o
  componente já passa de cinco props.

```
bun test test/fleet.contract.test.ts (cwd apps/frontend-transportada)
→ 2 fail antes da implementação (contrato vermelho), depois 82 pass, 0 fail (493 expect)
bun run --cwd apps/frontend-transportada test → 1156 pass, 0 fail (5638 expect)
typecheck · lint · prettier --check → limpos
```

## A UF de licenciamento é escolhida, não digitada

O campo era texto livre de duas letras. A API valida `/^[A-Z]{2}$/`, que aceita `XX`, `ZZ` e qualquer
par que não existe — o erro só aparecia no fim do preenchimento, no envio, e o operador voltava para
descobrir qual dos vinte campos estava errado. A lista é fechada em 27 e não muda.

- `BRAZIL_STATE` em `fleet.types.ts`, ordenada, ao lado das outras listas do módulo. O tipo derivado
  `BrazilState` existe para quem precisar dele; o formulário guarda `state: string`, então o
  `FleetSelectField` continua inferindo `TValue = string` sem mudança nenhuma no componente.
- Os rótulos seguem o padrão `"código — nome"` do módulo (o mesmo do rodado e da carroceria):
  `"SP": "SP — São Paulo"`. Vinte e sete chaves cujo valor fosse igual à chave não pagariam o
  arquivo; com o nome, quem não decora a sigla acha o estado.
- `stateOption` é **idêntico** nos dois dicionários: nome de estado é nome próprio e não se traduz.
- Sem prop de busca: o `Select` oferece o campo sozinho a partir de `SELECT_SEARCH_THRESHOLD` (8), e
  27 opções passam disso.
- O `maxLength={2}` saiu do bloco de identificação junto com o campo — era a única razão dele ali.

```
bun test test/fleet.contract.test.ts (cwd apps/frontend-transportada)
→ 1 fail antes da implementação (contrato vermelho), depois 83 pass, 0 fail (555 expect)
bun run --cwd apps/frontend-transportada test → 1157 pass, 0 fail (5700 expect)
bun run typecheck · bun run lint → limpos nas quatro apps
prettier --check nos arquivos tocados → limpo
```

A UF do proprietário (`ownerState`, em `VehicleOwnerFields`) continua sendo texto livre — mesmo
problema, campo diferente, fora do escopo desta correção.

## A consulta de veículo por placa saiu do produto

A pergunta que abriu isto foi direta: existe provedor gratuito? Não existe. O Denatran/Senatran não
publica consulta aberta por placa; o que há de aberto é débito por estado, cada Detran com seu portal,
com captcha, sem contrato de API e sem os campos do cadastro (tara, capacidade, proprietário). Todo
provedor de mercado levantado cobra por consulta. E dado de proprietário é dado pessoal de terceiro —
fonte gratuita que o devolvesse seria, com alta probabilidade, raspagem. A decisão do usuário foi
"se for pago remover tudo".

O trilho estava em desligado permanente: variável nunca preenchida, capacidade `false`, botão nunca
renderizado. Código que só existe para nunca rodar aparece em typecheck, em revisão e em teste, e
sugere na tela uma capacidade que não há.

**ADR-0032** registra a decisão e **substitui a ADR-0020**, que ganhou faixa de "substituída" e fica
como registro do desenho — é o caminho a retomar se alguma instalação contratar um provedor.

Saiu da API: `FleetVehicleLookupPort`/`FleetVehicleLookup`, o use case, a política de tradução de
payload, o gateway HTTP, `GET /fleet/vehicles/lookup`, o parser de query, as duas classes de erro
(503 `..._UNAVAILABLE`, 502 `..._FAILED`), `API_FLEET_VEHICLE_LOOKUP_PATH`, o bloco de configuração e
as duas variáveis do `.env.example`. Saiu do frontend: `useVehicleLookup`, o botão e a dica no bloco
de identificação, `lookupVehicleByPlate` do cliente, `vehicleLookupFromApi`, `applyVehicleLookup`,
`VEHICLE_LOOKUP_KEYS`/`VEHICLE_LOOKUP_FORM_KEYS`, `.lookupHint` e as cinco chaves de tradução.

O que **ficou**, e por quê:

- **O campo Renavam.** Não é artefato da consulta: é dado do CRLV, que o operador tem em mãos, e é
  obrigatório no MDF-e. Fica digitado, como a placa.
- **`GET /fleet/capabilities`** e o catálogo FIPE de marca e modelo — o catálogo é consumidor próprio
  da rota, com query independente no `useVehicleCatalog`. A resposta passou a ter **um** booleano.
  Chave desconhecida continua sendo resposta inválida no frontend (`hasOnlyKeys`), e é isso que
  impede a capacidade removida de voltar por descuido.
- **`isTrustedLookupUrl`** no schema de ambiente: o refine da URL do catálogo FIPE e o do callback de
  NFS-e usam a mesma função. O nome cita "lookup" mas a função não é do trilho removido.
- **`plateSchema`** em `fleet-request.schema.ts`, usado pelos schemas de criação e atualização de
  veículo. Só o import morto no `fleet.schema.ts` saiu.

As quatro suítes dedicadas (`vehicle-lookup.contract.ts` em `fleet-application`, `fleet-http`,
`fleet-infrastructure` e no frontend) viraram **dois contratos-guarda**, escritos vermelhos antes da
remoção: `test/fleet-application/plate-lookup-removed.contract.ts` (API) e
`test/fleet/plate-lookup-removed.contract.ts` (frontend). Eles varrem os arquivos do módulo por
símbolo do trilho, checam que os arquivos removidos não existem, que o `.env.example` não tem as
variáveis, que nenhum dicionário tem chave começando em `lookup`, que `FLEET_CAPABILITY_KEYS` é
`['vehicleCatalog']` — e que a ADR-0020 declara ser substituída pela 0032 e a 0032 declara substituir
a 0020. Reintroduzir a consulta exige, por construção, mexer na decisão antes de mexer no código.

Um renome de carona: `vehicleLookupCalls` → `existingVehicleIdCalls` nos fixtures de
`fleet-application`. O contador registra `listExistingVehicleIds` e nunca teve relação com placa; o
nome antigo só confundiria agora.

```
API      → bun test ./test/fleet-application.contract.test.ts (guarda vermelho: 4 fail / 15 pass)
frontend → bun test test/fleet.contract.test.ts               (guarda vermelho: 4 fail / 83 pass)

depois da remoção:
bun run --cwd apps/frontend-transportada typecheck → limpo
bun run --cwd apps/frontend-transportada test      → 1153 pass, 0 fail (6119 expect)
bun run --cwd apps/api-transportada test           → 2444 pass, 2 fail (as duas alheias, abaixo)
  fleet-application · fleet-http · fleet-infrastructure · fleet-schema → 97 pass, 0 fail
  env-example · fleet-domain · environment-provisioning               → 22 pass, 0 fail
bun run lint                                       → limpo nas quatro apps
prettier --check nos arquivos tocados              → limpo
```

⚠️ Dois gates não fecham por trabalho alheio em curso na árvore, nenhum deles tocado aqui:

- `bun run typecheck` da API falha em `freight-rules/domain/freight-rule-filters.policy.ts:38`
  (`Cannot find name 'TAX_ID_PATTERN'`) — edição inacabada da spec 037 (CNPJ alfanumérico), que
  trocou a constante pelo `CNPJ_PATTERN` importado e deixou uma referência para trás.
- `bun run --cwd apps/api-transportada test` tem 2 falhas alheias: o pin exato dos pacotes fiscais
  (`package.json` modificado por outra frente) e `cron-notifications` ausente da tabela de build do
  pipeline.

## A cor do veículo é escolhida, com o tom à mostra

Texto livre num campo de trinta caracteres punha `PRATA`, `prata` e `prata metálico` na mesma frota,
e a coluna "Cor" da tabela virava três valores para a mesma lataria. A tabela do Denatran/CRLV é
fechada em 16 tons e não muda — é lista, não texto.

- `VEHICLE_COLOR` em `fleet.types.ts` e `VEHICLE_COLORS` em `fleet.schema.ts` (API): o mesmo idioma
  das outras listas fechadas do módulo, espelhado à mão porque nenhuma app importa fonte da outra.
  O `check` do banco passou de `length("color") <= 30` para `length = 0 or "color" in (...)` — defesa
  em profundidade, e o Zod da rota virou `z.literal('').or(z.enum(VEHICLE_COLORS))`.
- `VehicleColorField.component.tsx` em vez de mais uma prop no `FleetSelectField`: só esta lista
  carrega quadrado de cor, e o campo genérico não tem por que conhecer mapa de tom.
- O quadrado entra por `swatch` no `SelectOption`, e o valor é sempre `var(--vehicle-color-*)` — os
  16 tons vivem no `:root` de `src/styles/index.css`, ao lado dos tokens da placa Mercosul. `fantasia`
  é gradiente: é o multicor do Denatran e nenhum tom único o representa.
- `filterSearchableOptions` ficou genérica (`<TOption extends SearchableSelectOption>`); antes o
  filtro estreitava para `SearchableSelectOption` e comia o `swatch` no caminho de busca.
- O gatilho é `space-between`, então o quadrado precisou do invólucro `.selection` — solto, ele ia
  para o lado oposto, junto ao chevron.
- Cor gravada antes da lista fechada não pode aparecer no select: `toVehicleColor` no
  `fleetForm.service.ts` devolve `''` para qualquer valor fora da lista, e a migration zera as
  mesmas linhas antes de estreitar o `check`.
- A célula da tabela recebe `colorLabel` pronto: o serviço puro não tem `t`, e slug cru renderizaria
  "branca" em minúscula no meio de rótulos traduzidos.

```
frontend → bun test test/fleet.contract.test.ts test/design-system.contract.test.ts
           (guarda vermelho antes da implementação; depois 214 pass, 0 fail, 1542 expect)
API      → bun test ./test/database-migration.contract.test.ts ./test/fleet-schema.contract.test.ts \
             ./test/fleet-http.contract.test.ts → 105 pass, 3 skip, 0 fail
bun run --cwd apps/api-transportada test      → 2470 pass, 1 fail (alheia: `cron-notifications`)
bun run --cwd apps/frontend-transportada test → 1175 pass, 44 fail (todas da spec 037, alheias)
bun run typecheck → limpo nas quatro apps
bun run lint      → limpo nas quatro apps
prettier --check nos arquivos tocados → limpo
```

`make migration-test` não foi rodado aqui (exige Postgres descartável de pé); a migration
`20260814211033_fleet_vehicle_color_list` traz `rollback.sql` com o guard de uma linha no journal e
restaura o `check` de trinta caracteres.
