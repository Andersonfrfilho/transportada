/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.1: contratos VERMELHOS de CA14 e CA15, de propósito fora da lista `test` do `package.json`
 * (a CI de staging não fica vermelha). A T7.4 move `reminders.contract.ts` e a T7.4b move
 * `reply-settlement.contract.ts` para `test/expenses.contract.test.ts` quando ficarem verdes.
 *
 * Rodar: bun --env-file=../../.env.test test ./test/expenses/reminders-red-entrypoint.ts
 */
import './reminders.contract.js'
import './reply-settlement.contract.js'
