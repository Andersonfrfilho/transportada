/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  COMPANY_LOGO_FIELD,
  isCompanyLogoMetadata,
  isCompanyLogoMimeType,
} from './companyLogo.validation'
import {
  isCertificatesResponse,
  isCompanyProfileLookupResponse,
  isRecord,
  isSafeCertificate,
  isSettingsResponse,
  toSafeCertificate,
} from './companySettingsResponse.validation'
import {
  isDistributionCursorResponse,
  type DistributionCursor,
} from './distributionCursor.validation'
import type { FuelProduct } from '../../shared/fuel.constant'
import {
  isFuelPriceListResponse,
  isFuelPriceResponse,
  type FuelPriceEntry,
} from './fuelPrice.validation'
import {
  isScheduledDistributionResponse,
  type ScheduledDistributionStatus,
} from './scheduledDistribution.validation'
import type {
  CertificatePurpose,
  CompanyLogoImage,
  CompanyLogoMetadata,
  CompanyProfileLookup,
  CompanySettingsResponse,
  CompanySettingsUpdate,
  DigitalCertificatesResponse,
  SafeCertificate,
} from './companySettings.types'

export { CERTIFICATE_PURPOSES } from './companySettings.types'
export type {
  CertificatePurpose,
  CompanyLogoImage,
  CompanyLogoMetadata,
  CompanyProfileLookup,
  CompanyProfileLookupResponse,
  CompanySettingsResponse,
  CompanySettingsUpdate,
  DigitalCertificatesResponse,
  SafeCertificate,
} from './companySettings.types'

const COMPANY_LOGO_PATH = '/company-settings/logo'
const COMPANY_SCHEDULED_DISTRIBUTION_PATH = '/company-settings/scheduled-distribution'
const COMPANY_DISTRIBUTION_CURSOR_PATH = '/company-settings/distribution-cursor'
const COMPANY_FUEL_PRICES_PATH = '/company-settings/fuel-prices'
const DATA_URL_CHUNK = 8_192

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
  newIdempotencyKey: () => string
}>

class CompanySettingsRequestError extends Error {
  public readonly code: string

  public constructor(code: string) {
    super(code)
    this.name = 'CompanySettingsRequestError'
    this.code = code
  }
}

export type { ScheduledDistributionStatus } from './scheduledDistribution.validation'
export type { DistributionCursor, DistributionCursorSkip } from './distributionCursor.validation'
export type {
  EnergyTariff,
  FuelPriceEntry,
  FuelPriceReference,
  FuelPriceSource,
} from './fuelPrice.validation'

export type CompanySettingsClient = Readonly<{
  adjustDistributionCursor: (ultNsu: string) => Promise<DistributionCursor>
  adjustFuelPrice: (
    input: Readonly<{ pricePerUnit: string; product: FuelProduct }>,
  ) => Promise<FuelPriceEntry>
  clearFuelPrice: (product: FuelProduct) => Promise<void>
  disableScheduledDistribution: () => Promise<ScheduledDistributionStatus>
  enableScheduledDistribution: () => Promise<ScheduledDistributionStatus>
  getDistributionCursor: () => Promise<DistributionCursor>
  getFuelPrices: () => Promise<readonly FuelPriceEntry[]>
  getLogo: () => Promise<CompanyLogoImage | null>
  getScheduledDistribution: () => Promise<ScheduledDistributionStatus>
  getSettings: () => Promise<CompanySettingsResponse>
  listCertificates: (
    input: Readonly<{ cursor?: string; limit: number }>,
  ) => Promise<DigitalCertificatesResponse>
  lookupProfileByCnpj: (cnpj: string) => Promise<CompanyProfileLookup | null>
  removeLogo: () => Promise<void>
  retireCertificate: (purpose: CertificatePurpose) => Promise<void>
  replaceCertificate: (input: FormData) => Promise<SafeCertificate>
  replaceLogo: (file: File) => Promise<CompanyLogoMetadata>
  updateSettings: (input: CompanySettingsUpdate) => Promise<CompanySettingsResponse>
}>

export type CompanySettingsClientFactory = (input: ClientDependencies) => CompanySettingsClient

function requestError(code: string): Error {
  return new CompanySettingsRequestError(code)
}

async function requestJson(
  input: Readonly<{ request: Request; fetch: ClientDependencies['fetch'] }>,
): Promise<unknown> {
  let response: Response
  try {
    response = await input.fetch(input.request)
  } catch {
    throw requestError('COMPANY_SETTINGS_NETWORK_ERROR')
  }
  const responseText = await response.text()
  if (!response.ok) throw requestError(readErrorCode(responseText))
  try {
    return JSON.parse(responseText) as unknown
  } catch {
    throw requestError('COMPANY_SETTINGS_RESPONSE_INVALID')
  }
}

function readErrorCode(responseText: string): string {
  try {
    const parsed = JSON.parse(responseText) as unknown
    if (!isRecord(parsed) || !isRecord(parsed.error)) return 'COMPANY_SETTINGS_REQUEST_FAILED'
    return typeof parsed.error.code === 'string'
      ? parsed.error.code
      : 'COMPANY_SETTINGS_REQUEST_FAILED'
  } catch {
    return 'COMPANY_SETTINGS_REQUEST_FAILED'
  }
}

function getRequest(
  input: Readonly<{ dependencies: ClientDependencies; path: string }>,
): Promise<unknown> {
  return input.dependencies.getAccessToken().then((accessToken) =>
    requestJson({
      fetch: input.dependencies.fetch,
      request: new Request(`${input.dependencies.apiBaseUrl}${input.path}`, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'GET',
      }),
    }),
  )
}

function cleanUpdate(input: CompanySettingsUpdate): CompanySettingsUpdate {
  return {
    billing: {
      bankAccount: input.billing.bankAccount,
      bankBranch: input.billing.bankBranch,
      bankCode: input.billing.bankCode,
      bankName: input.billing.bankName,
      observations: input.billing.observations,
      pixKey: input.billing.pixKey,
    },
    cte: {
      environment: input.cte.environment,
      nextNumber: input.cte.nextNumber,
      series: input.cte.series,
    },
    cteRetry: {
      backoffSeconds: [...input.cteRetry.backoffSeconds],
      maxAttempts: input.cteRetry.maxAttempts,
    },
    expectedVersion: input.expectedVersion,
    mdfe: {
      bankBranch: input.mdfe.bankBranch,
      bankCode: input.mdfe.bankCode,
      insurancePolicy: input.mdfe.insurancePolicy,
      insuranceResponsibility: input.mdfe.insuranceResponsibility,
      insurerName: input.mdfe.insurerName,
      insurerTaxId: input.mdfe.insurerTaxId,
      pixKey: input.mdfe.pixKey,
    },
    profile: {
      city: input.profile.city,
      cityIbgeCode: input.profile.cityIbgeCode,
      cnpj: input.profile.cnpj,
      complement: input.profile.complement,
      district: input.profile.district,
      email: input.profile.email,
      legalName: input.profile.legalName,
      municipalRegistration: input.profile.municipalRegistration,
      number: input.profile.number,
      phone: input.profile.phone,
      postalCode: input.profile.postalCode,
      rntrc: input.profile.rntrc,
      state: input.profile.state,
      stateRegistration: input.profile.stateRegistration,
      street: input.profile.street,
      taxRegime: input.profile.taxRegime,
      tradeName: input.profile.tradeName,
    },
  }
}

function multipartRequest(
  input: Readonly<{ accessToken: string; body: FormData; dependencies: ClientDependencies }>,
): Request {
  return new Request(`${input.dependencies.apiBaseUrl}/digital-certificates`, {
    body: input.body,
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'idempotency-key': input.dependencies.newIdempotencyKey(),
    },
    method: 'POST',
  })
}

async function sendRequest(
  input: Readonly<{ dependencies: ClientDependencies; request: Request }>,
): Promise<Response> {
  let response: Response
  try {
    response = await input.dependencies.fetch(input.request)
  } catch {
    throw requestError('COMPANY_SETTINGS_NETWORK_ERROR')
  }
  if (!response.ok && response.status !== 404)
    throw requestError(readErrorCode(await response.text()))
  return response
}

function logoRequest(
  input: Readonly<{
    accessToken: string
    body?: FormData
    dependencies: ClientDependencies
    method: string
  }>,
): Request {
  return new Request(`${input.dependencies.apiBaseUrl}${COMPANY_LOGO_PATH}`, {
    ...(input.body === undefined ? {} : { body: input.body }),
    cache: 'no-store',
    headers: { authorization: `Bearer ${input.accessToken}` },
    method: input.method,
  })
}

function toDataUrl(input: Readonly<{ bytes: ArrayBuffer; mimeType: string }>): string {
  const view = new Uint8Array(input.bytes)
  let binary = ''
  for (let offset = 0; offset < view.length; offset += DATA_URL_CHUNK) {
    binary += String.fromCharCode(...view.subarray(offset, offset + DATA_URL_CHUNK))
  }
  return `data:${input.mimeType};base64,${btoa(binary)}`
}

async function readLogo(dependencies: ClientDependencies): Promise<CompanyLogoImage | null> {
  const accessToken = await dependencies.getAccessToken()
  const response = await sendRequest({
    dependencies,
    request: logoRequest({ accessToken, dependencies, method: 'GET' }),
  })
  if (response.status === 404) return null
  const mimeType = response.headers.get('content-type') ?? ''
  if (!isCompanyLogoMimeType(mimeType)) throw requestError('COMPANY_SETTINGS_RESPONSE_INVALID')
  return { dataUrl: toDataUrl({ bytes: await response.arrayBuffer(), mimeType }), mimeType }
}

async function replaceLogo(
  input: Readonly<{ dependencies: ClientDependencies; file: File }>,
): Promise<CompanyLogoMetadata> {
  const accessToken = await input.dependencies.getAccessToken()
  const body = new FormData()
  body.set(COMPANY_LOGO_FIELD, input.file)
  const response = await requestJson({
    fetch: input.dependencies.fetch,
    request: logoRequest({ accessToken, body, dependencies: input.dependencies, method: 'PUT' }),
  })
  if (
    !isRecord(response) ||
    Object.keys(response).length !== 1 ||
    !isCompanyLogoMetadata(response.data)
  )
    throw requestError('COMPANY_SETTINGS_RESPONSE_INVALID')
  return response.data
}

async function removeLogo(dependencies: ClientDependencies): Promise<void> {
  const accessToken = await dependencies.getAccessToken()
  const response = await sendRequest({
    dependencies,
    request: logoRequest({ accessToken, dependencies, method: 'DELETE' }),
  })
  if (response.status === 404) throw requestError(readErrorCode(await response.text()))
}

async function readSettings(dependencies: ClientDependencies): Promise<CompanySettingsResponse> {
  const response = await getRequest({ dependencies, path: '/company-settings' })
  if (!isSettingsResponse(response)) throw requestError('COMPANY_SETTINGS_RESPONSE_INVALID')
  return response
}

async function readCertificates(
  input: Readonly<{
    dependencies: ClientDependencies
    request: Readonly<{ cursor?: string; limit: number }>
  }>,
): Promise<DigitalCertificatesResponse> {
  const search = new URLSearchParams({ limit: String(input.request.limit) })
  if (input.request.cursor !== undefined) search.set('cursor', input.request.cursor)
  const response = await getRequest({
    dependencies: input.dependencies,
    path: `/digital-certificates?${search}`,
  })
  if (!isCertificatesResponse(response)) throw requestError('COMPANY_SETTINGS_RESPONSE_INVALID')
  return response
}

async function lookupProfileByCnpj(
  input: Readonly<{ cnpj: string; dependencies: ClientDependencies }>,
): Promise<CompanyProfileLookup | null> {
  const response = await getRequest({
    dependencies: input.dependencies,
    path: `/company-settings/cnpj-info?cnpj=${encodeURIComponent(input.cnpj)}`,
  })
  if (!isCompanyProfileLookupResponse(response))
    throw requestError('COMPANY_SETTINGS_RESPONSE_INVALID')
  return response.data
}

async function replaceCertificate(
  input: Readonly<{ body: FormData; dependencies: ClientDependencies }>,
): Promise<SafeCertificate> {
  const accessToken = await input.dependencies.getAccessToken()
  const response = await requestJson({
    fetch: input.dependencies.fetch,
    request: multipartRequest({
      accessToken,
      body: input.body,
      dependencies: input.dependencies,
    }),
  })
  if (
    !isRecord(response) ||
    Object.keys(response).length !== 1 ||
    !isSafeCertificate(response.data)
  )
    throw requestError('COMPANY_SETTINGS_RESPONSE_INVALID')
  return toSafeCertificate(response.data)
}

async function retireCertificate(
  input: Readonly<{ dependencies: ClientDependencies; purpose: CertificatePurpose }>,
): Promise<void> {
  const { dependencies } = input
  const accessToken = await dependencies.getAccessToken()
  await requestJson({
    fetch: dependencies.fetch,
    request: new Request(
      `${dependencies.apiBaseUrl}/digital-certificates?purpose=${input.purpose}`,
      {
        cache: 'no-store',
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'DELETE',
      },
    ),
  })
}

async function updateSettings(
  input: Readonly<{ dependencies: ClientDependencies; settings: CompanySettingsUpdate }>,
): Promise<CompanySettingsResponse> {
  const accessToken = await input.dependencies.getAccessToken()
  const response = await requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiBaseUrl}/company-settings`, {
      body: JSON.stringify(cleanUpdate(input.settings)),
      cache: 'no-store',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'idempotency-key': input.dependencies.newIdempotencyKey(),
      },
      method: 'PATCH',
    }),
  })
  if (!isSettingsResponse(response)) throw requestError('COMPANY_SETTINGS_RESPONSE_INVALID')
  return response
}

async function requestScheduledDistribution(
  input: Readonly<{ dependencies: ClientDependencies; method: string }>,
): Promise<ScheduledDistributionStatus> {
  const accessToken = await input.dependencies.getAccessToken()
  const response = await requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiBaseUrl}${COMPANY_SCHEDULED_DISTRIBUTION_PATH}`, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${accessToken}` },
      method: input.method,
    }),
  })
  if (!isScheduledDistributionResponse(response))
    throw requestError('COMPANY_SETTINGS_RESPONSE_INVALID')
  return response.data
}

async function requestDistributionCursor(
  input: Readonly<{
    body?: Readonly<{ ultNsu: string }>
    dependencies: ClientDependencies
    method: string
  }>,
): Promise<DistributionCursor> {
  const accessToken = await input.dependencies.getAccessToken()
  const response = await requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiBaseUrl}${COMPANY_DISTRIBUTION_CURSOR_PATH}`, {
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      cache: 'no-store',
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      method: input.method,
    }),
  })
  if (!isDistributionCursorResponse(response))
    throw requestError('COMPANY_SETTINGS_RESPONSE_INVALID')
  return response.data
}

async function readFuelPrices(
  dependencies: ClientDependencies,
): Promise<readonly FuelPriceEntry[]> {
  const response = await getRequest({ dependencies, path: COMPANY_FUEL_PRICES_PATH })
  if (!isFuelPriceListResponse(response)) throw requestError('COMPANY_SETTINGS_RESPONSE_INVALID')
  return response.data
}

async function adjustFuelPrice(
  input: Readonly<{
    dependencies: ClientDependencies
    pricePerUnit: string
    product: FuelProduct
  }>,
): Promise<FuelPriceEntry> {
  const accessToken = await input.dependencies.getAccessToken()
  const response = await requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(
      `${input.dependencies.apiBaseUrl}${COMPANY_FUEL_PRICES_PATH}/${input.product}`,
      {
        body: JSON.stringify({ pricePerUnit: input.pricePerUnit }),
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        method: 'PUT',
      },
    ),
  })
  if (!isFuelPriceResponse(response)) throw requestError('COMPANY_SETTINGS_RESPONSE_INVALID')
  return response.data
}

/** A limpeza responde 204 sem corpo: pedir JSON aqui transformaria sucesso em erro de formato. */
async function clearFuelPrice(
  input: Readonly<{ dependencies: ClientDependencies; product: FuelProduct }>,
): Promise<void> {
  const accessToken = await input.dependencies.getAccessToken()
  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiBaseUrl}${COMPANY_FUEL_PRICES_PATH}/${input.product}`, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'DELETE',
      }),
    )
  } catch {
    throw requestError('COMPANY_SETTINGS_NETWORK_ERROR')
  }
  if (!response.ok) throw requestError(readErrorCode(await response.text()))
}

export const createCompanySettingsClient: CompanySettingsClientFactory = (dependencies) => ({
  adjustDistributionCursor: (ultNsu) =>
    requestDistributionCursor({ body: { ultNsu }, dependencies, method: 'PUT' }),
  adjustFuelPrice: (input) =>
    adjustFuelPrice({ dependencies, pricePerUnit: input.pricePerUnit, product: input.product }),
  clearFuelPrice: (product) => clearFuelPrice({ dependencies, product }),
  disableScheduledDistribution: () =>
    requestScheduledDistribution({ dependencies, method: 'DELETE' }),
  enableScheduledDistribution: () => requestScheduledDistribution({ dependencies, method: 'PUT' }),
  getDistributionCursor: () => requestDistributionCursor({ dependencies, method: 'GET' }),
  getFuelPrices: () => readFuelPrices(dependencies),
  getLogo: () => readLogo(dependencies),
  getScheduledDistribution: () => requestScheduledDistribution({ dependencies, method: 'GET' }),
  getSettings: () => readSettings(dependencies),
  listCertificates: (request) => readCertificates({ dependencies, request }),
  lookupProfileByCnpj: (cnpj) => lookupProfileByCnpj({ cnpj, dependencies }),
  removeLogo: () => removeLogo(dependencies),
  retireCertificate: (purpose) => retireCertificate({ dependencies, purpose }),
  replaceCertificate: (body) => replaceCertificate({ body, dependencies }),
  replaceLogo: (file) => replaceLogo({ dependencies, file }),
  updateSettings: (settings) => updateSettings({ dependencies, settings }),
})
