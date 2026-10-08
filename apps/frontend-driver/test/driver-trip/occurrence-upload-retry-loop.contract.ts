/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  createDriverTripClient,
  toAttachmentSendOutcome,
} from '../../src/modules/driver-trip/shared/driverTripClient.service'
import type { DriverFieldReport } from '../../src/modules/driver-trip/shared/driverTrip.types'
import {
  drainQueue,
  enqueueReport,
  type OfflineQueueStore,
  type QueuedReport,
} from '../../src/modules/driver-trip/shared/offlineQueue.service'
import { createDrainScheduler } from '../../src/modules/driver-trip/shared/pendingQueue.service'

const API = 'https://api.test'
const STORAGE_ORIGIN = 'https://storage.test'
const UPLOAD_ID = '00000000-0000-4000-8000-0000000000a1'
const UPLOAD_URL = `${STORAGE_ORIGIN}/bucket/objeto?X-Amz-Signature=assinatura`
const SLOT_PATH = '/me/trips/current/documents/document-1/occurrence-uploads'

function buildReport(): Extract<DriverFieldReport, { kind: 'documentOccurrence' }> {
  return {
    documentId: 'document-1',
    idempotencyKey: 'chave-da-ocorrencia',
    kind: 'documentOccurrence',
    location: null,
    note: 'Cliente recusou na porta',
    occurrenceTypeId: 'type-1',
    occurrenceTypeName: 'Recusa total',
    photo: {
      blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }),
      fileName: 'recusa.jpg',
    },
    productCode: '',
  }
}

function buildMemoryStore(): OfflineQueueStore {
  let items: readonly QueuedReport[] = []
  return {
    read: () => Promise.resolve(items),
    update: (mutate) => {
      items = mutate(items)
      return Promise.resolve(items)
    },
  }
}

type StorageBehavior = () => Promise<Response>

/** A API sempre responde bem; só o storage muda. É exatamente o que o log de produção mostrou. */
function buildHarness(storage: StorageBehavior) {
  const slotRequests: string[] = []
  const client = createDriverTripClient({
    apiUrl: API,
    fetch: (input) => {
      const request = input as Request
      const url = new URL(request.url)
      if (url.origin === STORAGE_ORIGIN) return storage()
      if (url.pathname === SLOT_PATH) {
        slotRequests.push(url.pathname)
        return Promise.resolve(
          Response.json({ data: { id: UPLOAD_ID, uploadUrl: UPLOAD_URL } }, { status: 201 }),
        )
      }
      return Promise.resolve(Response.json({ data: { id: 'occurrence-1' } }, { status: 201 }))
    },
    getAccessToken: () => Promise.resolve('token-de-mentira'),
  })

  async function send(stamped: Parameters<typeof client.send>[0]) {
    try {
      await client.send(stamped)
      return 'sent' as const
    } catch (error) {
      return toAttachmentSendOutcome(error).kind
    }
  }

  return { send, slotRequests }
}

async function runTicks(input: { ticks: number; storage: StorageBehavior }) {
  const store = buildMemoryStore()
  await enqueueReport({ now: new Date(), report: buildReport(), store })
  const { send, slotRequests } = buildHarness(input.storage)

  for (let tick = 0; tick < input.ticks; tick += 1) {
    await drainQueue({ send, store })
  }

  return { queue: await store.read(), slotRequests }
}

/**
 * Produção, 07/10/2026: 60 `POST .../occurrence-uploads` (201) sem nenhum `/confirm`, em ~9 minutos,
 * num aparelho. O temporizador de 30 s reenvia a fila enquanto houver item drenável — se o `PUT` ao
 * storage cai na rede, cada tick pede uma URL assinada nova, para sempre.
 */
describe('o PUT que cai na rede repete o pedido de URL a cada drenagem', () => {
  it('rede caída no storage: um pedido de URL por tick, o item nunca sai e as tentativas só sobem', async () => {
    const { queue, slotRequests } = await runTicks({
      ticks: 20,
      storage: () => Promise.reject(new TypeError('Failed to fetch')),
    })

    expect(slotRequests).toHaveLength(20)
    expect(queue).toHaveLength(1)
    expect(queue[0]?.attempts).toBe(20)
    expect(queue[0]?.rejectionCause).toBeUndefined()
  })

  it('503 do storage também é "tente depois": mesma repetição', async () => {
    const { queue, slotRequests } = await runTicks({
      ticks: 5,
      storage: () => Promise.resolve(new Response(null, { status: 503 })),
    })

    expect(slotRequests).toHaveLength(5)
    expect(queue[0]?.attempts).toBe(5)
  })

  it('403 do storage (URL recusada) é recusa: uma tentativa e o item sai da fila', async () => {
    const { queue, slotRequests } = await runTicks({
      ticks: 5,
      storage: () => Promise.resolve(new Response('<Error/>', { status: 403 })),
    })

    expect(slotRequests).toHaveLength(1)
    expect(queue).toHaveLength(0)
  })

  it('500 do storage também é recusa: não repete', async () => {
    const { queue, slotRequests } = await runTicks({
      ticks: 5,
      storage: () => Promise.resolve(new Response(null, { status: 500 })),
    })

    expect(slotRequests).toHaveLength(1)
    expect(queue).toHaveLength(0)
  })
})

/**
 * Spec 254 T1.3 (RF8/RF10, CA3/CA4): o temporizador de 30 s espaça o reenvio do item que a rede
 * recusa (30 s × 2, teto 10 min, jitter de ±20 %), e "Enviar agora" ignora o espaçamento. API
 * futura — a função e os parâmetros `origin`/`now`/`random` ainda não existem, por isso a
 * importação é dinâmica e a chamada passa por um tipo local.
 */
const RETRY_BACKOFF_MODULE = '../../src/modules/driver-trip/shared/retryBackoff.service'
const PINNED_RANDOM = () => 0.5
const TICK_MILLISECONDS = 30_000
const START_MILLISECONDS = Date.parse('2026-10-07T12:00:00.000Z')

type DrainOrigin = 'immediate' | 'timer'

type RetryBackoffModule = Readonly<{
  computeRetryDelayMs: (input: { attempts: number; random?: () => number }) => number
  isRetryDue: (input: {
    item: Readonly<{ attempts: number; lastAttemptAt?: string }>
    now: Date
    random?: () => number
  }) => boolean
}>

type DrainWithOrigin = (input: {
  origin: DrainOrigin
  now: Date
  random: () => number
  send: Parameters<typeof drainQueue>[0]['send']
  store: OfflineQueueStore
}) => ReturnType<typeof drainQueue>

const drainWithOrigin = drainQueue as unknown as DrainWithOrigin

async function loadRetryBackoff(): Promise<RetryBackoffModule> {
  return (await import(RETRY_BACKOFF_MODULE)) as RetryBackoffModule
}

function clockAt(tick: number): Date {
  return new Date(START_MILLISECONDS + tick * TICK_MILLISECONDS)
}

async function runClockedTicks(input: {
  ticks: number
  origin: DrainOrigin
  storage: StorageBehavior
}) {
  const store = buildMemoryStore()
  await enqueueReport({ now: clockAt(0), report: buildReport(), store })
  const { send, slotRequests } = buildHarness(input.storage)

  for (let tick = 0; tick < input.ticks; tick += 1) {
    await drainWithOrigin({
      now: clockAt(tick),
      origin: input.origin,
      random: PINNED_RANDOM,
      send,
      store,
    })
  }

  return { queue: await store.read(), slotRequests }
}

function buildWaitingItem(input: {
  key: string
  attempts: number
  lastAttemptAt?: string
}): QueuedReport {
  const base: QueuedReport = {
    attempts: input.attempts,
    createdAt: clockAt(0).toISOString(),
    report: {
      documentId: 'document-1',
      idempotencyKey: input.key,
      kind: 'deliver',
      location: null,
    },
  }
  return input.lastAttemptAt === undefined
    ? base
    : ({ ...base, lastAttemptAt: input.lastAttemptAt } as QueuedReport)
}

describe('computeRetryDelayMs e isRetryDue (spec 254 RF8)', () => {
  it('30 s dobrando a cada falha, com teto de 10 min', async () => {
    const { computeRetryDelayMs } = await loadRetryBackoff()
    const delays = [1, 2, 3, 4, 5, 6, 7, 50].map((attempts) =>
      computeRetryDelayMs({ attempts, random: PINNED_RANDOM }),
    )

    expect(delays).toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 600_000, 600_000, 600_000])
  })

  it('o jitter vai de -20 % a +20 % do atraso, pela função injetada', async () => {
    const { computeRetryDelayMs } = await loadRetryBackoff()

    expect(computeRetryDelayMs({ attempts: 1, random: () => 0 })).toBeCloseTo(24_000, 0)
    expect(computeRetryDelayMs({ attempts: 1, random: () => 1 })).toBeCloseTo(36_000, 0)
    expect(computeRetryDelayMs({ attempts: 20, random: () => 1 })).toBeCloseTo(720_000, 0)
  })

  it('item sem lastAttemptAt é devido, e o com lastAttemptAt só depois do atraso', async () => {
    const { isRetryDue } = await loadRetryBackoff()
    const now = clockAt(0)
    const legacy = buildWaitingItem({ attempts: 3, key: 'a' })
    const recent = buildWaitingItem({
      attempts: 1,
      key: 'b',
      lastAttemptAt: new Date(now.getTime() - 29_000).toISOString(),
    })
    const elapsed = buildWaitingItem({
      attempts: 1,
      key: 'c',
      lastAttemptAt: new Date(now.getTime() - 30_000).toISOString(),
    })

    expect(isRetryDue({ item: legacy, now, random: PINNED_RANDOM })).toBe(true)
    expect(isRetryDue({ item: recent, now, random: PINNED_RANDOM })).toBe(false)
    expect(isRetryDue({ item: elapsed, now, random: PINNED_RANDOM })).toBe(true)
  })
})

describe('a drenagem do temporizador espaça o reenvio (spec 254 CA3/CA4)', () => {
  it('20 ticks de 30 s com o storage caído fazem 5 pedidos de URL, não 20', async () => {
    const { queue, slotRequests } = await runClockedTicks({
      origin: 'timer',
      storage: () => Promise.reject(new TypeError('Failed to fetch')),
      ticks: 20,
    })

    // Tentativas nos ticks 0, 1, 3, 7 e 15 (esperas de 30, 60, 120 e 240 s; a próxima, 480 s, passa de 20 ticks).
    expect(slotRequests.length).toBeLessThan(20)
    expect(slotRequests).toHaveLength(5)
    expect(queue[0]?.attempts).toBe(5)
    expect(queue[0]?.rejectionCause).toBeUndefined()
  })

  it('gravar a tentativa que a rede recusou carimba lastAttemptAt com a hora da drenagem', async () => {
    const { queue } = await runClockedTicks({
      origin: 'timer',
      storage: () => Promise.reject(new TypeError('Failed to fetch')),
      ticks: 1,
    })

    expect((queue[0] as { lastAttemptAt?: string } | undefined)?.lastAttemptAt).toBe(
      clockAt(0).toISOString(),
    )
  })

  it('"Enviar agora" (immediate) ignora o espaçamento: um pedido por tick', async () => {
    const { queue, slotRequests } = await runClockedTicks({
      origin: 'immediate',
      storage: () => Promise.reject(new TypeError('Failed to fetch')),
      ticks: 20,
    })

    expect(slotRequests).toHaveLength(20)
    expect(queue[0]?.attempts).toBe(20)
  })

  it('403 e 500 do storage seguem sendo recusa: um pedido e o item sai', async () => {
    for (const status of [403, 500]) {
      const { queue, slotRequests } = await runClockedTicks({
        origin: 'timer',
        storage: () => Promise.resolve(new Response(null, { status })),
        ticks: 5,
      })

      expect(slotRequests).toHaveLength(1)
      expect(queue).toHaveLength(0)
    }
  })

  it('o item continua na fila depois de 100 ticks (spec 227 D1: nunca descartar)', async () => {
    const store = buildMemoryStore()
    await enqueueReport({ now: clockAt(0), report: buildReport(), store })
    let sends = 0

    for (let tick = 0; tick < 100; tick += 1) {
      await drainWithOrigin({
        now: clockAt(tick),
        origin: 'timer',
        random: PINNED_RANDOM,
        send: () => {
          sends += 1
          return Promise.resolve('failed-network')
        },
        store,
      })
    }

    // Tentativas em 0, 30, 90, 210, 450, 930, 1530, 2130 e 2730 s.
    expect(sends).toBe(9)
    expect(await store.read()).toHaveLength(1)
  })

  it('item em espera na frente PARA a drenagem do temporizador: ninguém passa e nada conta tentativa', async () => {
    const store = buildMemoryStore()
    const now = clockAt(10)
    const waiting = buildWaitingItem({
      attempts: 1,
      key: 'cheguei',
      lastAttemptAt: new Date(now.getTime() - 1_000).toISOString(),
    })
    const behind = buildWaitingItem({ attempts: 0, key: 'entreguei' })
    await store.update(() => [waiting, behind])
    const sentKeys: string[] = []
    const send: Parameters<typeof drainQueue>[0]['send'] = (stamped) => {
      sentKeys.push(stamped.report.idempotencyKey)
      return Promise.resolve('sent')
    }

    await drainWithOrigin({ now, origin: 'timer', random: PINNED_RANDOM, send, store })

    expect(sentKeys).toEqual([])
    expect((await store.read()).map((item) => item.attempts)).toEqual([1, 0])

    await drainWithOrigin({ now, origin: 'immediate', random: PINNED_RANDOM, send, store })

    expect(sentKeys).toEqual(['cheguei', 'entreguei'])
  })
})

/**
 * O agendador guarda a origem do pedido pendente: o tick do `setInterval` é `timer`, os demais
 * gatilhos são `immediate`, e ao juntar dois pedidos o `immediate` vence — senão "Enviar agora"
 * pedido durante uma drenagem respeitaria o espaçamento.
 */
type SchedulerWithOrigin = Readonly<{
  request: (only: string | undefined, origin: DrainOrigin) => void
  settled: () => void
}>

function createOriginScheduler(
  runs: Array<[string | undefined, DrainOrigin]>,
): SchedulerWithOrigin {
  const create = createDrainScheduler as unknown as (input: {
    run: (only: string | undefined, origin: DrainOrigin) => void
  }) => SchedulerWithOrigin
  return create({ run: (only, origin) => runs.push([only, origin]) })
}

describe('o agendador junta pedidos e immediate vence timer (spec 254 RF8)', () => {
  it('a origem do pedido que inicia a drenagem chega ao run', () => {
    const runs: Array<[string | undefined, DrainOrigin]> = []
    const scheduler = createOriginScheduler(runs)

    scheduler.request(undefined, 'timer')

    expect(runs).toEqual([[undefined, 'timer']])
  })

  it('timer pendente e immediate depois: a repetição é immediate', () => {
    const runs: Array<[string | undefined, DrainOrigin]> = []
    const scheduler = createOriginScheduler(runs)

    scheduler.request(undefined, 'immediate')
    scheduler.request(undefined, 'timer')
    scheduler.request(undefined, 'immediate')
    scheduler.settled()

    expect(runs).toEqual([
      [undefined, 'immediate'],
      [undefined, 'immediate'],
    ])
  })

  it('immediate pendente e timer depois: continua immediate', () => {
    const runs: Array<[string | undefined, DrainOrigin]> = []
    const scheduler = createOriginScheduler(runs)

    scheduler.request(undefined, 'timer')
    scheduler.request(undefined, 'immediate')
    scheduler.request(undefined, 'timer')
    scheduler.settled()

    expect(runs).toEqual([
      [undefined, 'timer'],
      [undefined, 'immediate'],
    ])
  })

  it('só timers juntos continuam timer', () => {
    const runs: Array<[string | undefined, DrainOrigin]> = []
    const scheduler = createOriginScheduler(runs)

    scheduler.request(undefined, 'timer')
    scheduler.request(undefined, 'timer')
    scheduler.settled()

    expect(runs).toEqual([
      [undefined, 'timer'],
      [undefined, 'timer'],
    ])
  })
})
