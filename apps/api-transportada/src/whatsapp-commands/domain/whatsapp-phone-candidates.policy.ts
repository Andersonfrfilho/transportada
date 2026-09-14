/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

const MOBILE_WITH_NINTH_DIGIT_LENGTH = 13
const MOBILE_WITHOUT_NINTH_DIGIT_LENGTH = 12
const NINTH_DIGIT_POSITION = 4
const NINTH_DIGIT = '9'

/**
 * O repositório casa exato, e a Meta às vezes entrega o celular sem o nono dígito: procura-se pela
 * forma recebida e pela outra, a mesma equivalência de `isSameWhatsAppPhone`. A recebida vem
 * primeiro. Recebe o telefone já canônico.
 */
export function buildWhatsAppPhoneCandidates(phone: string): readonly string[] {
  if (
    phone.length === MOBILE_WITH_NINTH_DIGIT_LENGTH &&
    phone[NINTH_DIGIT_POSITION] === NINTH_DIGIT
  ) {
    return [phone, phone.slice(0, NINTH_DIGIT_POSITION) + phone.slice(NINTH_DIGIT_POSITION + 1)]
  }
  if (phone.length === MOBILE_WITHOUT_NINTH_DIGIT_LENGTH) {
    return [
      phone,
      phone.slice(0, NINTH_DIGIT_POSITION) + NINTH_DIGIT + phone.slice(NINTH_DIGIT_POSITION),
    ]
  }
  return [phone]
}
