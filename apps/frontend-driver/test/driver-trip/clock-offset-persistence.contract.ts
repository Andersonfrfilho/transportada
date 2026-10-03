/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  CLOCK_OFFSET_MAX_AGE_MS,
  CLOCK_OFFSET_STORAGE_KEY,
  createClockOffsetStore,
  type ClockOffsetStorage,
} from '../../src/modules/driver-trip/shared/clockOffset.service'
import { createDriverTripClient } from '../../src/modules/driver-trip/shared/driverTripClient.service'
import {
  drainQueue,
  enqueueReport,
  type OfflineQueueStore,
  type QueuedReport,
} from '../../src/modules/driver-trip/shared/offlineQueue.service'

const MEASURED_AT_MS = Date.parse('2026-10-03T07:00:00.000Z')

function createFakeStorage(initial: Readonly<Record<string, string>> = {}) {
  const entries = new Map(Object.entries(initial))
  const storage: ClockOffsetStorage & { readonly entries: Map<string, string> } = {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
  }
  return storage
}

/** Uma "sessão" do app: a memória é nova, o armazenamento do aparelho é o mesmo. */
function openSession(input: {
  readonly nowMs: number
  readonly storage: ClockOffsetStorage | null
}) {
  return createClockOffsetStore({ now: () => input.nowMs, storage: input.storage })
}

function storedRecord(record: unknown): Record<string, string> {
  return { [CLOCK_OFFSET_STORAGE_KEY]: JSON.stringify(record) }
}

/**
 * Spec 234 D7: o desvio medido às 7h sobrevive à aba descartada — reabrir às 10h sem sinal ainda manda o
 * relógio corrigido. O desvio é do aparelho, não da conta: nada aqui depende de quem entrou.
 */
describe('o desvio sobrevive à sessão (spec 234 D7)', () => {
  it('o que uma sessão mediu a seguinte lê', () => {
    const storage = createFakeStorage()
    openSession({ nowMs: MEASURED_AT_MS, storage }).write(90_000)

    const reopened = openSession({ nowMs: MEASURED_AT_MS + 3 * 3_600_000, storage })

    expect(reopened.read()).toBe(90_000)
  })

  it('desvio zero também sobrevive', () => {
    const storage = createFakeStorage()
    openSession({ nowMs: MEASURED_AT_MS, storage }).write(0)

    expect(openSession({ nowMs: MEASURED_AT_MS + 1_000, storage }).read()).toBe(0)
  })

  it('medição nova substitui a anterior e é a que a próxima sessão lê', () => {
    const storage = createFakeStorage()
    openSession({ nowMs: MEASURED_AT_MS, storage }).write(90_000)
    openSession({ nowMs: MEASURED_AT_MS + 60_000, storage }).write(-4_200)

    expect(openSession({ nowMs: MEASURED_AT_MS + 120_000, storage }).read()).toBe(-4_200)
  })

  it('guarda o instante da medição junto do desvio', () => {
    const storage = createFakeStorage()
    openSession({ nowMs: MEASURED_AT_MS, storage }).write(90_000)

    expect(JSON.parse(storage.entries.get(CLOCK_OFFSET_STORAGE_KEY) ?? 'null')).toEqual({
      measuredAt: MEASURED_AT_MS,
      offsetMs: 90_000,
    })
  })

  it('sem nada guardado, ainda não foi medido', () => {
    expect(openSession({ nowMs: MEASURED_AT_MS, storage: createFakeStorage() }).read()).toBe(
      undefined,
    )
  })
})

describe('o desvio guardado vale 24 h (spec 234 D7)', () => {
  it('o teto declarado é 24 h', () => {
    expect(CLOCK_OFFSET_MAX_AGE_MS).toBe(24 * 3_600_000)
  })

  it('com exatas 24 h ainda vale (o limite é inclusivo)', () => {
    const storage = createFakeStorage()
    openSession({ nowMs: MEASURED_AT_MS, storage }).write(90_000)

    const reopened = openSession({ nowMs: MEASURED_AT_MS + CLOCK_OFFSET_MAX_AGE_MS, storage })

    expect(reopened.read()).toBe(90_000)
  })

  it('1 ms além das 24 h vale "nunca medido"', () => {
    const storage = createFakeStorage()
    openSession({ nowMs: MEASURED_AT_MS, storage }).write(90_000)

    const reopened = openSession({ nowMs: MEASURED_AT_MS + CLOCK_OFFSET_MAX_AGE_MS + 1, storage })

    expect(reopened.read()).toBe(undefined)
  })

  it('a mesma sessão aberta por mais de 24 h sem nova medição também expira', () => {
    let nowMs = MEASURED_AT_MS
    const store = createClockOffsetStore({ now: () => nowMs, storage: createFakeStorage() })
    store.write(90_000)

    nowMs = MEASURED_AT_MS + CLOCK_OFFSET_MAX_AGE_MS + 1

    expect(store.read()).toBe(undefined)
  })

  it('medição de agora no mesmo instante vale; no futuro do relógio atual (relógio mexido), não', () => {
    const atNow = createFakeStorage(storedRecord({ measuredAt: MEASURED_AT_MS, offsetMs: 5 }))
    expect(openSession({ nowMs: MEASURED_AT_MS, storage: atNow }).read()).toBe(5)

    const inTheFuture = createFakeStorage(
      storedRecord({ measuredAt: MEASURED_AT_MS + 1, offsetMs: 5 }),
    )
    expect(openSession({ nowMs: MEASURED_AT_MS, storage: inTheFuture }).read()).toBe(undefined)
  })
})

describe('o registro guardado é entrada não confiável (spec 234 D7)', () => {
  const MALFORMED: readonly (readonly [string, string])[] = [
    ['texto que não é JSON', 'isto não é json'],
    ['null', 'null'],
    ['número solto', '42'],
    ['sem measuredAt', JSON.stringify({ offsetMs: 5 })],
    ['sem offsetMs', JSON.stringify({ measuredAt: MEASURED_AT_MS })],
    ['offsetMs em texto', JSON.stringify({ measuredAt: MEASURED_AT_MS, offsetMs: '5' })],
    ['measuredAt em texto', JSON.stringify({ measuredAt: '2026-10-03', offsetMs: 5 })],
    [
      'offsetMs fracionário (a API recusa)',
      JSON.stringify({ measuredAt: MEASURED_AT_MS, offsetMs: 1.5 }),
    ],
    ['offsetMs infinito', '{"measuredAt":1788418800000,"offsetMs":1e999}'],
    ['lista', JSON.stringify([MEASURED_AT_MS, 5])],
  ]

  for (const [label, raw] of MALFORMED) {
    it(`${label}: não mede nada, e não derruba a leitura`, () => {
      const storage = createFakeStorage({ [CLOCK_OFFSET_STORAGE_KEY]: raw })

      expect(openSession({ nowMs: MEASURED_AT_MS, storage }).read()).toBe(undefined)
    })
  }

  it('armazenamento que lança na leitura vale "nunca medido"', () => {
    const storage: ClockOffsetStorage = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => undefined,
    }

    expect(openSession({ nowMs: MEASURED_AT_MS, storage }).read()).toBe(undefined)
  })

  it('armazenamento que lança na escrita (cota, modo privado) não derruba a medição', () => {
    const storage: ClockOffsetStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    const store = openSession({ nowMs: MEASURED_AT_MS, storage })

    store.write(90_000)

    expect(store.read()).toBe(90_000)
  })

  it('sem armazenamento (null), só a memória da sessão vale', () => {
    const store = openSession({ nowMs: MEASURED_AT_MS, storage: null })
    store.write(7)

    expect(store.read()).toBe(7)
  })
})

function createMemoryQueue() {
  let items: readonly QueuedReport[] = []
  const store: OfflineQueueStore = {
    read: () => Promise.resolve(items),
    update: (mutate) => {
      items = [...mutate(items)]
      return Promise.resolve(items)
    },
  }
  return { items: () => items, store }
}

describe('a medição que o cliente persiste (spec 234 D7)', () => {
  function buildClient(input: {
    readonly dateHeader: string | undefined
    readonly round: readonly [number, number]
    readonly store: ReturnType<typeof createClockOffsetStore>
  }) {
    const times = [...input.round]
    return createDriverTripClient({
      apiUrl: 'https://api.test',
      clockOffset: input.store,
      fetch: () =>
        Promise.resolve(
          new Response('{"data":{"acceptedAt":null}}', {
            headers: {
              'content-type': 'application/json',
              ...(input.dateHeader === undefined ? {} : { date: input.dateHeader }),
            },
          }),
        ),
      getAccessToken: () => Promise.resolve('token'),
      now: () => times.shift() ?? MEASURED_AT_MS,
    })
  }

  it('a resposta da API grava o desvio no aparelho', async () => {
    const storage = createFakeStorage()
    const client = buildClient({
      dateHeader: 'Sat, 03 Oct 2026 07:01:30 GMT',
      round: [MEASURED_AT_MS, MEASURED_AT_MS],
      store: openSession({ nowMs: MEASURED_AT_MS, storage }),
    })

    await client.readLocationConsent()

    expect(openSession({ nowMs: MEASURED_AT_MS + 1_000, storage }).read()).toBe(90_000)
  })

  it('o pedido lento (mais de 5 s) não grava nada no aparelho', async () => {
    const storage = createFakeStorage()
    const client = buildClient({
      dateHeader: 'Sat, 03 Oct 2026 07:01:30 GMT',
      round: [MEASURED_AT_MS, MEASURED_AT_MS + 5_001],
      store: openSession({ nowMs: MEASURED_AT_MS, storage }),
    })

    await client.readLocationConsent()

    expect(storage.entries.size).toBe(0)
  })

  /**
   * O caso-alvo da decisão: abre com sinal às 7h (mede), a aba é descartada, reabre às 10h sem sinal e
   * entrega. O item nasce com o desvio persistido, e o corpo sai com `tappedAt` e `clockOffsetMs`.
   */
  it('reabrir sem sinal depois: a entrega enfileirada logo no boot sai com o desvio de antes', async () => {
    const storage = createFakeStorage()
    const measuring = buildClient({
      dateHeader: 'Sat, 03 Oct 2026 07:01:30 GMT',
      round: [MEASURED_AT_MS, MEASURED_AT_MS],
      store: openSession({ nowMs: MEASURED_AT_MS, storage }),
    })
    await measuring.readLocationConsent()

    const tapAt = new Date(MEASURED_AT_MS + 3 * 3_600_000)
    const afterReload = openSession({ nowMs: tapAt.getTime(), storage })
    const queue = createMemoryQueue()
    await enqueueReport({
      clockOffsetMs: afterReload.read(),
      now: tapAt,
      report: { documentId: 'doc-1', idempotencyKey: 'k-1', kind: 'deliver', location: null },
      store: queue.store,
    })

    const bodies: Record<string, unknown>[] = []
    const sending = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: async (input) => {
        bodies.push(JSON.parse(await (input as Request).text()) as Record<string, unknown>)
        return Response.json({ data: {} }, { status: 201 })
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    await drainQueue({
      send: async (stamped) => {
        await sending.send(stamped)
        return 'sent'
      },
      store: queue.store,
    })

    expect(bodies).toEqual([
      { clockOffsetMs: 90_000, location: null, tappedAt: tapAt.toISOString() },
    ])
  })
})
