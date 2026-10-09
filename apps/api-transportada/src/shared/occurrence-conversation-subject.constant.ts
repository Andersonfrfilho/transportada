/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 (ADR-0101): o assunto da conversa com o motorista. `occurrence` é o único que existia; nota
 * (o vínculo `trip_documents.id`) e viagem entram sem mudar a conversa de ocorrência.
 */
export const OCCURRENCE_CONVERSATION_SUBJECT = {
  DOCUMENT: 'document',
  OCCURRENCE: 'occurrence',
  TRIP: 'trip',
} as const
export type OccurrenceConversationSubjectType =
  (typeof OCCURRENCE_CONVERSATION_SUBJECT)[keyof typeof OCCURRENCE_CONVERSATION_SUBJECT]

export const OCCURRENCE_CONVERSATION_SUBJECT_TYPES = [
  OCCURRENCE_CONVERSATION_SUBJECT.OCCURRENCE,
  OCCURRENCE_CONVERSATION_SUBJECT.DOCUMENT,
  OCCURRENCE_CONVERSATION_SUBJECT.TRIP,
] as const

/** O mesmo formato da `Idempotency-Key` das rotas: o eco que o app manda como `clientMessageId`. */
export const CLIENT_MESSAGE_ID_MIN_LENGTH = 16
export const CLIENT_MESSAGE_ID_MAX_LENGTH = 256
/** O limite de repetição do regex do Postgres é 255: o tamanho fica fora do padrão. */
export const CLIENT_MESSAGE_ID_CHARACTERS_PATTERN = '^[A-Za-z0-9._:-]+$'
