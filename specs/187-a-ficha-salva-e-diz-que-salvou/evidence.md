# Evidência — 187

25/09/2026:

- T001: `driver coverage response from the API` vermelho (2 falhas) antes; depois
  `bun test test/fleet.contract.test.ts` — 574 pass, 0 fail
- T002: `rejected request fields in the log` vermelho (1 falha) antes; depois
  `bun test test/observability.contract.test.ts` — 37 pass, 0 fail
- `bun run lint` — exit 0; `bun run typecheck` — exit 0 (após ajuste de tipo no contrato novo)
- `bun run --cwd apps/frontend-transportada test` — 5255 pass + 51 pass (hooks), 0 fail
- api `bun --env-file=../../.env.test test --timeout 120000` — 7283 pass, 0 fail
- Causa confirmada no navegador de staging: `GET /fleet/drivers/f5fafaad…/regions` devolve
  `"city":"","state":""` em `scope: "region"`
