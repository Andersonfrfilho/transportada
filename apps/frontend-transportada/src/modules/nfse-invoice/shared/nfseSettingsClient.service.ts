/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { NfseCredentialBody } from './nfseCredentialForm.service'
import {
  NFSE_EMISSION_PROFILES_PATH,
  NFSE_EMISSION_PROFILE_PAGE_SIZE,
  NFSE_PROVIDER_CREDENTIALS_PATH,
  NFSE_SETTINGS_ERROR,
} from './nfseInvoice.constant'
import { isRecord, isString } from './nfseInvoiceGuards.validation'
import {
  credentialFromApi,
  nullableCredentialFromApi,
  profileFromApi,
  profileListFromApi,
} from './nfseSettingsResponse.validation'
import type {
  NfseEmissionProfile,
  NfseEmissionProfileSettings,
  NfseFiscalEnvironment,
  NfseProviderCredentialSummary,
} from './nfseSettings.types'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type NfseProfileStatusChange = Readonly<{
  expectedVersion: string
  profileId: string
  status: 'active' | 'inactive'
}>

export type NfseProfileCreation = Readonly<{
  idempotencyKey: string
  settings: NfseEmissionProfileSettings
}>

export type NfseProfileUpdate = Readonly<{
  expectedVersion: string
  profileId: string
  settings: NfseEmissionProfileSettings
}>

export type NfseSettingsClient = Readonly<{
  changeProfileStatus: (input: NfseProfileStatusChange) => Promise<NfseEmissionProfile>
  createProfile: (input: NfseProfileCreation) => Promise<NfseEmissionProfile>
  getCredential: (
    input: Readonly<{ fiscalEnvironment: NfseFiscalEnvironment }>,
  ) => Promise<NfseProviderCredentialSummary | null>
  listProfiles: () => Promise<readonly NfseEmissionProfile[]>
  saveCredential: (input: NfseCredentialBody) => Promise<NfseProviderCredentialSummary>
  updateProfile: (input: NfseProfileUpdate) => Promise<NfseEmissionProfile>
}>

function requestError(code: string): Error {
  return new Error(code)
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload['error']) && isString(payload['error']['code'])) {
    return payload['error']['code']
  }
  return NFSE_SETTINGS_ERROR.REQUEST_FAILED
}

/** A chave de idempotência é cabeçalho, nunca corpo: o schema da API é `.strict()`. */
async function authorizedRequest(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    idempotencyKey?: string
    method: 'GET' | 'PATCH' | 'POST' | 'PUT'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey

  const requestInit: RequestInit = { cache: 'no-store', headers, method: input.method }
  if (input.body !== undefined) requestInit.body = input.body

  const response = await input.dependencies.fetch(
    new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
  )
  const text = await response.text()

  let payload: unknown
  try {
    payload = text.length === 0 ? undefined : (JSON.parse(text) as unknown)
  } catch {
    throw requestError(
      response.ok ? NFSE_SETTINGS_ERROR.RESPONSE_INVALID : NFSE_SETTINGS_ERROR.REQUEST_FAILED,
    )
  }

  if (!response.ok) throw requestError(readErrorCode(payload))
  return payload
}

/** Campo a campo: o `.strict()` da API recusa `companyId`, `status` ou `version` no corpo. */
function serializeSettings(settings: NfseEmissionProfileSettings): Record<string, unknown> {
  return {
    chargeComponentLabel: settings.chargeComponentLabel,
    cnaeCode: settings.cnaeCode,
    descriptionMaxLength: settings.descriptionMaxLength,
    descriptionTemplate: settings.descriptionTemplate,
    freightRuleId: settings.freightRuleId,
    issExigibility: settings.issExigibility,
    issRate: settings.issRate,
    issWithheld: settings.issWithheld,
    municipalTaxationCode: settings.municipalTaxationCode,
    municipalityIbgeCode: settings.municipalityIbgeCode,
    municipalityName: settings.municipalityName,
    name: settings.name,
    nbsCode: settings.nbsCode,
    observations: settings.observations,
    serviceListItem: settings.serviceListItem,
    taker: settings.taker,
  }
}

export function createNfseSettingsClient(dependencies: ClientDependencies): NfseSettingsClient {
  return {
    async changeProfileStatus(input) {
      const payload = await authorizedRequest({
        body: JSON.stringify({ expectedVersion: input.expectedVersion, status: input.status }),
        dependencies,
        method: 'PATCH',
        path: `${NFSE_EMISSION_PROFILES_PATH}/${input.profileId}/status`,
      })
      return profileFromApi(payload)
    },
    async createProfile(input) {
      const payload = await authorizedRequest({
        body: JSON.stringify(serializeSettings(input.settings)),
        dependencies,
        idempotencyKey: input.idempotencyKey,
        method: 'POST',
        path: NFSE_EMISSION_PROFILES_PATH,
      })
      return profileFromApi(payload)
    },
    async getCredential(input) {
      const search = new URLSearchParams({ fiscalEnvironment: input.fiscalEnvironment })
      const payload = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${NFSE_PROVIDER_CREDENTIALS_PATH}?${search.toString()}`,
      })
      return nullableCredentialFromApi(payload)
    },
    async listProfiles() {
      const search = new URLSearchParams({ limit: String(NFSE_EMISSION_PROFILE_PAGE_SIZE) })
      const payload = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${NFSE_EMISSION_PROFILES_PATH}?${search.toString()}`,
      })
      return profileListFromApi(payload)
    },
    async saveCredential(input) {
      const payload = await authorizedRequest({
        body: JSON.stringify({
          apiToken: input.apiToken,
          fiscalEnvironment: input.fiscalEnvironment,
          municipalRegistration: input.municipalRegistration,
          status: input.status,
          taxId: input.taxId,
        }),
        dependencies,
        method: 'PUT',
        path: NFSE_PROVIDER_CREDENTIALS_PATH,
      })
      return credentialFromApi(payload)
    },
    async updateProfile(input) {
      const payload = await authorizedRequest({
        body: JSON.stringify({
          expectedVersion: input.expectedVersion,
          settings: serializeSettings(input.settings),
        }),
        dependencies,
        method: 'PATCH',
        path: `${NFSE_EMISSION_PROFILES_PATH}/${input.profileId}`,
      })
      return profileFromApi(payload)
    },
  }
}
