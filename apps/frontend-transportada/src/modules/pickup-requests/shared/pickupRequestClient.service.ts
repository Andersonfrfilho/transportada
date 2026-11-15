/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  PICKUP_REQUEST_STATUSES,
  type AcceptInput,
  type PickupAddress,
  type PickupRequestDetail,
  type PickupRequestStatus,
  type PickupRequestView,
  type SuggestedTrip,
} from './pickupRequest.types'

const PATH = '/pickup-requests'

export class PickupRequestError extends Error {
  public constructor(code: string) {
    super(code)
    this.name = 'PickupRequestError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
const str = (row: Record<string, unknown>, key: string): string =>
  typeof row[key] === 'string' ? row[key] : ''
const nullable = (row: Record<string, unknown>, key: string): string | null =>
  typeof row[key] === 'string' ? row[key] : null

function toAddress(value: unknown): PickupAddress {
  const row = isRecord(value) ? value : {}
  return {
    city: str(row, 'city'),
    district: str(row, 'district'),
    number: str(row, 'number'),
    postalCode: str(row, 'postalCode'),
    state: str(row, 'state'),
    street: str(row, 'street'),
  }
}

/** Linha sem id ou com estado desconhecido é descartada: a tela nunca adivinha o estado de um pedido. */
export function toPickupRequestView(value: unknown): PickupRequestView | null {
  if (!isRecord(value)) return null
  const status = str(value, 'status') as PickupRequestStatus
  const id = str(value, 'id')
  if (id === '' || !PICKUP_REQUEST_STATUSES.includes(status)) return null
  return {
    acceptedTotalAmount: nullable(value, 'acceptedTotalAmount'),
    acceptedWindowEnd: nullable(value, 'acceptedWindowEnd'),
    acceptedWindowStart: nullable(value, 'acceptedWindowStart'),
    cargoDescription: str(value, 'cargoDescription'),
    createdAt: str(value, 'createdAt'),
    decisionNote: nullable(value, 'decisionNote'),
    destination: toAddress(value.destination),
    expiresAt: str(value, 'expiresAt'),
    id,
    kind: value.kind === 'delivery' ? 'delivery' : 'pickup',
    note: nullable(value, 'note'),
    origin: toAddress(value.origin),
    quotedTotalAmount: nullable(value, 'quotedTotalAmount'),
    requesterEmail: nullable(value, 'requesterEmail'),
    requesterName: str(value, 'requesterName'),
    requesterPhone: nullable(value, 'requesterPhone'),
    status,
    tripId: nullable(value, 'tripId'),
    volumes: typeof value.volumes === 'number' ? value.volumes : 0,
    weightKg: str(value, 'weightKg'),
    windowEnd: str(value, 'windowEnd'),
    windowStart: str(value, 'windowStart'),
  }
}

export function toPickupRequestDetail(value: unknown): PickupRequestDetail | null {
  if (!isRecord(value)) return null
  const request = toPickupRequestView(value.request)
  if (request === null) return null
  const suggestion = value.suggestion
  if (!isRecord(suggestion)) return { request, suggestion: null }
  const trips: SuggestedTrip[] = Array.isArray(suggestion.trips)
    ? suggestion.trips.filter(isRecord).map((trip) => ({
        createdAt: str(trip, 'createdAt'),
        id: str(trip, 'id'),
        status: str(trip, 'status'),
        stopCount: typeof trip.stopCount === 'number' ? trip.stopCount : 0,
      }))
    : []
  return { request, suggestion: { canCreateNewTrip: suggestion.canCreateNewTrip === true, trips } }
}

async function send(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getKeycloakAuthProvider().getAccessToken()
  let response: Response
  try {
    response = await fetch(`${getIdentityEnvironment().apiBaseUrl}${path}`, {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      method,
    })
  } catch {
    throw new PickupRequestError('NETWORK_ERROR')
  }
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const code =
      isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === 'string'
        ? payload.error.code
        : 'REQUEST_FAILED'
    throw new PickupRequestError(code)
  }
  return isRecord(payload) ? payload.data : null
}

export const pickupRequestClient = {
  async accept(id: string, input: AcceptInput): Promise<PickupRequestDetail> {
    const detail = toPickupRequestDetail(await send('POST', `${PATH}/${id}/accept`, input))
    if (detail === null) throw new PickupRequestError('RESPONSE_INVALID')
    return detail
  },
  async get(id: string): Promise<PickupRequestDetail> {
    const detail = toPickupRequestDetail(await send('GET', `${PATH}/${id}`))
    if (detail === null) throw new PickupRequestError('RESPONSE_INVALID')
    return detail
  },
  async list(status: PickupRequestStatus | null): Promise<readonly PickupRequestView[]> {
    const data = await send('GET', status === null ? PATH : `${PATH}?status=${status}`)
    return Array.isArray(data)
      ? data.flatMap((row) => {
          const view = toPickupRequestView(row)
          return view === null ? [] : [view]
        })
      : []
  },
  async refuse(id: string, note: string): Promise<void> {
    await send('POST', `${PATH}/${id}/refuse`, { note })
  },
  async schedule(id: string, tripId: string): Promise<void> {
    await send('POST', `${PATH}/${id}/schedule`, { tripId })
  },
}
