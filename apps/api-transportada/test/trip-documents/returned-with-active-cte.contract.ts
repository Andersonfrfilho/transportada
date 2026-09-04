/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { listReturnedWithActiveCte } from '../../src/trips/application/list-returned-with-active-cte.use-case.js'
import type {
  ListReturnedWithActiveCtePort,
  ReturnedWithActiveCteEntry,
} from '../../src/trips/application/list-returned-with-active-cte.use-case.js'
import { transitionTripDocument } from '../../src/trips/application/transition-trip-document.use-case.js'
import type {
  ApplyTripDocumentTransitionInput,
  TripDocumentTransitionPort,
  TripDocumentTransitionSnapshot,
} from '../../src/trips/application/transition-trip-document.use-case.js'
import { TRIP_DOCUMENT_ACTION } from '../../src/trips/domain/trip-state.policy.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const TRIP_ID = '22222222-2222-4222-8222-222222222222'
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'
const ACTOR_USER_ID = '44444444-4444-4444-8444-444444444444'

describe('list returned-with-active-cte contract', () => {
  test('lists exactly what the repository returns, without deriving anything', async () => {
    const entry: ReturnedWithActiveCteEntry = {
      cteAccessKey: '5'.repeat(44),
      returnedAt: '2026-08-01T10:00:00.000Z',
      returnReason: 'Destinatário ausente',
      tripDocumentId: DOCUMENT_ID,
      tripId: TRIP_ID,
    }
    const repository: ListReturnedWithActiveCtePort = {
      async listReturnedWithActiveCte() {
        return [entry]
      },
    }

    const result = await listReturnedWithActiveCte({ companyId: COMPANY_ID, repository })

    expect(result).toEqual({ entries: [entry] })
  })

  test('is an empty list when nothing returned still carries an authorized CT-e', async () => {
    const repository: ListReturnedWithActiveCtePort = {
      async listReturnedWithActiveCte() {
        return []
      },
    }

    expect(await listReturnedWithActiveCte({ companyId: COMPANY_ID, repository })).toEqual({
      entries: [],
    })
  })
})

/**
 * D8: `returned` nunca dispara nada no fiscal — o CT-e emitido continua válido. Prova negativa: o
 * port que a transição de nota usa (`TripDocumentTransitionPort`) não tem, na sua própria forma,
 * nenhum jeito de tocar CT-e — só documento e evento da própria viagem. Se um dia alguém acrescentar
 * uma chamada fiscal aqui, o port muda de forma antes do código compilar.
 */
describe('returning a document never touches the fiscal side (D8 negative test)', () => {
  test('the return transition only writes the trip document and its event — no fiscal call available', async () => {
    const calls: string[] = []
    const document = {
      createdAt: '2026-08-01T10:00:00.000Z',
      deliveredAt: null,
      destinationOrigin: null,
      freightCalculationId: null,
      id: DOCUMENT_ID,
      loadedAt: '2026-08-01T09:00:00.000Z',
      nfeDocumentId: '55555555-5555-4555-8555-555555555555',
      releasedAt: null,
      returnedAt: null,
      returnReason: null,
      separatedAt: '2026-08-01T08:00:00.000Z',
      separationStatus: 'loaded' as const,
      stopId: null,
      tripId: TRIP_ID,
      updatedAt: '2026-08-01T09:00:00.000Z',
    }
    const snapshot: TripDocumentTransitionSnapshot = {
      document,
      documentStatus: 'loaded',
      tripStatus: 'dispatched',
    }

    const repository: TripDocumentTransitionPort = {
      async applyTransition(input: ApplyTripDocumentTransitionInput) {
        calls.push('applyTransition')
        return {
          document: { ...document, returnReason: input.returnReason, separationStatus: 'returned' },
          raced: false,
          tripStatus: 'dispatched',
        }
      },
      async findSnapshot() {
        calls.push('findSnapshot')
        return snapshot
      },
    }

    await transitionTripDocument({
      action: TRIP_DOCUMENT_ACTION.return,
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      repository,
      returnReason: 'Destinatário ausente',
      tripId: TRIP_ID,
    })

    // O port só oferece leitura/escrita do documento da viagem — nenhuma chamada de CT-e é
    // sequer expressável aqui, e a lista de chamadas prova que só essas duas rodaram.
    expect(calls).toEqual(['findSnapshot', 'applyTransition'])
  })
})
