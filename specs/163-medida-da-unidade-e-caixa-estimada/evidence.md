# Evidência — 163

## T001 — `package-box-estimate.policy.ts` (CA01, CA02)

- Vermelho: `bun test ./test/package-box-estimate.contract.test.ts` → 0 pass, 1 erro (módulo inexistente).
- Verde: mesmo comando → **8 pass, 0 fail** (CA01: Lux 60×90×30, 24 un., 85 g → `188×188×128`,
  `2x2x6`, 4 524 cm³, 2 142 g; CA02: `unitsPerBox` 1/0/ausente e unidade incompleta → `undefined`).
- `test-registry.contract.test.ts` verde (entrypoint novo na lista explícita do `package.json`);
  `bun run typecheck` verde; eslint/prettier sem apontamento nos arquivos novos.
