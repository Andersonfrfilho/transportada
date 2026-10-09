/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor** da trava de `api-transportada/src/business-calendar/infrastructure/business-calendar-lock.support.ts`
 * (a derivação do identificador é cobrada linha a linha por `test/holiday-provider-pull/apply.contract.ts`).
 * Uma escrita do calendário por empresa de cada vez: a aplicação e as rotas da 238 (desligar, restaurar,
 * apagar, adotar) leem e escrevem as mesmas linhas, e `FOR UPDATE` não trava linha que não existe —
 * sem a trava, um desligar do operador que comita entre a leitura da supressão e o `INSERT` da rotina
 * deixaria a data voltar.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export type BusinessCalendarTransaction = Pick<Database, 'execute'>

export async function buildBusinessCalendarLockId(companyId: string): Promise<bigint> {
  const encoded = new TextEncoder().encode(JSON.stringify(['business-calendar', companyId]))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const lockId = new DataView(digest).getBigInt64(0, false)
  return lockId
}

export async function acquireBusinessCalendarLock(input: {
  readonly companyId: string
  readonly transaction: BusinessCalendarTransaction
}): Promise<void> {
  const identifier = await buildBusinessCalendarLockId(input.companyId)
  await input.transaction.execute(sql`select pg_advisory_xact_lock(${identifier})`)
}
