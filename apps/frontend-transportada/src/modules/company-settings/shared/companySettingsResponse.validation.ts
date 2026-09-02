import { hasExactKeys } from '@/modules/shared/objectKeys.service'
/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CTE_RETRY_BACKOFF_STEPS_LIMIT,
  CTE_RETRY_MAX_ATTEMPTS_LIMIT,
} from './companySettings.constant'
import { ACTIVATION_CHANNELS, CERTIFICATE_PURPOSES } from './companySettings.types'
import type {
  CompanyProfileLookup,
  CompanyProfileLookupResponse,
  CompanySettingsResponse,
  DigitalCertificatesResponse,
  SafeCertificate,
} from './companySettings.types'

const ACTIVATION_KEYS = ['channel']
const BILLING_KEYS = ['bankAccount', 'bankBranch', 'bankCode', 'bankName', 'observations', 'pixKey']
const CERTIFICATE_KEYS = ['expiresAt', 'id', 'purpose', 'status', 'validFrom', 'version']
const CTE_KEYS = ['environment', 'nextNumber', 'series', 'version']
const CTE_RETRY_KEYS = ['backoffSeconds', 'maxAttempts']
const DECIMAL = /^[1-9][0-9]{0,18}$/
const MDFE_KEYS = [
  'bankBranch',
  'bankCode',
  'insurancePolicy',
  'insuranceResponsibility',
  'insurerName',
  'insurerTaxId',
  'pixKey',
]
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
const LOOKUP_PROFILE_KEYS = [
  'city',
  'cityIbgeCode',
  'cnpj',
  'complement',
  'district',
  'email',
  'legalName',
  'number',
  'phone',
  'postalCode',
  'state',
  'stateRegistration',
  'street',
  'tradeName',
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

export function isSafeCertificate(value: unknown): value is SafeCertificate {
  if (!isRecord(value) || !hasExactKeys(value, CERTIFICATE_KEYS)) return false
  return (
    typeof value.id === 'string' &&
    UUID.test(value.id) &&
    CERTIFICATE_PURPOSES.some((purpose) => purpose === value.purpose) &&
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

export function isCompanyProfileLookup(value: unknown): value is CompanyProfileLookup {
  return (
    isRecord(value) &&
    hasExactKeys(value, LOOKUP_PROFILE_KEYS) &&
    LOOKUP_PROFILE_KEYS.every((key) => typeof value[key] === 'string')
  )
}

function isCteSettings(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, CTE_KEYS)) return false
  return (
    (value.environment === 'homologation' || value.environment === 'production') &&
    isDecimal(value.nextNumber) &&
    isDecimal(value.series) &&
    isDecimal(value.version)
  )
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1
}

function isCteRetryPolicy(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, CTE_RETRY_KEYS)) return false
  const { backoffSeconds, maxAttempts } = value
  return (
    Array.isArray(backoffSeconds) &&
    backoffSeconds.length >= 1 &&
    backoffSeconds.length <= CTE_RETRY_BACKOFF_STEPS_LIMIT &&
    backoffSeconds.every(isPositiveInteger) &&
    isPositiveInteger(maxAttempts) &&
    maxAttempts <= CTE_RETRY_MAX_ATTEMPTS_LIMIT
  )
}

function isActivation(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, ACTIVATION_KEYS)) return false
  return ACTIVATION_CHANNELS.some((channel) => channel === value.channel)
}

function isBillingDefaults(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, BILLING_KEYS)) return false
  return BILLING_KEYS.every((key) => typeof value[key] === 'string')
}

function isMdfeDefaults(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, MDFE_KEYS)) return false
  const responsibility = value.insuranceResponsibility
  return (
    MDFE_KEYS.every((key) => typeof value[key] === 'string') &&
    (responsibility === '' || responsibility === '1' || responsibility === '2')
  )
}

function isFiscalProfile(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, PROFILE_KEYS)) return false
  const allTextFields = PROFILE_KEYS.filter((key) => key !== 'taxRegime')
  return (
    allTextFields.every((key) => typeof value[key] === 'string') &&
    isDecimal(value.version) &&
    (value.taxRegime === '1' || value.taxRegime === '2' || value.taxRegime === '3')
  )
}

export function isSettingsResponse(value: unknown): value is CompanySettingsResponse {
  if (!isRecord(value) || !hasExactKeys(value, ['data']) || !isRecord(value.data)) return false
  const { activation, billing, cte, cteRetry, mdfe, profile } = value.data
  return (
    hasExactKeys(value.data, ['activation', 'billing', 'cte', 'cteRetry', 'mdfe', 'profile']) &&
    (activation === null || isActivation(activation)) &&
    (billing === null || isBillingDefaults(billing)) &&
    (cte === null || isCteSettings(cte)) &&
    (cteRetry === null || isCteRetryPolicy(cteRetry)) &&
    (mdfe === null || isMdfeDefaults(mdfe)) &&
    (profile === null || isFiscalProfile(profile))
  )
}

export function isCertificatesResponse(value: unknown): value is DigitalCertificatesResponse {
  if (!isRecord(value) || !hasExactKeys(value, ['data', 'page']) || !Array.isArray(value.data))
    return false
  return (
    isRecord(value.page) &&
    hasExactKeys(value.page, ['nextCursor']) &&
    (value.page.nextCursor === null ||
      (typeof value.page.nextCursor === 'string' &&
        /^[A-Za-z0-9_-]+$/.test(value.page.nextCursor))) &&
    value.data.every(isSafeCertificate)
  )
}

export function isCompanyProfileLookupResponse(
  value: unknown,
): value is CompanyProfileLookupResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['data']) &&
    (value.data === null || isCompanyProfileLookup(value.data))
  )
}
