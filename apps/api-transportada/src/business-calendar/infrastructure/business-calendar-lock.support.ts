/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'

import type { BusinessCalendarTransaction } from './business-calendar-database.types.js'

type LockParams = {
  readonly companyId: string
  readonly transaction: BusinessCalendarTransaction
}

/**
 * Uma escrita do calendário por empresa de cada vez: a conferência de conflito, a geração das datas e
 * a regeneração leem e escrevem as mesmas linhas, e `FOR UPDATE` não trava linha que não existe.
 */
export async function acquireBusinessCalendarLock({
  companyId,
  transaction,
}: LockParams): Promise<void> {
  const encoded = new TextEncoder().encode(JSON.stringify(['business-calendar', companyId]))
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const lockId = new DataView(digest).getBigInt64(0, false)
  await transaction.execute(sql`select pg_advisory_xact_lock(${lockId})`)
}
