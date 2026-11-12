/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { DriverFieldReport } from '@/modules/driver-trip/shared/driverTrip.types'
import {
  drainQueueWithAttachments,
  isClearedOnRejection,
  type AttachmentStore,
  type QueuedAttachment,
} from '@/modules/driver-trip/shared/offlineAttachments.service'
import type {
  OfflineQueueStore,
  QueuedReport,
} from '@/modules/driver-trip/shared/offlineQueue.service'

const NOW = '2026-11-10T20:00:00.000Z'

function memoryQueue(initial: readonly QueuedReport[]): OfflineQueueStore & {
  readonly items: () => readonly QueuedReport[]
} {
  let items = [...initial]
  return {
    items: () => items,
    read: () => Promise.resolve(items),
    update: (mutate) => {
      items = [...mutate(items)]
      return Promise.resolve(items)
    },
  }
}

function memoryAttachments(): AttachmentStore {
  const entries = new Map<string, readonly QueuedAttachment[]>()
  return {
    read: (eventKey) => Promise.resolve(entries.get(eventKey) ?? []),
    readAll: () =>
      Promise.resolve([...entries.entries()].map(([key, items]) => [key, items] as const)),
    readTotals: () => Promise.resolve({ count: 0, totalBytes: 0 }),
    remove: (eventKey) => {
      entries.delete(eventKey)
      return Promise.resolve()
    },
    update: (input) => {
      const next = input.mutate(entries.get(input.eventKey) ?? [])
      if (next.length === 0) entries.delete(input.eventKey)
      else entries.set(input.eventKey, [...next])
      return Promise.resolve(next)
    },
  }
}

const occurrence = {
  description: 'avaria',
  documentId: null,
  idempotencyKey: 'ocorrencia-1',
  kind: 'occurrence',
  location: null,
  stopId: 'stop-1',
} as unknown as DriverFieldReport

const dispatch = {
  idempotencyKey: 'despacho-1',
  kind: 'dispatch',
  location: null,
} as unknown as DriverFieldReport

describe('ocorrência recusada sai das pendências do motorista', () => {
  it('só ocorrência é limpa na recusa', () => {
    expect(isClearedOnRejection('occurrence')).toBe(true)
    expect(isClearedOnRejection('stopOccurrenceCharge')).toBe(true)
    expect(isClearedOnRejection('documentOccurrence')).toBe(true)
    expect(isClearedOnRejection('stopOccurrencePhoto')).toBe(true)
    expect(isClearedOnRejection('deliver')).toBe(false)
    expect(isClearedOnRejection('dispatch')).toBe(false)
  })

  it('a recusa da ocorrência tira o item da fila; a de despacho continua à vista', async () => {
    const store = memoryQueue([
      { attempts: 0, createdAt: NOW, report: occurrence },
      { attempts: 0, createdAt: NOW, report: dispatch },
    ])
    const result = await drainQueueWithAttachments({
      attachmentStore: memoryAttachments(),
      origin: 'immediate',
      send: () => Promise.resolve({ cause: '409 CONFLICT', kind: 'rejected' }),
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(result.rejected).toBe(2)
    expect(store.items().map((item) => item.report.idempotencyKey)).toEqual(['despacho-1'])
    expect(store.items()[0]?.rejectionCause).toBe('409 CONFLICT')
  })
})
