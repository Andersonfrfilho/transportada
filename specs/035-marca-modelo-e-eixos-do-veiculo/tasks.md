# 035 — Tasks

Uma task por vez. Teste de contrato **antes** da implementação. Evidência em `evidence.md`.

## Fase A — banco

> 🤖 Modelo: `sonnet`

- [ ] **T001** — Contrato: `test/fleet-schema/tenant-safety.contract.ts` passa a exigir `brand`,
      `model`, `fleet_number`, `model_year` e `axle_count` em `fleet_vehicles`, e
      `test/database-migration/static-migration.contract.ts` recebe o diretório novo na lista
      literal, com asserts de aditividade e de rollback guardado.
      Verificação: `bun test ./apps/api-transportada/test/fleet-schema.contract.test.ts` — vermelho
      pelos motivos certos.
- [ ] **T002** — Colunas e checks em `src/database/fleet.schema.ts`;
      `db:generate --name fleet_vehicle_model_fields`; `rollback.sql` escrito à mão.
      Verificação: `make migration-test` e `db:check` sem drift; T001 verde.

## Fase B — catálogo FIPE

> 🤖 Modelo: `sonnet` (T003 é 🧠 — confirmar a forma da resposta antes de escrever o adaptador)

- [ ] **T003** 🧠 — Sondar o provedor: listar marcas de caminhões, pegar **um código real** da
      resposta e chamar o endpoint de modelos com ele. Registrar a forma exata dos dois corpos em
      `evidence.md`. A sondagem anterior usou código inventado e voltou "recurso não encontrado".
      Verificação: os dois corpos colados na evidência, sem nada de terceiro.
- [ ] **T004** — Contrato: `test/fleet/vehicle-catalog-segment.contract.ts` fixa rodado → segmento
      (`04`/`05` → automóvel, `01`/`02`/`03`/`06` → caminhão, `trailer` → `none`) e
      `test/fleet/fipe-catalog-gateway.contract.ts` cobre sucesso, `429`, `500` e timeout com `fetch`
      falso, mais o cache positivo de 24 h e o negativo de 60 s.
      Verificação: vermelho; arquivos acrescentados à lista literal do `package.json` da app.
- [ ] **T005** — `vehicle-catalog-segment.policy.ts`, `fleet-vehicle-catalog.port.ts`,
      `fipe-vehicle-catalog.gateway.ts` e `cached-vehicle-catalog.gateway.ts`.
      Verificação: T004 verde.
- [ ] **T006** — Contrato de rota em `test/fleet/vehicle-catalog-routes.contract.ts`: `fleet.read`
      exigida, `trailer` devolvendo lista vazia com motivo, provedor fora do ar devolvendo `200` com
      `source` degradado — nunca `5xx`.
      Verificação: vermelho.
- [ ] **T007** — `FLEET_VEHICLE_CATALOG_URL` no `environment.schema.ts` e no `.env.example`; rotas,
      schema Zod `.strict()`, `vehicleCatalog` em `FleetCapabilities`, fiação em `main.ts`.
      Verificação: T006 verde; `make config` passa sem a variável configurada.

## Fase C — persistência e MDF-e

> 🤖 Modelo: `sonnet`

- [ ] **T008** — Contrato: os cinco campos atravessando `POST`/`PUT`/`GET` de veículo, com validação
      de faixa (`axleCount` 2–9, `modelYear` 1900–2100, `0` aceito como não informado); e
      `fleet_number` chegando ao `cInt` no contrato do payload de MDF-e, omitido quando vazio.
      Verificação: vermelho.
- [ ] **T009** — Request schema, mapper, repositório, view-model, rotas; `fleet_number` percorrendo
      `mdfe-issuance-payload.query.ts` → `mdfe-payload.types.ts` → `mdfe-payload.builder.ts`.
      Verificação: T008 verde; contrato de tenant-safety de query continua verde.

## Fase D — frontend

> 🤖 Modelo: `sonnet`

- [ ] **T010** — Contrato de formulário: os quatro blocos na ordem da spec, botão de consulta dentro
      do bloco de identificação, `ownership` no bloco de propriedade, marca/modelo/ano preenchidos
      pela consulta por placa, e trocar a marca limpando o modelo.
      Verificação: vermelho.
- [ ] **T011** — `fleet.constant.ts` (`VEHICLE_LOOKUP_FORM_KEYS`, `VEHICLE_BODY_KEYS`,
      `VEHICLE_FORM_KEYS`, `FLEET_CAPABILITY_KEYS`), `fleetCatalogClient.service.ts`,
      `useVehicleCatalog.hook.ts`, e a quebra de `VehicleIdentityFields` em três componentes.
      Verificação: T010 verde.
- [ ] **T012** — Aviso de campo exigido pelo MDF-e no formulário e marca de incompleto na listagem;
      colunas novas em `VehicleList`, ano e eixos ocultos por padrão.
      Verificação: contrato de tabela e de acentuação de locale verdes.

## Fase E — fechamento

> 🤖 Modelo: `sonnet`

- [ ] **T013** — `make check` verde, `CLAUDE.md` atualizado com as colunas e a rota nova, evidência
      completa, PR.
      Verificação: saída do `make check` colada em `evidence.md`.
