/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.2: contratos vermelhos do resultado (CA06 a CA10). Fora da lista `test` do `package.json` de propósito, para
 * o CI de staging não ficar vermelho: a T4.4 já passou `allocation.contract.ts` (verde) para
 * `test/expenses.contract.test.ts`; a T4.5 passa `result*.contract.ts` quando ficarem verdes, e este arquivo some.
 * Rodar: `bun test ./test/expenses/allocation-red-entrypoint.ts` (de `apps/api-transportada`).
 */
import './result.contract.js'
import './result-routes.contract.js'
