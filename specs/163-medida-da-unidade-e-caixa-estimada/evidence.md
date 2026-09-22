# Evidência — 163

## T001 — `package-box-estimate.policy.ts` (CA01, CA02)

- Vermelho: `bun test ./test/package-box-estimate.contract.test.ts` → 0 pass, 1 erro (módulo inexistente).
- Verde: mesmo comando → **8 pass, 0 fail** (CA01: Lux 60×90×30, 24 un., 85 g → `188×188×128`,
  `2x2x6`, 4 524 cm³, 2 142 g; CA02: `unitsPerBox` 1/0/ausente e unidade incompleta → `undefined`).
- `test-registry.contract.test.ts` verde (entrypoint novo na lista explícita do `package.json`);
  `bun run typecheck` verde; eslint/prettier sem apontamento nos arquivos novos.

## T002 — `package-box-unit-sanity.policy.ts` (CA03, CA04)

- Vermelho: `bun test ./test/package-box-estimate.contract.test.ts` → erro de módulo inexistente.
- Verde: mesmo comando → **19 pass, 0 fail**. CA03: aresta 2160 mm → `UNIT_EDGE_OUT_OF_RANGE`
  (faixa 5–1500 mm, inteiro), peso ≤ 0 → `UNIT_WEIGHT_NOT_POSITIVE`. CA04: caixa com volume
  menor que 24 × unidade → `VOLUME_BELOW_CONTENT`; peso bruto abaixo → `GROSS_WEIGHT_BELOW_CONTENT`
  (tipos extraídos de `PackageBoxCatalogSanityRejectionCode` da 160, sem código novo para a conferência).
- Políticas da 160 (`-catalog-sanity`, `-consensus`) intocadas. Typecheck, eslint e prettier verdes.

## T003 — `package-box-cubage-dimensions.policy.ts` (RF07)

- Vermelho: `bun test ./test/package-box-estimate.contract.test.ts` → erro de módulo inexistente.
- Verde: **24 pass, 0 fail**. Real vence estimada; real incompleta cai na estimada (`isEstimated: true`);
  nenhuma das duas → `undefined`; leitor sem campos de estimativa só vê a medida real.
- Typecheck, eslint e prettier verdes.

## T004 — Migration aditiva RF01 + schema TS

- `bun run db:generate --name package_box_unit_and_estimate` → `drizzle/20260922140709_package_box_unit_and_estimate/`
  (12 `ADD COLUMN` nulas + 4 CHECKs: unidade 5–1500 mm e peso > 0; origem `typed|catalog|manual:%`;
  estimada 20–2500 mm, volume/peso > 0; estimativa "três arestas + data ou nada"). Sem ENUM.
- Segundo `bun run db:generate` → `{"status":"no_changes"}`.
- `rollback.sql` escrito à mão. Contra Postgres 18 nativo (`127.0.0.1:56998/s163`): migrate → 13 colunas
  `unit%`/`estimated_%` (12 novas + `units_per_box`); rollback → 1; reaplicação → 13.
- `make migration-test` usa o Postgres do Docker (quebrado localmente); rodado o mesmo alvo direto:
  `DRIZZLE_TEST_DATABASE_URL=postgres://test@127.0.0.1:56998/s163mt bun --env-file=../../.env.test run db:test`
  → **110 pass, 0 fail** (inclui `database-migration.contract.test.ts` com a lista explícita atualizada).
- `test/nfe-schema/package-boxes.contract.ts`: lista de colunas atualizada; a regra "sem coluna de
  volume" passa a valer para a medida real (a caixa estimada guarda `estimated_volume_cm3`, RF01).
- Contratos da API completos: **6858 pass, 9 fail** — as 9 são as pré-existentes do
  "toll booth catalog repository" (dependem do Docker). Typecheck verde.

## T005 — `record-package-box-unit.use-case.ts` + `DrizzlePackageBoxUnitRepository`

- Vermelho: `bun test ./test/package-box-estimate.contract.test.ts` → erro de módulo inexistente
  (`test/package-box-estimate/record-unit.contract.ts`, repositório falso).
- Verde: **31 pass, 0 fail**. Cobre: grava unidade + estimativa `2x2x6` com `estimatedAt`; **RNF02** —
  o objeto que chega ao repositório não tem `lengthMm/widthMm/heightMm/measurementSource`;
  `unitsPerBox` informado recalcula; `unitsPerBox = 1` → estimativa `null`; estimativa fora de
  20–2500 mm (1×1×97) não é gravada; CA03 2160 mm → 422 `UNIT_EDGE_OUT_OF_RANGE` sem gravar;
  empresa alheia → `PackageBoxNotFoundError`.
- Repositório: `SELECT … FOR UPDATE` e só escreve `estimated_*` quando `length_mm` é nulo; nenhum
  `set` toca a medida real. Provado contra Postgres na T006.
- Typecheck, eslint e prettier verdes.

## T006 — Integração CA05, CA06

- `test/integration/package-box-unit-estimate.integration.ts` (na lista explícita de `test:integration`).
- De `apps/api-transportada`, Postgres 18 nativo (o do Docker está quebrado localmente):
  `U=postgres://test@127.0.0.1:56998/s163; DRIZZLE_TEST_DATABASE_URL=$U API_TEST_DATABASE_URL=$U DATABASE_URL=$U bun --env-file=../../.env.test test --timeout 120000 ./test/integration/package-box-unit-estimate.integration.ts`
  → **3 pass, 0 fail, 26 expects**.
  - CA05: depois da unidade, `length_mm/width_mm/height_mm/measured_at/measurement_source` seguem
    `null` e `estimated_*` = 188×188×128, 2x2x6, 4 524 cm³, 2 142 g; cubagem → estimada. Medida real
    via `DrizzlePackageBoxRepository.measure` → cubagem lê a real (`isEstimated: false`), estimativa
    preservada; nova unidade depois disso não recalcula a estimativa nem toca a medida.
  - CA06: `companyId` de outra empresa → `PackageBoxNotFoundError`, e `saveUnit` direto devolve `false`
    sem gravar nada.
  - CA03 contra o banco: 2160 mm → `PackageBoxUnitRejectedError`, nada gravado.

## T007 🧠 — Pontos de consumo da cubagem

- Mapeamento isolado primeiro (commit `docs(spec)`, tabela "Pontos de consumo" no `plan.md`): um único
  leitor de dimensão para cubagem (`trips/infrastructure/trip-occupancy.support.ts`, `loadMeasuredItems`);
  worker não lê dimensão de `nfe_package_boxes`; fila, réplica, exportação e guarda da importação
  ficam só com medida real.
- Troca: `loadMeasuredItems` lê `estimated_*` e resolve cada linha por `resolveCubageBoxRow` →
  `resolveBoxDimensionsForCubage`; nota com caixa estimada `measured` → `partial`
  (`markDocumentsWithEstimatedBoxes`); mediana e formas medidas continuam só com medida real.
- Vermelho: `test/package-box-estimate/cubage-consumer.contract.ts` → erro de export inexistente.
  Verde: `bun test ./test/package-box-estimate.contract.test.ts` → **37 pass, 0 fail**.
- Integração (Postgres nativo): `package-box-unit-estimate.integration.ts` → **4 pass, 0 fail**
  (novo caso: `loadTripOccupancy` desenha 2 caixas 188×188×128, m³ `0.009048`, ocupação `partial`,
  sem entrar na mediana; depois da medida real, 190×185×130, `0.009140`, `measured`). Texto do m³
  conferido contra o Postgres: `select round((190::numeric*185*130)/1000000000, 6)` → `0.004570`.
- Regressão das consumidoras de `loadTripOccupancy`: `trip-cargo-layout-read`, `trip-cargo-preview-layout`,
  `trip-detail-query-count`, `trip-document-review`, `mixed-cargo-end-to-end`, `trip-repository`
  → **42 pass, 0 fail**.
- Contratos da API: **6871 pass, 9 fail** (as 9 pré-existentes do toll booth). Typecheck, eslint verdes.
