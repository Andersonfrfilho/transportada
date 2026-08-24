/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  reconcileStopOnLink,
  reconcileStopOnUnlink,
  type TripStopRecord,
  type TripStopReconciliationPort,
} from '../../src/trips/application/reconcile-trip-stops.use-case.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const TRIP_ID = '22222222-2222-4222-8222-222222222222'
const EXISTING_STOP: TripStopRecord = {
  addressKey: '3550308|01310100|45',
  id: '33333333-3333-4333-8333-333333333333',
  sequence: 1n,
}

function createFakePort(overrides: {
  readonly stops?: TripStopRecord[]
  readonly liveDocumentsByStop?: Record<string, number>
} = {}): TripStopReconciliationPort & {
  readonly createStopCalls: unknown[]
  readonly deleteStopCalls: unknown[]
} {
  const stops = overrides.stops ?? []
  const liveDocumentsByStop = overrides.liveDocumentsByStop ?? {}
  const createStopCalls: unknown[] = []
  const deleteStopCalls: unknown[] = []

  return {
    createStopCalls,
    deleteStopCalls,
    async countLiveDocumentsAtStop(input) {
      return liveDocumentsByStop[input.stopId] ?? 0
    },
    async createStop(input) {
      createStopCalls.push(input)
      const created: TripStopRecord = {
        addressKey: input.addressKey,
        id: 'created-stop-id',
        sequence: input.sequence,
      }
      stops.push(created)
      return created
    },
    async deleteStop(input) {
      deleteStopCalls.push(input)
    },
    async findStopByAddressKey(input) {
      return stops.find((stop) => stop.addressKey === input.addressKey) ?? null
    },
    async nextStopSequence() {
      return BigInt(stops.length + 1)
    },
  }
}

describe('reconcile stop on link (ADR-0043 §3)', () => {
  test('creates the stop when no stop groups that address yet', async () => {
    const repository = createFakePort()

    const stop = await reconcileStopOnLink({
      addressComponents: { cityCode: '3550308', number: '45', postalCode: '01310100' },
      companyId: COMPANY_ID,
      label: 'Av. Paulista, 45 — São Paulo/SP',
      repository,
      tripId: TRIP_ID,
    })

    expect(stop).not.toBeNull()
    expect(repository.createStopCalls).toHaveLength(1)
  })

  test('reuses the existing stop instead of creating a second one', async () => {
    const repository = createFakePort({ stops: [EXISTING_STOP] })

    const stop = await reconcileStopOnLink({
      addressComponents: { cityCode: '3550308', number: 'nº 45', postalCode: '01310-100' },
      companyId: COMPANY_ID,
      label: 'Av. Paulista, 45 — São Paulo/SP',
      repository,
      tripId: TRIP_ID,
    })

    expect(stop).toEqual(EXISTING_STOP)
    expect(repository.createStopCalls).toHaveLength(0)
  })

  test('never creates a stop for an address whose postal code does not normalize', async () => {
    const repository = createFakePort()

    const stop = await reconcileStopOnLink({
      addressComponents: { cityCode: '3550308', number: '45', postalCode: null },
      companyId: COMPANY_ID,
      label: 'Endereço incompleto',
      repository,
      tripId: TRIP_ID,
    })

    expect(stop).toBeNull()
    expect(repository.createStopCalls).toHaveLength(0)
  })

  test('assigns increasing sequence numbers as stops are created', async () => {
    const repository = createFakePort()

    await reconcileStopOnLink({
      addressComponents: { cityCode: '3550308', number: '45', postalCode: '01310100' },
      companyId: COMPANY_ID,
      label: 'Primeira parada',
      repository,
      tripId: TRIP_ID,
    })
    await reconcileStopOnLink({
      addressComponents: { cityCode: '3550308', number: '46', postalCode: '01310100' },
      companyId: COMPANY_ID,
      label: 'Segunda parada',
      repository,
      tripId: TRIP_ID,
    })

    expect(repository.createStopCalls).toEqual([
      expect.objectContaining({ sequence: 1n }),
      expect.objectContaining({ sequence: 2n }),
    ])
  })
})

describe('reconcile stop on unlink (ADR-0043 §3)', () => {
  test('deletes the stop when it was the last document holding it', async () => {
    const repository = createFakePort({
      liveDocumentsByStop: { [EXISTING_STOP.id]: 0 },
      stops: [EXISTING_STOP],
    })

    const result = await reconcileStopOnUnlink({
      companyId: COMPANY_ID,
      repository,
      stopId: EXISTING_STOP.id,
    })

    expect(result).toEqual({ deleted: true })
    expect(repository.deleteStopCalls).toHaveLength(1)
  })

  test('keeps the stop when other documents still group under it', async () => {
    const repository = createFakePort({
      liveDocumentsByStop: { [EXISTING_STOP.id]: 2 },
      stops: [EXISTING_STOP],
    })

    const result = await reconcileStopOnUnlink({
      companyId: COMPANY_ID,
      repository,
      stopId: EXISTING_STOP.id,
    })

    expect(result).toEqual({ deleted: false })
    expect(repository.deleteStopCalls).toHaveLength(0)
  })

  test('is a no-op for a document that never had a stop', async () => {
    const repository = createFakePort()

    const result = await reconcileStopOnUnlink({ companyId: COMPANY_ID, repository, stopId: null })

    expect(result).toEqual({ deleted: false })
    expect(repository.deleteStopCalls).toHaveLength(0)
  })
})
