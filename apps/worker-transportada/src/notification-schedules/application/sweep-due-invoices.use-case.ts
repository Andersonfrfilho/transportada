/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import { buildBillingInvoiceDueNotification } from '../../notification/domain/notification-trigger.policy.js'
import type { NotificationSendPort } from '../../notification/application/notification-trigger.service.js'
import { NOTIFICATION_DEFAULT_LOCALE } from '../../notification/notification.constant.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { BILLING_INVOICE_DUE_WINDOW_DAYS } from '../domain/notification-schedules.constant.js'
import {
  toNotificationSchedulesFailureCause,
  type NotificationSchedulesFailureCause,
} from '../domain/notification-schedules-failure.policy.js'

import type { DueInvoice } from '../infrastructure/drizzle-due-invoices.query.js'

const MILLISECONDS_PER_DAY = 86_400_000

export type SweepDueInvoicesResult = {
  /** Uma causa por fatura que não virou aviso — é o que o ciclo traduz em código de fechamento. */
  readonly failures: readonly NotificationSchedulesFailureCause[]
  readonly notifiedCount: number
  readonly sweptCount: number
}

export type SweepDueInvoices = (input: { readonly now: Date }) => Promise<SweepDueInvoicesResult>

export type CreateSweepDueInvoicesParams = {
  readonly logger: WorkerLogger
  readonly selectDueInvoices: (input: {
    readonly now: Date
    readonly until: Date
  }) => Promise<readonly DueInvoice[]>
  readonly send: NotificationSendPort
}

/**
 * Uma batida avisa uma vez por fatura: a deduplicação é do agregado, então correr de cinco em cinco
 * minutos dentro dos três dias de antecedência não vira três dias de aviso repetido.
 *
 * Ao contrário do disparo que acompanha o processamento fiscal, aqui a falha **não é engolida**: o
 * aviso é o trabalho do ciclo, e um ciclo que não avisou ninguém não pode fechar como se tivesse.
 */
export function createSweepDueInvoices({
  logger,
  selectDueInvoices,
  send,
}: CreateSweepDueInvoicesParams): SweepDueInvoices {
  return async function sweep({ now }) {
    const invoices = await selectDueInvoices({
      now,
      until: new Date(now.getTime() + BILLING_INVOICE_DUE_WINDOW_DAYS * MILLISECONDS_PER_DAY),
    })

    const failures: NotificationSchedulesFailureCause[] = []
    let notifiedCount = 0

    for (const invoice of invoices) {
      const notification = buildBillingInvoiceDueNotification({
        actorUserId: invoice.actorUserId,
        companyId: invoice.companyId,
        dueDate: invoice.dueDate,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      })

      try {
        await send({ ...notification, locale: NOTIFICATION_DEFAULT_LOCALE })
        notifiedCount += 1
      } catch (error: unknown) {
        failures.push(toNotificationSchedulesFailureCause(error))
        safeLogWarn({
          logger,
          message: 'billing_invoice_due_notify_failed',
          metadata: {
            companyId: invoice.companyId,
            invoiceId: invoice.id,
            reason: error instanceof Error ? error.name : 'UnknownError',
          },
        })
      }
    }

    safeLogInfo({
      logger,
      message: 'billing_invoice_due_swept',
      metadata: { count: invoices.length, notifiedCount },
    })

    return { failures, notifiedCount, sweptCount: invoices.length }
  }
}
