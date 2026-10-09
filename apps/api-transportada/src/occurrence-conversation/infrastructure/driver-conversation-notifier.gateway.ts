/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T601 (RF11): o aviso na caixa do motorista quando a operação escreve na conversa. Reusa o
 * trilho `notification.v1` (o `send` é o `sendNotification` do módulo): a API produz, o worker
 * entrega. `dedupeKey` = id da mensagem, então o mesmo envio não vira dois avisos. Falha é registrada
 * pelo nome do erro e não sobe — a mensagem já está na conversa.
 *
 * Spec 260 T2.5: roteia pelo assunto. Ocorrência (ou chamada sem assunto) é a chave de sempre, com o
 * mesmo template, marcador e `dedupeKey` — só ganha campos extras no `payload`. Nota e viagem vão pela
 * chave `trip.subject-conversation-message`. Nenhum dos dois leva o corpo da mensagem.
 */
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_TEMPLATE_KEY,
} from '../../notification/domain/notification-catalog.constant.js'
import { OCCURRENCE_CONVERSATION_SUBJECT } from '../../shared/occurrence-conversation-subject.constant.js'
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
    async notify(notice) {
      const { companyId, dedupeKey, recipientUserId } = notice
      const { payload, templateKey } = buildDriverNotice(notice)
      try {
        await input.send({
          category: NOTIFICATION_CATEGORY.TRIP,
          companyId,
          dedupeKey: `${templateKey}:${dedupeKey}`,
          payload,
          recipientUserId,
          templateKey,
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

function buildDriverNotice(notice: Parameters<DriverConversationNotifierPort['notify']>[0]): {
  readonly payload: object
  readonly templateKey: string
} {
  const { occurrenceLabel, protocol, subjectId, subjectType } = notice
  if (subjectType === undefined || subjectId === undefined || protocol === undefined) {
    return {
      payload: { occurrenceLabel },
      templateKey: NOTIFICATION_TEMPLATE_KEY.TRIP_CONVERSATION_MESSAGE,
    }
  }
  const extras = { protocol, subjectId, subjectLabel: occurrenceLabel, subjectType }
  if (subjectType === OCCURRENCE_CONVERSATION_SUBJECT.OCCURRENCE) {
    return {
      payload: { occurrenceLabel, ...extras },
      templateKey: NOTIFICATION_TEMPLATE_KEY.TRIP_CONVERSATION_MESSAGE,
    }
  }
  return {
    payload: extras,
    templateKey: NOTIFICATION_TEMPLATE_KEY.TRIP_SUBJECT_CONVERSATION_MESSAGE,
  }
}
