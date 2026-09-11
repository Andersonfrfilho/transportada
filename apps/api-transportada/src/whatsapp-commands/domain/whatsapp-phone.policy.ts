/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia por valor entre api-transportada (whatsapp-commands/domain) e worker-transportada
 * (whatsapp/domain): o contrato de paridade do worker exige os dois arquivos idênticos.
 */

const BRAZIL_COUNTRY_CODE = '55'
const WHATSAPP_PHONE_PATTERN = /^55[1-9][0-9]{9,10}$/
const TYPED_PHONE_PATTERN = /^\+?[0-9\s().-]+$/
const NON_DIGIT_PATTERN = /\D/g
const LOCAL_PHONE_LENGTHS: ReadonlySet<number> = new Set([10, 11])
const MOBILE_WITH_NINTH_DIGIT_LENGTH = 13
const NINTH_DIGIT_POSITION = 4
const NINTH_DIGIT = '9'

export function toWhatsAppPhone(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!TYPED_PHONE_PATTERN.test(trimmed)) return undefined

  const digits = trimmed.replace(NON_DIGIT_PATTERN, '')
  // Decide pelo comprimento, não pelo prefixo: 10/11 dígitos é número local (inclusive DDD 55, RS).
  const withCountry = LOCAL_PHONE_LENGTHS.has(digits.length)
    ? `${BRAZIL_COUNTRY_CODE}${digits}`
    : digits

  return WHATSAPP_PHONE_PATTERN.test(withCountry) ? withCountry : undefined
}

export function isSameWhatsAppPhone(first: string, second: string): boolean {
  const firstPhone = toWhatsAppPhone(first)
  const secondPhone = toWhatsAppPhone(second)
  if (firstPhone === undefined || secondPhone === undefined) return false

  return dropNinthDigit(firstPhone) === dropNinthDigit(secondPhone)
}

// A Meta às vezes entrega o wa_id de celular sem o nono dígito.
function dropNinthDigit(phone: string): string {
  if (phone.length !== MOBILE_WITH_NINTH_DIGIT_LENGTH) return phone
  if (phone[NINTH_DIGIT_POSITION] !== NINTH_DIGIT) return phone

  return phone.slice(0, NINTH_DIGIT_POSITION) + phone.slice(NINTH_DIGIT_POSITION + 1)
}
