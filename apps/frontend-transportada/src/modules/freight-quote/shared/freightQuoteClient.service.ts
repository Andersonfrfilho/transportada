/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import type {
  FreightQuoteInput,
  FreightQuoteResult,
  FreightQuoteSettings,
  FreightQuoteSettingsValues,
} from './freightQuote.types'

const SETTINGS_PATH = '/freight-quote/settings'
const QUOTES_PATH = '/freight-quotes/by-address'
const REQUEST_FAILED = 'REQUEST_FAILED'
const NETWORK_ERROR = 'NETWORK_ERROR'
const RESPONSE_INVALID = 'RESPONSE_INVALID'

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

/** O código de erro da API viaja na mensagem, para a tela nomear a recusa. */
export class FreightQuoteRequestError extends Error {
  public constructor(code: string) {
    super(code)
    this.name = 'FreightQuoteRequestError'
  }
}

export type FreightQuoteClient = Readonly<{
  calculate: (input: FreightQuoteInput) => Promise<FreightQuoteResult>
  clearSettings: () => Promise<void>
  getSettings: () => Promise<FreightQuoteSettings>
  saveSettings: (values: FreightQuoteSettingsValues) => Promise<FreightQuoteSettings>
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isFreightQuoteSettings(value: unknown): value is FreightQuoteSettings {
  if (!isRecord(value) || !isRecord(value.values) || !isRecord(value.defaults)) return false
  if (!isRecord(value.anttFloor) || !Array.isArray(value.anttFloor.cargoTypes)) return false
  return (
    (value.origin === 'company' || value.origin === 'default') &&
    typeof value.values.marginPercent === 'string' &&
    typeof value.values.applyAnttFloor === 'boolean'
  )
}

export function isFreightQuoteResult(value: unknown): value is FreightQuoteResult {
  return (
    isRecord(value) &&
    typeof value.totalAmount === 'string' &&
    typeof value.freightAmount === 'string' &&
    typeof value.distanceKm === 'string' &&
    typeof value.tollAmount === 'string' &&
    Array.isArray(value.lines)
  )
}

function readErrorCode(body: unknown): string {
  if (!isRecord(body) || !isRecord(body.error)) return REQUEST_FAILED
  return typeof body.error.code === 'string' ? body.error.code : REQUEST_FAILED
}

async function send(
  dependencies: ClientDependencies,
  method: 'DELETE' | 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<Response> {
  const accessToken = await dependencies.getAccessToken()
  try {
    return await dependencies.fetch(
      new Request(`${dependencies.apiBaseUrl}${path}`, {
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method,
      }),
    )
  } catch {
    throw new FreightQuoteRequestError(NETWORK_ERROR)
  }
}

async function readData<T>(response: Response, guard: (value: unknown) => value is T): Promise<T> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new FreightQuoteRequestError(readErrorCode(body))
  if (!isRecord(body) || !guard(body.data)) throw new FreightQuoteRequestError(RESPONSE_INVALID)
  return body.data
}

export function createFreightQuoteClient(dependencies: ClientDependencies): FreightQuoteClient {
  return {
    async calculate(input) {
      return readData(await send(dependencies, 'POST', QUOTES_PATH, input), isFreightQuoteResult)
    },
    async clearSettings() {
      const response = await send(dependencies, 'DELETE', SETTINGS_PATH)
      if (!response.ok) throw new FreightQuoteRequestError(REQUEST_FAILED)
    },
    async getSettings() {
      return readData(await send(dependencies, 'GET', SETTINGS_PATH), isFreightQuoteSettings)
    },
    async saveSettings(values) {
      return readData(
        await send(dependencies, 'PUT', SETTINGS_PATH, values),
        isFreightQuoteSettings,
      )
    },
  }
}

export function getFreightQuoteClient(): FreightQuoteClient {
  return createFreightQuoteClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
