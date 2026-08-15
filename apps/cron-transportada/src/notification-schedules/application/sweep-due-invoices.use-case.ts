/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CronLogger } from '../../config/cron.types.js'
import type { DueInvoice } from '../infrastructure/drizzle-due-invoices.query.js'
import type { NotificationTrigger } from './notification-trigger.service.js'
import { BILLING_INVOICE_DUE_WINDOW_DAYS } from '../domain/notification-schedules.constant.js'
import { buildBillingInvoiceDueNotification } from '../domain/notification-trigger.policy.js'

const MILLISECONDS_PER_DAY = 86_400_000

export type SweepDueInvoicesParams = {
  readonly logger: CronLogger
  readonly now: Date
  readonly selectDueInvoices: (input: {
    readonly now: Date
    readonly until: Date
  }) => Promise<readonly DueInvoice[]>
  readonly trigger: NotificationTrigger
}

/**
 * Uma janela do cron avisa uma vez por fatura: a deduplicação é do agregado, então rodar a cada
 * hora dentro dos três dias de antecedência não vira três dias de aviso repetido.
 */
export async function sweepDueInvoices({
  logger,
  now,
  selectDueInvoices,
  trigger,
}: SweepDueInvoicesParams): Promise<number> {
  const invoices = await selectDueInvoices({
    now,
    until: new Date(now.getTime() + BILLING_INVOICE_DUE_WINDOW_DAYS * MILLISECONDS_PER_DAY),
  })

  // Em série de propósito: cada aviso grava e enfileira, e a lista é do tamanho da carteira.
  for (const invoice of invoices) {
    await trigger.notify(
      buildBillingInvoiceDueNotification({
        actorUserId: invoice.actorUserId,
        companyId: invoice.companyId,
        dueDate: invoice.dueDate,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      }),
    )
  }

  logger.info('billing_invoice_due_swept', { count: invoices.length })

  return invoices.length
}
