/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import type { CronDatabase } from '../../database/cron-database.types.js'
import {
  nfseIssuanceOutbox,
  nfseServiceInvoices,
} from '../../database/nfse-reconciliation.schema.js'
import type { NotificationTrigger } from '../../notification-schedules/application/notification-trigger.service.js'
import { buildNfseRejectionNotification } from '../../notification-schedules/domain/notification-trigger.policy.js'
import type { NfseRejectionNotifierPort } from '../application/reconcile-invoice.use-case.js'

/** A prefeitura recusa antes de numerar: o aviso identifica a nota pelo que existir. */
const UNNUMBERED_INVOICE_LABEL = 'sem número'

export function createNfseRejectionNotifier({
  db,
  trigger,
}: {
  readonly db: CronDatabase
  readonly trigger: NotificationTrigger
}): NfseRejectionNotifierPort {
  return {
    async notifyRejection({ attemptId, companyId, invoiceId, rejectionMessage }) {
      const [origin] = await db
        .select({ actorUserId: nfseIssuanceOutbox.actorUserId })
        .from(nfseIssuanceOutbox)
        .where(
          and(
            eq(nfseIssuanceOutbox.companyId, companyId),
            eq(nfseIssuanceOutbox.attemptId, attemptId),
          ),
        )
        .limit(1)

      // Sem o pedido original não há a quem avisar — a rejeição já está gravada na nota.
      if (origin === undefined) {
        return
      }

      const [invoice] = await db
        .select({ providerNumber: nfseServiceInvoices.providerNumber })
        .from(nfseServiceInvoices)
        .where(
          and(eq(nfseServiceInvoices.companyId, companyId), eq(nfseServiceInvoices.id, invoiceId)),
        )
        .limit(1)

      await trigger.notify(
        buildNfseRejectionNotification({
          actorUserId: origin.actorUserId,
          attemptId,
          companyId,
          invoiceId,
          invoiceNumber: invoice?.providerNumber ?? UNNUMBERED_INVOICE_LABEL,
          rejectionMessage,
        }),
      )
    },
  }
}
