/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { transitionTripDocument } from '../../src/trips/application/transition-trip-document.use-case.js'
import type {
  ApplyTripDocumentTransitionInput,
  TripDocumentTransitionOutcome,
  TripDocumentTransitionPort,
  TripDocumentTransitionSnapshot,
} from '../../src/trips/application/transition-trip-document.use-case.js'
import type { TripDocument } from '../../src/trips/application/trip.port.js'
import { TRIP_DOCUMENT_ACTION } from '../../src/trips/domain/trip-state.policy.js'
import {
  TripDocumentNotFoundError,
  TripDocumentReturnReasonRequiredError,
  TripDocumentTransitionConflictError,
  TripStateTransitionNotAllowedError,
} from '../../src/trips/domain/trip.error.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const TRIP_ID = '22222222-2222-4222-8222-222222222222'
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'
const ACTOR_USER_ID = '44444444-4444-4444-8444-444444444444'

const DOCUMENT: TripDocument = {
  createdAt: '2026-08-01T10:00:00.000Z',
  deliveredAt: null,
  freightCalculationId: null,
  id: DOCUMENT_ID,
  nfeDocumentId: '55555555-5555-4555-8555-555555555555',
  releasedAt: null,
  tripId: TRIP_ID,
  updatedAt: '2026-08-01T10:00:00.000Z',
}

/**
 * Port falso que se comporta como o banco se comportaria: `applyTransition` só escreve quando
 * `fromStatus` bate com o estado atual, e devolve `raced: true` quando não bate — igual ao
 * `WHERE separation_status = fromStatus` do repositório real.
 */
function createFakePort(overrides: {
  readonly documentStatus?: TripDocumentTransitionSnapshot['documentStatus']
  readonly exists?: boolean
  readonly tripStatus?: TripDocumentTransitionSnapshot['tripStatus']
} = {}): TripDocumentTransitionPort & {
  readonly applyCalls: ApplyTripDocumentTransitionInput[]
  currentDocumentStatus: TripDocumentTransitionSnapshot['documentStatus']
  currentTripStatus: TripDocumentTransitionSnapshot['tripStatus']
} {
  const exists = overrides.exists ?? true
  const applyCalls: ApplyTripDocumentTransitionInput[] = []
  let currentDocumentStatus = overrides.documentStatus ?? 'pending'
  let currentTripStatus = overrides.tripStatus ?? 'separating'

  return {
    applyCalls,
    get currentDocumentStatus() {
      return currentDocumentStatus
    },
    set currentDocumentStatus(value) {
      currentDocumentStatus = value
    },
    get currentTripStatus() {
      return currentTripStatus
    },
    set currentTripStatus(value) {
      currentTripStatus = value
    },
    async applyTransition(input): Promise<TripDocumentTransitionOutcome> {
      applyCalls.push(input)
      if (input.fromStatus !== currentDocumentStatus) {
        return {
          document: { ...DOCUMENT, updatedAt: '2026-08-01T11:00:00.000Z' },
          raced: true,
          tripStatus: currentTripStatus,
        }
      }
      currentDocumentStatus = input.toStatus
      return {
        document: { ...DOCUMENT, updatedAt: '2026-08-01T11:00:00.000Z' },
        raced: false,
        tripStatus: currentTripStatus,
      }
    },
    async findSnapshot(): Promise<TripDocumentTransitionSnapshot | null> {
      if (!exists) return null
      return { document: DOCUMENT, documentStatus: currentDocumentStatus, tripStatus: currentTripStatus }
    },
  }
}

describe('transition trip document (spec 056 T008)', () => {
  test('applies the transition, writes with the actor, and returns the resolved trip status', async () => {
    const repository = createFakePort({ documentStatus: 'pending', tripStatus: 'separating' })

    const result = await transitionTripDocument({
      action: TRIP_DOCUMENT_ACTION.separate,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      repository,
      tripId: TRIP_ID,
    })

    expect(result.document.id).toBe(DOCUMENT_ID)
    expect(repository.applyCalls).toEqual([
      {
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        documentId: DOCUMENT_ID,
        fromStatus: 'pending',
        note: null,
        returnReason: null,
        toStatus: 'separated',
        tripId: TRIP_ID,
      },
    ])
  })

  test('is idempotent: repeating the same transition writes nothing', async () => {
    const repository = createFakePort({ documentStatus: 'separated', tripStatus: 'separating' })

    const result = await transitionTripDocument({
      action: TRIP_DOCUMENT_ACTION.separate,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      repository,
      tripId: TRIP_ID,
    })

    expect(result.document).toEqual(DOCUMENT)
    expect(repository.applyCalls).toHaveLength(0)
  })

  test('refuses an invalid transition with the domain reason, and writes nothing', async () => {
    const repository = createFakePort({ documentStatus: 'pending', tripStatus: 'separating' })

    const error = await transitionTripDocument({
      action: TRIP_DOCUMENT_ACTION.load,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripStateTransitionNotAllowedError)
    expect((error as TripStateTransitionNotAllowedError).reason).toBe(
      'TRIP_DOCUMENT_NOT_SEPARATED',
    )
    expect(repository.applyCalls).toHaveLength(0)
  })

  test('requires a reason to return a document, before touching the repository', async () => {
    const repository = createFakePort({ documentStatus: 'loaded', tripStatus: 'in_transit' })

    const error = await transitionTripDocument({
      action: TRIP_DOCUMENT_ACTION.return,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      repository,
      returnReason: '   ',
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripDocumentReturnReasonRequiredError)
    expect(repository.applyCalls).toHaveLength(0)
  })

  test('carries the return reason through to the write', async () => {
    const repository = createFakePort({ documentStatus: 'loaded', tripStatus: 'in_transit' })

    await transitionTripDocument({
      action: TRIP_DOCUMENT_ACTION.return,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      repository,
      returnReason: 'Destinatário ausente',
      tripId: TRIP_ID,
    })

    expect(repository.applyCalls[0]?.returnReason).toBe('Destinatário ausente')
  })

  test('throws not found for a document outside this company or trip', async () => {
    const repository = createFakePort({ exists: false })

    const error = await transitionTripDocument({
      action: TRIP_DOCUMENT_ACTION.separate,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripDocumentNotFoundError)
  })

  test('retries a race, and a race that lands on the same target converges to unchanged', async () => {
    // Duas requisições pedem 'separate' na mesma nota 'pending'. A primeira ganha a corrida no
    // banco; a nossa perde o `applyTransition` (raced: true), mas a re-leitura mostra que o
    // resultado já é o que ela queria — converge sem escrever, sem segunda tentativa de escrita.
    const repository = createFakePort({ documentStatus: 'pending', tripStatus: 'separating' })
    let calls = 0
    repository.applyTransition = async () => {
      calls += 1
      repository.currentDocumentStatus = 'separated'
      return { document: DOCUMENT, raced: true, tripStatus: repository.currentTripStatus }
    }

    const result = await transitionTripDocument({
      action: TRIP_DOCUMENT_ACTION.separate,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      repository,
      tripId: TRIP_ID,
    })

    expect(result.document.id).toBe(DOCUMENT_ID)
    expect(calls).toBe(1)
  })



  test('gives up after too many races with a conflict, not an infinite loop', async () => {
    const repository = createFakePort({ documentStatus: 'pending', tripStatus: 'separating' })
    let calls = 0
    repository.applyTransition = async () => {
      calls += 1
      return { document: DOCUMENT, raced: true, tripStatus: 'separating' }
    }

    const error = await transitionTripDocument({
      action: TRIP_DOCUMENT_ACTION.separate,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      repository,
      tripId: TRIP_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(TripDocumentTransitionConflictError)
    expect((error as ApiError).status).toBe(409)
    expect(calls).toBeGreaterThan(1)
    expect(calls).toBeLessThan(10)
  })
})
