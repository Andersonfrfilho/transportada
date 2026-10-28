/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T5 (D4): o número para onde o boleto vai por WhatsApp. A API normaliza (E.164, DDI 55 quando falta) e
 * valida antes de qualquer envio; quem digita "(16) 99999-8888", "16999998888" ou "+55 16 99999-8888" chega ao mesmo
 * `+5516999998888`. Número fora da forma nunca é enviado nem guardado. Fora da API ele só sai mascarado.
 */
import { DELIVERY_CLIENT_WHATSAPP_ADDRESS_PATTERN } from '../../shared/delivery-client-email.constant.js'

const BRAZIL_COUNTRY_CODE = '55'
/** O texto bruto só protege o parser; nenhum número com formatação passa disso. */
const RAW_MAX_LENGTH = 40
/** Só o que as pessoas usam para escrever telefone: dígitos, espaço, `+`, `-`, `.` e parênteses. */
const ALLOWED_CHARACTERS = /^[\d\s+().-]+$/u
const NON_DIGITS = /\D/gu
const LEADING_ZEROS = /^0+/u
/** DDD de 11 a 99 e assinante de 8 dígitos (fixo) ou 9 começando por 9 (celular). */
const BRAZIL_NATIONAL = /^[1-9][1-9](?:9\d{8}|[2-8]\d{7})$/u
const E164 = new RegExp(DELIVERY_CLIENT_WHATSAPP_ADDRESS_PATTERN, 'u')
const VISIBLE_DIGITS = 4

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

/** Sem `+`, o número é brasileiro: com DDD (10 ou 11 dígitos) ganha o 55; já com o 55, fica como está. */
function toInternational(digits: string): null | string {
  if (digits.length === 10 || digits.length === 11) return `${BRAZIL_COUNTRY_CODE}${digits}`
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith(BRAZIL_COUNTRY_CODE)) {
    return digits
  }
  return null
}

/** `+55 ••••8888`: o país e os quatro últimos dígitos bastam para a pessoa reconhecer o número. */
export function maskClientWhatsAppNumber(e164: string): string {
  const digits = e164.replace(NON_DIGITS, '')
  const country = digits.startsWith(BRAZIL_COUNTRY_CODE) ? BRAZIL_COUNTRY_CODE : digits.slice(0, 1)
  return `+${country} ••••${digits.slice(-VISIBLE_DIGITS)}`
}
