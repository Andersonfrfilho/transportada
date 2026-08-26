/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  drainQueue,
  enqueueReport,
  type DrainOutcome,
  type OfflineQueueStore,
  type QueuedReport,
} from '@/modules/driver-trip/shared/offlineQueue.service'
import type { DriverFieldReport } from '@/modules/driver-trip/shared/driverTrip.types'

const NOW = new Date('2026-08-26T13:00:00.000Z')

function createMemoryStore(initial: readonly QueuedReport[] = []): OfflineQueueStore & {
  readonly items: () => readonly QueuedReport[]
} {
  let items = [...initial]

  return {
    items: () => items,
    read: () => Promise.resolve(items),
    write: (next) => {
      items = [...next]
      return Promise.resolve()
    },
  }
}

function arrival(key: string, stopId = 'stop-1'): DriverFieldReport {
  return { idempotencyKey: key, kind: 'arrive', location: null, stopId }
}

function delivery(key: string, documentId = 'document-1'): DriverFieldReport {
  return { documentId, idempotencyKey: key, kind: 'deliver', location: null }
}

describe('a fila offline', () => {
  it('guarda o toque com a chave que o servidor vai casar no reenvio', async () => {
    const store = createMemoryStore()

    await enqueueReport({ now: NOW, report: arrival('chave-1'), store })

    expect(store.items()).toHaveLength(1)
    expect(store.items()[0]?.report.idempotencyKey).toBe('chave-1')
    expect(store.items()[0]?.attempts).toBe(0)
  })

  /** A chave é a identidade do toque: a tela reenviando o mesmo não vira dois itens. */
  it('não enfileira o mesmo toque duas vezes', async () => {
    const store = createMemoryStore()

    await enqueueReport({ now: NOW, report: arrival('chave-1'), store })
    await enqueueReport({ now: NOW, report: arrival('chave-1'), store })

    expect(store.items()).toHaveLength(1)
  })

  /** É a história "sem sinal" da spec: três confirmações offline sobem quando a rede volta. */
  it('drena tudo em ordem quando a rede volta', async () => {
    const store = createMemoryStore()
    await enqueueReport({ now: NOW, report: arrival('chave-1'), store })
    await enqueueReport({ now: NOW, report: delivery('chave-2'), store })
    await enqueueReport({ now: NOW, report: delivery('chave-3', 'document-2'), store })
    const sentKeys: string[] = []

    const result = await drainQueue({
      send: (report) => {
        sentKeys.push(report.idempotencyKey)
        return Promise.resolve('sent')
      },
      store,
    })

    expect(sentKeys).toEqual(['chave-1', 'chave-2', 'chave-3'])
    expect(result).toMatchObject({ remaining: 0, sent: 3 })
    expect(store.items()).toHaveLength(0)
  })

  /**
   * Chegada antes de entrega. Drenar em paralelo entregaria numa parada onde o servidor ainda não
   * sabe que o motorista chegou — e a ordem é justamente o que a fila existe para preservar.
   */
  it('para na primeira falha de rede e guarda o resto para depois', async () => {
    const store = createMemoryStore()
    await enqueueReport({ now: NOW, report: arrival('chave-1'), store })
    await enqueueReport({ now: NOW, report: delivery('chave-2'), store })
    await enqueueReport({ now: NOW, report: delivery('chave-3', 'document-2'), store })
    const attempted: string[] = []

    const result = await drainQueue({
      send: (report): Promise<DrainOutcome> => {
        attempted.push(report.idempotencyKey)
        return Promise.resolve(report.idempotencyKey === 'chave-2' ? 'failed-network' : 'sent')
      },
      store,
    })

    expect(attempted).toEqual(['chave-1', 'chave-2'])
    expect(result).toMatchObject({ remaining: 2, sent: 1 })
    expect(store.items().map((item) => item.report.idempotencyKey)).toEqual([
      'chave-2',
      'chave-3',
    ])
  })

  /** Só quem a rede recusou conta uma tentativa: os de trás nem chegaram a ser enviados. */
  it('conta a tentativa apenas do item que a rede recusou', async () => {
    const store = createMemoryStore()
    await enqueueReport({ now: NOW, report: arrival('chave-1'), store })
    await enqueueReport({ now: NOW, report: delivery('chave-2'), store })

    await drainQueue({ send: () => Promise.resolve('failed-network'), store })

    expect(store.items().map((item) => item.attempts)).toEqual([1, 0])
  })

  /**
   * Recusa do servidor **sai** da fila: reenviar o que ele já disse que não aceita repetiria a
   * recusa para sempre. Ela volta como conflito à vista, nunca como sumiço em silêncio.
   */
  it('tira da fila o que o servidor recusou, e devolve o recusado para a tela mostrar', async () => {
    const store = createMemoryStore()
    await enqueueReport({ now: NOW, report: arrival('chave-1'), store })
    await enqueueReport({ now: NOW, report: delivery('chave-2'), store })

    const result = await drainQueue({
      send: (report) =>
        Promise.resolve(report.idempotencyKey === 'chave-2' ? 'rejected' : 'sent'),
      store,
    })

    expect(result).toMatchObject({ remaining: 0, sent: 1 })
    expect(result.rejected.map((item) => item.report.idempotencyKey)).toEqual(['chave-2'])
    expect(store.items()).toHaveLength(0)
  })

  it('fila vazia drena sem pedir nada à rede', async () => {
    const store = createMemoryStore()
    let calls = 0

    const result = await drainQueue({
      send: () => {
        calls += 1
        return Promise.resolve('sent')
      },
      store,
    })

    expect(calls).toBe(0)
    expect(result).toEqual({ rejected: [], remaining: 0, sent: 0 })
  })
})
