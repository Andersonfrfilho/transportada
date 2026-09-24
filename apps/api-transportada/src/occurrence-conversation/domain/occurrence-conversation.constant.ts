/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'
import type { ContractorMailThreadSubjectType } from '../../database/contractor-mail.schema.js'

export const SEND_OCCURRENCE_MAIL_OPERATION = 'occurrence-conversation.mail.send'

/** Os limites da mensagem, iguais aos CHECKs do banco e ao assunto dos modelos da 150. */
export const OCCURRENCE_MAIL_LIMITS = { body: 8000, subject: 200 } as const

/** A thread da 143 de cada tipo de ocorrência (`contractor_mail_threads.subject_type`). */
export const OCCURRENCE_THREAD_SUBJECT_TYPE: Readonly<
  Record<OccurrenceConversationKind, ContractorMailThreadSubjectType>
> = {
  document: 'document_occurrence',
  stop: 'stop_occurrence',
}
