/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b/T2.5: o aviso ao motorista da mensagem do escritório em nota e viagem. Entrega pelo
 * gateway do sino, que roteia o assunto para a chave `trip.subject-conversation-message`; o `payload`
 * leva `subjectType`, `subjectId`, `subjectLabel` e `protocol`, nunca o corpo nem o nome de ninguém.
 */
import type { DriverConversationNotifierPort } from '../application/driver-conversation.port.js'
import type { OfficeSubjectNotifierPort } from '../application/office-subject-conversation.port.js'

export function createOfficeSubjectNotifier(
  driverNotifier: DriverConversationNotifierPort,
): OfficeSubjectNotifierPort {
  return {
    notify: ({
      companyId,
      dedupeKey,
      protocol,
      recipientUserId,
      subjectId,
      subjectLabel,
      subjectType,
    }) =>
      driverNotifier.notify({
        companyId,
        dedupeKey,
        occurrenceLabel: subjectLabel,
        protocol,
        recipientUserId,
        subjectId,
        subjectType,
      }),
  }
}
