/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4b: o aviso ao motorista da mensagem do escritório em nota e viagem. Ponto de extensão da T2.5:
 * hoje entrega pelo gateway da ocorrência (chave `trip.conversation-message`, template e `dedupeKey` de
 * sempre), com o rótulo do assunto no lugar do da ocorrência; a T2.5 troca este adaptador pelo da chave
 * `trip.subject-conversation-message`, que leva também `subjectType`, `subjectId` e `protocol`.
 */
import type { DriverConversationNotifierPort } from '../application/driver-conversation.port.js'
import type { OfficeSubjectNotifierPort } from '../application/office-subject-conversation.port.js'

export function createOfficeSubjectNotifier(
  occurrenceNotifier: DriverConversationNotifierPort,
): OfficeSubjectNotifierPort {
  return {
    notify: ({ companyId, dedupeKey, recipientUserId, subjectLabel }) =>
      occurrenceNotifier.notify({
        companyId,
        dedupeKey,
        occurrenceLabel: subjectLabel,
        recipientUserId,
      }),
  }
}
