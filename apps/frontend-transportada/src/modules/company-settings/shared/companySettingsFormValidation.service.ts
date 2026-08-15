/* Copyright (c) 2026 Ada Technology. MIT License. */
import { normalizeRntrc } from '@/modules/shared/rntrc.service'
import {
  CNPJ_LENGTH,
  hasValidCnpjCharacterSet,
  normalizeTaxId,
} from '@/modules/shared/taxId.service'

import { PROFILE_DIGIT_LENGTHS } from './companySettings.constant'
import type { CompanySettingsUpdate } from './companySettings.types'

type Profile = CompanySettingsUpdate['profile']
type RequiredProfileField = Exclude<keyof Profile, 'taxRegime'>
type DigitProfileField = keyof typeof PROFILE_DIGIT_LENGTHS

type TranslateFieldError = (
  key: string,
  values: Readonly<Record<string, number | string>>,
) => string

export type CompanySettingsFieldError =
  | Readonly<{
      expectedLength: number
      field: DigitProfileField
      fieldId: string
      reason: 'digitLength'
    }>
  | Readonly<{ field: 'cnpj'; fieldId: string; reason: 'characterSet' }>
  | Readonly<{ field: RequiredProfileField; fieldId: string; reason: 'required' }>

const REQUIRED_PROFILE_FIELDS: readonly RequiredProfileField[] = [
  'legalName',
  'cnpj',
  'rntrc',
  'street',
  'number',
  'district',
  'city',
  'state',
  'postalCode',
  'cityIbgeCode',
]

const DIGIT_PROFILE_FIELDS = Object.keys(PROFILE_DIGIT_LENGTHS) as readonly DigitProfileField[]

export function profileFieldId(field: RequiredProfileField): string {
  return `field-profile-${field}`
}

export function describeCompanySettingsFieldError(
  input: Readonly<{ error: CompanySettingsFieldError; translate: TranslateFieldError }>,
): string {
  const field = input.translate(input.error.field, {})
  if (input.error.reason === 'digitLength') {
    return input.translate('validationDigitLength', {
      field,
      length: input.error.expectedLength,
    })
  }
  if (input.error.reason === 'characterSet') {
    return input.translate('validationCharacterSet', { field })
  }
  return input.translate('validationRequiredField', { field })
}

/**
 * O CNPJ alfanumérico não cabe na conferência por dígito: letra fora da base é erro de conjunto, e
 * acusá-la como "faltam dígitos" mandaria o usuário procurar o que não está faltando.
 */
function cnpjError(raw: string): CompanySettingsFieldError | undefined {
  const document = normalizeTaxId(raw)
  const fieldId = profileFieldId('cnpj')
  if (document === '') return undefined
  if (!hasValidCnpjCharacterSet(document)) return { field: 'cnpj', fieldId, reason: 'characterSet' }
  if (document.length === CNPJ_LENGTH) return undefined
  return { expectedLength: CNPJ_LENGTH, field: 'cnpj', fieldId, reason: 'digitLength' }
}

function digitLengthError(
  input: Readonly<{ field: DigitProfileField; profile: Profile }>,
): CompanySettingsFieldError | undefined {
  if (input.field === 'cnpj') return cnpjError(input.profile.cnpj)
  const expectedLength = PROFILE_DIGIT_LENGTHS[input.field]
  const raw = input.profile[input.field]
  const value = input.field === 'rntrc' ? normalizeRntrc(raw) : raw.replace(/\D/g, '')
  // Campo vazio já é acusado como obrigatório: dois erros para o mesmo campo só confundem.
  if (value === '' || value.length === expectedLength) return undefined
  return {
    expectedLength,
    field: input.field,
    fieldId: profileFieldId(input.field),
    reason: 'digitLength',
  }
}

export function validateCompanySettings(
  settings: CompanySettingsUpdate,
): readonly CompanySettingsFieldError[] {
  const missing = REQUIRED_PROFILE_FIELDS.filter(
    (field) => settings.profile[field].trim() === '',
  ).map<CompanySettingsFieldError>((field) => ({
    field,
    fieldId: profileFieldId(field),
    reason: 'required',
  }))
  const wrongLength = DIGIT_PROFILE_FIELDS.map((field) =>
    digitLengthError({ field, profile: settings.profile }),
  ).filter((error): error is CompanySettingsFieldError => error !== undefined)
  return [...missing, ...wrongLength]
}
