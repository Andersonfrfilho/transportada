/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, gte, isNull, lte } from 'drizzle-orm'

import { billingInvoices } from '../../database/billing.schema.js'
import type { CronDatabase } from '../../database/cron-database.types.js'

export type DueInvoice = {
  readonly actorUserId: string
  readonly companyId: string
  readonly dueDate: Date
  readonly id: string
  readonly invoiceNumber: bigint
}

/**
 * Fatura emitida, não cancelada, vencendo dentro da janela. A partir do vencimento a cobrança é
 * outro assunto — este aviso é o lembrete de antes, e por isso o piso é o próprio agora.
 */
export function createDueInvoicesQuery(database: CronDatabase) {
  return async function selectDueInvoices(input: {
    readonly now: Date
    readonly until: Date
  }): Promise<readonly DueInvoice[]> {
    return await database
      .select({
        actorUserId: billingInvoices.actorUserId,
        companyId: billingInvoices.companyId,
        dueDate: billingInvoices.dueDate,
        id: billingInvoices.id,
        invoiceNumber: billingInvoices.invoiceNumber,
      })
      .from(billingInvoices)
      .where(
        and(
          eq(billingInvoices.status, 'issued'),
          isNull(billingInvoices.cancelledAt),
          gte(billingInvoices.dueDate, input.now),
          lte(billingInvoices.dueDate, input.until),
        ),
      )
  }
}
