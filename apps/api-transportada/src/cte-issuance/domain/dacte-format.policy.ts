/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DacteTax } from './dacte.types.js'

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/u
const THOUSANDS_PATTERN = /\B(?=(?:\d{3})+(?!\d))/gu
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}:\d{2}))?/u
const ACCESS_KEY_GROUP_SIZE = 4
const NON_DIGIT_PATTERN = /\D/gu
const CNPJ_LENGTH = 14
const CPF_LENGTH = 11
const ZIP_CODE_LENGTH = 8
const SHORT_PHONE_LENGTH = 10
const LONG_PHONE_LENGTH = 11

const SERVICE_TYPE_LABELS: Readonly<Record<string, string>> = {
  '0': 'Normal',
  '1': 'Subcontratação',
  '2': 'Redespacho',
  '3': 'Redespacho intermediário',
  '4': 'Serviço vinculado a multimodal',
}

const DOCUMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  '0': 'Normal',
  '1': 'Complemento de valores',
  '2': 'Anulação',
  '3': 'Substituto',
}

const MODAL_LABELS: Readonly<Record<string, string>> = {
  '01': 'Rodoviário',
  '02': 'Aéreo',
  '03': 'Aquaviário',
  '04': 'Ferroviário',
  '05': 'Dutoviário',
  '06': 'Multimodal',
}

const TAX_SITUATION_LABELS: Readonly<Record<string, string>> = {
  '00': 'Tributação normal',
  '20': 'Base de cálculo reduzida',
  '40': 'Isenta',
  '41': 'Não tributada',
  '45': 'Isenta, não tributada ou diferida',
  '51': 'Diferimento',
  '60': 'ICMS cobrado por substituição tributária',
  '90': 'Outros',
}

/**
 * Agrupa milhares sobre a string: converter para `number` para formatar devolveria o valor
 * arredondado em float binário, e o DACTE tem de imprimir o mesmo centavo que o XML declarou.
 */
export function formatDacteAmount(value: string): string {
  if (!DECIMAL_PATTERN.test(value)) return value
  const [whole = '0', fraction = ''] = value.split('.')
  const cents = `${fraction}00`.slice(0, 2)
  return `${whole.replace(THOUSANDS_PATTERN, '.')},${cents}`
}

/** Quantidade não é dinheiro: mantém as casas que o emitente declarou e não agrupa milhares. */
export function formatDacteQuantity(value: string): string {
  if (!DECIMAL_PATTERN.test(value)) return value
  return value.replace('.', ',')
}

/** O instante já vem no fuso do emitente: converter para UTC mudaria a data impressa. */
export function formatDacteDateTime(value: string): string {
  const parts = DATE_TIME_PATTERN.exec(value)
  if (parts === null) return value
  const [, year, month, day, time] = parts
  const date = `${day}/${month}/${year}`
  return time === undefined ? date : `${date} ${time}`
}

/** CNPJ e CPF saem com a pontuação que o documento impresso usa; o que não reconhecer, sai cru. */
export function formatDacteDocumentNumber(value: string): string {
  const digits = value.replace(NON_DIGIT_PATTERN, '')
  if (digits.length === CNPJ_LENGTH) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
  }
  if (digits.length === CPF_LENGTH) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
  }
  return value
}

export function formatDacteZipCode(value: string): string {
  const digits = value.replace(NON_DIGIT_PATTERN, '')
  return digits.length === ZIP_CODE_LENGTH ? `${digits.slice(0, 5)}-${digits.slice(5)}` : value
}

export function formatDactePhone(value: string): string {
  const digits = value.replace(NON_DIGIT_PATTERN, '')
  if (digits.length < SHORT_PHONE_LENGTH || digits.length > LONG_PHONE_LENGTH) return value
  const area = digits.slice(0, 2)
  const subscriber = digits.slice(2)
  return `(${area}) ${subscriber.slice(0, subscriber.length - 4)}-${subscriber.slice(-4)}`
}

export function formatDacteAccessKey(accessKey: string): string {
  return (accessKey.match(new RegExp(`.{1,${ACCESS_KEY_GROUP_SIZE}}`, 'gu')) ?? []).join(' ')
}

export function describeDacteServiceType(code: string): string {
  return SERVICE_TYPE_LABELS[code] ?? code
}

export function describeDacteDocumentType(code: string): string {
  return DOCUMENT_TYPE_LABELS[code] ?? code
}

export function describeDacteModal(code: string): string {
  return MODAL_LABELS[code] ?? code
}

export function describeDacteTaxSituation(tax: DacteTax): string {
  const label = tax.isSimplesNacional
    ? 'Simples Nacional'
    : (TAX_SITUATION_LABELS[tax.situationCode] ?? 'Outros')
  return `${label} (${tax.situationCode})`
}
