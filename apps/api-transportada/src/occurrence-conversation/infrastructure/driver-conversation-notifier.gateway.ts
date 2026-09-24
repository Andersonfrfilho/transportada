/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T601 (RF11): o aviso na caixa do motorista quando a operação escreve na conversa. Reusa o
 * trilho `notification.v1` (o `send` é o `sendNotification` do módulo): a API produz, o worker
 * entrega. `dedupeKey` = id da mensagem, então o mesmo envio não vira dois avisos. Falha é registrada
 * pelo nome do erro e não sobe — a mensagem já está na conversa.
 */
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_TEMPLATE_KEY,
} from '../../notification/domain/notification-catalog.constant.js'
import type { DriverConversationNotifierPort } from '../application/driver-conversation.port.js'

type Logger = { warn(event: string, meta?: Record<string, unknown>): void }

export const DRIVER_CONVERSATION_NOTIFIER_LOG = {
  failed: 'occurrence_conversation_driver_notice_failed',
} as const

export function createDriverConversationNotifier(input: {
  readonly logger: Logger
  readonly send: (params: {
    readonly category: string
    readonly companyId: string
    readonly dedupeKey: string
    readonly payload: object
    readonly recipientUserId: string
    readonly templateKey: string
  }) => Promise<unknown>
}): DriverConversationNotifierPort {
  return {
    async notify({ companyId, dedupeKey, occurrenceLabel, recipientUserId }) {
      try {
        await input.send({
          category: NOTIFICATION_CATEGORY.TRIP,
          companyId,
          dedupeKey: `${NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_CONVERSATION_MESSAGE}:${dedupeKey}`,
          payload: { occurrenceLabel },
          recipientUserId,
          templateKey: NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_CONVERSATION_MESSAGE,
        })
      } catch (error) {
        input.logger.warn(DRIVER_CONVERSATION_NOTIFIER_LOG.failed, {
          companyId,
          errorName: error instanceof Error ? error.name : typeof error,
        })
      }
    },
  }
}
