/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.6b: the bell notice of the driver when the contractor reply is delivered automatically.
 * Same notice the API sends when the operator delivers it (`driver-conversation-notifier.gateway.ts`): template
 * `trip.conversation-message`, subject occurrence, and the dedupe key `trip.conversation-message:<message id>`,
 * so the same message never becomes two notices. A failure is logged by name only (never ids, label or text) and
 * does not rise: the boleto is already in the driver conversation.
 */
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import type { NotificationSendPort } from '../../notification/application/notification-trigger.service.js'
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_DEFAULT_LOCALE,
  NOTIFICATION_TEMPLATE_KEY,
} from '../../notification/notification.constant.js'
import type { DriverReplyNoticePort } from '../application/driver-reply-notice.port.js'

const OCCURRENCE_SUBJECT_TYPE = 'occurrence'

export const DRIVER_REPLY_NOTIFIER_LOG = {
  failed: 'occurrence_contractor_reply_driver_notice_failed',
} as const

export function createDriverReplyNotifier(input: {
  readonly logger: WorkerLogger
  readonly send: NotificationSendPort
}): DriverReplyNoticePort {
  return {
    async notify(notice) {
      const templateKey = NOTIFICATION_TEMPLATE_KEY.TRIP_CONVERSATION_MESSAGE
      try {
        await input.send({
          category: NOTIFICATION_CATEGORY.TRIP,
          companyId: notice.companyId,
          dedupeKey: `${templateKey}:${notice.driverMessageId}`,
          locale: NOTIFICATION_DEFAULT_LOCALE,
          payload: {
            occurrenceLabel: notice.occurrenceLabel,
            protocol: notice.protocol,
            subjectId: notice.occurrenceId,
            subjectLabel: notice.occurrenceLabel,
            subjectType: OCCURRENCE_SUBJECT_TYPE,
          },
          recipientUserId: notice.driverUserId,
          templateKey,
        })
      } catch (error: unknown) {
        safeLogWarn({
          logger: input.logger,
          message: DRIVER_REPLY_NOTIFIER_LOG.failed,
          metadata: {
            companyId: notice.companyId,
            errorName: error instanceof Error ? error.name : typeof error,
          },
        })
      }
    },
  }
}
