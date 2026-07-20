/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isCertificatesResponse,
  isRecord,
  isSafeCertificate,
  isSettingsResponse,
  toSafeCertificate,
} from './companySettingsResponse.validation'
import type {
  CompanySettingsResponse,
  CompanySettingsUpdate,
  DigitalCertificatesResponse,
  SafeCertificate,
} from './companySettings.types'

export type {
  CompanySettingsResponse,
  CompanySettingsUpdate,
  DigitalCertificatesResponse,
  SafeCertificate,
} from './companySettings.types'

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
  newIdempotencyKey: () => string
}>

export type CompanySettingsClient = Readonly<{
  getSettings: () => Promise<CompanySettingsResponse>
  listCertificates: (
    input: Readonly<{ cursor?: string; limit: number }>,
  ) => Promise<DigitalCertificatesResponse>
  replaceCertificate: (input: FormData) => Promise<SafeCertificate>
  updateSettings: (input: CompanySettingsUpdate) => Promise<CompanySettingsResponse>
}>

export type CompanySettingsClientFactory = (input: ClientDependencies) => CompanySettingsClient

function requestError(code: string): Error {
  return new Error(code)
}

async function requestJson(
  input: Readonly<{ request: Request; fetch: ClientDependencies['fetch'] }>,
): Promise<unknown> {
  let response: Response
  try {
    response = await input.fetch(input.request)
  } catch {
    throw requestError('COMPANY_SETTINGS_REQUEST_FAILED')
  }
  if (!response.ok) throw requestError('COMPANY_SETTINGS_REQUEST_FAILED')
  try {
    return JSON.parse(await response.text()) as unknown
  } catch {
    throw requestError('COMPANY_SETTINGS_RESPONSE_INVALID')
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
    cte: {
      environment: input.cte.environment,
      nextNumber: input.cte.nextNumber,
      series: input.cte.series,
    },
    expectedVersion: input.expectedVersion,
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

export const createCompanySettingsClient: CompanySettingsClientFactory = (dependencies) => ({
  getSettings: () => readSettings(dependencies),
  listCertificates: (request) => readCertificates({ dependencies, request }),
  replaceCertificate: (body) => replaceCertificate({ body, dependencies }),
  updateSettings: (settings) => updateSettings({ dependencies, settings }),
})
