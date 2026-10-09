/* Copyright (c) 2026 Ada Technology. MIT License. */
export const DRIVER_CONVERSATION_SUBJECT_TYPE = 'occurrence'

export const CURRENT_TRIP_PATH = '/me/trips/current'

/** A URL assinada do anexo vale 5 min no servidor; renovar um pouco antes de vencer. */
export const ATTACHMENT_URL_MAX_AGE_MS = 4 * 60 * 1000

export const CLIENT_MESSAGE_ECHO_STORAGE_KEY = 'transportada.driver.conversation-echo.v1'

export const CLIENT_MESSAGE_ECHO_MAX_ENTRIES = 200

export const UNREAD_CONVERSATIONS_QUERY_KEY = ['conversations', 'unread'] as const

export const UNREAD_CONVERSATIONS_REFETCH_INTERVAL_MS = 60 * 1000

export const DRIVER_CONVERSATION_ERROR = {
  OUTBOX_OWNER_MISSING: 'DRIVER_CONVERSATION_OUTBOX_OWNER_MISSING',
  REQUEST_FAILED: 'DRIVER_CONVERSATION_REQUEST_FAILED',
  RESPONSE_INVALID: 'DRIVER_CONVERSATION_RESPONSE_INVALID',
  SUBJECT_UNSUPPORTED: 'DRIVER_CONVERSATION_SUBJECT_UNSUPPORTED',
  UPLOAD_FAILED: 'DRIVER_CONVERSATION_UPLOAD_FAILED',
} as const

export const PARTICIPANT_MESSAGE_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'bounced',
] as const

export const CONVERSATION_OUTBOX_DATABASE_NAME = 'transportada.conversation-outbox'

export const CONVERSATION_OUTBOX_STORE_NAME = 'messages'

export const CONVERSATION_OUTBOX_LOCK_NAME = 'transportada.conversation-outbox.flush'

/** Status HTTP em que repetir com a mesma chave é o certo: sessão a renovar, limite de taxa, tempo. */
export const RETRYABLE_CLIENT_STATUSES: readonly number[] = [401, 408, 425, 429]

/** Quanto o app espera entre duas buscas de mensagem nova com a conversa aberta e a aba visível. */
export const CONVERSATION_REFRESH_INTERVAL_MS = 15 * 1000

/** Teto de ciclos pulados depois de falhas seguidas, para não martelar a API instável. */
export const CONVERSATION_REFRESH_MAX_SKIPPED_CYCLES = 7
