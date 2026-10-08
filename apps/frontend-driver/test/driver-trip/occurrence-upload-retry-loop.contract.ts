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
