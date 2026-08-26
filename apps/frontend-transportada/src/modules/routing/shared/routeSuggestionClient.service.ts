/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { RouteSuggestion } from './routeSuggestion.types'
import { toRouteSuggestion } from './routeSuggestionResponse.validation'

const TRIPS_PATH = '/trips'
const GEOCODED_ADDRESSES_PATH = '/geocoded-addresses'

export const ROUTING_ERROR = {
  REQUEST_FAILED: 'REQUEST_FAILED',
  RESPONSE_INVALID: 'RESPONSE_INVALID',
} as const

export class RoutingRequestError extends Error {
  public readonly code: string

  public constructor(code: string) {
    super(code)
    this.code = code
    this.name = 'RoutingRequestError'
  }
}

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type RouteSuggestionClient = Readonly<{
  accept: (input: Readonly<{ suggestionId: string; tripId: string }>) => Promise<RouteSuggestion>
  correctAddress: (
    input: Readonly<{ addressKey: string; latitude: string; longitude: string }>,
  ) => Promise<void>
  create: (input: Readonly<{ tripId: string }>) => Promise<RouteSuggestion>
  read: (input: Readonly<{ suggestionId: string; tripId: string }>) => Promise<RouteSuggestion>
  reject: (
    input: Readonly<{ reason?: string; suggestionId: string; tripId: string }>,
  ) => Promise<RouteSuggestion>
}>

export function createRouteSuggestionClient(
  dependencies: ClientDependencies,
): RouteSuggestionClient {
  function suggestionPath(input: Readonly<{ suggestionId: string; tripId: string }>): string {
    return `${TRIPS_PATH}/${input.tripId}/route-suggestions/${input.suggestionId}`
  }

  return {
    async accept(input) {
      return toSuggestion(
        await request({ dependencies, method: 'POST', path: `${suggestionPath(input)}/accept` }),
      )
    },

    async correctAddress(input) {
      await request({
        body: JSON.stringify({ latitude: input.latitude, longitude: input.longitude }),
        dependencies,
        method: 'PATCH',
        /**
         * A chave carrega `|`, que é separador de caminho para ninguém mas caractere reservado para
         * a URL. Sem codificar, o roteador a veria partida e a rota não casaria.
         */
        path: `${GEOCODED_ADDRESSES_PATH}/${encodeURIComponent(input.addressKey)}`,
      })
    },

    async create(input) {
      return toSuggestion(
        await request({
          dependencies,
          method: 'POST',
          path: `${TRIPS_PATH}/${input.tripId}/route-suggestions`,
        }),
      )
    },

    async read(input) {
      return toSuggestion(
        await request({ dependencies, method: 'GET', path: suggestionPath(input) }),
      )
    },

    async reject(input) {
      return toSuggestion(
        await request({
          ...(input.reason === undefined ? {} : { body: JSON.stringify({ reason: input.reason }) }),
          dependencies,
          method: 'POST',
          path: `${suggestionPath(input)}/reject`,
        }),
      )
    },
  }
}

function toSuggestion(payload: unknown): RouteSuggestion {
  const suggestion = toRouteSuggestion(readEnvelopeData(payload))
  if (suggestion === null) throw new RoutingRequestError(ROUTING_ERROR.RESPONSE_INVALID)

  return suggestion
}

async function request(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    method: 'GET' | 'PATCH' | 'POST'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'

  const requestInit: RequestInit = { cache: 'no-store', headers, method: input.method }
  if (input.body !== undefined) requestInit.body = input.body

  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
    )
  } catch {
    throw new RoutingRequestError(ROUTING_ERROR.REQUEST_FAILED)
  }

  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw new RoutingRequestError(
      response.ok ? ROUTING_ERROR.RESPONSE_INVALID : ROUTING_ERROR.REQUEST_FAILED,
    )
  }

  /**
   * O código do erro sobe como veio: é ele que a tela traduz — `ROUTING_MATRIX_UNAVAILABLE` vira a
   * frase que diz para ordenar à mão, e trocá-lo por um genérico apagaria justamente essa instrução.
   */
  if (!response.ok) throw new RoutingRequestError(readErrorCode(payload))

  return payload
}

function readEnvelopeData(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    throw new RoutingRequestError(ROUTING_ERROR.RESPONSE_INVALID)
  }

  return (payload as { readonly data: unknown }).data
}

function readErrorCode(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return ROUTING_ERROR.REQUEST_FAILED
  const error = (payload as { readonly error?: unknown }).error
  if (typeof error !== 'object' || error === null) return ROUTING_ERROR.REQUEST_FAILED
  const code = (error as { readonly code?: unknown }).code

  return typeof code === 'string' ? code : ROUTING_ERROR.REQUEST_FAILED
}
