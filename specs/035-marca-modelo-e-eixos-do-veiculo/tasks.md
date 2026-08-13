# 035 — Tasks

Uma task por vez. Teste de contrato **antes** da implementação. Evidência em `evidence.md`.
Arquivo de teste novo entra na lista literal do `package.json` da app, ou não roda.

## Fase 0 — padrão e UX da tela atual

> 🤖 Modelo: `sonnet` — só frontend, sem migration; entrega visível antes dos campos novos

- [x] **T000** — Contrato `test/fleet/screen-standards.contract.ts` (escrito antes) fixando: barra de
      filtro na métrica compacta e formulário na métrica cheia, resets de campo, anel de foco visível,
      esqueleto no carregamento, estado vazio por aba com ação, e o formulário quebrado em
      identificação / capacidade e operação / propriedade com a consulta por placa ao lado da placa.
      Verificação: `bun run --cwd apps/frontend-transportada test` verde.

## Fase A — banco: identidade e modelo

> 🤖 Modelo: `sonnet`

- [ ] **T001** — Contrato: `test/fleet-schema/vehicles.contract.ts` (onde a lista de colunas e os
      checks de `fleet_vehicles` já moram) passa a exigir `brand`, `model`, `fleet_number`,
      `model_year` e `axle_count` com os dois checks de faixa, e
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

## Fase C — persistência da identidade e MDF-e

> 🤖 Modelo: `sonnet`

- [ ] **T008** — Contrato: os cinco campos atravessando `POST`/`PUT`/`GET` de veículo, com validação
      de faixa (`axleCount` 2–9, `modelYear` 1900–2100, `0` aceito como não informado); e
      `fleet_number` chegando ao `cInt` no contrato do payload de MDF-e, omitido quando vazio.
      Verificação: vermelho.
- [ ] **T009** — Request schema, mapper, repositório, view-model, rotas; `fleet_number` percorrendo
      `mdfe-issuance-payload.query.ts` → `mdfe-payload.types.ts` → `mdfe-payload.builder.ts`.
      Verificação: T008 verde; contrato de tenant-safety de query continua verde.

## Fase D — frontend: identidade e modelo

> 🤖 Modelo: `sonnet`

- [ ] **T010** — Contrato de formulário: o bloco de modelo entre identificação e operação,
      marca/modelo/ano preenchidos pela consulta por placa, trocar a marca limpando o modelo, e
      degradação para texto livre quando `vehicleCatalog` é `false` ou o papel é `trailer`.
      Verificação: vermelho.
- [ ] **T011** — `fleet.constant.ts` (`VEHICLE_LOOKUP_FORM_KEYS`, `VEHICLE_BODY_KEYS`,
      `VEHICLE_FORM_KEYS`, `FLEET_CAPABILITY_KEYS`), `fleetCatalogClient.service.ts`,
      `useVehicleCatalog.hook.ts` e `VehicleModelFields.component.tsx`. A quebra do formulário em três
      blocos **já saiu na T000** — aqui entra o quarto.
      Verificação: T010 verde.
- [ ] **T012** — Aviso de campo exigido pelo MDF-e no formulário e marca de incompleto na listagem;
      colunas novas em `VehicleList`, ano e eixos ocultos por padrão.
      Verificação: contrato de tabela e de acentuação de locale verdes.

## Fase E — banco: custo e consumo

> 🤖 Modelo: `sonnet`

- [ ] **T013** — Contrato: `test/fleet-schema/vehicles.contract.ts` exige as seis colunas de
      custo (`average_consumption`, `cost_per_kilometer`, `acquisition_amount`,
      `monthly_installment_amount`, `annual_vehicle_tax_amount`, `annual_insurance_amount`) e
      `costs_updated_at`, todas `numeric`/`timestamptz` — **nenhuma** `double precision` — com check
      de não-negatividade; diretório da migration na lista literal.
      Verificação: vermelho.
- [ ] **T014** — Colunas e checks em `fleet.schema.ts`;
      `db:generate --name fleet_vehicle_cost_fields`; `rollback.sql` à mão.
      Verificação: `make migration-test` e `db:check` sem drift; T013 verde.

## Fase F — API: custo, consumo e o custo fixo derivado

> 🤖 Modelo: `sonnet`

- [ ] **T015** — Contrato `test/fleet-domain/vehicle-cost.contract.ts` — diretório novo na convenção
      já usada por `billing-domain/`, `mdfe-domain/` e afins, com entrypoint próprio
      `test/fleet-domain.contract.test.ts` acrescentado à lista literal do `package.json`:
      `deriveMonthlyFixedCost` = `parcela + (IPVA + seguro) / 12` em
      escala de dinheiro com `half_up`, sem float em ponto nenhum; `0` em todo campo devolvendo
      "sem informação"; e `test/fleet-http/vehicle-cost.contract.ts` fixando os seis campos no
      `PUT`, valor negativo recusado com `400` e **todos** os erros de uma vez, `costs_updated_at`
      mudando só quando algum custo muda, e nenhuma coluna de total no view-model.
      Verificação: vermelho.
- [ ] **T016** — `vehicle-cost.policy.ts`, request schema, mapper, repositório, use case e
      view-model (`monthlyFixedCost`, `costsUpdatedAt`).
      Verificação: T015 verde; tenant-safety de query continua verde.

## Fase G — frontend: bloco de custo e consumo

> 🤖 Modelo: `sonnet`

- [ ] **T017** — Contrato: `VehicleCostFields` como quinto bloco do formulário, os seis campos na
      métrica cheia, resumo em leitura com custo fixo mensal e custo por km, `0` renderizado como
      "não informado", colunas de custo ocultas por padrão em `VehicleList`, chaves nos dois locales.
      Verificação: vermelho.
- [ ] **T018** — `VehicleCostFields.component.tsx`, formatação de moeda pelo helper existente de
      `shared/`, colunas e locales.
      Verificação: T017 verde; contrato de acentuação verde.

## Fase H — banco: documentos do veículo

> 🤖 Modelo: `sonnet` (T019 é 🧠 — FK composta com tenant, índice parcial e vocabulário fechado)

- [ ] **T019** 🧠 — Contrato: `test/fleet-schema/vehicle-documents.contract.ts` exige
      `fleet_vehicle_documents` com FK composta para `fleet_vehicles (company_id, id)`, check de
      `type` no vocabulário fechado (sem ENUM nativo), índice parcial de unicidade do ativo
      (`where archived_at is null`), índice `(company_id, expires_at)` e `purpose: 'fleet_document'`
      no vocabulário de `stored_objects`; mais o contrato negativo de tenant em
      `test/fleet-schema/tenant-safety.contract.ts`.
      Verificação: vermelho. Suíte nova importada pelo entrypoint `fleet-schema.contract.test.ts`,
      que já está na lista literal — só o `import` a acrescentar.
- [ ] **T020** — Tabela, checks e índices em `fleet.schema.ts`;
      `db:generate --name fleet_vehicle_documents`; `rollback.sql` à mão com o `drop table`.
      Verificação: `make migration-test` e `db:check` sem drift; T019 verde.

## Fase I — API: documentos, arquivo e feed de avisos

> 🤖 Modelo: `sonnet` (T022 é 🧠 — fronteira de armazenamento, multipart e isolamento por tenant)

- [ ] **T021** — Contrato `test/fleet-domain/vehicle-document.contract.ts`: faixa por dias restantes
      (`expired`, `critical` ≤ 7, `warning` ≤ 30, `ok`), fronteiras exatas, e
      `detectVehicleDocumentMimeType` reconhecendo PDF/PNG/JPEG pela assinatura e recusando arquivo
      cujo `content-type` declarado não corresponde.
      Verificação: vermelho.
- [ ] **T022** 🧠 — `vehicle-document.policy.ts`, `fleet-document-storage.gateway.ts`
      (chave com `companyId` no prefixo, `create-only`, `sha256`, download assinado de vida curta),
      `vehicle-documents.use-case.ts` (arquivar e criar na mesma transação) e o registro em
      `stored_objects`.
      Verificação: T021 verde.
- [ ] **T023** — Contrato `test/fleet-http/vehicle-documents.contract.ts`: as quatro rotas com a
      permissão certa (`fleet.read` para ler e baixar, `fleet.manage` para gravar e arquivar),
      `PUT` sem arquivo criando só metadado, arquivo acima de 1 MiB recusado com o teto na mensagem,
      assinatura inválida recusada, renovação arquivando o anterior, `GET .../file` respondendo `302`
      para URL assinada, `GET /fleet/document-alerts` com `withinDays` 1..90 e ordenação por
      vencimento, e empresa A sem acesso a nada da empresa B.
      Verificação: vermelho.
- [ ] **T024** — `fleet-documents.routes.ts` + `.schema.ts` (multipart no molde de
      `company-logo.schema.ts`), fiação em `main.ts`, nenhum log com nome de arquivo, conteúdo ou URL
      assinada.
      Verificação: T023 verde; `bun run --cwd apps/api-transportada test` verde.

## Fase J — frontend: documentos e selo de vencimento

> 🤖 Modelo: `sonnet`

- [ ] **T025** — Contrato: `VehicleDocumentsPanel` como sexto bloco, presente só em veículo salvo e
      com explicação no cadastro novo; linha por tipo com vencimento, selo de faixa e ação de baixar;
      esqueleto no carregamento e estado vazio com convite; coluna **Documentos** em `VehicleList`
      com a faixa mais grave; chaves nos dois locales.
      Verificação: vermelho.
- [ ] **T026** — `fleetDocumentsClient.service.ts`, `useVehicleDocuments.hook.ts`,
      `VehicleDocumentsPanel.component.tsx`, selo na listagem e locales.
      Verificação: T025 verde; contratos de esqueleto, tabela e acentuação verdes.

## Fase K — fechamento

> 🤖 Modelo: `sonnet`

- [ ] **T027** — `make check` verde, `CLAUDE.md` atualizado (colunas novas, `fleet_vehicle_documents`,
      rotas de catálogo, documento e avisos, `purpose: 'fleet_document'`), evidência completa, PR.
      Verificação: saída do `make check` colada em `evidence.md`.

## Depois desta spec

- **036 — tela inicial de avisos**: consome `GET /fleet/document-alerts` e agrega outras origens.
  Não começa antes da Fase I entregar o endpoint.
- **Frete por quilômetro / por eixo**: exige tipo novo de regra no motor de cálculo e a decisão em
  aberto sobre eixos do conjunto (spec, "Decisões em aberto").
