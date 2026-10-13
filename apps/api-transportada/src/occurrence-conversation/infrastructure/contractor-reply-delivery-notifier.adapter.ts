/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.6b: the reply that the contractor sent through the portal and that went on by itself ends in
 * the driver app; this adapter turns what the delivery wrote into the same bell notice the operator path sends
 * (`DriverConversationNotifierPort`, template `trip.conversation-message`, dedupe by the message id).
 */
import { OCCURRENCE_CONVERSATION_SUBJECT } from '../../shared/occurrence-conversation-subject.constant.js'
import type { ContractorReplyDeliveryNotifierPort } from '../application/contractor-portal-conversation.port.js'
import type { DriverConversationNotifierPort } from '../application/driver-conversation.port.js'

export function createContractorReplyDeliveryNotifier(input: {
  readonly driverNotifier: DriverConversationNotifierPort
}): ContractorReplyDeliveryNotifierPort {
  return {
    notify: ({ companyId, delivery }) =>
      input.driverNotifier.notify({
        companyId,
        dedupeKey: delivery.messageId,
        occurrenceLabel: delivery.occurrenceLabel,
        protocol: delivery.protocol,
        recipientUserId: delivery.recipientUserId,
        subjectId: delivery.occurrenceId,
        subjectType: OCCURRENCE_CONVERSATION_SUBJECT.OCCURRENCE,
      }),
  }
}
