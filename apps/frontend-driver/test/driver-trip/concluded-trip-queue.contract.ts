/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  listQueuedOfConcludedTrips,
  purgeConcludedTripQueue,
} from '@/modules/driver-trip/shared/concludedTripQueue.service'
import type { DriverFieldReport, DriverTrip } from '@/modules/driver-trip/shared/driverTrip.types'
import type { AttachmentStore } from '@/modules/driver-trip/shared/offlineAttachments.service'
import type {
  OfflineQueueStore,
  QueuedReport,
} from '@/modules/driver-trip/shared/offlineQueue.service'

const OWNER = 'dono'

function trip(id: string, status: string, stopId: string, documentId: string): DriverTrip {
  return {
    id,
    status,
    stops: [{ documents: [{ id: documentId }], id: stopId }],
  } as unknown as DriverTrip
}

function item(report: object, subHash = OWNER): QueuedReport {
  return {
    attempts: 0,
    createdAt: '2026-11-10T20:00:00.000Z',
    report: report as DriverFieldReport,
    subHash,
  }
}

const trips = [
  trip('viagem-fechada', 'completed', 'parada-f', 'nota-f'),
  trip('viagem-cancelada', 'cancelled', 'parada-c', 'nota-c'),
  trip('viagem-aberta', 'in_transit', 'parada-a', 'nota-a'),
]

const queued = [
  item({ documentId: 'nota-f', idempotencyKey: 'k1', kind: 'deliver' }),
  item({ idempotencyKey: 'k2', kind: 'arrive', stopId: 'parada-c' }),
  item({ idempotencyKey: 'k3', kind: 'dispatch', tripId: 'viagem-fechada' }),
  item({ documentId: 'nota-a', idempotencyKey: 'k4', kind: 'deliver' }),
  item({ idempotencyKey: 'k5', kind: 'arrive', stopId: 'parada-f' }, 'outro-dono'),
  item({ idempotencyKey: 'k6', kind: 'arrive', stopId: 'parada-que-nao-conheco' }),
]

describe('viagem concluída não deixa pendência no aparelho', () => {
  it('só sai o item do dono que aponta para viagem concluída ou cancelada', () => {
    const result = listQueuedOfConcludedTrips({ ownerSubHash: OWNER, queued, trips })
    expect(result.map((entry) => entry.report.idempotencyKey)).toEqual(['k1', 'k2', 'k3'])
  })

  it('tira da fila e dos anexos e devolve o que saiu', async () => {
    let items = [...queued]
    const store = {
      read: () => Promise.resolve(items),
      update: (mutate: (current: readonly QueuedReport[]) => readonly QueuedReport[]) => {
        items = [...mutate(items)]
        return Promise.resolve(items)
      },
    } as unknown as OfflineQueueStore
    const cleared: string[] = []
    const attachmentStore = {
      update: (input: { eventKey: string }) => {
        cleared.push(input.eventKey)
        return Promise.resolve([])
      },
    } as unknown as AttachmentStore

    const purged = await purgeConcludedTripQueue({
      attachmentStore,
      ownerSubHash: OWNER,
      store,
      trips,
    })

    expect(purged).toHaveLength(3)
    expect(items.map((entry) => entry.report.idempotencyKey)).toEqual(['k4', 'k5', 'k6'])
    expect(cleared).toEqual(['k1', 'k2', 'k3'])
  })
})
