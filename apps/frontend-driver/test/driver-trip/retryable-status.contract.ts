/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { StampedReport } from '../../src/modules/driver-trip/shared/clockOffset.service'
import { describe, expect, it } from 'bun:test'

import {
  DriverTripRequestError,
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

const NOW = new Date('2026-10-02T13:00:00.000Z')
const RETRYABLE_STATUSES = [408, 429, 502, 503, 504] as const
const REFUSAL_STATUSES = [400, 403, 404, 409, 422, 500] as const

function buildClient(respond: (request: Request) => Response) {
  return createDriverTripClient({
    apiUrl: 'https://api.test',
    fetch: (input) => Promise.resolve(respond(input as Request)),
    getAccessToken: () => Promise.resolve('token-de-mentira'),
  })
}

function arrival(key: string): DriverFieldReport {
  return { idempotencyKey: key, kind: 'arrive', location: null, stopId: 'stop-1' }
}

function createMemoryStore(): OfflineQueueStore & {
  readonly items: () => readonly QueuedReport[]
} {
  let items: readonly QueuedReport[] = []

  return {
    items: () => items,
    read: () => Promise.resolve(items),
    update: (mutate) => {
      items = [...mutate(items)]
      return Promise.resolve(items)
    },
  }
}

async function outcomeOf(response: Response): Promise<string> {
  const client = buildClient(() => response)
  try {
    await client.send({ report: arrival('chave-1'), stamp: undefined })
    return 'sent'
  } catch (error) {
    return toAttachmentSendOutcome(error).kind
  }
}

/**
 * Servidor fora do ar não é recusa do item. Toda resposta não-OK virava `rejected` — inclusive o
 * HTML de um 502 durante o deploy —, e o item bom saía da drenagem automática e ficava parado até o
 * motorista tocar "Enviar agora". Só o que o servidor *leu e disse não* é recusa.
 */
describe('indisponibilidade do servidor não recusa o item da fila', () => {
  it.each([...RETRYABLE_STATUSES])('o %d com corpo JSON deixa o item na fila', async (status) => {
    const body = { error: { code: 'UPSTREAM', message: 'indisponível' } }

    expect(await outcomeOf(Response.json(body, { status }))).toBe('failed-network')
  })

  /** ⚠️ O gateway devolve HTML: o corpo não é JSON, e a causa tem de continuar sendo o status. */
  it.each([...RETRYABLE_STATUSES])('o %d com corpo HTML deixa o item na fila', async (status) => {
    const html = new Response('<html><body>Bad Gateway</body></html>', {
      headers: { 'content-type': 'text/html' },
      status,
    })

    expect(await outcomeOf(html)).toBe('failed-network')
  })

  it.each([...REFUSAL_STATUSES])('o %d continua sendo recusa do item', async (status) => {
    const body = { error: { code: 'TRIP_DOCUMENT_ALREADY_CLOSED', message: 'x' } }

    expect(await outcomeOf(Response.json(body, { status }))).toBe('rejected')
  })

  /**
   * ⚠️ O 500 fica de fora **de propósito**: `failed-network` para a drenagem inteira, então um item
   * que derruba o servidor sempre travaria todos os de trás, por até 7 dias. 502/503/504/429/408
   * são do caminho, não do item — o próximo da fila teria o mesmo destino.
   */
  it('um 500 não trava os itens de trás', async () => {
    const store = createMemoryStore()
    await enqueueReport({ now: NOW, report: arrival('chave-a'), store })
    await enqueueReport({ now: NOW, report: arrival('chave-b'), store })
    const seen: string[] = []
    const client = buildClient((request) => {
      seen.push(request.headers.get('idempotency-key') ?? '')
      return seen.length === 1
        ? Response.json({ error: { code: 'BOOM' } }, { status: 500 })
        : Response.json({ data: {} }, { status: 201 })
    })

    const result = await drainQueue({
      send: async ({ report }) => {
        try {
          await client.send({ report, stamp: undefined })
          return 'sent'
        } catch (error) {
          return toAttachmentSendOutcome(error).kind
        }
      },
      store,
    })

    expect(seen).toEqual(['chave-a', 'chave-b'])
    expect(result.sent).toBe(1)
    expect(result.rejected.map((item) => item.report.idempotencyKey)).toEqual(['chave-a'])
  })

  it('um 503 deixa o item e os de trás para a próxima drenagem, e ela os envia', async () => {
    const store = createMemoryStore()
    await enqueueReport({ now: NOW, report: arrival('chave-a'), store })
    await enqueueReport({ now: NOW, report: arrival('chave-b'), store })
    let isServerUp = false
    const seen: string[] = []
    const client = buildClient((request) => {
      seen.push(request.headers.get('idempotency-key') ?? '')
      return isServerUp
        ? Response.json({ data: {} }, { status: 201 })
        : new Response('<html>Service Unavailable</html>', { status: 503 })
    })
    const send = async ({ report }: StampedReport) => {
      try {
        await client.send({ report, stamp: undefined })
        return 'sent' as const
      } catch (error) {
        return toAttachmentSendOutcome(error).kind
      }
    }

    const first = await drainQueue({ send, store })
    expect(first).toEqual({ rejected: [], remaining: 2, sent: 0 })
    expect(store.items()[0]?.attempts).toBe(1)
    expect(seen).toEqual(['chave-a'])

    isServerUp = true
    const second = await drainQueue({ send, store })
    expect(second).toEqual({ rejected: [], remaining: 0, sent: 2 })
  })

  /** Fora do ar também vale para o storage da foto: a URL assinada vencida (403) é que recusa. */
  it('o PUT da foto ao storage: 503 espera, 403 recusa', async () => {
    const photo = {
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
      fileName: 'a.jpg',
    }
    const report: DriverFieldReport = {
      documentId: 'document-1',
      idempotencyKey: 'chave-foto',
      kind: 'documentOccurrence',
      location: null,
      note: '',
      occurrenceTypeId: 'type-1',
      occurrenceTypeName: 'Recusa',
      photo,
      productCode: '',
    }
    const respondWithStorage = (status: number) => (request: Request) =>
      new URL(request.url).origin === 'https://storage.test'
        ? new Response(null, { status })
        : Response.json(
            { data: { id: 'upload-1', uploadUrl: 'https://storage.test/bucket/objeto' } },
            { status: 201 },
          )

    const outcomes = await Promise.all(
      [503, 403].map(async (status) => {
        try {
          await buildClient(respondWithStorage(status)).send({ report, stamp: undefined })
          return 'sent'
        } catch (error) {
          return toAttachmentSendOutcome(error).kind
        }
      }),
    )

    expect(outcomes).toEqual(['failed-network', 'rejected'])
  })

  /** A resposta 200 que não é JSON continua sendo recusa, e a causa continua sem status. */
  it('um 200 com corpo ilegível continua recusado, sem status na causa', async () => {
    const client = buildClient(() => new Response('<html>ok?</html>', { status: 200 }))

    const error = await client
      .send({ report: arrival('chave-1'), stamp: undefined })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DriverTripRequestError)
    expect(toAttachmentSendOutcome(error)).toEqual({ cause: 'RESPONSE_INVALID', kind: 'rejected' })
  })
})
