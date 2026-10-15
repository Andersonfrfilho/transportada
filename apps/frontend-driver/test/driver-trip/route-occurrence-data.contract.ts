/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type {
  DriverRouteOccurrence,
  RouteOccurrenceSnapshotStore,
  StoredRouteOccurrences,
} from '@/modules/driver-trip/shared/driverRouteOccurrence.types'
import {
  DriverRouteOccurrenceResponseError,
  isStoredRouteOccurrences,
  toDriverRouteOccurrenceDetail,
  toDriverRouteOccurrenceList,
} from '@/modules/driver-trip/shared/driverRouteOccurrenceResponse.validation'
import {
  createDriverTripClient,
  DriverTripRequestError,
} from '@/modules/driver-trip/shared/driverTripClient.service'
import { loadRouteOccurrences } from '@/modules/driver-trip/shared/routeOccurrenceSnapshot.service'

const NOW = new Date('2026-10-15T12:00:00.000Z')
const INDEXED_DB = new URL(
  '../../src/modules/driver-trip/shared/indexedDbQueue.service.ts',
  import.meta.url,
)

const WIRE_ITEM = {
  conversation: { exists: true },
  documentCount: 2,
  documentId: 'doc-1',
  documentNumber: '1234',
  id: 'occ-1',
  kind: 'document',
  recordedAt: '2026-10-15T10:00:00.000Z',
  recordedByMe: true,
  reopenedAt: null,
  reportKey: 'key-9',
  resolution: null,
  state: 'open',
  stopId: 'stop-1',
  stopSequence: 2,
  type: { iconName: 'camera', id: 'type-1', name: 'Avaria' },
}

/** O erro com que a promessa rejeitou; `undefined` se ela resolveu. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return undefined
}

function occurrence(): DriverRouteOccurrence {
  return toDriverRouteOccurrenceList({ data: [WIRE_ITEM] })[0] as DriverRouteOccurrence
}

function createMemorySnapshotStore(
  initial: readonly StoredRouteOccurrences[] = [],
): RouteOccurrenceSnapshotStore & { readonly keys: () => readonly string[] } {
  const records = new Map(initial.map((record) => [record.tripId, record]))
  return {
    clear: () => {
      records.clear()
      return Promise.resolve()
    },
    keys: () => [...records.keys()],
    read: (tripId) => Promise.resolve(records.get(tripId)),
    remove: (tripId) => {
      records.delete(tripId)
      return Promise.resolve()
    },
    retainOnly: (tripId) => {
      for (const key of [...records.keys()]) if (key !== tripId) records.delete(key)
      return Promise.resolve()
    },
    write: (record) => {
      records.set(record.tripId, record)
      return Promise.resolve()
    },
  }
}

describe('validação da lista de ocorrências da rota (spec 266 T4.2)', () => {
  it('lê o payload do contrato', () => {
    const [item] = toDriverRouteOccurrenceList({ data: [WIRE_ITEM] })
    expect(item).toEqual({
      conversationExists: true,
      documentCount: 2,
      documentId: 'doc-1',
      documentNumber: '1234',
      id: 'occ-1',
      kind: 'document',
      recordedAt: '2026-10-15T10:00:00.000Z',
      recordedByMe: true,
      reopenedAt: null,
      reportKey: 'key-9',
      resolution: null,
      state: 'open',
      stopId: 'stop-1',
      stopSequence: 2,
      type: { iconName: 'camera', id: 'type-1', name: 'Avaria' },
    })
  })

  it('estado desconhecido conta como em aberto; ator desconhecido vira system', () => {
    const [item] = toDriverRouteOccurrenceList({
      data: [
        {
          ...WIRE_ITEM,
          resolution: {
            actorKind: 'robot',
            at: '2026-10-15T11:00:00.000Z',
            note: 'Ok',
            phraseKey: 'case_unknown',
          },
          state: 'archived',
        },
      ],
    })
    expect(item?.state).toBe('open')
    expect(item?.resolution?.actorKind).toBe('system')
    expect(item?.resolution?.phraseKey).toBeNull()
  })

  it('resolução: nota nula e frase fixa conhecida; reportKey ausente vira null', () => {
    const withoutReportKey: Record<string, unknown> = { ...WIRE_ITEM }
    delete withoutReportKey.reportKey
    const [item] = toDriverRouteOccurrenceList({
      data: [
        {
          ...withoutReportKey,
          resolution: {
            actorKind: 'system',
            at: '2026-10-15T11:00:00.000Z',
            note: null,
            phraseKey: 'case_returned_to_warehouse',
          },
          state: 'resolved',
        },
      ],
    })
    expect(item?.reportKey).toBeNull()
    expect(item?.resolution).toEqual({
      actorKind: 'system',
      at: '2026-10-15T11:00:00.000Z',
      note: null,
      phraseKey: 'case_returned_to_warehouse',
    })
  })

  it('recusa item malformado', () => {
    expect(() => toDriverRouteOccurrenceList({ data: [{ ...WIRE_ITEM, id: 7 }] })).toThrow(
      DriverRouteOccurrenceResponseError,
    )
    expect(() => toDriverRouteOccurrenceList({ data: [{ ...WIRE_ITEM, kind: 'trip' }] })).toThrow(
      DriverRouteOccurrenceResponseError,
    )
    expect(() => toDriverRouteOccurrenceList({ data: 'x' })).toThrow(
      DriverRouteOccurrenceResponseError,
    )
  })
})

describe('validação do detalhe (spec 266 T4.2)', () => {
  const detail = {
    ...WIRE_ITEM,
    attachments: [
      {
        contentType: 'application/pdf',
        messageId: 'm1',
        name: 'a.pdf',
        objectId: 'o1',
        sizeBytes: 10,
      },
    ],
    note: 'Caixa amassada',
    photos: [{ objectId: 'p1' }],
    signature: null,
    timeline: [
      { at: '2026-10-15T10:00:00.000Z', kind: 'recorded' },
      { at: '2026-10-15T10:01:00.000Z', kind: 'something.new' },
      { at: '2026-10-15T11:00:00.000Z', kind: 'resolution.resolved' },
    ],
  }

  it('descarta o kind de linha do tempo desconhecido sem derrubar o detalhe', () => {
    const parsed = toDriverRouteOccurrenceDetail({ data: detail })
    expect(parsed.timeline.map((event) => event.kind)).toEqual(['recorded', 'resolution.resolved'])
    expect(parsed.photos[0]?.objectId).toBe('p1')
    expect(parsed.attachments[0]?.messageId).toBe('m1')
    expect(parsed.note).toBe('Caixa amassada')
  })

  it('recusa evento da linha do tempo sem hora', () => {
    expect(() =>
      toDriverRouteOccurrenceDetail({ data: { ...detail, timeline: [{ kind: 'recorded' }] } }),
    ).toThrow(DriverRouteOccurrenceResponseError)
  })
})

describe('o retrato offline das ocorrências (spec 266 T4.2)', () => {
  it('lista fresca é guardada e só a viagem dela permanece', async () => {
    const store = createMemorySnapshotStore([
      { occurrences: [], savedAt: NOW.toISOString(), tripId: 'trip-old' },
    ])
    const result = await loadRouteOccurrences({
      now: NOW,
      readList: () => Promise.resolve({ data: [occurrence()], status: 'loaded' }),
      store,
      tripId: 'trip-1',
    })
    expect(result).toEqual({
      isFromSnapshot: false,
      occurrences: [occurrence()],
      savedAt: undefined,
      status: 'loaded',
    })
    expect(store.keys()).toEqual(['trip-1'])
    expect((await store.read('trip-1'))?.savedAt).toBe(NOW.toISOString())
  })

  it('sem rede, lê o retrato com a hora dele', async () => {
    const saved = {
      occurrences: [occurrence()],
      savedAt: '2026-10-15T09:00:00.000Z',
      tripId: 'trip-1',
    }
    const result = await loadRouteOccurrences({
      now: NOW,
      readList: () =>
        Promise.reject(new DriverTripRequestError({ code: 'OFFLINE', isOffline: true })),
      store: createMemorySnapshotStore([saved]),
      tripId: 'trip-1',
    })
    expect(result).toEqual({
      isFromSnapshot: true,
      occurrences: saved.occurrences,
      savedAt: saved.savedAt,
      status: 'loaded',
    })
  })

  it('sem rede e sem retrato, o erro sobe', async () => {
    const offline = new DriverTripRequestError({ code: 'OFFLINE', isOffline: true })
    expect(
      await rejectionOf(
        loadRouteOccurrences({
          now: NOW,
          readList: () => Promise.reject(offline),
          store: createMemorySnapshotStore(),
          tripId: 'trip-1',
        }),
      ),
    ).toBe(offline)
  })

  it('recusa 4xx não cai no retrato: é resposta, não queda', async () => {
    const refused = new DriverTripRequestError({ code: 'FORBIDDEN', isOffline: false, status: 403 })
    const saved = { occurrences: [occurrence()], savedAt: NOW.toISOString(), tripId: 'trip-1' }
    expect(
      await rejectionOf(
        loadRouteOccurrences({
          now: NOW,
          readList: () => Promise.reject(refused),
          store: createMemorySnapshotStore([saved]),
          tripId: 'trip-1',
        }),
      ),
    ).toBe(refused)
  })

  it('viagem finalizada devolve o estado e apaga o retrato', async () => {
    const store = createMemorySnapshotStore([
      { occurrences: [occurrence()], savedAt: NOW.toISOString(), tripId: 'trip-1' },
    ])
    const result = await loadRouteOccurrences({
      now: NOW,
      readList: () => Promise.resolve({ status: 'tripFinished' }),
      store,
      tripId: 'trip-1',
    })
    expect(result).toEqual({ status: 'tripFinished' })
    expect(store.keys()).toEqual([])
  })

  it('registro sem a forma do retrato não abre a tela', () => {
    expect(isStoredRouteOccurrences({ occurrences: [{ id: 1 }], savedAt: 'x', tripId: 't' })).toBe(
      false,
    )
    expect(
      isStoredRouteOccurrences({ occurrences: [occurrence()], savedAt: 'x', tripId: 't' }),
    ).toBe(true)
  })
})

describe('o cliente das rotas de leitura (spec 266 T4.2)', () => {
  function clientRespondingWith(respond: () => Response) {
    return createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: () => Promise.resolve(respond()),
      getAccessToken: () => Promise.resolve('token'),
    })
  }

  it('404 DRIVER_TRIP_NOT_ACTIVE é viagem finalizada, não exceção', async () => {
    const client = clientRespondingWith(
      () => new Response('{"error":{"code":"DRIVER_TRIP_NOT_ACTIVE"}}', { status: 404 }),
    )
    expect(await client.listRouteOccurrences()).toEqual({ status: 'tripFinished' })
    expect(await client.readRouteOccurrence({ id: 'o', kind: 'stop' })).toEqual({
      status: 'tripFinished',
    })
  })

  it('404 de ocorrência, de anexo ou de código desconhecido é notFound', async () => {
    for (const code of [
      'TRIP_OCCURRENCE_NOT_FOUND',
      'TRIP_OCCURRENCE_ATTACHMENT_NOT_FOUND',
      'SOMETHING_ELSE',
    ]) {
      const client = clientRespondingWith(
        () => new Response(JSON.stringify({ error: { code } }), { status: 404 }),
      )
      expect(await client.readRouteOccurrence({ id: 'o', kind: 'stop' })).toEqual({
        status: 'notFound',
      })
    }
  })

  it('200 devolve a lista validada', async () => {
    const client = clientRespondingWith(() => new Response(JSON.stringify({ data: [WIRE_ITEM] })))
    const result = await client.listRouteOccurrences()
    expect(result.status === 'loaded' && result.data[0]?.id).toBe('occ-1')
  })

  it('corpo fora do contrato vira RESPONSE_INVALID', async () => {
    const client = clientRespondingWith(() => new Response('{"data":[{"id":1}]}'))
    expect(await rejectionOf(client.listRouteOccurrences())).toMatchObject({
      code: 'RESPONSE_INVALID',
    })
  })

  it('500 sobe como erro com status', async () => {
    const client = clientRespondingWith(() => new Response('{}', { status: 500 }))
    expect(await rejectionOf(client.listRouteOccurrences())).toMatchObject({ status: 500 })
  })
})

describe('as frases fixas da tratativa no locale (spec 266 T4.2b)', () => {
  it('as três existem em pt-BR e en', () => {
    for (const file of ['driverTrip.locale.json', 'driverTrip.en.locale.json']) {
      const locale = JSON.parse(
        readFileSync(
          new URL(`../../src/modules/driver-trip/locales/${file}`, import.meta.url),
          'utf8',
        ),
      ) as { routeOccurrence: { phrase: Record<string, string> } }
      expect(Object.keys(locale.routeOccurrence.phrase).sort()).toEqual([
        'case_cancelled',
        'case_closed',
        'case_returned_to_warehouse',
      ])
    }
  })
})

describe('o store trip-occurrences no IndexedDB (spec 266 T4.2)', () => {
  const source = readFileSync(INDEXED_DB, 'utf8')

  it('sobe para a versão 5 criando só store novo, sem migrar nada', () => {
    expect(source).toInclude('const DATABASE_VERSION = 5')
    expect(source).toInclude("const TRIP_OCCURRENCES_STORE_NAME = 'trip-occurrences'")
    const upgrade = source.slice(
      source.indexOf('request.onupgradeneeded'),
      source.indexOf('request.onsuccess'),
    )
    for (const name of [
      'STORE_NAME,',
      'ATTACHMENT_STORE_NAME',
      'TRIP_SNAPSHOT_STORE_NAME',
      'PROOF_THUMBNAIL_STORE_NAME',
      'TRIP_OCCURRENCES_STORE_NAME',
    ]) {
      expect(upgrade).toInclude(name)
    }
    expect(upgrade).toInclude('objectStoreNames.contains(name)')
    expect(upgrade).not.toInclude('deleteObjectStore')
  })
})
