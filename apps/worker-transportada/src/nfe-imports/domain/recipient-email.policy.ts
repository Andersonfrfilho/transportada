/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const RECIPIENT_EMAIL_MAX_LENGTH = 254

/** Mesma forma da CHECK `nfe_documents_recipient_email_check`, mais a recusa de lista e cabeçalho. */
const RECIPIENT_EMAIL_PATTERN = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/u

export type ResolvedRecipientEmail = {
  readonly email: string | null
  readonly wasRejected: boolean
}

/** ⚠️ O endereço é PII: quem chama conta a rejeição e nunca registra o valor. */
export function resolveRecipientEmail(rawEmail: string | undefined): ResolvedRecipientEmail {
  const email = rawEmail?.trim() ?? ''
  if (email.length === 0) return { email: null, wasRejected: false }
  if (email.length > RECIPIENT_EMAIL_MAX_LENGTH) return { email: null, wasRejected: true }
  if (!RECIPIENT_EMAIL_PATTERN.test(email)) return { email: null, wasRejected: true }
  return { email, wasRejected: false }
}
