/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * ⚠️ Cópia por valor de `contractor-reply-whatsapp-number.policy.ts` (spec 281 T5, D4). A API valida e normaliza de
 * verdade; aqui o número só é lido para o motorista conferir na tela de confirmação antes de qualquer envio.
 */
const BRAZIL_COUNTRY_CODE = '55'
const RAW_MAX_LENGTH = 40
const ALLOWED_CHARACTERS = /^[\d\s+().-]+$/u
const NON_DIGITS = /\D/gu
const LEADING_ZEROS = /^0+/u
const BRAZIL_NATIONAL = /^[1-9][1-9](?:9\d{8}|[2-8]\d{7})$/u
const E164 = /^\+[1-9][0-9]{7,14}$/u
const MOBILE_LENGTH = 9

export const CLIENT_WHATSAPP_NUMBER_PATTERNS = {
  brazilNational: BRAZIL_NATIONAL.source,
  e164: E164.source,
} as const

/** `null` quando o texto não é um número de WhatsApp válido; senão o número em E.164. */
export function parseClientWhatsAppNumber(raw: string): null | string {
  const text = raw.trim()
  if (text.length === 0 || text.length > RAW_MAX_LENGTH || !ALLOWED_CHARACTERS.test(text)) {
    return null
  }
  const hasPlus = text.startsWith('+')
  if (text.lastIndexOf('+') > 0) return null
  const digits = text.replace(NON_DIGITS, '')
  const international = hasPlus ? digits : toInternational(digits.replace(LEADING_ZEROS, ''))
  if (international === null) return null
  if (international.startsWith(BRAZIL_COUNTRY_CODE)) {
    if (!BRAZIL_NATIONAL.test(international.slice(BRAZIL_COUNTRY_CODE.length))) return null
  }
  const e164 = `+${international}`
  return E164.test(e164) ? e164 : null
}

function toInternational(digits: string): null | string {
  if (digits.length === 10 || digits.length === 11) return `${BRAZIL_COUNTRY_CODE}${digits}`
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith(BRAZIL_COUNTRY_CODE)) {
    return digits
  }
  return null
}

/** `+55 (16) 99999-8888`: o número como a pessoa o lê, para conferir; fora do Brasil, `+DDI` e os dígitos. */
export function formatClientWhatsAppNumber(e164: string): string {
  const digits = e164.replace(NON_DIGITS, '')
  if (!digits.startsWith(BRAZIL_COUNTRY_CODE)) return e164
  const national = digits.slice(BRAZIL_COUNTRY_CODE.length)
  const area = national.slice(0, 2)
  const subscriber = national.slice(2)
  const split = subscriber.length === MOBILE_LENGTH ? 5 : 4
  return `+${BRAZIL_COUNTRY_CODE} (${area}) ${subscriber.slice(0, split)}-${subscriber.slice(split)}`
}
