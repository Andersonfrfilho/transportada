/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T654 (RF21): o aviso por e-mail às contas do portal quando a operação escreve pelo canal
 * Portal. Reusa o trilho `notification.v1`, como o aviso ao motorista (T601): a API produz, o worker
 * entrega. **Sem o corpo** — só a nota —, porque quem lê é quem entra no portal (ADR-0073). Um aviso
 * por conta, com `dedupeKey` da mensagem e da conta. Falha é registrada pelo nome do erro e não
 * sobe: a mensagem já está no portal.
 */
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_TEMPLATE_KEY,
} from '../../notification/domain/notification-catalog.constant.js'
import type { ContractorPortalNotifierPort } from '../application/contractor-portal-message.port.js'

type Logger = { warn(event: string, meta?: Record<string, unknown>): void }

export const CONTRACTOR_PORTAL_NOTIFIER_LOG = {
  failed: 'occurrence_conversation_portal_notice_failed',
} as const

export function createContractorPortalNotifier(input: {
  readonly logger: Logger
  readonly send: (params: {
    readonly category: string
    readonly companyId: string
    readonly dedupeKey: string
    readonly payload: object
    readonly recipientUserId: string
    readonly templateKey: string
  }) => Promise<unknown>
}): ContractorPortalNotifierPort {
  return {
    async notify({ companyId, messageId, occurrenceLabel, recipientUserIds }) {
      for (const recipientUserId of recipientUserIds) {
        try {
          await input.send({
            category: NOTIFICATION_CATEGORY.TRIP,
            companyId,
            dedupeKey: `${NOTIFICATION_TEMPLATE_KEY.TRIP_CONTRACTOR_PORTAL_MESSAGE}:${messageId}:${recipientUserId}`,
            payload: { occurrenceLabel },
            recipientUserId,
            templateKey: NOTIFICATION_TEMPLATE_KEY.TRIP_CONTRACTOR_PORTAL_MESSAGE,
          })
        } catch (error) {
          input.logger.warn(CONTRACTOR_PORTAL_NOTIFIER_LOG.failed, {
            companyId,
            errorName: error instanceof Error ? error.name : typeof error,
          })
        }
      }
    },
  }
}
