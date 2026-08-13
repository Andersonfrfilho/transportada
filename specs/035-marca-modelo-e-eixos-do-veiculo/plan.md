# 035 — Plano

## Fase A — banco

`apps/api-transportada/src/database/fleet.schema.ts`: cinco colunas em `fleet_vehicles` —
`brand varchar(60) not null default ''`, `model varchar(120) not null default ''`,
`fleet_number varchar(20) not null default ''`, `model_year integer not null default 0`,
`axle_count integer not null default 0`. Dois checks: `model_year = 0 or model_year between 1900 and
2100`, `axle_count = 0 or axle_count between 2 and 9`. Todas aditivas com default — nenhuma linha
existente precisa ser tocada.

Migration por `bun run --cwd apps/api-transportada db:generate --name fleet_vehicle_model_fields`,
`rollback.sql` à mão no molde de `20260811164234_billing_description_templates/rollback.sql`, e o
nome do diretório entrado na lista literal de `test/database-migration/static-migration.contract.ts`.

O worker não copia `fleet_vehicles` — nada a espelhar lá.

## Fase B — catálogo FIPE na API

- `fleet/application/fleet-vehicle-catalog.port.ts` — `listBrands({role, wheelType})` /
  `listModels({role, wheelType, brand})`, devolvendo `{items, source}`.
- `fleet/domain/vehicle-catalog-segment.policy.ts` — a tradução rodado → segmento do provedor, pura
  e testada por contrato. `trailer` devolve `none`.
- `fleet/infrastructure/fipe-vehicle-catalog.gateway.ts` — molde literal de
  `http-vehicle-lookup.gateway.ts`: `fetch` injetado, `AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS)`,
  erro tipado, nenhuma exceção crua escapando.
- `fleet/infrastructure/cached-vehicle-catalog.gateway.ts` — decorador de cache em memória, TTL 24 h
  no sucesso e 60 s na falha, chave `${segment}:${brand ?? ''}`.
- `config/environment.schema.ts` — `FLEET_VEHICLE_CATALOG_URL`, mesmo refinement HTTPS-ou-localhost
  de `FLEET_VEHICLE_LOOKUP_URL`, default `''` (capacidade desligada). Linha no `.env.example`.
- `fleet/presentation/fleet-catalog.routes.ts` + `.schema.ts` (Zod `.strict()`), `fleet.read`.
  `vehicleCatalog` entra em `FleetCapabilities`.

## Fase C — persistir os campos na API

Schema de request, mapper, repositório, view-model e rotas de `fleet` recebendo os cinco campos.
`fleet_number` entra em `mdfe-issuance-payload.query.ts` → `mdfe-payload.types.ts` →
`mdfe-payload.builder.ts` como `cInt`, omitido quando vazio (o campo é opcional no layout).

Contrato de tenant-safety de `test/fleet-schema/` atualizado com as colunas novas.

## Fase D — frontend

- `fleet.constant.ts`: `brand`, `model`, `modelYear` entram em `VEHICLE_LOOKUP_FORM_KEYS`; os cinco
  campos entram em `VEHICLE_BODY_KEYS` e `VEHICLE_FORM_KEYS`; `vehicleCatalog` em
  `FLEET_CAPABILITY_KEYS`.
- `shared/fleetCatalogClient.service.ts` + `hooks/useVehicleCatalog.hook.ts` (TanStack Query,
  `staleTime` longo — a lista muda uma vez por mês).
- `VehicleIdentityFields.component.tsx` quebra em quatro: `VehicleIdentificationFields`,
  `VehicleModelFields`, `VehicleCapacityFields` e o `VehicleOwnerFields` existente, que passa a
  hospedar o select de `ownership`. O botão de consulta migra do `VehicleForm` para dentro do bloco
  de identificação, ao lado da placa.
- `VehicleList.component.tsx`: colunas novas, ano e eixos ocultos por padrão.
- Textos acentuados nos `*.locale.json`.

## Fase E — fechamento

`make check`, evidência, PR.

## Riscos

- **O provedor FIPE não tem SLA.** Mitigado por decisão 4 da spec: degradação para texto livre, e o
  salvamento nunca depende dele. O contrato do gateway cobre `429`, `500` e timeout.
- **O endpoint de modelos ainda não foi verificado com um código de marca real** — a sondagem usou um
  código inventado e voltou "recurso não encontrado". A Fase B começa confirmando a forma da resposta
  com um código tirado da lista de marcas.
- **Terceira feature aberta na mesma árvore de trabalho** (032 e 033 já estão vivas). A Fase A só
  começa depois que o PR #19 entrar, para a migration não nascer em cima de um schema em movimento.
