/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CompanySettingsUpdate } from './companySettings.types'

type Profile = CompanySettingsUpdate['profile']
type RequiredProfileField = Exclude<keyof Profile, 'taxRegime'>

export type CompanySettingsFieldError = Readonly<{
  field: RequiredProfileField
  fieldId: string
}>

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

export function profileFieldId(field: RequiredProfileField): string {
  return `field-profile-${field}`
}

export function validateCompanySettings(
  settings: CompanySettingsUpdate,
): readonly CompanySettingsFieldError[] {
  return REQUIRED_PROFILE_FIELDS.filter((field) => settings.profile[field].trim() === '').map(
    (field) => ({ field, fieldId: profileFieldId(field) }),
  )
}
