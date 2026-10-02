/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import {
  createDriverTripClient,
  reportBody,
  reportPath,
  toAttachmentSendOutcome,
} from '../../src/modules/driver-trip/shared/driverTripClient.service'
import type { DriverFieldReport } from '../../src/modules/driver-trip/shared/driverTrip.types'
import { buildEventQueueView } from '../../src/modules/driver-trip/shared/eventQueueView.service'
import {
  drainQueue,
  enqueueReport,
  type OfflineQueueStore,
  type QueuedReport,
} from '../../src/modules/driver-trip/shared/offlineQueue.service'

const NOW = new Date('2026-10-03T12:00:00.000Z')

const DISPATCH: Extract<DriverFieldReport, { kind: 'dispatch' }> = {
  idempotencyKey: 'chave-despacho',
  kind: 'dispatch',
  tripId: 'trip-1',
}

function arrival(): DriverFieldReport {
  return { idempotencyKey: 'chave-chegada', kind: 'arrive', location: null, stopId: 'stop-1' }
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

function buildClient(respond: (request: Request) => Response) {
  const seen: Request[] = []
  const client = createDriverTripClient({
    apiUrl: 'https://api.test',
    fetch: (input) => {
      seen.push((input as Request).clone())
      return Promise.resolve(respond(input as Request))
    },
    getAccessToken: () => Promise.resolve('token-de-mentira'),
  })
  return { client, seen }
}

async function outcomeKind(client: ReturnType<typeof buildClient>['client']): Promise<string> {
  try {
    await client.send(DISPATCH)
    return 'sent'
  } catch (error) {
    return toAttachmentSendOutcome(error).kind
  }
}

/**
 * Spec 230. Decisão do usuário (03/10/2026): despachar precisa chegar ao servidor, mas sem rede o
 * toque fica como pendência de envio e sobe sozinho (ou pelo envio manual) quando o sinal voltar. O
 * servidor já trata o despacho repetido como `unchanged`, então reenviar é seguro.
 */
describe('o despacho da viagem vai pela fila (spec 230)', () => {
  it('é um POST de /dispatch com a viagem no corpo', async () => {
    expect(reportPath(DISPATCH)).toBe('/me/trips/current/dispatch')
    expect(JSON.parse(reportBody(DISPATCH))).toEqual({ tripId: 'trip-1' })

    const { client, seen } = buildClient(() => Response.json({ data: { status: 'dispatched' } }))
    await client.send(DISPATCH)

    expect(seen[0]?.method).toBe('POST')
    expect(new URL(seen[0]?.url ?? '').pathname).toBe('/me/trips/current/dispatch')
    expect(await seen[0]?.json()).toEqual({ tripId: 'trip-1' })
  })

  it('servidor fora do ar espera; recusa de negócio recusa; sucesso envia', async () => {
    const down = buildClient(() => new Response('<html>Bad Gateway</html>', { status: 502 }))
    const refused = buildClient(() =>
      Response.json({ error: { code: 'STATE_TRANSITION_NOT_ALLOWED' } }, { status: 409 }),
    )
    const ok = buildClient(() => Response.json({ data: {} }))

    expect(await outcomeKind(down.client)).toBe('failed-network')
    expect(await outcomeKind(refused.client)).toBe('rejected')
    expect(await outcomeKind(ok.client)).toBe('sent')
  })

  /** O despacho abre o portão das escritas de campo: tem de subir antes de tudo que veio depois dele. */
  it('sem sinal o despacho fica na fila, e quando o sinal volta sobe antes do resto', async () => {
    const store = createMemoryStore()
    await enqueueReport({ now: NOW, report: DISPATCH, store })
    await enqueueReport({ now: NOW, report: arrival(), store })
    let isUp = false
    const order: string[] = []
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: (input) => {
        const request = input as Request
        if (!isUp) return Promise.reject(new TypeError('Failed to fetch'))
        order.push(new URL(request.url).pathname)
        return Promise.resolve(Response.json({ data: {} }, { status: 200 }))
      },
      getAccessToken: () => Promise.resolve('token-de-mentira'),
    })
    const send = async (report: DriverFieldReport) => {
      try {
        await client.send(report)
        return 'sent' as const
      } catch (error) {
        return toAttachmentSendOutcome(error).kind
      }
    }

    const offline = await drainQueue({ send, store })
    expect(offline).toEqual({ rejected: [], remaining: 2, sent: 0 })
    expect(store.items()[0]?.report.kind).toBe('dispatch')

    isUp = true
    const online = await drainQueue({ send, store })
    expect(online).toEqual({ rejected: [], remaining: 0, sent: 2 })
    expect(order).toEqual(['/me/trips/current/dispatch', '/me/trips/current/stops/stop-1/arrive'])
  })

  it('a tela de pendências lê o despacho com a viagem dele', () => {
    const views = buildEventQueueView({
      attachments: [],
      queued: [{ attempts: 0, createdAt: NOW.toISOString(), report: DISPATCH }],
    })

    expect(views[0]).toMatchObject({ kind: 'dispatch', tripId: 'trip-1' })
  })
})

describe('a tela despacha pela fila e destrava o campo (spec 230)', () => {
  const page = readFileSync(
    new URL('../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx', import.meta.url),
    'utf8',
  )
  const client = readFileSync(
    new URL('../../src/modules/driver-trip/shared/driverTripClient.service.ts', import.meta.url),
    'utf8',
  )

  it('o botão enfileira o despacho; a chamada direta saiu', () => {
    expect(page).toInclude("kind: 'dispatch'")
    expect(page).not.toInclude('getDriverTripClient().dispatchTrip')
    expect(client).not.toInclude('dispatchTrip')
  })

  it('despacho na fila libera as ações de campo e troca o botão pelo aviso', () => {
    expect(page).toInclude('isDispatchQueued')
    expect(page).toInclude("t('dispatch.queued')")
    expect(page).toInclude('isFieldWorkBlocked={isTripAwaitingDispatch}')
  })

  it('há texto do aviso e do tipo na fila, nos dois idiomas', () => {
    for (const locale of [driverTrip, driverTripEn]) {
      expect(locale.dispatch.queued).toBeString()
      expect(locale.eventQueue.kind.dispatch).toBeString()
    }
  })
})
