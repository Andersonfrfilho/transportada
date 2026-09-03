/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { RouteSuggestion } from './routeSuggestion.types'
import { toRouteSuggestion } from './routeSuggestionResponse.validation'

const TRIPS_PATH = '/trips'
const GEOCODED_ADDRESSES_PATH = '/geocoded-addresses'
/** Spec 058 P2: fora da árvore da viagem — a sugestão existe antes de as viagens existirem. */
const MULTI_VEHICLE_PATH = '/route-suggestions'

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

/** O que o aceite da multi-veículo devolve: a sugestão decidida e as viagens que ela criou. */
export type AcceptedMultiVehicleSuggestion = Readonly<{
  suggestion: RouteSuggestion
  trips: readonly MultiVehicleTrip[]
}>

export type MultiVehicleTrip = Readonly<{
  documentCount: number
  /** Spec 081: quem dirige esta viagem, ou `null` quando o par não trouxe motorista. */
  driverId: string | null
  stopCount: number
  tripId: string
  vehicleId: string
}>

export type RouteSuggestionClient = Readonly<{
  accept: (input: Readonly<{ suggestionId: string; tripId: string }>) => Promise<RouteSuggestion>
  acceptMultiVehicle: (
    input: Readonly<{ suggestionId: string }>,
  ) => Promise<AcceptedMultiVehicleSuggestion>
  createMultiVehicle: (
    input: Readonly<{
      nfeDocumentIds: readonly string[]
      solverTimeBudgetSeconds?: number
      vehicles: readonly Readonly<{ driverId?: string; vehicleId: string }>[]
    }>,
  ) => Promise<RouteSuggestion>
  readMultiVehicle: (input: Readonly<{ suggestionId: string }>) => Promise<RouteSuggestion>
  rejectMultiVehicle: (input: Readonly<{ suggestionId: string }>) => Promise<RouteSuggestion>
  correctAddress: (
    input: Readonly<{ addressKey: string; latitude: string; longitude: string }>,
  ) => Promise<void>
  /**
   * O degrau 2 da escada (spec 069). A resposta **nunca é muda**: ela diz se substituiu, se nada
   * melhorou, ou se a precisão fina não está configurada — e as duas últimas oferecem o pino manual.
   */
  refineAddress: (
    input: Readonly<{ addressKey: string }>,
  ) => Promise<Readonly<{ outcome: RefineAddressOutcome; precision?: string }>>
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

    async acceptMultiVehicle(input) {
      const payload = readEnvelopeData(
        await request({
          dependencies,
          method: 'POST',
          path: `${MULTI_VEHICLE_PATH}/${input.suggestionId}/accept`,
        }),
      )

      return toAcceptedMultiVehicle(payload)
    },

    async createMultiVehicle(input) {
      return toSuggestion(
        await request({
          body: JSON.stringify({
            nfeDocumentIds: input.nfeDocumentIds,
            ...(input.solverTimeBudgetSeconds === undefined
              ? {}
              : { solverTimeBudgetSeconds: input.solverTimeBudgetSeconds }),
            vehicles: input.vehicles,
          }),
          dependencies,
          method: 'POST',
          path: `${MULTI_VEHICLE_PATH}/multi-vehicle`,
        }),
      )
    },

    async readMultiVehicle(input) {
      return toSuggestion(
        await request({
          dependencies,
          method: 'GET',
          path: `${MULTI_VEHICLE_PATH}/${input.suggestionId}`,
        }),
      )
    },

    async rejectMultiVehicle(input) {
      return toSuggestion(
        await request({
          dependencies,
          method: 'POST',
          path: `${MULTI_VEHICLE_PATH}/${input.suggestionId}/reject`,
        }),
      )
    },

    async refineAddress(input) {
      const body = await request({
        dependencies,
        method: 'POST',
        path: `${GEOCODED_ADDRESSES_PATH}/${encodeURIComponent(input.addressKey)}/refine`,
      })

      return toRefineOutcome(body)
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

/**
 * A resposta do aceite é **envelope de dois campos**, e as viagens vêm dentro dele. Validar aqui, e
 * não confiar no formato, é a mesma regra de fronteira do resto: resposta de API é entrada.
 */
function toAcceptedMultiVehicle(payload: unknown): AcceptedMultiVehicleSuggestion {
  if (typeof payload !== 'object' || payload === null) {
    throw new RoutingRequestError(ROUTING_ERROR.RESPONSE_INVALID)
  }

  const record = payload as { suggestion?: unknown; trips?: unknown }
  const suggestion = toRouteSuggestion(record.suggestion)
  if (suggestion === null) throw new RoutingRequestError(ROUTING_ERROR.RESPONSE_INVALID)

  const trips = Array.isArray(record.trips) ? record.trips.map(toMultiVehicleTrip) : []

  return { suggestion, trips: trips.filter((trip): trip is MultiVehicleTrip => trip !== null) }
}

function toMultiVehicleTrip(value: unknown): MultiVehicleTrip | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const tripId = record.tripId
  const vehicleId = record.vehicleId
  if (typeof tripId !== 'string' || typeof vehicleId !== 'string') return null

  return {
    documentCount: typeof record.documentCount === 'number' ? record.documentCount : 0,
    driverId: typeof record.driverId === 'string' ? record.driverId : null,
    stopCount: typeof record.stopCount === 'number' ? record.stopCount : 0,
    tripId,
    vehicleId,
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

export type RefineAddressOutcome = 'refined' | 'not_improved' | 'provider_not_configured'

const REFINE_OUTCOMES: readonly RefineAddressOutcome[] = [
  'refined',
  'not_improved',
  'provider_not_configured',
]

/**
 * Resposta que a tela não reconhece vira `not_improved`, e não erro: o conferente já marcou, e um
 * estouro no lugar de um aviso o faria concluir que a marca está quebrada — que é exatamente o que
 * a RF5 existe para impedir.
 */
function toRefineOutcome(
  body: unknown,
): Readonly<{ outcome: RefineAddressOutcome; precision?: string }> {
  const data = (body as { readonly data?: Readonly<{ outcome?: unknown; precision?: unknown }> })
    ?.data
  const outcome = REFINE_OUTCOMES.find((candidate) => candidate === data?.outcome)

  return {
    outcome: outcome ?? 'not_improved',
    ...(typeof data?.precision === 'string' ? { precision: data.precision } : {}),
  }
}
