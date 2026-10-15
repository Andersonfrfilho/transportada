/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 T3.2: o feed devolve o andamento da ocorrência (`resolution`). Ausente ou nulo é em aberto;
 * estado ou ator desconhecido degrada (estado vira `null`, ator vira `null`) e nunca reprova o item —
 * a mesma tolerância da tratativa (T1.1).
 */
import { describe, expect, test } from 'bun:test'

import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'
import {
  EMPTY_TRIP_OCCURRENCE_FILTERS,
  serializeTripOccurrenceQuery,
  type TripOccurrenceFeedFilters,
} from '@/modules/trip/shared/tripOccurrenceFeed.service'

const API_URL = 'https://api.example.test'
const ACCESS_TOKEN = 'synthetic-token'
const LIST_INPUT = {
  cursor: null,
  filters: EMPTY_TRIP_OCCURRENCE_FILTERS,
  order: 'desc',
  perPage: 20,
} as const
const RESOLVED_AT = '2026-10-15T12:00:00.000Z'

function buildFeedItem(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    case: null,
    createdAt: '2026-10-14T19:03:10.795Z',
    description: 'Avaria no transporte',
    driverName: 'Motorista',
    hasAttachment: false,
    id: '4b581a02-3dba-4df9-a20b-20ac66163fa1',
    invoiceNumber: null,
    invoiceSeries: null,
    notifies: true,
    source: 'document',
    stage: 'separation',
    stopLabel: null,
    tripId: 'trip-1',
    typeName: 'Item avariado',
    vehiclePlate: 'ABC1D23',
    ...extra,
  }
}

async function readFirstResolution(extra: Readonly<Record<string, unknown>>) {
  const client = createTripOccurrenceFeedClient({
    apiUrl: API_URL,
    fetch: () =>
      Promise.resolve(
        Response.json({ data: [buildFeedItem(extra)], pagination: { nextCursor: null } }),
      ),
    getAccessToken: () => Promise.resolve(ACCESS_TOKEN),
  })
  const page = await client.listOccurrences(LIST_INPUT)
  return { items: page.items, resolution: page.items[0]?.resolution }
}

function queryWith(resolutionStates: TripOccurrenceFeedFilters['resolutionStates']) {
  const query = serializeTripOccurrenceQuery({
    cursor: null,
    filters: { ...EMPTY_TRIP_OCCURRENCE_FILTERS, resolutionStates },
    order: 'desc',
    perPage: 20,
  })
  return new URLSearchParams(query).get('resolutionStateIn')
}

describe('andamento da ocorrência no feed (spec 266 T3.2)', () => {
  test('lê resolvida, reaberta e cancelada com instante e ator', async () => {
    const resolved = await readFirstResolution({
      resolution: { actorKind: 'internal', at: RESOLVED_AT, state: 'resolved' },
    })
    const reopened = await readFirstResolution({
      resolution: { actorKind: 'driver', at: RESOLVED_AT, state: 'reopened' },
    })
    const cancelled = await readFirstResolution({
      resolution: { actorKind: 'system', at: RESOLVED_AT, state: 'cancelled' },
    })

    expect(resolved.resolution).toEqual({
      actorKind: 'internal',
      at: RESOLVED_AT,
      state: 'resolved',
    })
    expect(reopened.resolution?.state).toBe('reopened')
    expect(cancelled.resolution?.state).toBe('cancelled')
  })

  test('ausente, nulo ou com `at` malformado é em aberto (null) e não reprova o item', async () => {
    const missing = await readFirstResolution({})
    const explicitNull = await readFirstResolution({ resolution: null })
    const malformed = await readFirstResolution({
      resolution: { actorKind: 'driver', at: 1234, state: 'resolved' },
    })

    expect(missing.items).toHaveLength(1)
    expect(missing.resolution).toBeNull()
    expect(explicitNull.resolution).toBeNull()
    expect(malformed.items).toHaveLength(1)
    expect(malformed.resolution).toBeNull()
  })

  test('estado desconhecido vira null (em aberto) sem derrubar a página', async () => {
    const page = await readFirstResolution({
      resolution: { actorKind: 'driver', at: RESOLVED_AT, state: 'archived' },
    })

    expect(page.items).toHaveLength(1)
    expect(page.resolution).toBeNull()
  })

  test('ator desconhecido mantém o estado e zera só o ator', async () => {
    const page = await readFirstResolution({
      resolution: { actorKind: 'robot', at: RESOLVED_AT, state: 'resolved' },
    })

    expect(page.resolution).toEqual({ actorKind: null, at: RESOLVED_AT, state: 'resolved' })
  })
})

describe('filtro de andamento na consulta (resolutionStateIn)', () => {
  test('"Em aberto" manda open e reopened; a seleção inteira não manda nada', () => {
    expect(queryWith(['open'])).toBe('open,reopened')
    expect(queryWith(['reopened'])).toBe('reopened')
    expect(queryWith(['resolved', 'cancelled'])).toBe('resolved,cancelled')
    expect(queryWith(['open', 'reopened', 'resolved', 'cancelled'])).toBeNull()
  })

  test('a ordem enviada é a canônica, não a da seleção', () => {
    expect(queryWith(['cancelled', 'resolved'])).toBe('resolved,cancelled')
  })
})
