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
