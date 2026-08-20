/* Copyright (c) 2026 Ada Technology. MIT License. */
export { formatCnpj } from '@/modules/shared/taxId.service'
/** A máscara de CEP é a mesma do cadastro de motorista — uma só, para as duas não divergirem. */
export { formatPostalCode } from '@/modules/shared/postalCode.service'

import type { CompanySettingsUpdate } from './companySettings.types'
import { normalizePixKey } from './pixKeyType.service'

/** Nenhum corte por tamanho: dígito excedente precisa continuar visível para a validação acusar. */
export function stripNonDigits(value: string): string {
  return value.replace(/\D/g, '')
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
