/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.2: contratos vermelhos do rateio (CA06 a CA10). Fora da lista `test` do `package.json` de propósito, para o
 * CI de staging não ficar vermelho: a T4.4 (`allocation.contract.ts`) e a T4.5 (`result*.contract.ts`) passam as suas
 * linhas para `test/expenses.contract.test.ts` quando ficarem verdes, e este arquivo some com a última.
 * Rodar: `bun test ./test/expenses/allocation-red-entrypoint.ts` (de `apps/api-transportada`).
 */
import './allocation.contract.js'
import './result.contract.js'
import './result-routes.contract.js'
