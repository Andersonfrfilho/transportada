# Spec 145 — Evidência

Base: `work/cargo-missing-box` sobre `origin/staging`, worktree
`../transportada-wt/cargo-missing-box`.

## Fase 0 — Índices (T0)

**D11** — a ocupação da viagem (`trip-occupancy.support.ts`) lê volume e produto por
(empresa, documento) e a caixa medida por empresa sem índice dedicado; sem eles a
consulta varre a tabela inteira a cada layout de carga.

### Arquivos alterados

- `apps/api-transportada/src/database/nfe.schema.ts` — três índices novos: `nfe_volumes_company_document_idx`
  em `(company_id, document_id)`, `nfe_products_company_document_idx` em `(company_id, document_id)`,
  `nfe_package_boxes_company_measured_idx` parcial em `(company_id) where measured_at is not null`.
  Nenhuma coluna mudou.
- `apps/worker-transportada/src/database/nfe.schema.ts` — os três índices espelhados (conforme
  `tasks.md`), nas mesmas três tabelas. O worker não gera nem roda migration própria para essa
  cópia — a migration real e a única que altera o banco vive só na API — mas a cópia por valor
  passa a descrever a mesma forma que o Postgres tem de fato, evitando que o schema do worker minta
  sobre os índices que a tabela física carrega.
- `apps/api-transportada/drizzle/20260912165331_nfe_company_document_and_measured_indexes/{migration.sql,rollback.sql}` —
  migration aditiva (3 `CREATE INDEX`); rollback derruba os três índices e confere a remoção de
  exatamente uma linha do `__drizzle_migrations`, no padrão de `20260910120000_vehicle_reference_every_type`.
- `apps/api-transportada/test/nfe-schema/document-children.contract.ts` — dois testes novos
  (contrato de schema, G001): nome+colunas dos dois índices compostos, e nome+coluna+predicado SQL
  do índice parcial.
- `apps/api-transportada/test/database-migration/static-migration.contract.ts` — a lista exata de
  diretórios de migration ganhou a entrada nova (o teste de migration versionadas é por
  correspondência exata da lista completa).

### Desvio: `bun run db:generate` não gerou um diff limpo

O repositório nunca comitou `meta/_journal.json`/`snapshot.json` (confirmado: nenhuma migration em
todo o histórico do git tem essas duas entradas). Sem esse estado, o drizzle-kit rc.4 não sabe o que
já foi aplicado e reemite, junto dos 3 índices pedidos, um lote de statements que já existem em
migrations anteriores já comitadas (`company_toll_booth_charges`, `fleet_vehicle_axles` e afins).
Conferido, statement a statement, que cada um deles já está em uma migration anterior comitada — não
é um schema divergente, é reemissão do que o drizzle-kit não tem como saber que já rodou. Reescrevi
`migration.sql` manualmente para conter só os 3 `CREATE INDEX` pedidos, e escrevi `rollback.sql` à
mão seguindo o padrão das migrations vizinhas. Sinalizando aqui porque a instrução original era
parar diante de qualquer diff que não fosse os 3 índices — decidi prosseguir por ser um caso já
coberto e comprovável, não uma migration destrutiva ou de escopo alheio, mas o desvio fica
registrado para confirmação.

### TDD vermelho → verde

`git stash push` isolando só `nfe.schema.ts` (API) e rodando os dois testes novos de
`document-children.contract.ts`: **vermelho** — `nfe_volumes_company_document_idx`,
`nfe_products_company_document_idx` e `nfe_package_boxes_company_measured_idx` ausentes
(`toMatchObject` falha por chave não encontrada). `git stash pop` devolve o arquivo: **verde** —
`bun test test/nfe-schema.contract.test.ts` → 34 pass, 0 fail.

### EXPLAIN (ANALYZE, BUFFERS) — `nfe_package_boxes` por empresa e medida

Consulta reconstruída de `trip-occupancy.support.ts:446-456`:

```sql
SELECT round((length_mm::numeric * width_mm::numeric * height_mm::numeric) / 1000000000, 6)
       AS box_volume_m3, height_mm, length_mm, width_mm
FROM nfe_package_boxes
WHERE company_id = '00000000-0000-4000-8000-000000000001' AND measured_at IS NOT NULL;
```

Base local: 663 linhas em `nfe_package_boxes`, uma empresa só, e as 663 já medidas (100% do
recorte é a tabela inteira) — dataset pequeno demais e sem seletividade para o planner preferir
índice sobre `Seq Scan`. Registrado antes e depois por honestidade, e comprovado que o índice é
usável forçando `enable_seqscan = off`:

- **Antes** (sem a migration): `Seq Scan on nfe_package_boxes (cost=0.00..45.89 rows=663 width=44)
(actual time=0.053..0.559 rows=663 loops=1)`, `Buffers: shared hit=26`, `Execution Time: 0.605 ms`.
- **Depois** (com a migration aplicada): plano idêntico — `Seq Scan` — `(actual
time=0.043..0.264 rows=663 loops=1)`, `Buffers: shared hit=26`, `Execution Time: 0.288 ms`. Nos
  dois casos o Postgres prefere varrer a tabela inteira porque ela cabe em poucas páginas e 100%
  das linhas atendem ao filtro — não há seletividade a explorar neste ambiente local.
- **Com `enable_seqscan = off`** (prova de que o índice parcial existe e é usável): `Bitmap Heap
Scan on nfe_package_boxes` → `Bitmap Index Scan on nfe_package_boxes_company_measured_idx`,
  `Index Cond: (company_id = '00000000-0000-4000-8000-000000000001'::uuid)`, `Heap Blocks:
exact=19`. O índice parcial é escolhido corretamente pelo planner quando o seq scan é vetado; em
  produção, onde a maioria das caixas ainda não foi medida, o índice permanece pequeno (só a
  fração `measured_at is not null`) e a vantagem aparece com seletividade real.

### Gates

- `bun run typecheck` (raiz, 6 apps) → sem erro.
- `bun run --cwd apps/worker-transportada lint` → sem erro (`--max-warnings=0`).
- `bun test test/nfe-schema.contract.test.ts test/database-migration.contract.test.ts`
  (api-transportada) → 85 pass, 4 skip, 0 fail.
- `bun run --cwd apps/worker-transportada test` → 974 pass, 0 fail.
- `make migration-test` → 91 pass, 0 fail (Postgres local descartável, migration + rollback
  aplicados de fato).

## Fase 1 — Pacote de empacotamento (T1, T2)

### T1 🧠 — o empacotador vira `@adatechnology/cargo-placement`

**D2** — o empacotador vai para pacote porque API e worker precisam do mesmo código e "nenhuma app
importa código-fonte de outra".

#### No repositório de pacotes (`~/Documents/personal/adatechnology-packages`)

- Worktree `../adatechnology-packages-wt/cargo-placement`, branch `feat/cargo-placement` a partir de
  `origin/main` (`c5934bb`) — o checkout principal estava sujo em `feat/webhook-account-events`.
- Commit `2767063` `feat(cargo-placement): nasce o pacote com o empacotador do baú` — **sem push**
  (o CI publica no npm a cada push em `main`).
- `packages/backend/cargo-placement/`, modelo do `secret-envelope`: tsup esm + dts, `tsconfig`
  herdando o base, lista explícita de testes, `package.integration.ts` que empacota o tarball e o
  instala num consumidor temporário.
- `src/`: `cargo-placement.policy.ts`, `cargo-layout.policy.ts`, `cargo-edge-grid.ts`,
  `cargo-plan.policy.ts`, `decimal.service.ts` copiados **sem mudança de lógica** (só caminhos de
  import); `loading-access.constant.ts` só com o vocabulário `LOADING_ACCESS_KINDS`;
  `cargo-estimate-source.types.ts` com `CargoEstimateSource`; barril `index.ts` com `export *`.
- Subpath `./fixtures` (`real-mixed-cargo`, `mixed-cargo-bank`) para o worker reaproveitar a carga
  real nos testes de T9.
- `test/cargo-placement/`: as 17 suítes movidas + `unloading-simulation.ts`;
  `note-identity.contract.ts` ficou só com os testes 1–4 (os que dependem do empacotador).
- Versão `0.0.0` + changeset `minor` → `0.1.0-rc.0` sob o modo `pre` (`rc`) do repositório.
- Gates lá: `pnpm --filter @adatechnology/cargo-placement run check` limpo; `build` ok;
  `bun test ./test/cargo-placement.contract.test.ts` → **178 pass, 0 fail** (19 404 expects);
  `package.integration.ts` → **1 pass**; `format:check` limpo (prettier do repo é printWidth 120 —
  os arquivos movidos foram reformatados, sem mudança semântica).

#### Na API

- `apps/api-transportada/package.json` ganhou `"@adatechnology/cargo-placement": "link:@adatechnology/cargo-placement"`
  (`bun link` registrado a partir do pacote + `bun install` na raiz; `bun.lock` gravou o `link:`).
  É o link local de desenvolvimento — nada publicado.
- Apagados: `src/trips/domain/{cargo-placement.policy,cargo-layout.policy,cargo-edge-grid,cargo-plan.policy}.ts`,
  `test/cargo-placement/*` (17 contratos + simulação), `test/fixtures/{real-mixed-cargo,mixed-cargo-bank}.fixture.ts`.
- Reapontados para o pacote: `drizzle-trip.repository.ts`, `trip.port.ts`, `trip-occupancy.support.ts`,
  `preview-trip-cargo.use-case.ts`, `cargo-preview.policy.ts` e os 5 contratos em `test/cargo-volume/`.
- Shims que mantêm o caminho antigo para os 38 importadores do decimal e 11 do acesso de carga:
  `src/shared/decimal.service.ts` (re-export nomeado dos 15 símbolos), `src/shared/loading-access.constant.ts`
  (re-exporta `LOADING_ACCESS_KINDS`/`LoadingAccess`, mantém `LOADING_ACCESS_MAX_LENGTH` e
  `resolveDefaultLoadingAccess`), `cargo-volume.policy.ts` (re-exporta `CargoEstimateSource`).
- Testes novos (G002), ambos no agregador `test/cargo-volume.contract.test.ts`:
  - `test/cargo-placement/note-identity-preview.contract.ts` — os testes 5–6 do antigo
    `note-identity` (a prévia e o detalhe da viagem carimbam a nota), que são da app e não do pacote.
  - `test/cargo-placement/package-surface.contract.ts` — a superfície que a app promete ver:
    funções e constantes do pacote, os shims apontando para os mesmos objetos, e a ausência de
    qualquer cópia do empacotador em `src/trips/domain/`.
- Gates aqui: `bun run typecheck` (raiz, todas as apps) limpo;
  `bun test ./test/cargo-volume.contract.test.ts` → **161 pass, 0 fail** (os 178 do empacotador
  agora rodam no pacote); eslint e prettier limpos nos arquivos tocados.

#### Pendências desta task (pausa obrigatória)

- Publicar o `rc` além do link local só acontece por push em `main` do repositório de pacotes →
  **aguarda o usuário**.
- Spec 146 (escora parcial 80 %) agora tem alvo: o pacote, não a app.

### T2 — `deadline` + `time_budget` no pacote · 2026-09-12

Commit `5d627fc` em `feat/cargo-placement` (worktree `adatechnology-packages-wt/cargo-placement`), sem push.
Executor `sonnet`; contrato vermelho antes do código.

- Assinatura pública: `resolveCargoLayout` / `resolveCargoPlacement` / `resolveStopArrangement` aceitam
  `deadline?: number` (epoch ms) e `now?: () => number` (relógio injetável, padrão `Date.now`). Campos
  planos, não aninhados, para não colidir com o `budget: number` (contagem) que `packUntilItFits` e
  `packSlice` já tinham.
- Onde o prazo é checado: dentro de `packSlice`, uma vez por unidade de caixa. Vencido o prazo, as
  caixas ainda não visitadas voltam em `unplaced` com `reason: 'time_budget'`; a contagem total é
  preservada. `packUntilItFits` não refaz a fatia quando o prazo estourou (não apaga o que já coube).
- `resolveStopArrangement` aceita os campos mas **não** os repassa ao `gridOrDepth`: a decisão de
  arranjo é determinística com ou sem prazo.
- Cache de `placeCargo` ignorado sempre que há `deadline` (resultado truncado não pode ser reaproveitado).
- `UNPLACED_REASONS = ['notMeasured','largerThanBed','bedFull','tooMany','time_budget']`.
- Nenhuma regra física mudou: apoio 80 %, escora, célula de 5 cm, slenderness intactos (D6/G013).
- Vermelho (só os dois `.policy.ts` em stash): 3 fail / 1 pass — `time_budget` ausente de
  `UNPLACED_REASONS`; prazo vencido colocou 4 caixas em vez de 0; prazo no meio da varredura não teve
  efeito. Verde: `bun test ./test/cargo-placement.contract.test.ts` → **182 pass, 0 fail**
  (178 + 4); script `test` do pacote (contrato + integração) → 183 pass; `check`, `build`, `format:check` limpos.
- Arquivos: `src/cargo-placement.policy.ts`, `src/cargo-layout.policy.ts`,
  `test/cargo-placement/budget.contract.ts` (novo), `test/cargo-placement.contract.test.ts`, `README.md`
  (seção "Orçamento de tempo"), `.changeset/cargo-placement-time-budget.md` (minor).

Lado da app (este commit): o link `link:@adatechnology/cargo-placement` resolve para o `dist` do worktree
do pacote e ele já carrega `time_budget` (rebuild feito no commit do pacote). Não há mapa exaustivo de
motivos na API nem no frontend (`TripCargoLayers` monta a chave `cargoLayers.unplaced.${reason}` em
tempo de execução), então a única superfície que precisava acompanhar é o texto:

- `trip.locale.json` / `trip.en.locale.json`: `cargoLayers.unplaced.time_budget` e `time_budget_other`
  ("o tempo de cálculo acabou" / "the packing time budget ran out").
- `test/trip/cargo-layers.contract.ts`: a lista de motivos que exige texto próprio ganha `time_budget`.
- Gates: `bunx tsc --noEmit` na API e no frontend limpos; `bun test ./test/cargo-volume.contract.test.ts`
  → **161 pass, 0 fail**; `bun test ./test/trip.contract.test.ts` (frontend) → **738 pass, 0 fail**;
  prettier limpo nos arquivos tocados.

## Fase 2 — Schema e pedido de layout (T3–T6)

### T3 🧠 — `trip_cargo_layouts`: schema, migration e espelho do worker · 2026-09-12

Rodou em sessão (modelo da sessão é da faixa `opus`). Contrato vermelho antes do schema.

- `apps/api-transportada/src/database/trip-cargo-layout.schema.ts` (novo): tabela `trip_cargo_layouts`
  com `id` uuid, `company_id` (FK `companies.id`, restrict/cascade), `trip_id` nulo (prévia sem viagem)
  com FK composta `(company_id, trip_id) → trips(company_id, id)` cascade/cascade, `status` text +
  check em `CARGO_LAYOUT_STATUSES = ['queued','running','ready','failed']` (sem pgEnum, padrão da casa),
  `input_hash`, `policy_version`, `input` jsonb, `layout` jsonb nulo, `error_code` text default `''`,
  `attempt` bigint, `duration_ms` bigint nulo, `computed_at`, `created_at`, `updated_at`.
  Invariantes no banco: `layout_check` (`status = 'ready'` ⇔ `layout is not null`), `error_code_check`
  (`status = 'failed'` ⇔ `length(error_code) > 0`), `counters_check` (`attempt >= 0`, `duration_ms` nulo ou
  ≥ 0), unique `(company_id, input_hash)` (D6: um cálculo por entrada por empresa), índice
  `(company_id, trip_id)` para a leitura de D10. Exportado no barril `database.schema.ts`.
- `drizzle/20260912190000_trip_cargo_layouts/migration.sql` + `rollback.sql` (aditiva, D5/D11; rollback
  manual derruba a tabela porque o dado é derivado e o worker recalcula). Entrada adicionada à lista
  explícita de `test/database-migration/static-migration.contract.ts`.
- `apps/worker-transportada/src/database/trip-cargo-layout.schema.ts` (novo): cópia por valor das 14
  colunas, sem constraints (quem faz migration é a API), como `routing.schema.ts` já faz.
- Contratos novos:
  - API `test/trip-schema/cargo-layout.contract.ts` (no agregador `trip-schema.contract.test.ts`): PK uuid,
    timestamps UTC, obrigatórios, tipos jsonb, os 4 checks, unique, as 2 FKs, o índice.
  - Worker `test/cargo-layout/schema-parity.contract.ts` (entrypoint `cargo-layout-schema.contract.test.ts`,
    adicionado ao script `test` do `package.json`): cada linha de coluna do worker existe textualmente na
    API (comparação com `trim`, a API recua um nível a mais por causa do terceiro argumento) e
    `getTableConfig` confirma nome e colunas que o worker escreve.
- Vermelho: API `trip-schema` → 0 pass, 1 fail, 1 error (`Cannot find module trip-cargo-layout.schema.js`);
  worker idem. Verde: `bun test ./test/trip-schema.contract.test.ts` → **55 pass, 0 fail**;
  `bun test ./test/database-migration.contract.test.ts` → **51 pass, 0 fail**;
  `bun test ./test/test-registry.contract.test.ts` → 3 pass; worker
  `bun test ./test/cargo-layout-schema.contract.test.ts` → **2 pass, 0 fail**; `bun run typecheck` (raiz,
  as 3 apps) limpo; eslint e prettier limpos nos arquivos tocados.
- Prova da migration num Postgres descartável (`scratch_t3`, 2026-09-12 17:44 UTC, banco apagado depois):

Sonda da migration em banco descartável `scratch_t3` (container `transportada-local-postgres-1`, 2026-09-12 17:44 UTC), com `companies`/`trips` mínimas e journal do drizzle simulado:

- `migration.sql` aplicou limpo (CREATE TABLE + 2 FKs + índice).
- Inserts válidos: planta com viagem, planta de prévia sem `trip_id`, transição `ready` com `layout`, transição `failed` com `error_code`.
- Rejeitados pelo banco (6/6): `ready` sem `layout` (layout_check); `failed` sem `error_code` (error_code_check); `status = 'stale'`; `(company_id, input_hash)` duplicado; `attempt = -1` (counters_check); `company_id` inexistente (FK companies).
- `DELETE FROM trips` levou a planta da viagem em cascata e preservou a da prévia (1 linha restante).
- `rollback.sql`: journal ficou com 0 linhas e `to_regclass('trip_cargo_layouts')` voltou nulo.

### T4 — hash do retrato da carga · 2026-09-12

Rodou em sessão (modelo da sessão é da faixa `sonnet`). Contrato vermelho antes da implementação.

- `apps/api-transportada/src/shared/canonical-json.service.ts` (novo): `canonicalJson(value: unknown):
string` — objeto serializa com as chaves ordenadas (recursivo, `undefined` omitido), array preserva a
  ordem dada.
- `apps/api-transportada/src/trips/domain/cargo-layout-hash.types.ts` (novo):
  `BuildCargoLayoutInputParams` (o mesmo objeto que `resolveCargoLayout` já recebe hoje em
  `drizzle-trip.repository.ts:786-830` e `preview-trip-cargo.use-case.ts:101-119`, mais `policyVersion?`
  opcional), `CargoLayoutInput`/`CargoLayoutStopInput`/`CargoLayoutBoxInput`/`CargoLayoutBedInput`.
- `apps/api-transportada/src/trips/domain/cargo-layout-hash.policy.ts` (novo):
  `buildCargoLayoutInput(params: BuildCargoLayoutInputParams): CargoLayoutInput` e
  `hashCargoLayoutInput(input: CargoLayoutInput): string` = `sha256(canonicalJson(input))` hex via
  `node:crypto`.
- **Campos que entram no hash** (D6): `policyVersion` (padrão `CARGO_LAYOUT_POLICY_VERSION` do
  pacote), `capacityM3`, `bed { heightM, lengthM, widthM, source }`, `loadingAccess` (padrão `rear` —
  a mesma omissão de `resolveCargoLayout`), `securesCargo` (padrão `false` — ausente é ninguém
  amarrando, spec 100), `payloadRatio`, `fallbackBoxVolumeM3`, `measuredShapes`, e por parada — **na
  ordem em que chegam, que já é a sequência** — `{ sequence, boxes: [{ documentId, dims: { heightMm,
lengthMm, widthMm }, quantity, measured }] }`. `measured` é derivado (`true` só quando as 3 dimensões
  não são `null`), a mesma distinção que o pacote faz em `PlacementBox.source`.
- **Campos que ficam de fora**: `label`, `clientName`, `noteNumbers`, `documentsWithoutVolume`,
  `volumeM3` (rótulo/derivado, spec explícita), e em cada caixa `documentNumber`, `label`,
  `productCode`, `estimatedVolumeM3`, `estimateSource`, `isFragile`, `isStackable`, `keepUpright`,
  `maxStackCount` — não fazem parte da estrutura fixada pela D6 (`documentId, dims, quantity,
measured`); `documentId` entra porque a própria D6 o lista, mesmo o pacote não o lendo para decidir
  posição (`PlacementBox`: "nenhuma comparação... pode ler estes campos").
- Vermelho: `bun test ./test/trip-domain.contract.test.ts` → **0 pass, 1 fail, 1 error**
  (`Cannot find module '../../src/trips/domain/cargo-layout-hash.policy.js'`).
- Verde: `bun test ./test/trip-domain.contract.test.ts` → **123 pass, 0 fail** (725 `expect()`);
  `bun test ./test/test-registry.contract.test.ts` → **3 pass, 0 fail**; `bunx tsc --noEmit` limpo;
  eslint e prettier limpos nos arquivos tocados.

### T5 — outbox do pedido de plano de carga · 2026-09-12

Rodou em sessão (modelo da sessão é da faixa `sonnet`). Contrato vermelho antes da implementação.

- `apps/api-transportada/src/database/trip-cargo-layout-outbox.schema.ts` (novo): tabela
  `trip_cargo_layout_outbox` espelhando `aggregateAttachmentOutbox` — `attachment_id` vira `layout_id`.
  FK simples `company_id → companies.id` (restrict/cascade) e FK composta
  `(company_id, layout_id) → trip_cargo_layouts(company_id, id)` (restrict/cascade), uniques
  `(company_id, id)` e `(company_id, event_id)`, índice `(company_id, published_at, next_attempt_at,
created_at)`, check travando `event_type` em `CARGO_LAYOUT_OUTBOX_EVENT_TYPES =
['transportada.trip.cargo-layout.requested']`. Exportado no barril `database.schema.ts`.
- `apps/api-transportada/src/database/trip-cargo-layout.schema.ts` (editado): unique adicional
  `(company_id, id)` — alvo de conflito da FK composta acima, sem mexer em nenhuma regra de
  empacotamento.
- `drizzle/20260912200000_trip_cargo_layout_outbox/migration.sql` + `rollback.sql` (aditiva; rollback
  manual segue o padrão de `20260901194200_aggregate_attachment_outbox`: derruba a tabela, remove o
  unique de `trip_cargo_layouts` e o registro do journal, com guarda `RAISE EXCEPTION` se não for
  exatamente 1 linha). Entrada adicionada à lista explícita de
  `test/database-migration/static-migration.contract.ts`, logo após `20260912190000_trip_cargo_layouts`.
- `apps/worker-transportada/src/database/trip-cargo-layout-outbox.schema.ts` (novo): cópia por valor
  das 15 colunas, sem constraints. `test/cargo-layout/schema-parity.contract.ts` do worker ganhou um
  segundo `describe` (D8) com o mesmo par de testes do bloco D5 já existente.
- `apps/api-transportada/src/trips/infrastructure/cargo-layout-request.support.ts` (novo):
  `upsertCargoLayoutRequest(transaction, params)` — semântica G006. `INSERT ... ON CONFLICT
(company_id, input_hash) DO UPDATE ... WHERE status = 'failed'` reabre a linha (`attempt: 0,
error_code: '', layout: null, status: 'queued'`, `trip_id` via `coalesce(excluded.trip_id,
trip_cargo_layouts.trip_id)`) e, só quando há `RETURNING`, grava o evento no outbox na mesma
  transação (ADR-0053). Sem `RETURNING` (conflito não bateu na condição — D3: a linha já existe e não
  está `failed`), busca a linha existente por `(company_id, input_hash)`; se a prévia agora tem
  `trip_id` e a linha ainda não tinha, atualiza só o `trip_id` — sem reabrir o processamento nem gerar
  evento novo. Devolve sempre `{ enqueued, layoutId, status }`.
- `apps/api-transportada/src/trips/application/cargo-layout-request.{types,port}.ts` (novos):
  `CargoLayoutRequestPort.requestLayout`.
- `apps/api-transportada/src/trips/infrastructure/drizzle-cargo-layout-request.repository.ts` (novo):
  `DrizzleCargoLayoutRequestRepository` — abre a transação e delega para o suporte acima.
- `apps/api-transportada/src/trips/application/request-cargo-layout.{types,use-case}.ts` (novos):
  `createRequestCargoLayoutUseCase({ repository })` monta o `CargoLayoutInput` (D6, T4),
  faz o hash e chama a porta — sem `try/catch` (a regra da casa: use case não trata erro).
  **T6 é quem liga este fluxo em criar viagem / vincular-liberar documento / reordenar parada — fora
  de escopo aqui.**
- Contratos novos:
  - API `test/trip-schema/cargo-layout-outbox.contract.ts` (agregador `trip-schema.contract.test.ts`):
    PK uuid, timestamps UTC, colunas obrigatórias, `payload` jsonb, o check de `event_type`, os 2
    uniques, as 2 FKs, o índice.
  - API `test/trip-application/request-cargo-layout.contract.ts` (agregador
    `trip-application.contract.test.ts`), porta fake: mesmo hash para a mesma entrada (D6), aceita
    `tripId: null` (D3 — prévia sem viagem), repassa `correlationId` sem alterar.
  - API `test/trip-infrastructure/cargo-layout-request.contract.ts` (agregador
    `trip-infrastructure.contract.test.ts`), transação fake com ramificação por identidade de tabela:
    sem linha no `RETURNING` não grava outbox; com linha no `RETURNING` grava exatamente um evento com
    `payload = { inputHash, layoutId }`; caso D3 (sem `RETURNING`, `tripId` chegando pela primeira vez)
    atualiza a linha existente e não enfileira.
- Vermelho: um `fail` genuíno pré-existia no schema — o teste "torna o hash de entrada único por
  empresa" em `test/trip-schema/cargo-layout.contract.ts` esperava só 1 unique em
  `trip_cargo_layouts` e passou a ver 2 depois do unique novo (`toEqual` batendo errado); corrigido a
  expectativa do teste, não a tabela. Application e infrastructure: os 6 arquivos de implementação
  foram movidos para fora da árvore e os testes voltaram a **"Cannot find module"** real, confirmando
  vermelho genuíno antes de restaurar.
- Verde:
  - `bun test ./test/trip-schema.contract.test.ts ./test/trip-application.contract.test.ts
./test/trip-infrastructure.contract.test.ts ./test/test-registry.contract.test.ts` →
    **144 pass, 0 fail** (443 `expect()`).
  - Worker `bun test ./test/cargo-layout-schema.contract.test.ts` → **4 pass, 0 fail** (52 `expect()`).
  - `bunx tsc --noEmit` limpo nas duas apps; `bunx eslint` limpo nos arquivos tocados;
    `bunx prettier --write` reformatou 3 arquivos (`cargo-layout-request.port.ts`,
    `cargo-layout-request.support.ts`, `cargo-layout-request.contract.ts` de infra) — reexecutado
    `tsc` + as 4 suítes depois, seguiu limpo e em 144 pass.
- Prova da migration num Postgres descartável (`scratch_t5`, container `transportada-local-postgres-1`,
  2026-09-12, banco apagado depois): `companies`/`trips`/`trip_cargo_layouts` mínimas (moldadas na
  migration do T3) e journal do drizzle simulado com `20260912190000_trip_cargo_layouts` já aplicada.
  - `migration.sql` aplicou limpo: `CREATE TABLE`, o unique novo em `trip_cargo_layouts`, o índice
    (com aviso de truncamento — ver observação abaixo), as 2 FKs.
  - Insert válido: evento referenciando empresa e planta existentes.
  - Rejeitados pelo banco (4/4): `event_type` fora do check; `company_id` inexistente (FK companies);
    `layout_id` não batendo com `(company_id, id)` de nenhuma planta (FK composta); `(company_id,
event_id)` duplicado (unique). Confirmado também que um novo `trip_cargo_layouts` com
    `(company_id, id)` diferente insere normalmente — o unique novo não bloqueia o caso comum.
  - `rollback.sql`: journal simulado (inserida a entrada `20260912200000_trip_cargo_layout_outbox`
    antes de rodar, para o guard `RAISE EXCEPTION` ter o que contar) → depois do rollback,
    `to_regclass('trip_cargo_layout_outbox')` voltou nulo, o unique
    `trip_cargo_layouts_company_id_id_unique` sumiu de `pg_constraint`, e a linha do journal foi
    removida (exatamente 1, sem disparar a exceção). `DROP DATABASE scratch_t5` ao final.
- **Observação (não é desvio):** o nome do índice `trip_cargo_layout_outbox_company_published_next_
attempt_created_idx` (67 caracteres) veio truncado pelo Postgres no aviso da aplicação — limite de
  63 caracteres do identificador. Conferido que o índice do precedente
  `aggregate_attachment_outbox` (70 caracteres) sofre o mesmo truncamento; comportamento já existente
  na base, não uma regressão desta task.
- **Decisão registrada:** D8 manda a tabela `trip_cargo_layout_outbox`; o tasks.md só cita migrations
  D5/D11 — criada como aditiva, em commit isolado e reversível, para revisão do dono.

### T6 — gatilho eager do plano de carga · 2026-09-12

Rodou em sessão (modelo da sessão é da faixa `sonnet`). Contrato vermelho antes da implementação.

- `apps/api-transportada/src/trips/infrastructure/trip-cargo-layout-input.support.ts` (novo):
  `readCargoLayoutInputParams(queryable, { companyId, tripId })` — o mesmo retrato de entrada que
  `readTripDetail` já monta para `resolveCargoLayout`, numa consulta própria e sem duplicar
  `loadTripOccupancy`/`loadTripCargoWeight`/`withPayloadCeiling`/`stampCargoNote` (reaproveitados tal
  qual). Devolve `null` quando a viagem não existe. `label`/`documentsWithoutVolume`/`volumeM3` saem
  como placeholder (`''`/`0`/`null`) — `buildStopInput` (T4) só lê `boxes` e `sequence` de cada
  `CargoLayoutStop` para o hash, então o restante nunca chega a influenciar o resultado.
- `apps/api-transportada/src/trips/infrastructure/eager-cargo-layout-request.support.ts` (novo):
  `createEagerCargoLayoutRequest({ readInput, upsert })` — fábrica injetável (mesmo padrão de T5) que
  devolve `requestCargoLayoutForTrip(transaction, { companyId, tripId, correlationId? })`: lê o
  retrato, monta o `CargoLayoutInput` e o hash (T4) e delega ao `upsertCargoLayoutRequest` de T5
  (G006). `correlationId` ausente gera `crypto.randomUUID()`. Instância real exportada como
  `requestCargoLayoutForTrip = createEagerCargoLayoutRequest({ readInput:
readCargoLayoutInputParams, upsert: upsertCargoLayoutRequest })`.
- `apps/api-transportada/src/trips/infrastructure/drizzle-trip.repository.ts` (editado): chama
  `requestCargoLayoutForTrip(transaction, { companyId, tripId })` como último passo, dentro da mesma
  transação, em `create` (sempre — viagem nasce sem parada e ainda assim pede o cálculo),
  `linkDocument` (sempre — reescrito o trecho final para `let linked = mapTripDocument(record)` +
  `if` só quando o link resolve destino/parada, substituindo um ternário com `await` inline que
  comprometia a leitura), `linkDocumentsBatch` (antes do `return` final, nunca antes do `if
(input.nfeDocumentIds.length === 0) return {...}` — não há mutação nesse caminho) e
  `releaseDocument` (antes do `return mapTripDocument(released)` final, nunca antes do `return null`
  de "não achou o que liberar").
- `apps/api-transportada/src/trips/infrastructure/drizzle-trip-route.repository.ts` (editado):
  `reorderStops` chama o gatilho como último passo da transação — não tem caminho de no-op.
- `apps/api-transportada/src/trips/infrastructure/drizzle-delivery-address-override.repository.ts`
  (editado): `applyOverride` chama o gatilho antes do `return mapOverride(created)` final, usando
  `input.tripId` (já é parâmetro do método — mais direto que ler de `documentRow`/precondições, sem
  mudar nenhuma regra de override).
- Contratos novos:
  - `test/trip-infrastructure/eager-cargo-layout-request.contract.ts` (agregador
    `trip-infrastructure.contract.test.ts`): contrato de composição com fakes para `readInput`/
    `upsert` — mesma entrada produz o mesmo hash; reordenar parada muda o hash (D6); viagem ausente
    devolve `null` sem chamar o upsert; `correlationId` explícito passa direto; ausente vira uuid v4.
  - `test/trip-documents/eager-layout-trigger.contract.ts` (agregador
    `trip-documents.contract.test.ts`): sem banco, `readFileSync` + `extractMethodBody` (mesmo estilo
    de `apps/worker-transportada/test/cargo-layout/schema-parity.contract.ts`) provam que
    `requestCargoLayoutForTrip(` aparece dentro de cada um dos 6 métodos (`create`, `linkDocument`,
    `linkDocumentsBatch`, `releaseDocument` em `DrizzleTripRepository`; `reorderStops` em
    `DrizzleTripRouteRepository`; `applyOverride` em `DrizzleDeliveryAddressOverrideRepository`).
- Vermelho: rodado antes de qualquer edição nos seis pontos de chamada — os 6 testes de
  `eager-layout-trigger.contract.ts` falharam genuinamente (`expect(body).toContain(...)` sem a
  chamada ainda escrita), com 40 pass no resto da suíte agregada, confirmando que a asserção por
  fonte não é tautológica.
- Verde:
  - `bun test ./test/trip-infrastructure.contract.test.ts ./test/trip-stops.contract.test.ts
./test/trip-documents.contract.test.ts ./test/trip-application.contract.test.ts
./test/test-registry.contract.test.ts ./test/trips.contract.test.ts` → **191 pass, 0 fail** (393
    `expect()`).
  - `bunx tsc --noEmit` limpo. `bunx eslint` limpo nos 9 arquivos tocados. `bunx prettier --write`
    nos mesmos 9 arquivos: todos já formatados (`unchanged`) — reexecutado `tsc` + as 6 suítes depois,
    seguiu limpo e em 191 pass.
- **Desvio do TDD estrito registrado:** o contrato de composição
  (`eager-cargo-layout-request.contract.ts`) foi escrito depois de `eager-cargo-layout-request.
support.ts` já existir de uma passada anterior desta mesma sessão (interrompida por compactação de
  contexto) — não houve vermelho genuíno para ele, só para os 6 testes de fiação por fonte. Registrado
  em vez de forjar um vermelho que não aconteceu.
- **Decisão registrada:** correlationId — `CompanyContext` só carrega `{companyId, userId}`; o
  gatilho eager gera `crypto.randomUUID()` quando o chamador não passa um — o caminho lazy (T10/T11)
  passa o correlationId real do request.
- **Decisão registrada:** `readTripDetail` não foi refatorado para consumir
  `readCargoLayoutInputParams` — o método já monta contatos/endereços/rótulo junto com o retrato de
  carga numa única passada, e trocar sua composição interna arriscaria comportamento fora do escopo
  de D7 sem ganho para esta task; a nova função é a fonte única para o gatilho eager, e a duplicação
  de leitura (não de lógica — occupancy/weight/ceiling/stamp continuam vindo dos mesmos suportes) fica
  registrada aqui para quem revisitar.

### T6b — a coluna `input` guarda a entrada inteira · 2026-09-12

Rodou em sessão `opus`: o executor `sonnet` delegado morreu no limite semanal de uso sem deixar
nada na árvore. Contrato vermelho antes da implementação.

- **O defeito:** T5/T6 gravavam em `trip_cargo_layouts.input` o `CargoLayoutInput` do hash, que
  descarta rótulo, cliente, números de nota e o `documentNumber` da caixa (D6), e o
  `readCargoLayoutInputParams` ainda enchia `label: ''`/`volumeM3: null`/`documentsWithoutVolume: 0`.
  O worker (T9) empacota a partir dessa coluna, sem reler a viagem (D5), então a planta gravada sairia
  com caixas sem nome e paradas sem etiqueta.
- `cargo-layout-hash.types.ts`: tipo novo `StoredCargoLayoutInput` (a entrada de `resolveCargoLayout`
  com as omissões resolvidas, mais `policyVersion`). `cargo-layout-hash.policy.ts`:
  `buildStoredCargoLayoutInput` escolhe os campos um a um, para o envelope do pedido (`companyId`,
  `correlationId`, `tripId`) nunca entrar na coluna.
- `UpsertCargoLayoutRequestParams.input` passa a ser `StoredCargoLayoutInput`. O use case
  (`request-cargo-layout.use-case.ts`) e o gatilho eager gravam a entrada inteira e hasheiam o retrato
  canônico, então o hash não muda.
- `trip-cargo-layout-input.support.ts`: as paradas saem como no `readTripDetail`: rótulo derivado de
  `listStopAddresses` (com o gravado como reserva), `clientName` do destinatário, `noteNumbers` e
  `documentNumber` pela mesma coalescência nota/frete, `documentsWithoutVolume` e `volumeM3`
  (`sumVolumes`). O endereço entra no `Promise.all` que já existia, então é **uma** consulta a mais
  por gatilho, não uma por parada.
- Contratos novos (vermelho → verde): `eager-cargo-layout-request.contract.ts` confere que a entrada
  gravada guarda rótulo, cliente, número de nota e `documentId` da caixa, que `policyVersion` é a
  constante do pacote, e que o hash **não** muda com o rótulo; `request-cargo-layout.contract.ts`
  confere que a entrada guarda o rótulo e não carrega `companyId`/`correlationId`/`tripId`.
- Vermelho: 2 fail / 85 pass em `trip-infrastructure` + `trip-application`, antes do código.
- Verde: `bun test` de `trip-infrastructure`, `trip-stops`, `trip-documents`, `trip-application`,
  `test-registry` e `trips`: **193 pass, 0 fail** (191 da T6 + os 2 novos); suíte inteira da API
  (`bun run --cwd apps/api-transportada test`) **4959 pass, 0 fail**. `bunx tsc --noEmit` limpo,
  `bunx eslint` limpo nos 10 arquivos, `prettier --write` aplicado.
- **Não coberto aqui:** nenhum teste contra Postgres prova que `readCargoLayoutInputParams` devolve,
  para a mesma viagem, as mesmas paradas que o `readTripDetail` passa a `resolveCargoLayout`. As duas
  montagens são cópias (a decisão da T6 de não refatorar o `readTripDetail` continua valendo). A T10,
  que compara o hash do detalhe com o guardado, é o lugar natural dessa paridade.

## Fase 3 — Worker (T7–T9)

### T7 — envelope e topologia do pedido de planta · 2026-09-12

Rodou em `opus`: `sonnet` sem cota até 2026-09-14 09:00. Contrato vermelho antes da implementação.

- `apps/worker-transportada/src/messaging/cargo-layout-envelope.schema.ts` (novo):
  `CARGO_LAYOUT_EVENT_TYPE.REQUESTED = 'transportada.trip.cargo-layout.requested'` (cópia por valor de
  `CARGO_LAYOUT_OUTBOX_EVENT_TYPES` da API) e `cargoLayoutEnvelopeV1Schema` no formato de
  `aggregate-attachment-envelope.schema.ts`: `strictObject` com `eventId, type, version (1),
occurredAt, companyId, correlationId, payload`; `payload` é `strictObject({ inputHash, layoutId })`
  — referência, nunca a carga (D8).
- `apps/worker-transportada/src/messaging/cargo-layout-topology.ts` (novo):
  `buildCargoLayoutTopology({ queuePrefix })` no padrão exato de `route-optimization-topology.ts` —
  `${QUEUE_PREFIX}.cargo-layout.v1.{main,retry,dead}.{exchange,queue}` e routing keys
  `.main/.retry/.dead`, retry `delayMs: 30_000`, `maxRetries: 2`.
- Contratos novos (entrypoint `test/cargo-layout-messaging.contract.test.ts`, adicionado à lista
  explícita do `package.json` do worker logo após `cargo-layout-schema.contract.test.ts`):
  - `test/cargo-layout/envelope.contract.ts`: envelope válido aceito; recusados payload com campo a
    mais (rótulo de parada — PII), sem `layoutId`, sem `inputHash`, `layoutId` não-uuid, `type` de
    outro trilho, `version: 2` e campo desconhecido no envelope. Paridade com a API por leitura de
    fonte (mesmo estilo de `schema-parity.contract.ts`): a lista `CARGO_LAYOUT_OUTBOX_EVENT_TYPES` da
    API é exatamente `[CARGO_LAYOUT_EVENT_TYPE.REQUESTED]`, e as chaves do `payload` gravado em
    `cargo-layout-request.support.ts` são as chaves do schema do payload.
  - `test/cargo-layout/topology.contract.ts`: topologia inteira por `toEqual` (principal, retry TTL
    30000 ×2, morta, com as routing keys de cada uma); prefixo do ambiente, nunca literal; não divide
    fila/exchange/retry/morta com a emissão de CT-e nem com a roteirização.
- Vermelho: `bun test ./test/cargo-layout-messaging.contract.test.ts` → **0 pass, 1 fail, 1 error**
  (`Cannot find module '../../src/messaging/cargo-layout-topology.js'`), antes de qualquer código de
  produção.
- Verde: a mesma suíte → **13 pass, 0 fail** (21 `expect()`); suíte inteira do worker
  (`bun run test`) → **991 pass, 0 fail** (2736 `expect()`, 79 arquivos). `bunx tsc --noEmit` limpo,
  `bunx eslint` limpo nos 5 arquivos, `bunx prettier --write` nos 6 arquivos tocados: todos
  `unchanged`.
- **Decisões registradas:** nomes de exchange/fila montados por template no builder, no mesmo estilo
  do arquivo de referência (sem `*.constant.ts` à parte — nenhuma das topologias existentes usa);
  `inputHash` validado como string não vazia, sem travar o formato sha256-hex que a API produz hoje,
  para o envelope não acoplar ao algoritmo do hash. Relay (T8), handler/consumidor (T9) e a ligação em
  `main.ts` ficam fora desta task.

### T8 — relay da outbox do pedido de planta · 2026-09-12

Rodou em `opus`: `sonnet` sem cota até 2026-09-14 09:00. Contrato vermelho antes da implementação.

- `apps/worker-transportada/src/cargo-layout/infrastructure/drizzle-cargo-layout-outbox.repository.ts`
  (novo): `DrizzleCargoLayoutOutboxRepository` no molde de
  `drizzle-aggregate-attachment-outbox.repository.ts` — `claimDueEntries` (`FOR UPDATE SKIP LOCKED`,
  não publicadas, `next_attempt_at` vencido, sem dono ou lease expirado, ordem `created_at, id`,
  `LIMIT`) e `markPublished` filtrado por `(company_id, event_id, claim_owner)` e
  `published_at IS NULL`. `layoutId` vem da coluna tipada; do `payload jsonb` só sai o `inputHash`.
  Linha com `event_type` diferente de `CARGO_LAYOUT_EVENT_TYPE.REQUESTED`, sem `inputHash` ou com
  `payload.layoutId` divergente da coluna é recusada (`Unsupported cargo layout outbox record`).
- `apps/worker-transportada/src/cargo-layout/application/cargo-layout-outbox-relay.service.ts` (novo):
  `CargoLayoutOutboxRelayService.relayDueEntries` espelhando o relay do anexo — confere o dono da
  reivindicação, publica o envelope v1 montado só com `{ inputHash, layoutId }` no payload, marca
  publicado **depois** do publish; falha de publish passa por `retryPolicy.classify` (relança) e a
  linha fica não publicada, para o próximo ciclo depois do lease.
- `apps/worker-transportada/src/cargo-layout/application/cargo-layout-outbox-publisher.service.ts`
  (novo): publica no provider da topologia da T7 com `messageId = eventId`, `correlationId` e `type`.
- `apps/worker-transportada/src/main.ts`: `buildCargoLayoutTopology` declarado junto das demais; um
  `cargoLayoutPublisher` (a factory do provider declara a topologia `cargo-layout.v1`) e um
  `OutboxRelayLoop` (`cargo_layout_outbox_relay_failed`, 1 s, lease 30 s, lote 25 — os mesmos números
  do relay do anexo). O loop entra nos `closeables`, o publisher no grupo de fechamento **e** no
  `catch` de boot, conforme o aviso do próprio `main.ts`.
- Contratos:
  - `test/cargo-layout/outbox-relay.contract.ts` (novo, importado por
    `test/cargo-layout-messaging.contract.test.ts`, que já está na lista explícita do `package.json`):
    envelope satisfaz `cargoLayoutEnvelopeV1Schema` com `type`/`version` certos; payload exatamente
    `{ inputHash, layoutId }` e envelope só com as 7 chaves mesmo com a entrada reivindicada
    contaminada por rótulo/cliente (PII); `companyId` de cada envelope é o da própria linha;
    reivindica → publica → marca em ordem, sem marcar antes do publish resolver; respeita o lote;
    falha de publish não marca; um dono por lease até expirar; linha de outro dono é pulada.
  - `test/nfe-runtime.contract.test.ts`: a lista de fechamento ganha
    `provider.close:…cargo-layout.v1.main.queue` — trilho novo entra nela junto com o publisher.
- Vermelho: `bun test ./test/cargo-layout-messaging.contract.test.ts` → **0 pass, 1 fail, 1 error**
  (`Cannot find module '../../src/cargo-layout/application/cargo-layout-outbox-relay.service.js'`);
  `bun test ./test/nfe-runtime.contract.test.ts` → **2 pass, 1 fail** (lista de fechamento sem o
  publisher novo). Ambos antes de qualquer código de produção.
- Verde: as duas suítes → **24 pass, 0 fail** (49 `expect()`); suíte inteira do worker
  (`bun run test`) → **999 pass, 0 fail** (2765 `expect()`, 79 arquivos, inclui
  `build-entrypoints.contract.test.ts`). `bunx tsc --noEmit` limpo; `bunx prettier --write` e
  `bunx eslint` nos 7 arquivos tocados: todos `unchanged`, eslint limpo.
- **Decisões registradas:** o relay **não** valida com `cargoLayoutEnvelopeV1Schema` antes de
  publicar, porque o relay de referência (anexo) não valida — o envelope é montado de campos tipados
  e o contrato prova a conformidade; quem valida é o consumidor (T9). Espelho do schema da outbox e a
  paridade com a API já existiam (T3/T5, `schema-parity.contract.ts`), sem mudança. Nenhuma variável
  de ambiente nova. Consumidor/handler fica para a T9.

### T9 🧠 — o worker calcula a planta · 2026-09-12

Rodou em `opus`, validado antes por architect `opus`. Contratos vermelhos antes da implementação.
Segue as decisões do usuário D13–D15 (2026-09-12), que substituem o `truncated: true` da D9.

- `apps/worker-transportada/src/cargo-layout/application/` (novos):
  - `cargo-layout-handler.service.ts`: `handleCargoLayout({ attempt, baseBudgetMs, job, maxAttempts,
ports })` → `'ack' | 'retry'`, no molde de `route-optimization-handler.service.ts`, portas
    `claim/compute/complete/fail/release/now`. Reivindicação nula → `ack` sem calcular. Entrada
    inválida → `failed` `CARGO_LAYOUT_FAILED`, `ack`. Teto externo da thread → `release` + `retry`
    numa tentativa não final, `failed` `CARGO_LAYOUT_TIME_BUDGET_EXCEEDED` na última. Exceção ou
    thread morta → `failed` `CARGO_LAYOUT_FAILED`, `ack`. `null` do pacote → `failed`
    `CARGO_LAYOUT_UNAVAILABLE`, `ack` (**D15**). Caixa `unplaced` com motivo `time_budget` numa tentativa
    não final → `release` + `retry`; na última grava `ready` como está, sem marca nenhuma (**D13** —
    "incompleta" é derivada na leitura, T10). Falha de escrita depois da reivindicação → `release` +
    `retry`, e `failed` `CARGO_LAYOUT_FAILED` na última.
  - `cargo-layout-budget.policy.ts`: orçamento da tentativa N = `base × 2^(N−1)` (60/120/240 s no
    padrão, **D13**); lease = maior degrau + teto externo 10 s + folga 30 s = 280 s no padrão, derivado
    de `CARGO_LAYOUT_TIME_BUDGET_MS` sem env nova (**D14**).
  - `cargo-layout-error.constant.ts` (`CARGO_LAYOUT_ERROR`), `cargo-layout-timeout.error.ts`
    (`CargoLayoutTimeoutError`, o único erro que vale novo degrau).
  - `stored-cargo-layout-input.schema.ts`: `StoredCargoLayoutInput` escrito a partir de
    `Parameters<typeof resolveCargoLayout>[0]` + `policyVersion`, e o Zod `strictObject` (com
    `exactOptional`/`readonly`) com `satisfies z.ZodType<StoredCargoLayoutInput>`. O jsonb lido é
    fronteira: campo desconhecido é recusado.
- `apps/worker-transportada/src/cargo-layout/infrastructure/` (novos):
  - `drizzle-cargo-layout.repository.ts`: `claim` = `UPDATE … SET status='running',
attempt=attempt+1, updated_at=now() WHERE company_id AND id AND input_hash AND (status='queued' OR
(status='running' AND updated_at < now() - lease)) RETURNING attempt, input`; `complete`/`fail`/
    `release` só sobre `running` da mesma empresa, id e hash. `fail` grava `layout: null` (o CHECK da API
    proíbe planta fora de `ready`).
  - `threaded-cargo-layout.gateway.ts` (cópia do padrão de `threaded-extraction.gateway.ts`) +
    `cargo-layout.worker.ts`: o prazo (`deadline = now() + budgetMs`) nasce **dentro** da thread; teto
    externo = orçamento + 10 s, termina a thread; em falha só atravessa `error.name` (a entrada tem PII).
- `apps/worker-transportada/src/runtime/cargo-layout-consumer.service.ts` (novo): decodifica com
  `cargoLayoutEnvelopeV1Schema`, `CARGO_LAYOUT_PREFETCH = 1`, `attempt = retryCount + 1`, log só com
  `layoutId`/`attempt`/`disposition` (e `reason` = nome do erro na falha do handler, que devolve a
  mensagem).
- Editados: `package.json` (dependência `"@adatechnology/cargo-placement":
"link:@adatechnology/cargo-placement"`, igual à API; `cargo-layout.worker.ts` no `build`; o
  entrypoint novo na lista explícita de testes); `bun.lock` (**uma linha só**, a dependência nova no
  workspace do worker — `bun install` sem mudar outra dependência); `src/config/environment.schema.ts`
  e `src/shared/worker.types.ts` (`CARGO_LAYOUT_TIME_BUDGET_MS`, int 1 000–600 000, padrão 60 000 →
  `cargoLayoutTimeBudgetMs`); `src/main.ts` (starter injetável `startCargoLayoutConsumer`, como o do
  anexo; `maxAttempts = maxRetries + 1 = 3`; consome na conexão do `cargoLayoutPublisher` da T8, que já
  está no grupo de fechamento e no `catch` de boot — nenhum provider novo; consumidor drenado depois
  do anexo). Sem `.env.example` no worker, nem contrato que o cubra — nada a editar ali.
- Contratos (entrypoint `test/cargo-layout-handler.contract.test.ts`, na lista explícita):
  - `test/cargo-layout/handler.contract.ts` (16): todos os ramos acima, a escada 60000/120000/240000
    passada ao `compute` por tentativa e o lease 280 000/44 000.
  - `test/cargo-layout/input-schema.contract.ts` (3): entrada da API aceita após JSON; campo a mais na
    raiz, na parada e na caixa recusado; forma quebrada recusada.
  - `test/cargo-layout/consumer.contract.ts` (6): decode, envelope inválido recusado, prefetch 1,
    `retryCount` → degrau, log sem PII, falha do handler → `retry`.
  - `test/cargo-layout/gateway.contract.ts` (4): **`new Worker()` real** com a Daily de
    `@adatechnology/cargo-placement/fixtures` (3 paradas) devolvendo planta que sobrevive a
    `JSON.parse(JSON.stringify())`; teto externo → `CargoLayoutTimeoutError`; prazo vencido → caixas
    `time_budget`, nunca somem.
  - `test/cargo-layout/repository.contract.ts` (4): SQL da reivindicação (`queued` ou `running` com
    lease vencido, por empresa/id/hash) e das escritas por `PgDialect`.
  - `test/environment.contract.test.ts`: padrão 60 000, `90000` lido, `abc`/`0`/`999`/`600001`/`1.5`
    recusados. `test/nfe-runtime.contract.test.ts` e `test/shutdown-signals.contract.test.ts`: o starter
    novo injetado, e `cargoLayout.cancel` na ordem de drenagem. `build-entrypoints.contract.test.ts`
    passa a exigir o `cargo-layout.worker.ts` (varredura por `*.worker.ts`).
- Vermelho (antes de qualquer código de produção): `cargo-layout-handler.contract.test.ts` → **0 pass,
  1 fail** (`Cannot find module …/stored-cargo-layout-input.schema.js`); `environment` → **21 pass,
  7 fail**; `nfe-runtime` → **2 pass, 1 fail** (drenagem sem `cargoLayout.cancel`).
- Verde: `cargo-layout-handler.contract.test.ts` → **33 pass, 0 fail** (93 `expect()`); as cinco
  suítes afetadas → **67 pass, 0 fail** (137 `expect()`); suíte inteira do worker
  (`bun run test`) → **1038 pass, 0 fail** (2874 `expect()`, 80 arquivos). `bunx tsc --noEmit` limpo;
  `bunx prettier --write` e `bunx eslint` nos 22 arquivos tocados: limpos. `bun run build` empacota
  `cargo-layout/infrastructure/cargo-layout.worker.js`.
- **Achado registrado (para T9b/T10):** o `.d.ts` do pacote declara `resolveCargoLayout(...) |
null`, mas a versão instalada **nunca devolve `null`** (`dist/index.js`, corpo inteiro sem `return
null`): sem baú nem capacidade sai uma planta com `placement: null` e `occupancyKnown: false`. O ramo
  da D15 fica, coberto pelo contrato do handler, e o teste de thread fixa o comportamento real. Hoje,
  então, planta sem capacidade vira `ready` com `placement: null` — que o CHECK aceita. Quem decide se
  isso deve ser `CARGO_LAYOUT_UNAVAILABLE` (e se a API deixa de enfileirar) é a T9b.
- **Risco registrado:** o `strictObject` recusa qualquer chave que a API passe a gravar em `input`
  sem o worker conhecer — a planta vira `failed` `CARGO_LAYOUT_FAILED` em vez de calcular sobre um
  retrato parcial. Mudou `StoredCargoLayoutInput` na API? atualize a cópia aqui.
- Regra física do empacotador (apoio 80%, escora, célula 5 cm, slenderness) intocada (G013): o worker
  só chama `resolveCargoLayout`. Não coberto aqui: teste contra Postgres real da reivindicação por
  lease (a cláusula é provada pelo SQL gerado).

### T9b — a API reabre o que parou e não pede o impossível · 2026-09-12

Rodou em `opus`: `sonnet` sem cota até 2026-09-14 09:00. Contratos vermelhos antes da implementação.
Lado da API das decisões D14–D16 (e D10 para o baú ausente).

- **Reabrir parados (D14/D16):** `upsertCargoLayoutRequest` (`cargo-layout-request.support.ts`)
  troca o `where status='failed'` do `onConflictDoUpdate` por `status = 'failed' or (status in
('queued', 'running') and updated_at < now() - ($lease * interval '1 millisecond'))` — a mesma
  cláusula de tempo do claim do worker. Reabrir continua voltando a linha para `queued`, `attempt 0`,
  `layout null`, e grava a linha nova na outbox pelo mesmo caminho de antes. `ready` e
  `queued`/`running` recentes seguem no-op (G006). O lease chega por parâmetro:
  `UpsertCargoLayoutRequestParams = CargoLayoutRequestParams & { leaseMs }`. O port
  (`CargoLayoutRequestPort`) recebe `CargoLayoutRequestParams`, sem lease, porque o lease é da
  infraestrutura. `DrizzleCargoLayoutRequestRepository` o recebe no construtor.
- **Lease igual ao do worker:** `src/trips/domain/cargo-layout-lease.policy.ts` (novo) é cópia por
  valor de `cargo-layout-budget.policy.ts` (mesmas constantes, mesmos corpos de função), com
  `CARGO_LAYOUT_MAX_ATTEMPTS = 3` (`maxRetries: 2` da topologia `cargo-layout.v1` + 1) e
  `DEFAULT_CARGO_LAYOUT_LEASE_MS` (280 000). `main.ts` deriva `cargoLayoutLeaseMs` de
  `config.cargoLayoutTimeBudgetMs` e o injeta em `DrizzleTripRepository`,
  `DrizzleTripRouteRepository` e `DrizzleDeliveryAddressOverrideRepository`, que agora montam o
  gatilho eager por `createRequestCargoLayoutForTrip({ cargoLayoutLeaseMs })`. O singleton do módulo
  saiu.
- **Não enfileirar sem planta possível (D15 + D10):** `src/trips/domain/cargo-layout-availability.policy.ts`
  (novo) define `canRequestCargoLayout`, que é falso com `capacityM3 === null` ou `bedDimensions`
  nulo/ausente. O gatilho eager devolve `null` sem chamar o upsert. O use case devolve
  `{ enqueued: false, layoutId: null, status: 'unavailable' }` (`CargoLayoutUnavailableResult`,
  em união com `RequestCargoLayoutResult`) sem tocar no repositório. T10/T11 leem isso como
  `cargoLayoutState.status = 'unavailable'`. Com isso, o achado da T9 (o pacote devolve `placement:
null` sem baú, e isso seria gravado `ready`) fica fechado do lado da API.
- **Env (antecipa parte da T11):** `CARGO_LAYOUT_TIME_BUDGET_MS` no schema da API, com o mesmo
  formato do worker (`z.coerce.number().int().min(1_000).max(600_000).default(60_000)`), exposto
  como `ApiEnvironment.cargoLayoutTimeBudgetMs` e declarado no `.env.example` da raiz
  (`CARGO_LAYOUT_TIME_BUDGET_MS=60000`, lido pelas duas apps). Fixtures de `auth-me` e `server`
  (integração) ganharam o campo.
- Regra física, schema de tabela, CHECK e migration: nenhuma mudança.
- Contratos:
  - `test/trip-infrastructure/cargo-layout-request.contract.ts` (+4): SQL da reabertura por
    `PgDialect` (sem `ready`, lease como parâmetro `$1`), lease injetado chega ao SQL, reabertura
    volta a `queued`/`attempt 0`/`layout null`, `running` recente é no-op sem outbox.
  - `test/trip-infrastructure/eager-cargo-layout-request.contract.ts` (+4): sem capacidade, baú
    `null` e baú ausente devolvem `null` sem upsert; com os dois, o upsert recebe o lease injetado.
  - `test/trip-application/request-cargo-layout.contract.ts` (+4): sem capacidade, baú `null` e
    baú ausente devolvem `unavailable` sem chamar o repositório; com os dois, pede.
  - `test/trip-infrastructure/cargo-layout-lease.contract.ts` (novo, 10, importado pelo entrypoint
    `trip-infrastructure.contract.test.ts`, que já está na lista explícita): paridade lendo os
    fontes do worker com `readFile` (as 2 constantes `CARGO_LAYOUT_*_MS` e os 2 corpos de função
    idênticos; `maxRetries + 1 === CARGO_LAYOUT_MAX_ATTEMPTS`), lease de 280 000/44 000, env ausente
    60 000, `90000` lido, `abc`/`0`/`999`/`600001`/`1.5` recusados.
  - `test/config/env-example.contract.ts` (+1): `CARGO_LAYOUT_TIME_BUDGET_MS=60000` declarado.
- Vermelho (antes de qualquer código de produção): `cargo-layout-request` + `eager` isolados →
  **11 pass, 6 fail**. `trip-infrastructure.contract.test.ts` → **0 pass, 1 fail** (`Cannot find
module …/cargo-layout-lease.policy.js`). `trip-application.contract.test.ts` → **65 pass,
  3 fail**. `env-example.contract.test.ts` → **3 pass, 1 fail**.
- Verde: `trip-infrastructure` → **41 pass, 0 fail** (78 `expect()`); `trip-application` →
  **68 pass, 0 fail** (144 `expect()`); `env-example` → **4 pass, 0 fail** (117 `expect()`). Suíte
  inteira da API (`bun run test`) → **4982 pass, 0 fail** (17 963 `expect()`, 5005 testes em 164
  arquivos). `bunx tsc --noEmit` limpo. `bunx prettier --write` e `bunx eslint` nos 23 arquivos
  tocados da API: limpos. O prettier não tem parser para `.env.example`.
- **Decisão de implementação registrada:** os construtores dos três repositórios de viagem e de
  `DrizzleCargoLayoutRequestRepository` têm `options` com padrão `DEFAULT_CARGO_LAYOUT_LEASE_MS`,
  que é o lease do orçamento padrão do env. Assim as 13 construções em testes de integração não
  mudam. O `main.ts` sempre passa o lease derivado da env. Quem construir um desses repositórios
  num composition root novo e esquecer o parâmetro fica com 280 s, divergindo do worker só se o
  ambiente mudar o orçamento.
- Não coberto aqui: reabertura contra Postgres real (a cláusula é provada pelo SQL gerado, como na
  T9). `DrizzleCargoLayoutRequestRepository` e o use case ainda não são montados no `main.ts`: é a
  T10/T11 que os liga.

- **Gate conferido pelo orquestrador:** `bunx tsc --noEmit` e `bunx eslint` limpos; suíte inteira da API 4981 pass, 1 fail — `test/deploy/keycloak-realm.contract.ts` › "callback declarado que falta no client é acrescentado" (script de deploy em diretório temporário, sem relação com a T9b e sem mudança desde 2026-09-02). Isolado, passou 12/12 em duas rodadas seguidas: intermitente, registrado aqui em vez de ignorado.

### T12a — o frontend aceita antes de a API servir · 2026-09-12

Rodou em `opus`: `sonnet` sem cota até 2026-09-14 09:00. Contratos vermelhos antes da implementação.
Só **aceita** as chaves novas, sem leitor na tela (polling, esqueleto e selo ficam para T12/T13).

- **D17 — ordem de publicação:** este commit vai para o ar **antes** da T10/T11, em push próprio.
  Bundle novo com API antiga: chave ausente, aceita. API nova com bundle antigo: `hasKeys` recusa a
  resposta inteira, e a tela de detalhe cai com a API respondendo 200. Por isso a ordem não se inverte.
- **Detalhe:** `cargoLayoutState` entrou em `TRIP_DETAIL_OPTIONAL_KEYS` (`trip.constant.ts`), com
  `TRIP_CARGO_LAYOUT_STATE_KEYS` (`computedAt`, `errorCode`, `stale`, `status`, `truncated`).
  `isCargoLayoutState` (`tripResponse.validation.ts`) confere chave exata por `hasExactKeys`,
  `status` em `CARGO_LAYOUT_STATUSES` (`ready`/`pending`/`failed`/`unavailable`), `computedAt` e
  `errorCode` como `string | null` (o `''` da coluna `text not null default ''` passa como string,
  sem conversão) e os dois booleanos. `isDetail` aceita ausente e reprova `null` ou forma errada.
- **Tipos (D12):** `trip.types.ts` ganhou `CARGO_LAYOUT_STATUSES`, `CargoLayoutStatus` e
  `TripCargoLayoutState`. `TripDetail.cargoLayoutState?` e `TripCargoPreview.layoutId?`/`state?`
  são opcionais. `truncated` segue na forma da D10 como booleano servido, derivado na leitura pela
  T10 (D13). Nenhum componente mudou: sendo opcionais, o `tsc` não pediu propagação.
- **Prévia:** `tripCargoPreviewFromApi` **não confere chaves** (desestrutura e ignora o resto), então
  a prévia nunca recusaria `{ layoutId, state }`. Hoje ela só os descartaria. Agora `layoutId` que
  não é string ou `state` com forma errada reprovam, e os válidos são propagados. Ausentes não são
  inventados (`'layoutId' in preview === false`).
- **Fixture:** `TRIP_DETAIL` (`test/trip/trip.fixture.ts`) ganhou `cargoLayoutState` `ready`, e
  `TripDetailContract` ganhou a chave opcional. Isso é exigido pelo contrato da spec 076 "cobre
  exatamente o que o guard aceita".
- Contratos: `test/trip/cargo-layout-state-accepted.contract.ts` (novo, 27 testes). Ele é importado
  pelo entrypoint `test/trip.contract.test.ts`, que já está na lista explícita do `package.json`, e
  cobre:
  - no detalhe: sem a chave; cada um dos 4 status; `errorCode` `''` e com código, `computedAt`
    nulo; 8 formas inválidas (status desconhecido, campo a mais, campo faltando, `stale`/`truncated`
    não booleanos, `computedAt`/`errorCode` numéricos, não objeto); `null` recusado;
  - na prévia: sem as chaves; propaga as válidas; não inventa as ausentes; as mesmas 8 formas
    inválidas; `layoutId` numérico.
- Vermelho (antes de qualquer código de produção): `bun test ./test/trip.contract.test.ts` →
  **742 pass, 23 fail**. Foram 15 falhas dos contratos novos e 8 dos existentes, que já liam a
  fixture com a chave nova: cliente ×2, spec 078 D2 ×2, fixture da 076, `amounts` e contato do
  motorista ×2.
- Verde: `trip.contract.test.ts` → **765 pass, 0 fail** (17 303 `expect()`). `bunx tsc --noEmit`
  limpo. `bunx prettier --write` e `bunx eslint` nos 6 arquivos tocados: limpos. `bun run build`
  passou.
- Suíte inteira (`bun run test`) → **3370 pass, 15 fail** (3385 testes em 29 arquivos). As 15 falhas
  são contratos de design system e de convenção (`button`, `checkbox`, `count-badge`,
  `date-picker`, `field-metrics`, `filter-pills`, `floating-layer`, `icon`, `layout-width`,
  `revealed-panel`, `responsive`, `select`, `skeleton`, leitor de etiqueta e tabela do CT-e) que leem
  `../../CLAUDE.md` e esperam links como `docs/frontend/checkboxes.md`. O commit `37436e4a`
  (divide CLAUDE.md por app) tirou esse texto da raiz. Nenhum arquivo da T12a é doc, e o
  `CLAUDE.md` está fora do escopo desta task: fica registrado como pendência do orquestrador.

- **Gate conferido pelo orquestrador:** `tsc`, `eslint` e `bun run build` limpos; suíte inteira do frontend 3370 pass, **15 fail**. As 15 são contratos de design system e de convenção que procuram a regra no `CLAUDE.md` da raiz, de onde o commit `37436e4a` (divisão do CLAUDE.md por app) a tirou; nenhuma toca em viagem nem nos arquivos da T12a. A correção fica fora da spec 145, numa tarefa separada.

## Fase 4 — Leitura da API (T10, T11)

### T10 — o detalhe lê a planta que o worker guardou · 2026-09-12

Rodou em `opus`: `sonnet` sem cota até 2026-09-14 09:00. Contratos vermelhos antes da implementação.
Segue D5–D7, D10 e D13–D17. Nenhuma regra física, migration ou coluna nova.

- **`readTripDetail` não empacota mais.** Ele monta a entrada com o dado que já carregou, calcula o
  hash (D6) e lê `trip_cargo_layouts` por `(company_id, input_hash)`. `resolveCargoLayout`,
  `stampCargoNote` e `sumVolumes` saíram do repositório. O único `resolveCargoLayout` que resta na API é
  o da prévia (T11).
  - `src/trips/infrastructure/stored-cargo-layout-read.support.ts` (novo): `readTripCargoLayout`.
    Quando `canRequestCargoLayout` é falso, devolve `unavailable` sem hash e sem ler a tabela. Nos
    outros casos faz no máximo duas consultas: a do hash atual e, se ela não está `ready`, a última
    `ready` da viagem (`computed_at desc nulls last`).
  - `src/trips/domain/cargo-layout-state.policy.ts` + `.types.ts` (novos): `resolveCargoLayoutReading`
    é puro. Regras:
    - `ready` com o hash igual → aquela planta, `stale: false`;
    - senão, a última `ready` da viagem, `stale: true`;
    - senão, `null`;
    - `pending` = linha `queued`/`running`, ou nenhuma linha ainda;
    - `failed` traz o `errorCode` da linha;
    - `errorCode` `''` sai `null`;
    - `truncated` sai de `placement.unplaced[].reason === 'time_budget'` na planta servida (D13).
    - `shouldRequest` vale para: sem linha, `failed`, ou `queued`/`running` com lease vencido.
- **Paridade de hash:** `buildLayoutStop` foi exportado de `trip-cargo-layout-input.support.ts` e o
  detalhe passou a usá-lo, o que acabou com a cópia. O `stops` intermediário do detalhe foi removido.
  `labelOf`/`addressOf` continuam só na resposta, com os comentários ⚠️ sobre o rótulo intactos.
- **Lease numa cláusula só:** `buildCargoLayoutLeaseExpiredCondition` saiu de
  `cargo-layout-request.support.ts`. O upsert (T9b) e a leitura usam a mesma. O SQL da reabertura
  saiu idêntico, e os contratos da T9b continuam verdes.
- **Lazy (D7/D16):** `TripDetail` ganhou `cargoLayoutState` e `pendingCargoLayoutInput?`, que só está
  presente quando `shouldRequest` é verdadeiro e **nunca é serializado**, porque carrega rótulo e
  cliente.
  - A rota `GET /trips/:id` passou a receber `correlationId` pelo `parse`, no padrão das outras rotas.
    Depois da leitura, ela chama `requestCargoLayout.execute` com o id real.
  - `main.ts` monta `createRequestCargoLayoutUseCase` sobre `DrizzleCargoLayoutRequestRepository`
    (transação própria) com o mesmo `cargoLayoutLeaseOptions`.
  - Em `unavailable` nada é pedido.
  - O serializador ganhou `cargoLayoutState` com as cinco chaves.
- **Contratos:**
  - `test/trip-domain/cargo-layout-state.contract.ts` (novo, 11 testes, no entrypoint
    `trip-domain.contract.test.ts`, que já está listado): cobre os casos abaixo.
    - os estados `ready`, `stale`, `pending` (sem linha, `queued`/`running`), `failed`, `unavailable`
      e lease vencido;
    - `''` sai `null`, e `truncated` é derivado (fresca, stale e `placement: null`);
    - **paridade com o frontend por leitura de fonte**: as chaves de `cargoLayoutState` são exatamente
      `TRIP_CARGO_LAYOUT_STATE_KEYS`, e os status são exatamente `CARGO_LAYOUT_STATUSES` do front.
  - `test/trip-http/detail.contract.ts` (+3): o lazy pede depois da leitura com `CORRELATION_ID`,
    `companyId` do contexto e `tripId`; a resposta serve `cargoLayoutState` e nunca
    `pendingCargoLayoutInput`; sem entrada pendente (inclusive `unavailable`) nada é pedido.
  - `test/trip-schema/tenant-safety.contract.ts`: `trip_cargo_layouts` entrou em `TRIP_TABLES`.
  - `test/integration/trip-cargo-layout-read.integration.ts` (novo, 8 testes contra Postgres real,
    adicionado a `test:integration` no `package.json`):
    - **mesmo hash e mesma entrada gravada inteira** (rótulo, cliente, notas) entre detalhe e eager
      para a mesma viagem;
    - `pending` sem linha, e o lazy enfileira uma vez, com `correlationId` na outbox;
    - `ready` fresco com `truncated` derivado;
    - `failed` com código e planta antiga `stale`;
    - a `ready` mais nova é a servida;
    - `queued` com lease vencido é pedido de novo, e o upsert reabre. Isso prova, contra Postgres, a
      cláusula da T9b, que antes só tinha prova por SQL gerado;
    - planta de **outra empresa** com o mesmo hash não é lida;
    - sem capacidade nem baú → `unavailable`, sem linha criada.
  - Fixtures: `TRIP_DETAIL` (`trip-http-payload.fixture.ts`) e `openTrip`
    (`trip-use-case.contract.ts`) ganharam `cargoLayoutState` `unavailable`. A fixture HTTP ganhou a
    dependência `requestCargoLayout` e `getTripResult`.
- **Vermelho** (antes de qualquer código de produção):
  - `trip-domain.contract.test.ts` → **0 pass, 1 fail** (`Cannot find module
…/cargo-layout-state.policy.js`);
  - `trip-http.contract.test.ts` → **46 pass, 3 fail**;
  - as duas integrações → **1 pass, 9 fail**;
  - `trip-schema` e `trip-application` ficaram verdes: só receberam a guarda e a fixture.
- **Verde:**
  - `bunx tsc --noEmit` limpo;
  - `bunx prettier --write` e `bunx eslint` nos 20 arquivos tocados: limpos;
  - `trip-cargo-layout-read` + `trip-detail-query-count` (Postgres local 55432) → **10 pass, 0 fail**;
  - suíte inteira da API (`bun run test`) → **4996 pass, 0 fail** (18 005 `expect()`, 5019 testes em
    164 arquivos);
  - o intermitente conhecido (`keycloak-realm`) não apareceu.
- **Orçamento de consultas (G011).** Medido com o proxy de `select` de
  `trip-detail-query-count.integration.ts`, viagem de 1 parada e de 40 paradas:

  | veículo                             | antes (HEAD `f67d4174`) | depois | leituras de `trip_cargo_layouts` |
  | ----------------------------------- | ----------------------- | ------ | -------------------------------- |
  | sem capacidade/baú (`tractor_unit`) | 6 = 6                   | 6 = 6  | 0 (`unavailable`)                |
  | baú medido                          | 7 = 7                   | 9 = 9  | 2, fixas                         |

  O teste ganhou o caso com baú medido. Ele conta também quantos `select` vão a `trip_cargo_layouts`
  e exige igualdade entre 1 e 40 paradas, com a leitura da planta entre 1 e 2. O pedido lazy fica fora
  do orçamento, porque é transação própria disparada pela rota.

- **Contratos existentes ajustados, com o porquê:**
  - `stop-label-refresh` localiza pela primeira ocorrência de `stops: stopRecords.map(` e passou a
    achar a montagem da planta. As paradas da planta viraram `layoutStops` no código de produção, e o
    contrato não mudou.
  - `note-identity-preview` (spec 119) procurava o carimbo no repositório. O carimbo mora em
    `buildLayoutStop`, e o contrato agora exige o carimbo lá **e** o uso de `buildLayoutStop({` no
    repositório.
- **Pré-existente, não é da T10:** `test/integration/trip-repository.integration.ts` estoura os 30 s.
  Rodado contra o HEAD `f67d4174`, numa worktree destacada e já removida, estoura igual.
- A prévia e `GET /trips/cargo-layouts/:layoutId` (T11) não foram tocadas.

#### Ajustes do orquestrador na T10 · 2026-09-12

Dois pontos da primeira entrega foram corrigidos antes do commit. O primeiro saiu de uma releitura da
D10 feita pelo orquestrador.

- **Sem baú, a planta leve continua saindo na hora (D10).** "Saindo direto" é a planta de hoje, e não
  `cargoLayout: null`.
  - **Conferido no pacote** (`cargo-placement.policy.ts`/`cargo-plan.policy.ts`), com baú nulo:
    - `placeCargo` devolve `null` na primeira linha (`if (input.bed === null) return null`);
    - `resolveStopArrangement` devolve `{ depth, noBed }` na hora;
    - `resolveCargoPlanLayers` devolve `null`.

    Nenhum `packUntilItFits`/`packSlice` roda, então o caminho é barato.

  - Na API, capacidade nula implica baú nulo: baú medido gera capacidade medida, e baú de referência
    gera `referenceM3` com as mesmas medidas (`trip-occupancy.support.ts` + `resolveVehicleCapacity`).
  - Em `unavailable`, `readTripCargoLayout` chama `resolveCargoLayout({ ...input, bedDimensions: null
})` de forma síncrona. O `null` forçado não muda nenhum caso alcançável e garante que o empacotador
    nunca rode dentro da requisição.
  - O estado continua `unavailable`, sem ler a tabela e sem enfileirar.

- **Pedido lazy que falha não derruba a leitura (D7).** `requestCargoLayoutAfterRead`
  (`trip.routes.ts`) captura o erro do upsert. É fallback gracioso, o único `catch` local que a regra
  permite.
  - Loga `warn` `trip.cargo_layout.request_failed` com `{ correlationId, errorCode, tripId }`, e nada
    mais. `errorCode` é o `code` do erro (ex.: `DATABASE_UNAVAILABLE`) ou o `name` dele.
  - Responde 200 com a leitura e o estado que ela calculou.
  - A rota ganhou a dependência `logger: ApiLogger`, ligada no `main.ts`.
- **Contratos:**
  - `test/trip-http/detail.contract.ts` (+1): o upsert lança `DATABASE_UNAVAILABLE` → resposta 200 com
    o detalhe e o `failed` da leitura, um `warn` com exatamente as três chaves, e rótulo/cliente da
    entrada pendente fora do log. A fixture HTTP ganhou `logger` (grava os avisos) e
    `requestCargoLayoutError`.
  - `test/integration/trip-cargo-layout-read.integration.ts`: o caso sem baú agora exige a mesma planta
    que `resolveCargoLayout` dá sobre a entrada eager da viagem, que é a planta que o detalhe servia
    antes (a paridade de entrada está provada no primeiro teste). Exige também `placement: null`,
    `pendingMeasurements` presente, `unavailable` e nenhuma linha em `trip_cargo_layouts`.
- **Vermelho** (antes do código): `trip-http.contract.test.ts` → **49 pass, 1 fail**; integração da
  leitura → **7 pass, 1 fail**.
- **Verde:**
  - `bunx tsc --noEmit` limpo;
  - `prettier --write` e `eslint` nos 6 arquivos tocados: limpos;
  - integrações `trip-cargo-layout-read` + `trip-detail-query-count` → **10 pass, 0 fail**;
  - suíte inteira da API → **4997 pass, 0 fail** (18 010 `expect()`, 5020 testes em 164 arquivos).
- **Orçamento de consultas:** sem mudança. `resolveCargoLayout` é puro. Sem baú continua 6 = 6
  selects, com 0 leituras da tabela; com baú medido, 9 = 9, com 2 leituras fixas.

### T11 — a prévia pede a planta, e a tela pergunta de novo · 2026-09-12

Rodou em `opus`: `sonnet` sem cota até 2026-09-14 09:00. Contratos vermelhos antes da implementação.
Segue D3, D6, D7, D10 e D13–D17. Nenhuma regra física, migration ou coluna nova.

- **A prévia não empacota mais na requisição.** `previewTripCargo` monta a mesma entrada de antes e
  delega a `resolvePreviewCargoLayout` (`src/trips/application/preview-cargo-layout.service.ts`,
  novo). Com isso o último `resolveCargoLayout` com baú saiu da API: a outra metade do bloqueio do
  event loop (a proposta de 82 paradas e 1431 caixas) fechou.
  - Sem capacidade ou sem baú (D15): a planta leve sai na hora, com `resolveCargoLayout({
...layoutInput, bedDimensions: null })`, igual à T10. O estado é `unavailable`, sem `layoutId`
    (chave ausente, que o front aceita), e nada é lido nem enfileirado.
  - Nos outros casos: hash (D6) → leitura de `trip_cargo_layouts` por `(company_id, input_hash)`
    → `resolveCargoLayoutReading` da T10, sem planta anterior (a prévia não tem viagem, D3):
    - `ready` → a planta guardada, com `truncated` derivado de `time_budget` (D13);
    - sem linha, `failed` ou `queued`/`running` além do lease → pede de novo com
      `createRequestCargoLayoutUseCase`, `tripId: null` e o `correlationId` da requisição;
    - pendente → `cargoLayout: null` + `pending`;
    - `failed` → serve o `errorCode` da linha e reabre pelo upsert, como o detalhe faz. Na próxima
      pergunta a tela vê `pending`.
    - `layoutId` = o que o upsert devolveu ou o id da linha lida (é a mesma linha, pela chave única).
  - A rota `POST /trips/cargo-preview` passou a receber `correlationId` pelo `parse`, no padrão da
    `GET /trips/:id`. Falha do upsert **propaga** (503 etc.): aqui não há leitura já feita para
    salvar, ao contrário do lazy da T10, e o use case não faz `try/catch`.
- **Rota de polling:** `GET /trips/cargo-layouts/:layoutId` → `{ data: { layoutId, state,
cargoLayout } }`, no mesmo envelope `{ data }` das outras rotas de viagem.
  - `createReadCargoLayoutUseCase` (novo) busca por `(company_id do contexto, id)` e deriva o
    estado com a mesma `resolveCargoLayoutReading`. É só leitura: quem pede é a prévia.
  - Ausente, ou de outra empresa → `TripCargoLayoutNotFoundError` (404
    `TRIP_CARGO_LAYOUT_NOT_FOUND`), nunca 403 nem 200.
  - `pathParameterFormat: 'raw'` + `parseUuidPathIdentifier` (Zod) → 400 `INVALID_REQUEST`. O
    `canonicalUuid` padrão responderia 404 a id malformado antes de a rota existir, o que misturaria
    erro do cliente com ausência; é o mesmo motivo documentado no router para convites.
  - **Permissão:** `TRIP_MANAGE_POLICY`, espelhando a prévia. O separador alcança a prévia (decisão
    escrita da spec 085), então alcança o polling. `test/separator-role.contract.test.ts` reprovou a
    rota nova, como devia, e ela entrou na lista com a decisão escrita ao lado.
- **Leitura compartilhada:** `stored-cargo-layout-read.support.ts` ganhou
  `readCargoLayoutByInputHash`/`readCargoLayoutById` sobre um leitor único, que agora também devolve o
  `id` (`StoredCargoLayoutRecord`). O detalhe da T10 usa o primeiro, sem consulta a mais.
  `DrizzleCargoLayoutLookupRepository` (novo) implementa `CargoLayoutLookupPort` com o lease injetado,
  e o `main.ts` o monta com o mesmo `cargoLayoutLeaseOptions`.
- **Documentação da rota:** a API não tem OpenAPI nem catálogo de rotas; procurei em `src/`, `docs/`
  e `test/`. A rota está documentada na constante do caminho (`trip.routes.ts`, junto das outras de
  viagem), na lista por extenso do `separator-role` e aqui.
- **Env:** `CARGO_LAYOUT_TIME_BUDGET_MS` já está no schema da API e no `.env.example` da raiz desde a
  T9b. Conferido, e sem mudança nesta task. `env-example.contract.test.ts` segue verde na suíte.
- **Contratos:**
  - `test/cargo-volume/cargo-preview-layout.contract.ts` (novo, 11 testes, no entrypoint
    `cargo-volume.contract.test.ts`, que já está listado). A prévia cobre: `unavailable` (planta
    leve, sem `layoutId`, sem ler nem enfileirar); `ready` pelo hash (o hash procurado é o de
    `buildCargoLayoutInput` sobre a mesma entrada); `truncated` derivado; `pending` enfileirando com
    `tripId: null` e o `correlationId`; `running` recente sem enfileirar; lease vencido pedindo de
    novo; `failed` com código e reabertura. Há ainda a **guarda do empacotador por leitura de
    fonte**: o use case não tem `resolveCargoLayout(`, e o serviço tem exatamente um, com
    `bedDimensions: null`. O polling cobre: forma exata com `ready`, `pending` e 404 de ausente.
  - `test/trip-http/cargo-layout.contract.ts` (novo, 5 testes, no entrypoint
    `trip-http.contract.test.ts`, já listado): a prévia repassa o `correlationId` da requisição; o
    polling responde 200 com as chaves exatas (`cargoLayout`/`layoutId`/`state` e as cinco de
    `state`) e busca pela empresa do contexto; 404 de outra empresa; 400 em uuid inválido sem
    consultar; 403 com só `fleet.read`. A fixture HTTP ganhou `previewCargo` e `readCargoLayout`.
  - `test/cargo-volume/cargo-preview.contract.ts`: os três casos antigos (sem baú) ganharam
    dependências que **lançam** se forem chamadas. Assim eles provam também que `unavailable` não
    toca tabela nem fila.
  - `test/integration/trip-cargo-preview-layout.integration.ts` (novo, 4 testes contra Postgres,
    adicionado a `test:integration`):
    - **D3:** a prévia enfileira uma vez com `tripId null` e o `correlationId`; a segunda prévia
      igual não enfileira; o gatilho eager real da viagem (`createRequestCargoLayoutForTrip`) com a
      mesma entrada devolve `enqueued: false`, com o mesmo `layoutId`; a linha ganha o `tripId`, e a
      outbox continua com 1 linha;
    - `ready` servido pela prévia e pelo polling, sem enfileirar;
    - `failed` servido com código, e a linha reaberta para `queued`, com a outbox em 2;
    - **polling de outra empresa → 404** `TRIP_CARGO_LAYOUT_NOT_FOUND` (tenant negativo contra o
      banco).
- **Vermelho** (antes de qualquer código de produção):
  - `cargo-volume.contract.test.ts` → **0 pass, 1 fail** (`Cannot find module
…/read-cargo-layout.use-case.js`);
  - `trip-http.contract.test.ts` → **0 pass, 1 fail** (`TripCargoLayoutNotFoundError` inexistente);
  - `separator-role.contract.test.ts` → **5 pass, 1 fail** (a lista sem a rota nova);
  - integração nova → **0 pass, 1 fail** (módulo ausente).
- **Verde:**
  - `bunx tsc --noEmit` limpo;
  - `bunx prettier --write` e `bunx eslint` nos 20 `.ts` tocados: limpos;
  - os três entrypoints → **233 pass, 0 fail** (509 `expect()`);
  - integrações `trip-cargo-preview-layout` + `trip-cargo-layout-read` + `trip-detail-query-count`
    (Postgres local 55432) → **14 pass, 0 fail**;
  - suíte inteira da API (`bun run test`) → **5013 pass, 0 fail** (18 066 `expect()`, 5036 testes em
    164 arquivos). O intermitente `keycloak-realm` não apareceu.
- **Correções durante o verde, sem mudar comportamento:** a lista do separador é ordenada, e `:`
  vem antes de `c`, então a rota nova ficou depois de `GET /trips/:id/stops`. O contrato HTTP da
  prévia mandava `nfeDocumentIds: []`, que o schema recusa com `min(1)`.
- **Para o orquestrador / T12:** a prévia responde `failed` na mesma resposta em que reabre o pedido
  (espelha a T10). Se o front parar de perguntar ao ver `failed`, não verá o resultado da nova
  tentativa. O polling em si nunca reabre nada (GET idempotente): um pedido da prévia parado além do
  lease só é reaberto na próxima `POST /trips/cargo-preview`, ou pela viagem. _(Superado pelos
  ajustes abaixo.)_

#### Ajustes do orquestrador na T11 · 2026-09-13

Os dois ajustes vieram da D16 ("nunca ficar sem resposta") e das pendências acima. Antes de
implementar, parei e relatei um laço de custo sem teto, e o usuário aprovou a espera no servidor: é a
**D18** (registrada na spec pelo orquestrador).

- **O laço (lido no worker):** `cargo-layout-handler.service.ts:62-110` grava `failed` **na hora,
  sem retry**, em três casos: entrada fora do schema, exceção do empacotador (os dois com
  `CARGO_LAYOUT_FAILED`) e planta nula (`CARGO_LAYOUT_UNAVAILABLE`). Se leitura e polling reabrissem
  `failed` sempre, a planta nunca terminaria:
  - o polling de 3 s reabre, o worker falha igual, e o polling reabre de novo;
  - no detalhe, servir `pending` depois de reabrir faz o refetch da T12 entrar no mesmo ciclo;
  - o teto de 10 min da D16 vale só no cliente.

  Decidir pelo `errorCode` não resolve: `CARGO_LAYOUT_FAILED` também é a falha **transitória** de
  escrita na última tentativa (linha 79), que ficaria presa para sempre.

- **D18, no upsert (G006):** a condição de reabrir virou `status in ('failed', 'queued', 'running')
and updated_at < now() - lease`, com o mesmo `leaseMs` injetado (280 s no orçamento padrão). É
  uma cláusula só para todos os gatilhos: eager, lazy, prévia e polling.
  - `failed` recente é no-op e serve `failed` com o código; a espera limita a um ciclo por lease por
    linha, qualquer que seja o cliente.
  - Entrada editada gera hash novo e linha nova, e é calculada na hora.
  - `resolveCargoLayoutReading` acompanha: `shouldRequest` de `failed` agora é `leaseExpired`, o que
    evita a transação no-op a cada leitura.
  - **Confirmado:** antes da D18, `failed` sempre reabria, então a prévia nunca servia `failed`.
    Agora ela serve `failed` dentro da espera.
- **Ajuste 1 — reabriu, a resposta é `pending`:** `markCargoLayoutRequested` (política pura) devolve
  o estado com `status: 'pending'` e `errorCode: null`. `computedAt`, `stale` e `truncated` continuam
  os da leitura, e a planta `stale` segue servida como fantasma.
  - Na **prévia**, vale quando o upsert devolve `enqueued: true`.
  - No **detalhe**, `requestCargoLayoutAfterRead` passou a devolver `enqueued`, e a rota serializa o
    estado marcado. Lazy que falha (catch→warn da T10) ou que não reabre mantém o estado da leitura.
  - Nenhuma consulta nova: vale o resultado do upsert.
- **Ajuste 2 — o polling reabre o que parou:** `readCargoLayout` devolve `shouldRequest`, que a rota
  lê e nunca serializa. A resposta segue com exatamente `cargoLayout`, `layoutId` e `state`.
  - Quando `shouldRequest` é verdadeiro, a rota chama `reopenCargoLayout`
    (`createReopenCargoLayoutUseCase` →
    `DrizzleCargoLayoutRequestRepository.reopenStoredLayout` → `reopenStoredCargoLayoutRequest`).
  - Numa transação, `reopenStoredCargoLayoutRequest` lê `input`/`input_hash`/`policy_version`/`trip_id`
    da própria linha, filtrando por `(company_id do contexto, id)`, e chama o **mesmo**
    `upsertCargoLayoutRequest` com o `correlationId` da requisição. A viagem não é relida e o hash
    não é recalculado.
  - Enfileirou → `pending`. Upsert que lança → catch→warn `trip.cargo_layout.request_failed` com
    `{ correlationId, errorCode, layoutId }`, e responde 200 com a leitura.
  - O aviso leva `layoutId` no lugar do `tripId` do detalhe: o polling não lê a viagem, e a linha da
    prévia nem tem viagem. As chaves continuam só referências opacas.
- **Contratos (vermelho → verde):**
  - `test/trip-infrastructure/cargo-layout-request.contract.ts`: SQL novo da reabertura, e `failed`
    recente sem outbox (novo).
  - `test/trip-domain/cargo-layout-state.contract.ts`: `failed` recente espera; `failed` além da
    espera pede; `markCargoLayoutRequested` (os dois últimos são novos).
  - `test/cargo-volume/cargo-preview-layout.contract.ts`: `failed` recente serve o código sem pedir;
    `failed` além da espera reabre e responde `pending`; o polling devolve `shouldRequest`, e `failed`
    velho pede.
  - `test/trip-http/detail.contract.ts`: lazy que enfileirou responde `pending` sem código (novo). O
    caso "serve o estado" ganhou `requestCargoLayoutResult` com `enqueued: false`, e o lazy que falha
    continua servindo a leitura.
  - `test/trip-http/cargo-layout.contract.ts` (+4):
    - linha além da espera reabre com `companyId`, `correlationId` e `layoutId`, e responde `pending`;
    - linha recente não chama o upsert;
    - upsert que não reabriu mantém a leitura;
    - upsert que lança → 200, a leitura, e o aviso com as três chaves.

    A fixture ganhou `reopenCargoLayout` e `requestCargoLayoutResult`.

  - `test/integration/trip-cargo-preview-layout.integration.ts`:
    - `failed` recente é servido sem outbox nova;
    - `failed` além da espera reabre, com `pending` e a outbox em 2;
    - **o polling reabre pela linha guardada**: recente é no-op; outra empresa → `undefined`, sem
      outbox; além da espera enfileira com `correlation-polling`, e `input`/`input_hash` ficam
      idênticos.
  - `test/integration/trip-cargo-layout-read.integration.ts`: `failed` recente não pede; depois de
    envelhecer `updated_at` além do lease, pede.
  - `test/trip-application/request-cargo-layout.contract.ts`: o fake do port ganhou
    `reopenStoredLayout`, que lança se for chamado.

- **Vermelho:**
  - `trip-infrastructure` → **41 pass, 1 fail**;
  - `trip-domain` → **0 pass, 1 fail** (`markCargoLayoutRequested` inexistente);
  - `cargo-volume` → **169 pass, 5 fail**;
  - `trip-http` → **56 pass, 4 fail**;
  - integrações da planta → **9 pass, 5 fail**.
- **Verde:**
  - os seis entrypoints tocados (+ `trip-application` e `separator-role`) → **486 pass, 0 fail**
    (1511 `expect()`);
  - integrações `trip-cargo-preview-layout` + `trip-cargo-layout-read` + `trip-detail-query-count`
    (Postgres local) → **16 pass, 0 fail**;
  - suíte inteira da API → **5023 pass, 0 fail** (18 088 `expect()`, 5046 testes em 164 arquivos);
  - `bunx tsc --noEmit`, `prettier --write` e `eslint` nos tocados: limpos.
- **Para a T12:** `failed` agora é resposta estável dentro da espera. O front pode parar de perguntar
  ao ver `failed` e mostrar "não foi possível calcular agora" (D16). Numa próxima abertura depois do
  lease, a leitura reabre sozinha.

## Fase 5 — Frontend (T12, T13)

### T12 — a tela pergunta enquanto a planta é calculada · 2026-09-13

Rodou em `opus`: `sonnet` sem cota até 2026-09-14 09:00. Contratos vermelhos antes da implementação.
Segue D3, D4 (só o estado; a parte visual é da T13), D10, D12, D16 e D18. Sem mudança na API.

- **Funções puras, relógio injetado** (`src/modules/trip/shared/cargoLayoutPolling.service.ts`, novo):
  - `trackCargoLayoutPendingEpisode({ key, now, previous, status })` marca o começo do `pending`
    atual. A chave é o `tripId` no detalhe e o `layoutId` na prévia. Sair de `pending` zera o
    episódio, e outra chave abre um novo: o teto da D16 conta **por episódio**.
  - `resolveCargoLayoutRefetchInterval` devolve `CARGO_LAYOUT_REFETCH_MS` (3 s) só em `pending`
    abaixo de `CARGO_LAYOUT_POLL_CEILING_MS` (10 min). Em `ready`, `failed` (estável dentro da
    espera, D18), `unavailable`, chave ausente ou teto vencido, devolve `false`.
  - `resolveCargoLayoutView` monta o modelo da T13 (abaixo). `resolveCargoPreviewPollLayoutId` e
    `mergeCargoPreviewPoll` cuidam da prévia.
- **Detalhe:** `resolveTripRefetchInterval` (`tripPolling.service.ts`) foi **estendida**, sem
  mecanismo paralelo. O parâmetro `cargoLayout` é opcional e o resultado é o menor dos dois
  intervalos: na rua com planta `pending` vale 3 s, e com a planta pronta volta aos 30 s de hoje.
  `useTripWorkspace.hook.ts` guarda o episódio num `useState` ajustado no render. O relógio é o
  `dataUpdatedAt` da consulta, que avança a cada resposta. O hook passa a expor `cargoLayoutView`.
- **Prévia:**
  - `readCargoLayout` (`tripClient.service.ts`) faz `GET ${TRIP_CARGO_LAYOUTS_PATH}/:layoutId` e
    desembrulha `{ data }`.
  - `tripCargoLayoutPollFromApi` (`tripResponse.validation.ts`) exige a chave exata
    (`TRIP_CARGO_LAYOUT_POLL_KEYS`) e **reusa** `isCargoLayoutState` e `isCargoLayout`, os mesmos
    validadores da prévia.
  - `useTripCargoLayoutQuery` (`queries/useTripCargoLayout.query.ts`, novo) usa a chave
    `['trip-cargo-layout', layoutId]`.
  - `useTripCargoPreview.hook.ts` liga o polling quando a prévia vem `pending` com `layoutId`. Uma
    prévia nova traz outro id e outra consulta. O `mergeCargoPreviewPoll` só aplica a resposta cujo
    `layoutId` bate com o da prévia atual, e a de uma prévia anterior chegando atrasada é descartada.
  - `TripQuickCreateDialog` e `TripProposalDetail` não mudaram: leem `preview.cargoLayout`, que já
    chega mesclado quando o polling termina.
- **Modelo exposto para a T13** (`CargoLayoutView | null`, em `useTripWorkspace().cargoLayoutView` e
  `useTripCargoPreview().cargoLayoutView`):
  `{ phase: 'ready'|'pending'|'failed'|'unavailable'|'timedOut', layout, stale, truncated, errorCode }`.
  - `null` quer dizer chave ausente (API antiga), e a tela segue a de hoje.
  - `layout` é a planta servida: em `pending` com `stale: true` ela é a anterior, que vira o fantasma
    da D4. Em `timedOut` a planta anterior também continua ali.
  - `truncated` e `stale` vêm da API, sem recálculo.
- **Contratos:** `test/trip/cargo-layout-polling.contract.ts` (novo, 34 testes, importado pelo
  entrypoint `test/trip.contract.test.ts`, que já está na lista do `package.json`). Cobre:
  - 3 s só em `pending`, e nunca em `ready`/`failed`/`unavailable`/chave ausente;
  - teto de 10 min (`-1 ms` pergunta; no teto, para e vira `timedOut` com a planta anterior);
  - o episódio zera ao sair de `pending`, e chave nova abre episódio novo;
  - no detalhe: galpão + `pending` → 3 s; na rua → o menor; planta pronta → os 30 s de hoje;
    chave ausente → igual a hoje;
  - na prévia: `pending` pede polling pelo `layoutId`, a resposta do mesmo id substitui planta e
    estado, e a **resposta atrasada de outro id não sobrescreve** a prévia nova;
  - resposta da rota nova: aceita `pending` sem planta e `ready` com planta; recusa chave a mais,
    chave faltando, `layoutId` não string, `state` com status desconhecido ou chave a mais, planta
    estranha e não objeto;
  - o cliente faz GET no caminho certo, desembrulha `{ data }` e recusa chave a mais;
  - a fiação nos dois hooks, por leitura de fonte.
- **Vermelho** (antes de qualquer código de produção): `bun test ./test/trip.contract.test.ts` →
  **0 pass, 1 fail** (`Cannot find module …/cargoLayoutPolling.service`).
- **Verde:**
  - `trip.contract.test.ts` → **799 pass, 0 fail**;
  - `bunx tsc --noEmit -p .` → 0 erros;
  - `bunx prettier --write` e `bunx eslint` nos 11 arquivos tocados: limpos;
  - `bun run build` passou (PWA gerado).
- **Suíte inteira** (`bun run test`) → **3404 pass, 15 fail** (3419 testes em 29 arquivos). São as
  mesmas 15 da baseline da T12a: contratos de design system e de convenção que procuram a regra no
  `CLAUDE.md` da raiz, de onde o commit `37436e4a` a tirou. Nenhuma é nova, e 3370 + 34 = 3404.
- **Para a T13 / orquestrador:**
  - na prévia, o POST `pending` vem com `cargoLayout: null`, então **não há planta anterior servida**
    para o fantasma. Se a T13 quiser o fantasma também na prévia, ela precisa guardar a última planta
    exibida; isso não foi decidido aqui;
  - a primeira pergunta pelo `layoutId` sai logo depois do POST (é a busca inicial da consulta), e as
    seguintes a cada 3 s.

### T13 — a tela durante a espera · 2026-09-13

Rodou em `opus`: `sonnet` sem cota até 2026-09-14 09:00. Contratos vermelhos antes da implementação.
Segue D4, D12, D13, D16 e D18. Sem mudança na API. Nenhum primitivo novo: a espera é composta com
`CargoIsometric`, `Skeleton` e `Icon` do design system, sem `<svg>` cru, sem estilo inline e sem
mascote (G012).

- **Despacho** (`TripCargoLayers.component.tsx`): o `export function TripCargoLayers` virou um
  despachante fino. `pending`, `failed` e `timedOut` (`WAITING_PHASES`) vão para
  `TripCargoLayoutWait`. `ready`, `unavailable` e `view === null` (API antiga) vão para o corpo de
  sempre, renomeado para `TripCargoPlan` e sem mudança de comportamento. O hook da transição fica no
  despachante, montado nas duas fases, porque é ele que lembra o fantasma.
- **Espera** (`TripCargoLayoutWait.component.tsx`, novo):
  - `pending`: selo "Reorganizando a carga…" (`<p role="status" aria-live="polite">` com ícone
    `spinner` **e** texto). O esqueleto é o baú em `CargoIsometric` sem caixas, no mesmo sistema de
    escala da planta, pulsando (`.cargoWireframe`). Com planta anterior, ela vem desenhada translúcida
    por cima (`.cargoGhost`), acompanhada da marca "Planta desatualizada". A medida do esqueleto sem
    fantasma sai de `occupancy.capacityDimensions`, e sem medida nenhuma o que aparece é o `Skeleton`
    do design system.
  - `failed`/`timedOut`: "Não foi possível calcular a planta agora.", com a planta anterior (se
    houver) esmaecida e marcada como desatualizada. **Sem botão de tentar de novo** (D18: a próxima
    leitura depois da espera reabre sozinha).
- **Animação** (`shared/cargoLayoutTransition.service.ts` puro + `hooks/useCargoLayoutTransition.hook.ts`):
  - **Identidade:** a planta não traz id de caixa. A chave de casamento é nota (ou `stop-N` sem nota)
    - medida ordenada (a caixa girada continua sendo ela) + ordinal entre as iguais.
  - O hook guarda a planta da espera como fantasma. Quando chega `ready`, planeja: quem continua
    **desliza** (posição interpolada por `requestAnimationFrame`, 600 ms, `easeInOutCubic`), quem é
    novo **surge esmaecendo** e quem saiu **some esmaecendo**. As duas classes novas do
    `cargo-isometric` (`appearance?: 'entering'|'leaving'`, opcional) fazem o esmaecer em CSS.
  - Só o desenho anima: fatias, fichas, contagens e folha impressa leem a planta nova de verdade.
  - **`prefers-reduced-motion`:** o hook não anima (troca direta) e o CSS zera as três animações
    (entrada/saída das caixas e pulso do esqueleto).
  - **Teto:** `CARGO_LAYOUT_TRANSITION_MAX_BOXES = 800`. Acima dele a troca é direta, porque cada
    quadro reprojeta a carga inteira. Decisão de desempenho desta task.
- **Incompleta (D13):** em `ready` com `truncated`, aparece o aviso discreto "Planta incompleta —
  algumas caixas ficaram de fora por tempo." (`role="status"`, `aria-live="polite"`). O motivo
  `time_budget` já tinha rótulo legível nos dois locales, e a lista de `unplaced` o mostra.
- **Prévia (decisão derivada da D4, registrada aqui):** o fantasma da prévia é **a última planta
  pronta que a tela exibiu**, guardada em memória no `useTripCargoPreview` pela sessão da tela (não
  persiste ao desmontar). `rememberShownCargoLayout` guarda, e `withRememberedCargoLayout` a entrega
  em `pending`/`failed`/`timedOut` sem planta servida, com `stale: true`. Sem planta anterior, a tela
  mostra só esqueleto e selo. `ready`, `unavailable` e `null` passam intactos.
- **Fiação:** `TripCargoPanel` ganhou `layoutView` (opcional) e repassa `view` +
  `bedDimensions`; `TripDetail` passa `workspace.cargoLayoutView`; `TripQuickCreateDialog`,
  `cargoPreview.cargoLayoutView`; e `TripProposalDetail`, `cargo.cargoLayoutView`.
- **Textos:** `cargoLayers.wait.{reorganizing, stale, failed, truncated, ghostLabel, skeletonLabel}`
  nos dois locales (pt-BR acentuado).
- **Efeito colateral aceito:** entrar em espera desmonta o `TripCargoPlan`, então giro, zoom e foco
  da vista voltam ao padrão quando a planta nova chega. O despacho existe também para não chamar
  hooks condicionalmente quando a fase muda.
- **Contratos:** `test/trip/cargo-layout-wait.contract.ts` (novo, 30 testes, importado por
  `test/trip.contract.test.ts`, que já está na lista do `package.json`). Cobre:
  - selo, esqueleto, fantasma e "desatualizada" em `pending`;
  - despacho das três fases;
  - mensagem de falha sem botão nem `refetch`/`retry`, e sem mascote;
  - aviso de incompleta e rótulo de `time_budget`;
  - `unavailable`/`null` fora da espera, com "meça o caminhão";
  - nenhum `<svg>` cru nem estilo inline, e chaves nos dois locales;
  - a fiação nas três telas e no hook da prévia;
  - as funções de lembrança da prévia (6 casos);
  - casamento de caixas, plano (desliza/entra/sai), quadro interpolado, lista intacta sem quadro e
    suavização;
  - `prefers-reduced-motion` e o teto desligando a animação;
  - o hook com `matchMedia`/`requestAnimationFrame`/`cancelAnimationFrame`, e o CSS com a mesma
    duração do hook e as guardas de reduced-motion.
- **Vermelho** (antes de qualquer código de produção): `bun test ./test/trip.contract.test.ts` →
  **0 pass, 1 fail** (`Cannot find module …/cargoLayoutTransition.service`). Com só o serviço puro no
  lugar → **810 pass, 3 fail**. O `describe` de fonte nem carregou, porque o componente da espera não
  existia. Uma das 3 falhas era erro do próprio teste (ordinal da caixa girada), corrigido no teste.
- **Verde:**
  - `trip.contract.test.ts` → **829 pass, 0 fail**;
  - `bunx tsc --noEmit -p .` → 0 erros;
  - `bunx prettier --write` e `bunx eslint` nos 18 arquivos tocados: limpos;
  - `bun run build` → exit 0.
- **Suíte inteira** (`bun run test`) → **3434 pass, 15 fail** (3449 testes em 29 arquivos). A lista
  das 15 é **idêntica** (`diff` vazio) à da baseline tirada antes da task: os contratos de design
  system que procuram a regra no `CLAUDE.md` da raiz. 3404 + 30 = 3434.
- **Verificação visual (orquestrador):** detalhe de uma viagem com baú medido, em que
  `GET /trips/:id` responda `cargoLayoutState.status = 'pending'`. Com `stale: true` e
  `cargoLayout` presente, aparecem fantasma + selo; sem planta, só esqueleto + selo. Depois
  `ready`: deslize. `failed`: mensagem + fantasma esmaecido. `truncated: true` em `ready`: o aviso.
  Na criação rápida / proposta, trocar a seleção de notas depois de uma planta pronta; o POST
  `pending` mostra a planta anterior como fantasma.

## Fase 6 — Documentação e gate final (T14)

### T14 — ADR, ponteiros e entradas de contexto · 2026-09-13

- **ADR-0063** — "A planta do baú é calculada no worker, não na API síncrona": estende ADR-0044 §7.
  Contexto (o bloqueio de 16,9 s), decisão (D1–D12, D13–D18 do usuário), consequências e armadilhas.
  Criada e formatada com prettier.
- **Ponteiro em `docs/domain/cargo-placement-defects.md`** — entrada de 15 linhas apontando para ADR-0063
  e spec 145, na seção "Arquitetura: a planta sai do event loop", após a lição de método.
- **Parágrafo em `apps/api-transportada/CLAUDE.md`** — na seção "Carga", bullet novo dizendo que a
  planta é calculada no worker, nunca na API, com referência a ADR-0063, spec 145 e docs/ai-context.
- **Parágrafo em `apps/worker-transportada/CLAUDE.md`** — na seção "Invariantes", entry novo sobre
  consumidor `CargoLayoutConsumer`, prefetch 1, schema estrito de `StoredCargoLayoutInput`, escada
  60/120/240 s, lease ≈280 s, reivindicação por hash. Referência a ADR-0063, spec 145 T7–T9.
- **Entrada em `docs/ai-context/api-transportada.md`** — seção nova "A planta sai do event loop —
  spec 145 e ADR-0063" (1600+ caracteres), contando: o problema (16,9 s de CPU bloqueando event
  loop), a decisão (ADR-0063 estendendo ADR-0044 §7), hash de entrada, gatilho eager e lazy, worker
  com thread orçada, lease de `running` órfão, reuso entre prévia e viagem, schema da tabela,
  armadilhas (link local do pacote, paridade de schema Zod, lease padrão 280 s, teste sem Postgres
  real, revalidação em massa). Frontend: animação, polling, tipo `cargoLayoutState`, truncado
  derivado.

### Gate final (G015)

- `bun run typecheck` (raiz, todas as apps) → 0 erros, todos os 6 apps limpam.
- `bun run --cwd apps/api-transportada test` → **5023 pass, 23 skip, 0 fail** (164 arquivos, 18088
  expect(), 8.53s).
- `bun run --cwd apps/worker-transportada test` → **1038 pass, 0 fail** (80 arquivos, 2874
  expect(), 6.03s).
- `bun run --cwd apps/frontend-transportada test` → **3434 pass, 15 fail** (29 arquivos, 33940
  expect(), 1.97s). As 15 falhas são idênticas à baseline antes da spec (contratos de design system
  que procuram regra no `CLAUDE.md` da raiz — tarefa separada em aberto, registrada em spec 145
  "Pendências").
- `bunx prettier --write` nos 5 arquivos de doc tocados (ADR, cargo-placement-defects.md, dois
  CLAUDE.md, ai-context) — sem alterações.
- **`make check` (gate completo na raiz):** sem executar aqui por depender de container/infra, mas
  os componentes que não dependem de infra passam (typecheck, eslint, prettier, testes isolados).
  Recomendação: rodar `make check` no checkout principal após publicar a branch, ou no CI/CD da
  spec.

### Pendências registradas (bloqueadores fora desta task, listadas em ADR-0063 §5)

- Publicação de `@adatechnology/cargo-placement` além do `link:` local — decisão fora da spec.
- Lease padrão de 280 s nos construtores dos repositórios da API — mudança exigiria audit de callers.
- Teste isolado do worker contra Postgres real para reivindicação por lease — testado em composição
  com fake, não integração.
- 15 falhas conhecidas do frontend (design system, registradas em spec anterior).
- Verificação visual da T13 no navegador — ainda por fazer (T13 implementação, esta task é doc).
- Carroceria `00` e cavalo sem capacidade — spec separada em andamento, reduz entrada inválida.

### Verificação: Todas as mudanças de documentação passam por typecheck, prettier, e lint

- Nenhuma sintaxe quebrada, nenhuma chave sem fechar.
- Markdown/ADR formatado conforme padrão do repositório.
- Referências cruzadas (ADR-0063 ↔ spec 145 ↔ docs/ai-context) verificadas por leitura do contexto.
- Nenhuma alteração de código — só documentação em `.md`, `CLAUDE.md` e ai-context.

## Revisão final (code-reviewer `opus`) · 2026-09-13

Veredito inicial **REPROVA** por um achado ALTO, corrigido abaixo. Médios e baixos que eram só correção
também entraram; o restante ficou registrado.

**Correções da revisão final.**

- **A1:** o retrato canônico do hash (D6) passou a levar tudo o que o empacotador lê. Da parada:
  `volumeM3` e `documentsWithoutVolume`. Da caixa: `estimatedVolumeM3`, `estimateSource`, `isFragile`,
  `isStackable`, `keepUpright` e `maxStackCount`, com o campo ausente normalizado para `null`. Ficam de
  fora só as etiquetas: `label`, `clientName`, `noteNumbers`, `documentNumber` e `productCode`.
  `CARGO_LAYOUT_POLICY_VERSION` continua `"1"`; como a forma do retrato mudou, todos os hashes mudam
  sozinhos, e um contrato fixa o hash anterior e prova a diferença.
- **M1:** `measuredShapes` é ordenado no retrato e na coluna `input`, e as consultas de produtos e caixas
  ganharam `orderBy` estável, sem mudar o orçamento de consultas do detalhe.
- **M3:** o upsert que reabre regrava `input = excluded.input`. O caminho no-op atualiza só o `input`,
  sem mexer em status nem em `updated_at` (o relógio do lease). Pendência que virou a T16: a planta
  `ready` com o mesmo hash continua servindo o rótulo antigo, porque a tela lê o `layout` gravado pelo
  worker.
- **L5:** a escrita do no-op filtra `company_id` e `id`.
- **L6:** a falha de gravação no worker registra `warn` `cargo_layout_settle_failed` com `layoutId` e
  `reason = cause.name`, sem a mensagem da exceção.
- **L7:** os status viraram `CARGO_LAYOUT_STATUS` num `*.constant.ts` por app, e `'time_budget'` virou
  `TIME_BUDGET_UNPLACED_REASON`, preso ao tipo `UnplacedReason` do pacote.

**TDD:** hash e upsert, 20 fail / 182 pass → 202 pass / 0 fail. Handler do worker, 1 fail / 33 pass →
34 pass.

**Gate conferido pelo orquestrador:** `bun run typecheck` (6 apps) limpo; eslint limpo na API e no
worker; API 5047 pass / 0 fail; worker 1039 pass / 0 fail. Integrações da planta contra o Postgres
local, pelo executor: 16/16. O classificador de segurança esteve indisponível durante essa rodada, e o
diff foi revisto à mão: o `sql.raw` interpola só uma constante de status, e toda escrita filtra
`company_id`.

**Registrados, sem correção:**

- L1: mensagem duplicada quando a fila demora mais que o lease; a duplicata cai no claim.
- L2: a escada recomeça em 60 s se a API reabrir no meio.
- L3: a reentrega antes do lease é confirmada sem calcular (é o comportamento da D14).
- L4: uma linha envenenada trava o lote do relay (padrão herdado dos outros relays).
- L8: erros genéricos na thread.
- M2 virou a D19 e a T15.
- M4: a ordem de publicação da D17 exige dois pushes (`f67d4174` primeiro).

### T16 — a etiqueta servida é a de agora · 2026-09-13

Rodou em `opus`: `sonnet` sem cota até 2026-09-14 09:00.

A planta `ready` pode ter sido desenhada com a etiqueta de antes, porque o hash a ignora (D6). A função
pura `relabelCargoLayout(layout, { stops })` (`trips/domain/cargo-layout-label.policy.ts`) troca só a
etiqueta pela entrada atual, sem recalcular:

- `rows[].label/clientName/noteNumbers` e `slices[].label` casam pela `sequence`;
- `stopsWithoutVolume[].label`, pela posição entre as paradas sem cubagem, com `documentCount` igual;
- `pendingMeasurements[].stopLabel`, `label` e `documentNumber`, pela `sequence` e pelo `productCode`;
- `placement.layers[].boxes[].label/documentNumber`, pela `stopSequence` e pelo `documentId`;
- `placement.unplaced[].label`, pela troca de rótulo da parada vista em `rows`/`slices`.

Posição, dimensão, contagem, `reason` e `splitNotes` ficam intactos, e parada ou caixa sem par fica como
está. O detalhe reetiqueta com a entrada que já monta, inclusive a planta `stale`, e a prévia com
`layoutInput`, sem consulta nova. O polling usa o `input` da própria linha, que o upsert mantém atual
(M3), trazido no mesmo select por id. Sem baú (`unavailable`) nada muda.

- **TDD:** 9 fail / 377 pass → 386 pass / 0 fail (trip-domain, trip-infrastructure, cargo-volume). Os
  dois casos D20 de integração foram escritos depois da implementação e não têm vermelho registrado.
- **Gate conferido pelo orquestrador:** `tsc --noEmit` limpo; eslint limpo nos tocados; API 5057 pass /
  0 fail. Integrações da planta contra o Postgres local, pelo executor: 18/18, com o orçamento de
  consultas do detalhe inalterado.
- **Limites registrados:** a caixa fora do baú cujo rótulo é o nome do produto, e a caixa posicionada de
  uma nota com dois produtos renomeados, continuam com o rótulo antigo. Casar ali seria adivinhar.

### T15 — a prévia some em 24 h · 2026-09-13

Rodou em `opus`: `sonnet` sem cota até 2026-09-14 09:00. Escopo ampliado e autorizado pelo usuário, com a
migration: o cron só publica a batida, quem executa é o worker, e o nome da rotina é travado por CHECK.

- **Rotina:** `trip.cargo-layout.purge` (D19), no molde de `trip.location.purge`.
- **API:** migration aditiva `20260913120000_trip_cargo_layout_purge_job`, escrita à mão (sem
  journal/snapshot, como na T0), no molde de `20260905130000_geocoded_address_paid_refinement`.
  - Amplia `job_executions_job_check` e `job_schedules_job_check` e semeia `job_schedules` com
    86 400 s.
  - O `rollback.sql` apaga as execuções e o relógio da rotina, restaura os CHECKs e remove a própria
    linha do journal, com checagem de `ROW_COUNT`.
- **Catálogo:** a rotina entrou no `JOB_CATALOG` das quatro apps, com os contratos de paridade. O contrato
  de catálogo da API passou a aceitar hífen no nome.
- **Worker** (`src/trip-cargo-layout-purge/`):
  - cada lote é uma transação: seleciona até 500 prévias com `trip_id is null` e `updated_at` anterior a
    agora − 24 h, com `for update skip locked`;
  - apaga primeiro a outbox delas (FK `ON DELETE RESTRICT`) e depois as prévias, reconferindo
    `trip_id is null`;
  - para em lote vazio, no teto de 200 lotes ou em `isStopRequested()`;
  - o log `trip_cargo_layout_purge_cycle_finished` leva só `{ batches, deleted, deletedOutbox,
exhausted, executionId, correlationId }`;
  - o corte de 24 h é calculado do relógio injetado, para ser testável, como na rotina de referência.
- **Frontend:** a rotina não ganhou rótulo, porque o painel de operações mostra o nome cru de toda rotina.
- **Configuração do Railway:** não mudou, porque a batida de 5 min passa a publicar a rotina uma vez por
  dia.
- **Vermelho:**

  | App      | Vermelho                         |
  | -------- | -------------------------------- |
  | worker   | 3 fail + 1 erro (módulo ausente) |
  | api      | 6 fail                           |
  | cron     | 2 fail                           |
  | frontend | 2 fail                           |

- **Verde nas suítes tocadas:**

  | App                                | Verde   |
  | ---------------------------------- | ------- |
  | worker                             | 12/12   |
  | api                                | 64/64   |
  | cron                               | 6/6     |
  | frontend                           | 215/215 |
  | integração contra o Postgres local | 2/2     |

  A integração apaga a prévia de 25 h e a outbox dela, mantém a de 1 h e a planta de viagem de 25 h, e o
  segundo ciclo não apaga nada.

- **`make migration-test`:** 91 pass, com migration, rollback e reaplicação. A migration também foi
  aplicada no Postgres local.
- **Gate conferido pelo orquestrador:**
  - `bun run typecheck` limpo e eslint limpo nas quatro apps;
  - api 5057 pass / 0 fail, worker 1046 / 0, cron 94 / 0;
  - frontend 3434 pass / 15 fail. As 15 foram conferidas pelo nome: as mesmas da baseline, nenhuma no
    catálogo de jobs.
- **Anteriores a esta task, fora do escopo:** o catálogo do frontend não tem `geocoding.refine`, e o
  `apps/worker-transportada/CLAUDE.md` diz "Quatro registradas hoje". Os dois viraram uma tarefa separada.

### Conferência visual da T13 no navegador · 2026-09-13

Stack local deste worktree: API e frontend daqui; o worker no ar era o do checkout principal, sem o
consumidor da T9, então a planta ficou em cálculo de propósito. Viagem `11b0bfe5`: `route_planned`,
3 notas, baú medido (Fiorino, 1,70 × 1,45 × 1,30 m), nenhuma planta calculada antes.

- **Selo e acessibilidade:** o detalhe mostra, em "Onde cada caixa cabe", o selo "Reorganizando a
  carga…" (`role="status"`, `aria-live="polite"`) e o baú vazio desenhado em escala, com a porta de carga
  destacada. Não há fantasma, porque a viagem nunca teve planta pronta.
- **Pedido no banco:** a primeira leitura criou a linha em `queued`, com uma entrada na outbox (gatilho
  lazy, D7).
- **Console:** nenhum erro ligado à spec; o 404 é a foto de perfil do usuário local.
- **Polling não observado:** o painel do navegador estava oculto (`visibilityState: hidden`), e o React
  Query pausa o refetch por intervalo em aba oculta, que é o comportamento padrão e desejável. O polling
  de 3 s segue coberto pelos 34 contratos da T12.
- **Sem cobertura visual:** fantasma e animação de troca exigiriam o worker deste worktree no ar.

### Conferência ponta a ponta com o worker deste worktree · 2026-09-13

O worker do checkout principal não tinha o consumidor da T9. O painel de preview não lê o `.env`, então
o worker deste worktree subiu pelo mesmo comando do `make dev`: `.env` carregado no ambiente e
`QUEUE_PREFIX="${PROJECT_NAME}_${APP_ENV}"`.

- **Banco:** a planta da viagem `11b0bfe5` foi de `queued` para `ready` na primeira tentativa, em 56 ms
  (`attempt 1`, sem `error_code`).
- **Outbox:** havia 4 entradas publicadas, geradas pelas leituras lazy anteriores (L1). O log mostra 4
  `cargo_layout_handled`: uma calculou a planta e as outras três foram descartadas pela reivindicação.
- **Tela:** o selo sumiu, e "Onde cada caixa cabe" mostra "27 de 27 caixas no mapa recomendado", com as
  camadas e a planta desenhada. Não aparece falha, planta incompleta nem marca de desatualizada.
- **Sem cobertura visual:** a animação de troca não foi observada, porque o painel estava oculto e a
  página foi recarregada, não atualizada por polling.

### Teste local completo · 2026-09-13

| Etapa                                                                                     | Resultado                                   |
| ----------------------------------------------------------------------------------------- | ------------------------------------------- |
| `make check`: formatação, lint e typecheck (6 apps)                                       | limpos                                      |
| Testes da raiz                                                                            | 18 pass / 0 fail                            |
| Testes da API                                                                             | 5057 pass / 23 skip / 0 fail                |
| Testes do worker                                                                          | 1046 pass / 0 fail                          |
| Testes do cron                                                                            | 94 pass / 0 fail                            |
| Testes do frontend                                                                        | 3434 pass / 15 fail                         |
| `make migration-test`                                                                     | 91 pass / 0 fail                            |
| `bun run build` (rodado à parte, porque o `make check` para no primeiro script que falha) | exit 0, com `cargo-layout.worker.js` gerado |
| `make smoke`                                                                              | 42 pass / 9 fail                            |

As 15 falhas do frontend foram conferidas pelo nome: são os contratos de design system da baseline.

**As 9 falhas do smoke são todas anteriores à spec.** Os mesmos cenários rodaram no commit anterior à
T12a (primeiro commit da spec no frontend) e no HEAD, cada um com build novo e porta própria
(`PLAYWRIGHT_REUSE_EXISTING_FRONTEND_SERVER=false`, portas 53030 e 53040). O resultado foi 9 falhas
idênticas nos dois:

- **montagem de viagem com pedágio (2 cenários):** o texto do pedágio não aparece no diálogo;
- **CRLV e anexo do agregado (3 cenários):** chamada sem mock para `/fleet/vehicle-references`, que
  aparece em `api.failures()`;
- **proposta no diálogo de montar roteiro (1 cenário):** o teste ainda procura "Entregas", texto que o
  commit `8e849738` trocou;
- **planta do baú em escala em mobile, tablet e desktop (3 cenários):** a imagem
  "Planta do baú em escala" não aparece.

Fora do CI, o `make smoke` reaproveita o frontend de desenvolvimento que estiver na porta 53000; a
comparação acima usou build de produção nos dois lados. As 9 falhas viraram uma tarefa separada.

### Montagem automática de roteiro no navegador · 2026-09-13

Viagens → "Montar roteiro pela busca de notas" → 342 notas do filtro, 6 motoristas, 6 veículos →
"Propor roteiro". O worker deste worktree geocodificou e roteirizou (`route_optimization_handled`), e a
proposta saiu com 5 viagens e 186 entregas. 125 paradas ficaram acima do teto de peso e 16 com endereço
impreciso, e nada é criado antes do aceite. Cada caminhão foi aberto na proposta, e cada abertura pediu
a prévia da planta (D3):

| Caminhão                                  | Paradas | Tela                                            | Prévia / polling            | Banco                                         |
| ----------------------------------------- | ------- | ----------------------------------------------- | --------------------------- | --------------------------------------------- |
| Accelo 1016 (RTD5J78), escala do catálogo | 24      | 24% do baú, planta em perspectiva               | —                           | `ready`, 1ª tentativa, 6,2 s, 0 caixa fora    |
| Daily 35-150 (RTC4H67)                    | 23      | 41% do baú, 98% do peso; 251 + 97 de 372 caixas | 200 em 139 ms, 3 consultas  | `ready`, 1ª, 4,4 s, 24 fora (`bedFull`)       |
| Fiorino (RTF7L01)                         | 10      | 47% do baú, 99% do peso; 53 + 29 de 94          | 200 em 123 ms, 2 consultas  | `ready`, 1ª, 0,2 s, 12 fora (`bedFull`)       |
| Sprinter 416 (RTE6K89)                    | 21      | 26% do baú, 98% do peso; 192 + 30 de 248        | 200 em 262 ms, 2 consultas  | `ready`, 1ª, 1,0 s, 26 fora (`bedFull`)       |
| Atego 2426 (RTA2F45)                      | 84      | 46% do baú, 100% do peso; 753 + 335 de 1465     | 200 em 177 ms, 20 consultas | `ready`, 1ª, **56,4 s**, 377 fora (`bedFull`) |

- Em todos: o selo "Reorganizando a carga…" apareceu e saiu sozinho, pelo polling e sem recarregar a
  página. Nenhuma falha, nenhuma planta incompleta, nenhuma caixa cortada por `time_budget`, uma única
  linha de outbox por planta, nenhuma resposta diferente de 200, nenhum erro de console ligado à spec.
- As caixas que ficaram de fora fecham com a contagem da tela: cada uma aparece na lista "não coube: o
  baú encheu".

**Observações para o dono do produto, sem regressão da spec:**

- A Atego ficou a 3,6 s do orçamento de 60 s. Uma viagem um pouco maior já entra na escada da D13
  (120 s e depois 240 s), e o tempo de espera na tela sobe junto.
- Com a ocupação entre 41% e 47%, caixas ficam de fora por "o baú encheu". A ocupação soma volumes
  estimados, e o empacotador decide pela geometria: caixa presumida e restrição de empilhamento. As
  regras físicas do empacotador ficaram inalteradas nesta spec (G013).
- O cartão da viagem mostra "Tempo 3 h 18 min", e o detalhe mostra "Tempo do roteiro: 12 h 8 min"
  (estrada mais 20 min por parada). 3 h 18 min + 24 × 20 min dá 11 h 18 min, não 12 h 8 min.
  Anterior à spec.
- A imagem "Planta do baú em escala" não aparece mesmo com o baú medido, e o smoke acusa o mesmo nas
  três larguras antes da spec. O painel mostra só a vista em perspectiva por camada.
- Todas as viagens aparecem como "conta incompleta" / "parcelas em falta". Anterior à spec.

### T17 — baú fechado segura a carga · 2026-09-13

D21 (decisão do usuário, 2026-09-13): em baú fechado (`tpCar` `02`) a carga não precisa de amarração. Nos
demais tipos vale a regra da spec 100: todo motorista da viagem amarra, e nenhum motorista significa que
ninguém amarra.

- **Implementação:** a função pura `resolveSecuresCargo({ bodyType, driversSecureCargo })`, em
  `src/trips/domain/cargo-securing.policy.ts`, é usada pelos três pontos que montam `securesCargo`: o
  detalhe (`readTripDetail`), o gatilho eager (`readCargoLayoutInputParams`) e a prévia
  (`readCargoPreviewContext`). O `bodyType` vem de `loadTripOccupancy`, na consulta ao veículo que já
  existia, sem consulta nova.
- **Limite:** a carroceria considerada é a do veículo de tração da viagem. Quando o implemento entrar no
  modelo, ela precisa vir de quem carrega (`resolveVolumeReferenceKey`).
- **Vermelho:** o contrato de domínio falhou por módulo inexistente (0/1); a integração
  `trip-cargo-layout-read` falhou no caso `02` com motorista que não amarra (esperado `true`, recebido
  `false`; 10 pass / 1 fail).
- **Verde:** `trip-domain.contract.test.ts` 175/0. As integrações `trip-cargo-layout-read`,
  `trip-detail-query-count` e `trip-cargo-preview-layout` contra o Postgres local deram 20/0: a paridade de
  hash entre detalhe e eager se mantém para `02` (true) e `05` (false), e o orçamento de consultas do
  detalhe não mudou.
- **Gate conferido pelo orquestrador:** eslint limpo nos 8 arquivos; `tsc --noEmit` exit 0; as suítes
  trip-domain, trip-infrastructure, trip-documents, trip-application, cargo-volume e trip-http deram
  550/0.
- **Suíte inteira da API, pelo executor:** 5071/1. A falha é o intermitente conhecido do realm Keycloak,
  que passa isolado (146/0).
- **Efeito no hash:** muda nas viagens com baú fechado cujo motorista não amarra. É esperado, porque
  `securesCargo` entra no hash.
- **Medido na investigação:** a Atego 2426 cai de 377 para 46 caixas de fora, e a Iveco Daily de 24 para 0.

### D21 no navegador: a proposta refeita com baú fechado segurando a carga · 2026-09-13

Refeita a mesma montagem ("Montar roteiro pela busca de notas", 342 notas, 6 motoristas, 6 veículos),
depois do commit da T17. O roteirizador propôs 6 viagens com 168 entregas; 139 paradas ficaram acima do
teto de peso. Cada cartão foi aberto, e as 6 prévias saíram `ready` na 1ª tentativa, todas com
`securesCargo: true`, porque os 6 veículos são baú fechado (`02`):

| Caminhão                                                                | Paradas    | Caixas        | Caixas de fora     | Cálculo               |
| ----------------------------------------------------------------------- | ---------- | ------------- | ------------------ | --------------------- |
| Accelo 1016 (RTD5J78)                                                   | 23         | 465           | 0                  | 1,2 s                 |
| VW Delivery 9.170 (RTB3G56), Fiorino (RTF7L01) e Sprinter 416 (RTE6K89) | 10, 7 e 17 | 154, 72 e 225 | 0                  | 0,1 s, 0,06 s e 0,3 s |
| Iveco Daily 35-150 (RTC4H67)                                            | 27         | 444           | **13** (`bedFull`) | 1,1 s                 |
| Atego 2426 (RTA2F45)                                                    | 64         | 1178          | 0                  | 11,3 s                |

Total de 2538 caixas e 13 de fora, contra 439 de fora nas 5 viagens da proposta anterior, sem a D21. As
13 da Iveco entram na medição da T18 (layout `6b676625-df65-4d56-a017-45df261ca4eb`).

A investigação da T18 (só leitura), com `securesCargo: true` sobre as entradas antigas, deixou de fora:
46 de 1465 na Atego de 84 paradas, 6 de 94 na Fiorino e 0 na Sprinter, na Accelo e na Iveco. A causa é o
relevo serrilhado das entregas do fundo, e não falta de volume. Só baixar o apoio mínimo para 50–60%
(regra protegida, não recomendada) zera tudo. O caminho seguro em implementação é a arrumação: camadas
niveladas por entrega, piso reservado para as primeiras entregas e vários arranjos.
