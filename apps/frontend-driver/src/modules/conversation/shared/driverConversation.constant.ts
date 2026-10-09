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
