/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { getRedeliveryProposal } from '../../src/trips/application/redelivery-proposal.use-case.js'
import type {
  RedeliveryProposalOccurrenceDocument,
  RedeliveryProposalPort,
} from '../../src/trips/application/redelivery-proposal.use-case.js'
import { OccurrenceCaseNotFoundError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = 'company-1'
const OCCURRENCE_ID = 'occurrence-1'

function createFakeRepository(
  overrides: Partial<{
    countOtherLiveDocumentsAtStop: number
    document: RedeliveryProposalOccurrenceDocument | null
    stopIds: readonly string[]
    tripStatus: 'route_planned' | 'dispatched' | null
  }>,
): RedeliveryProposalPort {
  const document =
    overrides.document === undefined
      ? {
          releasedAt: null,
          stopId: 'stop-1',
          tripDocumentId: 'trip-document-1',
          tripId: 'trip-1',
        }
      : overrides.document
  return {
    countOtherLiveDocumentsAtStop: () =>
      Promise.resolve(overrides.countOtherLiveDocumentsAtStop ?? 0),
    readOccurrenceDocument: () => Promise.resolve(document),
    readTripStatus: () =>
      Promise.resolve(overrides.tripStatus === undefined ? 'route_planned' : overrides.tripStatus),
    readTripStopIds: () => Promise.resolve(overrides.stopIds ?? ['stop-2', 'stop-1']),
  }
}

describe('redelivery-proposal.use-case', () => {
  test('ocorrência inexistente nesta empresa é 404', async () => {
    await expect(
      getRedeliveryProposal({
        companyId: COMPANY_ID,
        occurrenceId: OCCURRENCE_ID,
        repository: createFakeRepository({ document: null }),
      }),
    ).rejects.toBeInstanceOf(OccurrenceCaseNotFoundError)
  })

  test('viagem sem status resolvível também é 404 — a ocorrência não pertence a esta empresa', async () => {
    await expect(
      getRedeliveryProposal({
        companyId: COMPANY_ID,
        occurrenceId: OCCURRENCE_ID,
        repository: createFakeRepository({ tripStatus: null }),
      }),
    ).rejects.toBeInstanceOf(OccurrenceCaseNotFoundError)
  })

  test('propõe reordenar para o fim quando a parada só tem a própria nota', async () => {
    const proposal = await getRedeliveryProposal({
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      repository: createFakeRepository({}),
    })
    expect(proposal).toEqual({
      kind: 'reorder_stop',
      orderedStopIds: ['stop-2', 'stop-1'],
      stopId: 'stop-1',
    })
  })

  test('propõe liberar quando a parada tem outras notas vivas', async () => {
    const proposal = await getRedeliveryProposal({
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      repository: createFakeRepository({ countOtherLiveDocumentsAtStop: 1 }),
    })
    expect(proposal).toEqual({ kind: 'release_document', stopId: 'stop-1' })
  })

  test('nota sem parada não lê contagem nem ordem — recusa direto', async () => {
    let countCalled = false
    let stopIdsCalled = false
    const repository: RedeliveryProposalPort = {
      countOtherLiveDocumentsAtStop: () => {
        countCalled = true
        return Promise.resolve(0)
      },
      readOccurrenceDocument: () =>
        Promise.resolve({
          releasedAt: null,
          stopId: null,
          tripDocumentId: 'trip-document-1',
          tripId: 'trip-1',
        }),
      readTripStatus: () => Promise.resolve('route_planned'),
      readTripStopIds: () => {
        stopIdsCalled = true
        return Promise.resolve([])
      },
    }
    const proposal = await getRedeliveryProposal({
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      repository,
    })
    expect(proposal.kind).toBe('refused')
    expect(countCalled).toBe(false)
    expect(stopIdsCalled).toBe(false)
  })
})
