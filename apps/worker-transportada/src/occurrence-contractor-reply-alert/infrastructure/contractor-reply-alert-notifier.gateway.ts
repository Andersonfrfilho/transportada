/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NotificationSendPort } from '../../notification/application/notification-trigger.service.js'
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_DEFAULT_LOCALE,
  NOTIFICATION_TEMPLATE_KEY,
} from '../../notification/notification.constant.js'
import type { ContractorReplyAlertNotifierPort } from '../application/occurrence-contractor-reply-alert.port.js'
import { OCCURRENCE_CONTRACTOR_REPLY_ALERT_DEDUPE_PREFIX } from '../domain/occurrence-contractor-reply-alert.constant.js'

/**
 * Avisa quem despachou a viagem, no sino e no e-mail interno. A chave leva o número do alerta
 * (`reply:<id>:<n>`): o dedupe do módulo é permanente, então sem ele só o primeiro alerta chegaria. A falha
 * sobe — quem chama conta e fecha o ciclo com ela, em vez de engoli-la.
 */
export function createContractorReplyAlertNotifier(input: {
  readonly send: NotificationSendPort
}): ContractorReplyAlertNotifierPort {
  return {
    async notify({ alertNumber, companyId, recipient, replyId }) {
      await input.send({
        category: NOTIFICATION_CATEGORY.TRIP,
        companyId,
        dedupeKey: `${OCCURRENCE_CONTRACTOR_REPLY_ALERT_DEDUPE_PREFIX}${replyId}:${alertNumber}`,
        locale: NOTIFICATION_DEFAULT_LOCALE,
        payload: { alertNumber: String(alertNumber), occurrenceLabel: recipient.occurrenceLabel },
        recipientUserId: recipient.recipientUserId,
        templateKey: NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_CONTRACTOR_REPLY_OVERDUE,
      })
    },
  }
}
