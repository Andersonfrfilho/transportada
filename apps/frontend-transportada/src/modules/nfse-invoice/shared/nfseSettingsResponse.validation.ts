/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  NFSE_EMISSION_PROFILE_KEYS,
  NFSE_PROVIDER_CREDENTIAL_KEYS,
  NFSE_SETTINGS_ERROR,
} from './nfseInvoice.constant'
import {
  hasExactKeys,
  isBoolean,
  isOneOf,
  isRecord,
  isString,
} from './nfseInvoiceGuards.validation'
import {
  NFSE_CREDENTIAL_STATUSES,
  NFSE_EMISSION_PROFILE_STATUSES,
  NFSE_FISCAL_ENVIRONMENTS,
  NFSE_ISS_EXIGIBILITIES,
  NFSE_TAKERS,
  type NfseEmissionProfile,
  type NfseProviderCredentialSummary,
} from './nfseSettings.types'

/** A alíquota chega com seis casas fixas — ler como número perderia a casa que a prefeitura cobra. */
const ISS_RATE_PATTERN = /^(?:0\.[0-9]{6}|1\.000000)$/
const UNSIGNED_INTEGER_PATTERN = /^[0-9]+$/

function settingsError(): Error {
  return new Error(NFSE_SETTINGS_ERROR.RESPONSE_INVALID)
}

function isProfile(value: unknown): value is NfseEmissionProfile {
  if (!hasExactKeys(value, NFSE_EMISSION_PROFILE_KEYS)) return false

  return (
    isString(value['chargeComponentLabel']) &&
    isString(value['cnaeCode']) &&
    isString(value['companyId']) &&
    isString(value['createdAt']) &&
    UNSIGNED_INTEGER_PATTERN.test(String(value['descriptionMaxLength'])) &&
    isString(value['descriptionTemplate']) &&
    isString(value['freightRuleId']) &&
    isString(value['id']) &&
    isOneOf(value['issExigibility'], NFSE_ISS_EXIGIBILITIES) &&
    ISS_RATE_PATTERN.test(String(value['issRate'])) &&
    isBoolean(value['issWithheld']) &&
    isString(value['municipalTaxationCode']) &&
    isString(value['municipalityIbgeCode']) &&
    isString(value['municipalityName']) &&
    isString(value['name']) &&
    isString(value['nbsCode']) &&
    isString(value['observations']) &&
    isString(value['serviceListItem']) &&
    isOneOf(value['status'], NFSE_EMISSION_PROFILE_STATUSES) &&
    isOneOf(value['taker'], NFSE_TAKERS) &&
    isString(value['updatedAt']) &&
    isString(value['version'])
  )
}

/**
 * `hasExactKeys` é o que impede o token de voltar: um campo a mais no corpo recusa a resposta
 * inteira em vez de deixar o segredo entrar no estado da tela por espalhamento.
 */
function isCredentialSummary(value: unknown): value is NfseProviderCredentialSummary {
  if (!hasExactKeys(value, NFSE_PROVIDER_CREDENTIAL_KEYS)) return false

  return (
    isBoolean(value['apiTokenConfigured']) &&
    isBoolean(value['callbackTokenConfigured']) &&
    isString(value['createdAt']) &&
    isOneOf(value['fiscalEnvironment'], NFSE_FISCAL_ENVIRONMENTS) &&
    isString(value['id']) &&
    isString(value['municipalRegistration']) &&
    isString(value['provider']) &&
    isOneOf(value['status'], NFSE_CREDENTIAL_STATUSES) &&
    isString(value['taxId']) &&
    isString(value['updatedAt']) &&
    isString(value['version'])
  )
}

export function profileFromApi(payload: unknown): NfseEmissionProfile {
  if (!isRecord(payload) || !isProfile(payload['data'])) throw settingsError()
  return payload['data']
}

export function profileListFromApi(payload: unknown): readonly NfseEmissionProfile[] {
  if (!isRecord(payload) || !Array.isArray(payload['data'])) throw settingsError()
  const items = payload['data']
  if (!items.every(isProfile)) throw settingsError()
  return items
}

export function credentialFromApi(payload: unknown): NfseProviderCredentialSummary {
  if (!isRecord(payload) || !isCredentialSummary(payload['data'])) throw settingsError()
  return payload['data']
}

export function nullableCredentialFromApi(payload: unknown): NfseProviderCredentialSummary | null {
  if (!isRecord(payload)) throw settingsError()
  if (payload['data'] === null) return null
  return credentialFromApi(payload)
}
