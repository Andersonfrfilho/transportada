# 035 — Plano

Três blocos independentes, entregáveis em ordem: **identidade** (Fases A–D), **custo** (E–G),
**documentos** (H–J). Cada bloco fecha com tela funcionando; nenhum depende do seguinte.

## Fase 0 — padrão e UX da tela atual ✅

Feita. Métrica de campo, foco visível, esqueleto de carregamento, estado vazio por aba e o
formulário em três blocos com a consulta por placa ao lado da placa. Evidência em `evidence.md`.

## Fase A — banco: identidade e modelo

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

## Fase C — persistir identidade na API e no MDF-e

Schema de request, mapper, repositório, view-model e rotas de `fleet` recebendo os cinco campos.
`fleet_number` entra em `mdfe-issuance-payload.query.ts` → `mdfe-payload.types.ts` →
`mdfe-payload.builder.ts` como `cInt`, omitido quando vazio (o campo é opcional no layout).

Contrato de tenant-safety de `test/fleet-schema/` atualizado com as colunas novas.

## Fase D — frontend: identidade e modelo

- `fleet.constant.ts`: `brand`, `model`, `modelYear` entram em `VEHICLE_LOOKUP_FORM_KEYS`; os cinco
  campos entram em `VEHICLE_BODY_KEYS` e `VEHICLE_FORM_KEYS`; `vehicleCatalog` em
  `FLEET_CAPABILITY_KEYS`.
- `shared/fleetCatalogClient.service.ts` + `hooks/useVehicleCatalog.hook.ts` (TanStack Query,
  `staleTime` longo — a lista muda uma vez por mês).
- `VehicleModelFields.component.tsx` — o bloco novo, entre identificação e operação. Os três blocos
  da Fase 0 ficam como estão.
- `VehicleList.component.tsx`: colunas novas, ano e eixos ocultos por padrão.
- Textos acentuados nos `*.locale.json`.

## Fase E — banco: custo e consumo

Seis colunas em `fleet_vehicles`, todas `not null default '0'` com check `>= 0`:
`average_consumption numeric(6,2)`, `cost_per_kilometer numeric(12,4)`,
`acquisition_amount numeric(14,2)`, `monthly_installment_amount numeric(14,2)`,
`annual_vehicle_tax_amount numeric(14,2)`, `annual_insurance_amount numeric(14,2)`, mais
`costs_updated_at timestamptz null`. Aditiva, `rollback.sql` à mão, diretório na lista literal do
contrato de migration.

## Fase F — API: custo, consumo e o derivado

- `fleet/domain/vehicle-cost.policy.ts` — puro: `deriveMonthlyFixedCost` sobre
  `decimal.service.ts` (`parcela + (IPVA + seguro) / 12`, `MONEY_SCALE`, `half_up`) e
  `hasCostInformation`, que decide o que a tela mostra como "não informado".
- Request schema com os seis campos opcionais, não-negativos, erros agregados; mapper e repositório;
  `costs_updated_at` escrito **só** quando algum campo de custo muda — comparação no use case, não no
  SQL.
- View-model do veículo ganha `monthlyFixedCost` e `costsUpdatedAt`; nenhuma coluna nova de total.

## Fase G — frontend: bloco de custo e consumo

`VehicleCostFields.component.tsx` como quinto bloco, com os seis campos e o resumo em leitura
(custo fixo mensal derivado + custo por km + data de referência), formatação de moeda pelo helper de
`shared/` já existente, `0` renderizado como "não informado". Colunas de custo em `VehicleList`,
ocultas por padrão. Locales pt-BR/en.

## Fase H — banco: documentos

`src/database/fleet.schema.ts` — tabela `fleet_vehicle_documents`:

`id uuid pk`, `company_id uuid not null`, `vehicle_id uuid not null`, `type varchar(20) not null`,
`reference varchar(60) not null default ''`, `issued_at date null`, `expires_at date not null`,
`stored_object_id uuid null`, `file_name varchar(160) not null default ''`,
`notes varchar(300) not null default ''`, `archived_at timestamptz null`, `version integer`,
`created_at`, `updated_at`.

- FK composta para `fleet_vehicles (company_id, id)` — o tenant entra na integridade referencial, não
  só no `where`.
- Check de `type` no vocabulário fechado (`crlv`, `insurance`, `antt`, `tachograph`, `other`).
- Índice parcial `fleet_vehicle_documents_active_type_unique` em
  `(company_id, vehicle_id, type) where archived_at is null`.
- Índice `(company_id, expires_at)` para o feed de avisos.
- `purpose: 'fleet_document'` acrescentado ao vocabulário de `stored_objects`.

## Fase I — API: documentos, arquivo e feed de avisos

- `fleet/domain/vehicle-document.policy.ts` — faixa por dias restantes (`expired`/`critical`/
  `warning`/`ok`, constantes 7 e 30) e `detectVehicleDocumentMimeType` por assinatura (PDF, PNG,
  JPEG), no molde de `company-logo.policy.ts`.
- `fleet/infrastructure/fleet-document-storage.gateway.ts` — `buildFleetDocumentObjectKey`
  (`tenants/${companyId}/fleet-vehicles/${vehicleId}/documents/${documentId}/${objectId}`), `put` em
  `create-only` com `sha256`, e `createSignedDownload` de vida curta com
  `disposition: 'attachment'`.
- `fleet/application/vehicle-documents.use-case.ts` — arquivar o ativo e criar o novo **na mesma
  transação**; registro em `stored_objects` junto.
- `fleet/presentation/fleet-documents.routes.ts` — as quatro rotas de documento (`fleet.read` para
  ler e baixar, `fleet.manage` para gravar e arquivar) e `GET /fleet/document-alerts` (`fleet.read`,
  `withinDays` 1..90, default 30). Multipart no molde de `company-logo.schema.ts`.
- Nenhum log com nome de arquivo, conteúdo ou URL assinada.

## Fase J — frontend: documentos e selo na listagem

`VehicleDocumentsPanel.component.tsx` como sexto bloco (só em veículo salvo), linha por tipo com
vencimento, selo de faixa, anexo e ação de baixar; `useVehicleDocuments.hook.ts` +
`fleetDocumentsClient.service.ts`; coluna **Documentos** em `VehicleList` com a faixa mais grave;
esqueleto no carregamento e estado vazio com convite, como manda `docs/frontend/loading.md`.

## Fase K — fechamento

`make check`, `CLAUDE.md` atualizado (colunas, tabela nova, rotas novas, `purpose` novo), evidência
completa, PR.

## Riscos

- **O provedor FIPE não tem SLA.** Mitigado pela decisão 4 da spec: degradação para texto livre, e o
  salvamento nunca depende dele. O contrato do gateway cobre `429`, `500` e timeout.
- **O endpoint de modelos ainda não foi verificado com um código de marca real** — a sondagem usou um
  código inventado e voltou "recurso não encontrado". A Fase B começa confirmando a forma da resposta
  com um código tirado da lista de marcas.
- **Upload é a primeira gravação de arquivo de frota no bucket.** O risco é vazar tenant pela chave
  ou aceitar arquivo hostil; mitigado por `companyId` no prefixo (decisão 13), assinatura em vez de
  `content-type` (decisão 14) e contrato negativo de tenant obrigatório na Fase I.
- **Três blocos na mesma spec.** Mitigado pela ordem: identidade, custo e documentos não se cruzam em
  arquivo nenhum além do `fleet.schema.ts` e do formulário, e cada bloco fecha verde por conta
  própria. Se o prazo apertar, corta-se do fim para trás.
- **Escopo aberto na mesma árvore de trabalho** (032 vive em `staging` sem commit). A Fase A só
  começa depois que a árvore estiver limpa, para a migration não nascer em cima de schema em
  movimento.
