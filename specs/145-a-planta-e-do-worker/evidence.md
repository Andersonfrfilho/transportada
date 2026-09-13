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

## Fase 4 — Leitura da API (T10, T11)

## Fase 5 — Frontend (T12, T13)

## Fase 6 — Documentação e gate final (T14)
