/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { tripCargoLayoutOutbox } from '../../src/database/trip-cargo-layout-outbox.schema.js'
import type { StoredCargoLayoutInput } from '../../src/trips/domain/cargo-layout-hash.types.js'
import type { UpsertCargoLayoutRequestParams } from '../../src/trips/application/cargo-layout-request.types.js'
import { upsertCargoLayoutRequest } from '../../src/trips/infrastructure/cargo-layout-request.support.js'
import type { TripTransaction } from '../../src/trips/infrastructure/trip-queryable.type.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const LAYOUT_ID = '00000000-0000-4000-8000-0000000000b1'
const TRIP_ID = '00000000-0000-4000-8000-0000000000a1'

const INPUT: StoredCargoLayoutInput = {
  bedDimensions: null,
  capacityM3: null,
  fallbackBoxVolumeM3: null,
  loadingAccess: 'rear',
  measuredShapes: [],
  payloadRatio: null,
  policyVersion: 'cargo-placement-v1',
  securesCargo: false,
  stops: [],
}

const BASE_PARAMS: UpsertCargoLayoutRequestParams = {
  companyId: COMPANY_ID,
  correlationId: 'trace-1',
  input: INPUT,
  inputHash: 'hash-1',
  policyVersion: 'cargo-placement-v1',
  tripId: TRIP_ID,
}

function createTransaction(options: {
  readonly existingRow?: { id: string; status: string; tripId: string | null }
  readonly returning: readonly { id: string; status: string }[]
}): {
  readonly layoutUpdates: unknown[]
  readonly outboxInserts: unknown[]
  readonly transaction: TripTransaction
} {
  const outboxInserts: unknown[] = []
  const layoutUpdates: unknown[] = []

  const transaction = {
    insert: (table: unknown) => {
      if (table === tripCargoLayoutOutbox) {
        return {
          values: (payload: unknown) => {
            outboxInserts.push(payload)
            return Promise.resolve([])
          },
        }
      }
      return {
        values: () => ({
          onConflictDoUpdate: () => ({
            returning: () => Promise.resolve(options.returning),
          }),
        }),
      }
    },
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve(options.existingRow === undefined ? [] : [options.existingRow]),
        }),
      }),
    }),
    update: () => ({
      set: (payload: unknown) => {
        layoutUpdates.push(payload)
        return { where: () => Promise.resolve() }
      },
    }),
  } as unknown as TripTransaction

  return { layoutUpdates, outboxInserts, transaction }
}

describe('cargo layout request upsert-and-outbox contract (spec 145 D8/G006)', () => {
  test('does nothing new when the upsert returns no row, but still answers the caller', async () => {
    const { outboxInserts, transaction } = createTransaction({
      existingRow: { id: LAYOUT_ID, status: 'queued', tripId: TRIP_ID },
      returning: [],
    })

    const result = await upsertCargoLayoutRequest(transaction, BASE_PARAMS)

    expect(result).toEqual({ enqueued: false, layoutId: LAYOUT_ID, status: 'queued' })
    expect(outboxInserts).toHaveLength(0)
  })

  /** Uma linha voltando do upsert — nova ou reaberta — é o único gatilho do outbox. */
  test('enqueues exactly one outbox row when the upsert returns a row', async () => {
    const { outboxInserts, transaction } = createTransaction({
      returning: [{ id: LAYOUT_ID, status: 'queued' }],
    })

    const result = await upsertCargoLayoutRequest(transaction, BASE_PARAMS)

    expect(result).toEqual({ enqueued: true, layoutId: LAYOUT_ID, status: 'queued' })
    expect(outboxInserts).toHaveLength(1)
    expect(outboxInserts[0]).toEqual({
      companyId: COMPANY_ID,
      correlationId: 'trace-1',
      eventType: 'transportada.trip.cargo-layout.requested',
      layoutId: LAYOUT_ID,
      payload: { inputHash: 'hash-1', layoutId: LAYOUT_ID },
    })
  })

  /** D3: a prévia virou viagem real — o pedido antigo aprende o `tripId`, mesmo sem reabrir. */
  test('learns the trip id in the no-op path, when a preview becomes a real trip', async () => {
    const { layoutUpdates, transaction } = createTransaction({
      existingRow: { id: LAYOUT_ID, status: 'ready', tripId: null },
      returning: [],
    })

    const result = await upsertCargoLayoutRequest(transaction, { ...BASE_PARAMS, tripId: TRIP_ID })

    expect(result.enqueued).toBeFalse()
    expect(layoutUpdates).toHaveLength(1)
    expect(layoutUpdates[0]).toMatchObject({ tripId: TRIP_ID })
  })
})
