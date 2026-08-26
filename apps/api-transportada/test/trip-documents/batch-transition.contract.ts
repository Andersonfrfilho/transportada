/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { transitionTripDocumentsBatch } from '../../src/trips/application/transition-trip-documents-batch.use-case.js'
import type {
  TripDocumentBatchTransitionPort,
  TripDocumentBatchWriteInput,
  TripDocumentBatchWriteResult,
  TripDocumentSnapshotById,
} from '../../src/trips/application/transition-trip-documents-batch.use-case.js'
import type { TripDocument } from '../../src/trips/application/trip.port.js'
import { TRIP_DOCUMENT_ACTION } from '../../src/trips/domain/trip-state.policy.js'
import {
  TripDocumentReturnReasonRequiredError,
  TripNotFoundError,
} from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const TRIP_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_USER_ID = '33333333-3333-4333-8333-333333333333'

const PENDING_ID = 'a0000000-0000-4000-8000-00000000000a'
const ALREADY_SEPARATED_ID = 'a0000000-0000-4000-8000-00000000000b'
const DELIVERED_ID = 'a0000000-0000-4000-8000-00000000000c'
const MISSING_ID = 'a0000000-0000-4000-8000-00000000000d'
const RACED_ID = 'a0000000-0000-4000-8000-00000000000e'

function fakeDocument(id: string): TripDocument {
  return {
    createdAt: '2026-08-01T10:00:00.000Z',
    deliveredAt: null,
    freightCalculationId: null,
    id,
    loadedAt: null,
    nfeDocumentId: 'b0000000-0000-4000-8000-000000000001',
    releasedAt: null,
    returnedAt: null,
    returnReason: null,
    separatedAt: null,
    separationStatus: 'pending',
    stopId: null,
    tripId: TRIP_ID,
    updatedAt: '2026-08-01T10:00:00.000Z',
  }
}

type FakePortOverrides = {
  readonly racedIds?: readonly string[]
  readonly tripExists?: boolean
}

function createFakePort(overrides: FakePortOverrides = {}): TripDocumentBatchTransitionPort & {
  readonly findSnapshotsCalls: number
  readonly writeBatchCalls: readonly TripDocumentBatchWriteInput[]
} {
  const racedIds = new Set(overrides.racedIds ?? [])
  const tripExists = overrides.tripExists ?? true
  let findSnapshotsCalls = 0
  const writeBatchCalls: TripDocumentBatchWriteInput[] = []

  return {
    get findSnapshotsCalls() {
      return findSnapshotsCalls
    },
    get writeBatchCalls() {
      return writeBatchCalls
    },
    async findSnapshots(): Promise<{
      readonly snapshots: TripDocumentSnapshotById
      readonly tripStatus: 'separating'
    } | null> {
      findSnapshotsCalls += 1
      if (!tripExists) return null
      const snapshots: TripDocumentSnapshotById = new Map([
        [PENDING_ID, { document: fakeDocument(PENDING_ID), documentStatus: 'pending' }],
        [
          ALREADY_SEPARATED_ID,
          { document: fakeDocument(ALREADY_SEPARATED_ID), documentStatus: 'separated' },
        ],
        [DELIVERED_ID, { document: fakeDocument(DELIVERED_ID), documentStatus: 'delivered' }],
        [RACED_ID, { document: fakeDocument(RACED_ID), documentStatus: 'pending' }],
      ])
      return { snapshots, tripStatus: 'separating' }
    },
    async writeBatch(input): Promise<TripDocumentBatchWriteResult> {
      writeBatchCalls.push(input)
      return {
        racedDocumentIds: input.items
          .map((item) => item.documentId)
          .filter((documentId) => racedIds.has(documentId)),
        tripStatus: 'separating',
        updatedDocuments: input.items
          .filter((item) => !racedIds.has(item.documentId))
          .map((item) => fakeDocument(item.documentId)),
      }
    },
  }
}

describe('transition trip documents batch (spec 056 T009)', () => {
  test('resolves every id on its own — applied, unchanged, blocked and not found in one call', async () => {
    const repository = createFakePort()

    const result = await transitionTripDocumentsBatch({
      action: TRIP_DOCUMENT_ACTION.separate,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentIds: [PENDING_ID, ALREADY_SEPARATED_ID, DELIVERED_ID, MISSING_ID],
      repository,
      tripId: TRIP_ID,
    })

    expect(result.items).toEqual([
      { documentId: PENDING_ID, outcome: 'applied' },
      { documentId: ALREADY_SEPARATED_ID, outcome: 'unchanged' },
      { documentId: DELIVERED_ID, outcome: 'blocked', reason: 'TRIP_DOCUMENT_ALREADY_CLOSED' },
      { documentId: MISSING_ID, outcome: 'not_found' },
    ])
  })

  test('touches the database once per table, never once per document', async () => {
    const manyIds = Array.from({ length: 50 }, (_unused, index) =>
      index === 0
        ? PENDING_ID
        : `c${index.toString().padStart(7, '0')}-0000-4000-8000-000000000000`,
    )
    const repository = createFakePort()

    await transitionTripDocumentsBatch({
      action: TRIP_DOCUMENT_ACTION.separate,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentIds: manyIds,
      repository,
      tripId: TRIP_ID,
    })

    // Uma leitura para os 50 ids, uma escrita para os aplicados — nunca 50 leituras nem 50 escritas.
    expect(repository.findSnapshotsCalls).toBe(1)
    expect(repository.writeBatchCalls).toHaveLength(1)
  })

  test('never calls writeBatch when nothing in the batch would change', async () => {
    const repository = createFakePort()

    const result = await transitionTripDocumentsBatch({
      action: TRIP_DOCUMENT_ACTION.separate,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentIds: [ALREADY_SEPARATED_ID, DELIVERED_ID],
      repository,
      tripId: TRIP_ID,
    })

    expect(repository.writeBatchCalls).toHaveLength(0)
    expect(result.items).toEqual([
      { documentId: ALREADY_SEPARATED_ID, outcome: 'unchanged' },
      { documentId: DELIVERED_ID, outcome: 'blocked', reason: 'TRIP_DOCUMENT_ALREADY_CLOSED' },
    ])
  })

  test('reports a race per document, without failing the rest of the batch', async () => {
    const repository = createFakePort({ racedIds: [RACED_ID] })

    const result = await transitionTripDocumentsBatch({
      action: TRIP_DOCUMENT_ACTION.separate,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentIds: [PENDING_ID, RACED_ID],
      repository,
      tripId: TRIP_ID,
    })

    expect(result.items).toEqual([
      { documentId: PENDING_ID, outcome: 'applied' },
      { documentId: RACED_ID, outcome: 'raced' },
    ])
  })

  test('requires a reason to return documents, before touching the repository', async () => {
    const repository = createFakePort()

    const error = await transitionTripDocumentsBatch({
      action: TRIP_DOCUMENT_ACTION.return,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentIds: [PENDING_ID],
      repository,
      returnReason: '',
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripDocumentReturnReasonRequiredError)
    expect(repository.findSnapshotsCalls).toBe(0)
  })

  test('carries the actor and the note into every event of the batch', async () => {
    const repository = createFakePort()

    await transitionTripDocumentsBatch({
      action: TRIP_DOCUMENT_ACTION.separate,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentIds: [PENDING_ID],
      note: 'conferido no portão',
      repository,
      tripId: TRIP_ID,
    })

    expect(repository.writeBatchCalls[0]).toMatchObject({
      actorUserId: ACTOR_USER_ID,
      note: 'conferido no portão',
    })
  })

  test('throws not found for a trip outside this company', async () => {
    const repository = createFakePort({ tripExists: false })

    const error = await transitionTripDocumentsBatch({
      action: TRIP_DOCUMENT_ACTION.separate,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentIds: [PENDING_ID],
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripNotFoundError)
  })
})
