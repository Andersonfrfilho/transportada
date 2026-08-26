/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatCnpj, formatCpf } from './taxId.service'
import { formatPhone, PHONE_MASK_LENGTH } from './phone.service'

const RANDOM_KEY_MASK_LENGTH = 36 // UUID: 8-4-4-4-12 com hífens
const RANDOM_KEY_HEX_LENGTH = 32
const RANDOM_KEY_GROUPS = [8, 4, 4, 4, 12] as const

/** Chave aleatória é um UUID — mesmo agrupamento 8-4-4-4-12 que o Bacen exige (regex do backend). */
function formatRandomPixKey(value: string): string {
  const hex = value
    .toLowerCase()
    .replace(/[^0-9a-f]/gu, '')
    .slice(0, RANDOM_KEY_HEX_LENGTH)
  let masked = ''
  let cursor = 0
  for (const groupLength of RANDOM_KEY_GROUPS) {
    const group = hex.slice(cursor, cursor + groupLength)
    if (group === '') break
    masked += masked === '' ? group : `-${group}`
    cursor += groupLength
  }
  return masked
}

/** Cada tipo de chave tem sua própria máscara — CPF/CNPJ/telefone reaproveitam as já existentes. */
export function formatPixKey(type: string, value: string): string {
  if (type === 'cpf') return formatCpf(value)
  if (type === 'cnpj') return formatCnpj(value)
  if (type === 'phone') return formatPhone(value)
  if (type === 'random') return formatRandomPixKey(value)
  return value // email — texto livre, sem máscara
}

export function pixKeyMaskLength(type: string): number | undefined {
  if (type === 'cpf') return 14 // 999.999.999-99
  if (type === 'cnpj') return 18 // 99.999.999/9999-99
  if (type === 'phone') return PHONE_MASK_LENGTH
  if (type === 'random') return RANDOM_KEY_MASK_LENGTH
  return undefined // e-mail não tem tamanho fixo
}
