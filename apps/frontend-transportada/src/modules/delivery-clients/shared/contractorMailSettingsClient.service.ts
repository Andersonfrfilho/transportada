/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  checksFromApi,
  nullableSettingsFromApi,
  settingsFromApi,
  testEmailResultFromApi,
} from './contractorMailSettingsResponse.validation'
import type {
  ContractorMailCheckItem,
  ContractorMailSettingsSummary,
  ContractorMailTestEmailResult,
} from './contractorMailSettings.types'

export const CONTRACTOR_MAIL_SETTINGS_PATH = '/contractor-mail-settings'
export const CONTRACTOR_MAIL_SETTINGS_CHECKS_PATH = '/contractor-mail-settings/checks'
export const CONTRACTOR_MAIL_TEST_EMAIL_PATH = '/contractor-mail-settings/test-email'

export const CONTRACTOR_MAIL_SETTINGS_ERROR = {
  REQUEST_FAILED: 'REQUEST_FAILED',
  RESPONSE_INVALID: 'RESPONSE_INVALID',
} as const

export type ContractorMailSettingsSaveBody = Readonly<{
  apiKey?: string
  expectedVersion?: string
  replyDomain: string
  senderAddress: string
  senderName: string
  webhookSigningSecret?: string
}>

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type ContractorMailSettingsClient = Readonly<{
  getChecks: () => Promise<readonly ContractorMailCheckItem[]>
  getSettings: () => Promise<ContractorMailSettingsSummary | null>
  saveSettings: (body: ContractorMailSettingsSaveBody) => Promise<ContractorMailSettingsSummary>
  sendTestEmail: () => Promise<ContractorMailTestEmailResult>
}>

function readErrorCode(payload: unknown): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as { error?: { code?: unknown } }).error === 'object' &&
    (payload as { error?: { code?: unknown } }).error !== null &&
    typeof (payload as { error: { code?: unknown } }).error.code === 'string'
  ) {
    return (payload as { error: { code: string } }).error.code
  }
  return CONTRACTOR_MAIL_SETTINGS_ERROR.REQUEST_FAILED
}

async function request(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    method: 'GET' | 'POST' | 'PUT'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'

  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, {
        ...(input.body === undefined ? {} : { body: input.body }),
        cache: 'no-store',
        headers,
        method: input.method,
      }),
    )
  } catch {
    throw new Error(CONTRACTOR_MAIL_SETTINGS_ERROR.REQUEST_FAILED)
  }

  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw new Error(CONTRACTOR_MAIL_SETTINGS_ERROR.RESPONSE_INVALID)
  }
  if (!response.ok) throw new Error(readErrorCode(payload))

  return payload
}

export function createContractorMailSettingsClient(
  dependencies: ClientDependencies,
): ContractorMailSettingsClient {
  return {
    async getChecks() {
      return checksFromApi(
        await request({
          dependencies,
          method: 'GET',
          path: CONTRACTOR_MAIL_SETTINGS_CHECKS_PATH,
        }),
      )
    },
    async getSettings() {
      return nullableSettingsFromApi(
        await request({ dependencies, method: 'GET', path: CONTRACTOR_MAIL_SETTINGS_PATH }),
      )
    },
    async saveSettings(body) {
      return settingsFromApi(
        await request({
          body: JSON.stringify(body),
          dependencies,
          method: 'PUT',
          path: CONTRACTOR_MAIL_SETTINGS_PATH,
        }),
      )
    },
    async sendTestEmail() {
      return testEmailResultFromApi(
        await request({ dependencies, method: 'POST', path: CONTRACTOR_MAIL_TEST_EMAIL_PATH }),
      )
    },
  }
}

export function getContractorMailSettingsClient(): ContractorMailSettingsClient {
  return createContractorMailSettingsClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
