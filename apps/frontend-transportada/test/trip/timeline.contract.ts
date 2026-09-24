import { describe, expect, it } from 'bun:test'

import { createTripClient } from '../../src/modules/trip/shared/tripClient.service'
import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import { TRIP_FIELD_CHANNELS, TRIP_TIMELINE_KINDS } from '../../src/modules/trip/shared/trip.types'

const adapters = createTripResponseAdapters()

const BASE_ITEM = {
  actorName: 'Marina Alves',
  channel: 'office' as const,
  closeReason: null,
  document: { id: 'doc-1', number: '123', series: '1' },
  fromStatus: null,
  id: 'item-1',
  kind: 'document.status_changed' as const,
  occurrence: null,
  occurredAt: '2026-09-18T12:00:00.000Z',
  onBehalfOfDriverName: 'João Pereira',
  recordedAt: null,
  returnReason: null,
  stop: { id: 'stop-1', sequence: 1 },
  toStatus: 'delivered',
}

/**
 * Spec 158 T7 (D6, aceite 8): o validador do front recusa chave desconhecida e vocabulário fora da
 * lista fechada — nada de `actorUserId`, `receiverName`, `latitude`, `longitude`, `objectKey` chega
 * à tela.
 */
describe('leitura da linha do tempo (spec 158 T7)', () => {
  it('aceita uma página completa', () => {
    const page = adapters.tripTimelineFromApi({ items: [BASE_ITEM], nextCursor: 'cursor-1' })
    expect(page.items).toHaveLength(1)
    expect(page.nextCursor).toBe('cursor-1')
  })

  it('aceita channel, recordedAt e document nulos (D3/D6)', () => {
    const page = adapters.tripTimelineFromApi({
      items: [
        {
          ...BASE_ITEM,
          channel: null,
          document: null,
          fromStatus: 'in_transit',
          kind: 'trip.status_changed',
          recordedAt: null,
          toStatus: 'on_delivery_route',
        },
      ],
      nextCursor: null,
    })
    expect(page.items[0]?.channel).toBeNull()
    expect(page.items[0]?.document).toBeNull()
    expect(page.nextCursor).toBeNull()
  })

  it('aceita closeReason no encerramento manual (spec 158 T12)', () => {
    const page = adapters.tripTimelineFromApi({
      items: [
        {
          ...BASE_ITEM,
          closeReason: 'Canhotos recebidos no escritório',
          kind: 'trip.status_changed',
          toStatus: 'completed',
        },
      ],
      nextCursor: null,
    })
    expect(page.items[0]?.closeReason).toBe('Canhotos recebidos no escritório')
  })

  it('recusa closeReason fora do vocabulário de tipo (número em vez de string)', () => {
    expect(() =>
      adapters.tripTimelineFromApi({
        items: [{ ...BASE_ITEM, closeReason: 42 }],
        nextCursor: null,
      }),
    ).toThrow()
  })

  it('recusa chave desconhecida no item', () => {
    expect(() =>
      adapters.tripTimelineFromApi({
        items: [{ ...BASE_ITEM, actorUserId: 'user-1' }],
        nextCursor: null,
      }),
    ).toThrow()
  })

  it('recusa channel fora do vocabulário', () => {
    expect(() =>
      adapters.tripTimelineFromApi({
        items: [{ ...BASE_ITEM, channel: 'invented' }],
        nextCursor: null,
      }),
    ).toThrow()
  })

  it('recusa kind fora do vocabulário', () => {
    expect(() =>
      adapters.tripTimelineFromApi({
        items: [{ ...BASE_ITEM, kind: 'invented' }],
        nextCursor: null,
      }),
    ).toThrow()
  })

  it('recusa envelope sem items/nextCursor', () => {
    expect(() => adapters.tripTimelineFromApi({})).toThrow()
  })
})

/** Spec 158 T7 (D4): `readTripTimeline({ tripId, cursor, limit })`, no molde de `readTripOccurrences`. */
describe('cliente HTTP da linha do tempo (spec 158 T7)', () => {
  it('monta a query string com cursor e limite, e lê o envelope { items, nextCursor }', async () => {
    const requests: Request[] = []
    const client = createTripClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(Response.json({ data: { items: [BASE_ITEM], nextCursor: null } }))
      },
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
    })

    const page = await client.readTripTimeline({ cursor: 'c1', limit: 50, tripId: 'trip-1' })

    expect(page.items).toHaveLength(1)
    expect(page.nextCursor).toBeNull()
    const [request] = requests
    if (request === undefined) throw new Error('TRIP_TIMELINE_REQUEST_MISSING')
    expect(request.url).toBe('https://api.example.test/trips/trip-1/timeline?cursor=c1&limit=50')
    expect(request.method).toBe('GET')
    expect(request.headers.get('authorization')).toBe('Bearer synthetic-access-token')
  })

  it('sem cursor, a query string não leva a chave', async () => {
    const requests: Request[] = []
    const client = createTripClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Promise.resolve(Response.json({ data: { items: [], nextCursor: null } }))
      },
      getAccessToken: () => Promise.resolve('synthetic-access-token'),
    })

    await client.readTripTimeline({ cursor: null, limit: 100, tripId: 'trip-1' })

    const [request] = requests
    if (request === undefined) throw new Error('TRIP_TIMELINE_REQUEST_MISSING')
    expect(request.url).toBe('https://api.example.test/trips/trip-1/timeline?limit=100')
  })
})

/**
 * As duas listas fechadas são cópia por valor da API — o bundle não carrega código de lá (mesmo
 * molde de `test/driver-trip/catalog-parity.contract.ts`).
 */
describe('paridade das listas fechadas da linha do tempo com a API (spec 158)', () => {
  it('TRIP_TIMELINE_KINDS bate com os oito kinds de trip-timeline.types.ts', async () => {
    const source = new URL(
      '../../../api-transportada/src/trips/application/trip-timeline.types.ts',
      import.meta.url,
    )
    const text = await Bun.file(source).text()
    const declaration = /export const TRIP_TIMELINE_KINDS = \[([^\]]*)\] as const/u.exec(text)
    if (declaration?.[1] === undefined) throw new Error('API_TRIP_TIMELINE_KINDS_NOT_FOUND')
    const apiKinds = [...declaration[1].matchAll(/'([a-z._]+)'/gu)].map((match) => match[1] ?? '')
    expect<readonly string[]>([...TRIP_TIMELINE_KINDS]).toEqual(apiKinds)
  })

  it('TRIP_FIELD_CHANNELS bate com os valores de TRIP_FIELD_CHANNELS em trip.schema.ts', async () => {
    const source = new URL('../../../api-transportada/src/database/trip.schema.ts', import.meta.url)
    const text = await Bun.file(source).text()
    const declaration = /export const TRIP_FIELD_CHANNELS = \{([^}]*)\} as const/u.exec(text)
    if (declaration?.[1] === undefined) throw new Error('API_TRIP_FIELD_CHANNELS_NOT_FOUND')
    const apiChannels = [...declaration[1].matchAll(/: '([a-z_]+)'/gu)].map(
      (match) => match[1] ?? '',
    )
    expect<readonly string[]>([...TRIP_FIELD_CHANNELS].sort()).toEqual([...apiChannels].sort())
  })
})
