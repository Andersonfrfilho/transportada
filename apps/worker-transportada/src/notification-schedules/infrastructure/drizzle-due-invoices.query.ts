/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, gte, isNull, lte } from 'drizzle-orm'

import { billingInvoices } from '../../database/billing.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

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
export function createDueInvoicesQuery(database: Database) {
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
