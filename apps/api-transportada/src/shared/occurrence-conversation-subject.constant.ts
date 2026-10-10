/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 (ADR-0101): o assunto da conversa com o motorista. `occurrence` é o único que existia; nota
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

/** ADR-0101 D5: o banco sorteia o sufixo; o TS só descreve o formato (sem I, L, O, 0 nem 1) e o contrato o prende ao SQL. */
export const CONVERSATION_PROTOCOL_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const CONVERSATION_PROTOCOL_PATTERN = '^[0-9]{6}-[2-9A-HJKMNP-Z]{4}$'
