/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import type { DriverFieldReport, DriverTripSnapshot } from './driverTrip.types'
import { toDriverTripSnapshot } from './driverTripResponse.validation'

const CURRENT_TRIP_PATH = '/me/trips/current'

export const DRIVER_TRIP_ERROR = {
  /** A rede não respondeu. É o caso do subsolo, e ele **não** tira o item da fila. */
  OFFLINE: 'OFFLINE',
  RESPONSE_INVALID: 'RESPONSE_INVALID',
} as const

export class DriverTripRequestError extends Error {
  public readonly code: string
  /** `true` só quando a rede falhou — recusa do servidor é resposta, e resposta não se repete. */
  public readonly isOffline: boolean

  public constructor(input: { code: string; isOffline: boolean }) {
    super(input.code)
    this.code = input.code
    this.isOffline = input.isOffline
    this.name = 'DriverTripRequestError'
  }
}

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type DriverTripClient = Readonly<{
  readCurrent: () => Promise<DriverTripSnapshot>
  send: (report: DriverFieldReport) => Promise<void>
}>

function reportPath(report: DriverFieldReport): string {
  switch (report.kind) {
    case 'arrive':
      return `${CURRENT_TRIP_PATH}/stops/${report.stopId}/arrive`
    case 'deliver':
      return `${CURRENT_TRIP_PATH}/documents/${report.documentId}/deliver`
    case 'return':
      return `${CURRENT_TRIP_PATH}/documents/${report.documentId}/return`
    case 'occurrence':
      return `${CURRENT_TRIP_PATH}/stops/${report.stopId}/occurrences`
  }
}

function reportBody(report: DriverFieldReport): string {
  switch (report.kind) {
    case 'arrive':
    case 'deliver':
      return JSON.stringify({ location: report.location })
    case 'return':
      return JSON.stringify({ location: report.location, reason: report.reason })
    case 'occurrence':
      return JSON.stringify({
        description: report.description,
        documentId: report.documentId,
        kind: report.occurrenceKind,
      })
  }
}

export function createDriverTripClient(dependencies: ClientDependencies): DriverTripClient {
  return {
    async readCurrent() {
      const payload = await request({ dependencies, method: 'GET', path: CURRENT_TRIP_PATH })
      return toDriverTripSnapshot(payload)
    },
    async send(report) {
      await request({
        body: reportBody(report),
        dependencies,
        idempotencyKey: report.idempotencyKey,
        method: 'POST',
        path: reportPath(report),
      })
    },
  }
}

export function getDriverTripClient(): DriverTripClient {
  return createDriverTripClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

async function request(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    idempotencyKey?: string
    method: 'GET' | 'POST'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey

  const requestInit: RequestInit = { cache: 'no-store', headers, method: input.method }
  if (input.body !== undefined) requestInit.body = input.body

  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
    )
  } catch {
    // Rede caída: quem chamou devolve o item para a fila em vez de dizer ao motorista que falhou.
    throw new DriverTripRequestError({ code: DRIVER_TRIP_ERROR.OFFLINE, isOffline: true })
  }

  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw new DriverTripRequestError({
      code: DRIVER_TRIP_ERROR.RESPONSE_INVALID,
      isOffline: false,
    })
  }

  /**
   * O código sobe como veio: é ele que a tela traduz. `TRIP_DOCUMENT_NOT_REACHABLE` vira "esta nota
   * saiu da sua viagem", e trocá-lo por um genérico apagaria a única explicação que o motorista tem.
   */
  if (!response.ok) {
    throw new DriverTripRequestError({ code: readErrorCode(payload), isOffline: false })
  }

  return payload
}

function readErrorCode(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return 'REQUEST_FAILED'
  const error = (payload as { readonly error?: { readonly code?: unknown } }).error
  return typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED'
}
