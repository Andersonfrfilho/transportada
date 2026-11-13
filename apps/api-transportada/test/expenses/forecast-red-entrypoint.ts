/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.1: contratos VERMELHOS da previsão (CA12) e do fora do padrão (CA13), de propósito fora de
 * `expenses.contract.test.ts` e da lista `test` do `package.json` para o CI de staging não ficar vermelho.
 * A T6.2 os implementa e os move para `test/expenses.contract.test.ts`.
 * Rodar: `bun --env-file=../../.env.test test ./test/expenses/forecast-red-entrypoint.ts` (de `apps/api-transportada`).
 */
import './forecast.contract.js'
import './out-of-pattern.contract.js'
