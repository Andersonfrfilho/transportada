/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'
import type { ContractorMailThreadSubjectType } from '../../database/contractor-mail.schema.js'

export const SEND_OCCURRENCE_MAIL_OPERATION = 'occurrence-conversation.mail.send'

/** Spec 274 (D11): o chat tem a operação própria — a mesma chave no diálogo e no chat nunca se confunde. */
export const SEND_OCCURRENCE_CHAT_MAIL_OPERATION = 'occurrence-conversation.chat-mail.send'

/** Spec 287: o chat do cliente por e-mail tem a operação própria, para a chave nunca se confundir com a da contratante. */
export const SEND_CLIENT_CHAT_MAIL_OPERATION = 'occurrence-conversation.client-chat-mail.send'

/** Os limites da mensagem, iguais aos CHECKs do banco e ao assunto dos modelos da 150. */
export const OCCURRENCE_MAIL_LIMITS = { body: 8000, subject: 200 } as const

/** Spec 287: o fio de e-mail do cliente (a migration `client_mail_thread`), um por ocorrência, separado do da contratante. */
export const OCCURRENCE_CLIENT_THREAD_SUBJECT_TYPE: Readonly<
  Record<OccurrenceConversationKind, ContractorMailThreadSubjectType>
> = {
  document: 'client_document_occurrence',
  stop: 'client_stop_occurrence',
}

/** A thread da 143 de cada tipo de ocorrência (`contractor_mail_threads.subject_type`). */
export const OCCURRENCE_THREAD_SUBJECT_TYPE: Readonly<
  Record<OccurrenceConversationKind, ContractorMailThreadSubjectType>
> = {
  document: 'document_occurrence',
  stop: 'stop_occurrence',
}
