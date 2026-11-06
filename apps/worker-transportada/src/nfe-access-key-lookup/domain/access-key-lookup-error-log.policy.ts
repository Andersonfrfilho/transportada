/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { MAX_LOGGED_ERROR_MESSAGE_LENGTH } from './nfe-access-key-lookup.constant.js'

/** Mensagem com `<` pode carregar XML da SEFAZ: nunca entra em log. */
export function describeLookupErrorForLog(error: unknown): {
  readonly message?: string
  readonly reason: string
} {
  if (!(error instanceof Error)) return { reason: 'unknown' }
  const isSafeMessage = error.message.length > 0 && !error.message.includes('<')
  return {
    reason: error.name,
    ...(isSafeMessage ? { message: error.message.slice(0, MAX_LOGGED_ERROR_MESSAGE_LENGTH) } : {}),
  }
}
