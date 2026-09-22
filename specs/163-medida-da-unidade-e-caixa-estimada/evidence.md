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
