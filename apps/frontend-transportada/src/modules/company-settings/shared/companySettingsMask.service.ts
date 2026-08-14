/* Copyright (c) 2026 Ada Technology. MIT License. */
import { normalizeTaxId } from '@/modules/shared/taxId.service'

import { PROFILE_DIGIT_LENGTHS } from './companySettings.constant'
import type { CompanySettingsUpdate } from './companySettings.types'
import { normalizePixKey } from './pixKeyType.service'

/** Nenhum corte por tamanho: dígito excedente precisa continuar visível para a validação acusar. */
export function stripNonDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Máscara por posição, não por classe de caractere: a base do CNPJ alfanumérico tem letra, e um
 * `\d` no lugar errado deixaria de mascarar o documento inteiro.
 */
const CNPJ_GROUPS = [
  { end: 2, separator: '', start: 0 },
  { end: 5, separator: '.', start: 2 },
  { end: 8, separator: '.', start: 5 },
  { end: 12, separator: '/', start: 8 },
  { end: 14, separator: '-', start: 12 },
] as const

/** Acima do tamanho legal a máscara sairia do lugar e esconderia o excesso — melhor exibir cru. */
export function formatCnpj(value: string): string {
  const document = normalizeTaxId(value)
  if (document.length > PROFILE_DIGIT_LENGTHS.cnpj) return document

  let masked = ''
  for (const group of CNPJ_GROUPS) {
    const part = document.slice(group.start, group.end)
    if (part === '') break
    masked += masked === '' ? part : `${group.separator}${part}`
  }
  return masked
}

export function formatPostalCode(value: string): string {
  const digits = stripNonDigits(value)
  if (digits.length > PROFILE_DIGIT_LENGTHS.postalCode) return digits
  return digits.replace(/^(\d{5})(\d)/, '$1-$2')
}

/** Agrupa dígitos da direita para a esquerda em blocos de 3 — máscara de IE sem formato fixo por UF. */
export function formatDigitGroups(value: string): string {
  if (value === '' || !/^\d+$/.test(value)) return value
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** IE aceita "ISENTO" e variações alfanuméricas — a máscara só se aplica a valores puramente numéricos. */
export function stripStateRegistrationMask(value: string): string {
  return value.replace(/[./]/g, '')
}

/** Conta bancária tem dígito verificador; alguns bancos usam "X" como verificador (ex: Itaú). */
export function digitsWithOptionalCheckDigit(value: string): string {
  return value.replace(/[^0-9Xx]/g, '').toUpperCase()
}

/** Separa o dígito verificador por hífen só para exibição — o valor salvo continua sem o hífen. */
export function formatBankAccountNumber(value: string): string {
  const raw = digitsWithOptionalCheckDigit(value)
  if (raw.length < 2) return raw
  return `${raw.slice(0, -1)}-${raw.slice(-1)}`
}

/** Valor legado com máscara antiga nunca passa pelo onChange — só o submit garante o payload limpo. */
export function normalizeCompanySettingsMasks(
  settings: CompanySettingsUpdate,
): CompanySettingsUpdate {
  return {
    ...settings,
    billing: {
      ...settings.billing,
      bankAccount: digitsWithOptionalCheckDigit(settings.billing.bankAccount),
      pixKey: normalizePixKey(settings.billing.pixKey),
    },
    profile: {
      ...settings.profile,
      rntrc: stripNonDigits(settings.profile.rntrc),
      stateRegistration: stripStateRegistrationMask(settings.profile.stateRegistration),
    },
  }
}
