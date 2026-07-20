/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CompanySettingsResponse,
  DigitalCertificatesResponse,
  SafeCertificate,
} from './companySettings.types'

const CERTIFICATE_KEYS = ['expiresAt', 'id', 'purpose', 'status', 'validFrom', 'version']
const CTE_KEYS = ['environment', 'nextNumber', 'series', 'version']
const DECIMAL = /^[1-9][0-9]{0,18}$/
const MAX_DATABASE_BIGINT = 9_223_372_036_854_775_807n
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PROFILE_KEYS = [
  'city',
  'cityIbgeCode',
  'cnpj',
  'complement',
  'district',
  'email',
  'legalName',
  'municipalRegistration',
  'number',
  'phone',
  'postalCode',
  'rntrc',
  'state',
  'stateRegistration',
  'street',
  'taxRegime',
  'tradeName',
  'version',
]

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value
}

function isDecimal(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL.test(value) && BigInt(value) <= MAX_DATABASE_BIGINT
}

function hasExactKeys(
  input: Readonly<{
    keys: readonly string[]
    value: Record<string, unknown>
  }>,
): boolean {
  const currentKeys = Object.keys(input.value).sort()
  const expectedKeys = [...input.keys].sort()
  return (
    currentKeys.length === input.keys.length &&
    currentKeys.every((key, index) => key === expectedKeys[index])
  )
}

export function isSafeCertificate(value: unknown): value is SafeCertificate {
  if (!isRecord(value) || !hasExactKeys({ keys: CERTIFICATE_KEYS, value })) return false
  return (
    typeof value.id === 'string' &&
    UUID.test(value.id) &&
    value.purpose === 'cte' &&
    (value.status === 'active' || value.status === 'retired') &&
    isIsoDate(value.validFrom) &&
    isIsoDate(value.expiresAt) &&
    isDecimal(value.version)
  )
}

export function toSafeCertificate(value: SafeCertificate): SafeCertificate {
  return {
    id: value.id,
    status: value.status,
    purpose: value.purpose,
    validFrom: value.validFrom,
    expiresAt: value.expiresAt,
    version: value.version,
  }
}

function isCteSettings(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys({ keys: CTE_KEYS, value })) return false
  return (
    (value.environment === 'homologation' || value.environment === 'production') &&
    isDecimal(value.nextNumber) &&
    isDecimal(value.series) &&
    isDecimal(value.version)
  )
}

function isFiscalProfile(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys({ keys: PROFILE_KEYS, value })) return false
  const allTextFields = PROFILE_KEYS.filter((key) => key !== 'taxRegime')
  return (
    allTextFields.every((key) => typeof value[key] === 'string') &&
    isDecimal(value.version) &&
    (value.taxRegime === '1' || value.taxRegime === '2' || value.taxRegime === '3')
  )
}

export function isSettingsResponse(value: unknown): value is CompanySettingsResponse {
  if (!isRecord(value) || !hasExactKeys({ keys: ['data'], value }) || !isRecord(value.data))
    return false
  const { activeCertificate, cte, profile } = value.data
  return (
    hasExactKeys({ keys: ['activeCertificate', 'cte', 'profile'], value: value.data }) &&
    (activeCertificate === null || isSafeCertificate(activeCertificate)) &&
    (cte === null || isCteSettings(cte)) &&
    (profile === null || isFiscalProfile(profile))
  )
}

export function isCertificatesResponse(value: unknown): value is DigitalCertificatesResponse {
  if (
    !isRecord(value) ||
    !hasExactKeys({ keys: ['data', 'page'], value }) ||
    !Array.isArray(value.data)
  )
    return false
  return (
    isRecord(value.page) &&
    hasExactKeys({ keys: ['nextCursor'], value: value.page }) &&
    (value.page.nextCursor === null ||
      (typeof value.page.nextCursor === 'string' &&
        /^[A-Za-z0-9_-]+$/.test(value.page.nextCursor))) &&
    value.data.every(isSafeCertificate)
  )
}
