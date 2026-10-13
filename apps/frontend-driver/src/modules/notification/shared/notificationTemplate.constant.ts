/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Aviso de conversa de ocorrência; ganha o assunto no payload. */
export const LEGACY_CONVERSATION_MESSAGE_TEMPLATE_KEY = 'trip.conversation-message'

/** Aviso de conversa de nota e de viagem (ADR-0101 §9); o app precisa aceitá-lo antes de a API emitir. */
export const SUBJECT_CONVERSATION_MESSAGE_TEMPLATE_KEY = 'trip.subject-conversation-message'

/** Mesmo padrão do `subjectType` que a API valida; o que não casa não vira rota. */
export const SUBJECT_TYPE_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/

export const SUBJECT_ID_MAX_LENGTH = 128
