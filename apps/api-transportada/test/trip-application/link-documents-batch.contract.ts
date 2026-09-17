/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createLinkTripDocumentsBatchUseCase } from '../../src/trips/application/link-trip-documents-batch.use-case.js'
import type { LinkTripDocumentsBatchPort } from '../../src/trips/application/link-trip-documents-batch.use-case.js'
import type { PlanTripRouteTollFreezer } from '../../src/trips/application/plan-trip-route.use-case.js'
import type { TripDocument } from '../../src/trips/application/trip.port.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-0000000000a1'

const linkedDocument = (nfeDocumentId: string): TripDocument => ({
  createdAt: '2026-08-01T10:00:00.000Z',
  deliveredAt: null,
  destinationOrigin: null,
  freightCalculationId: null,
  id: `doc-id-${nfeDocumentId}`,
  loadedAt: null,
  nfeDocumentId,
  releasedAt: null,
  returnedAt: null,
  returnReason: null,
  separatedAt: null,
  separationStatus: 'pending',
  stopId: null,
  tripId: TRIP_ID,
  updatedAt: '2026-08-01T10:00:00.000Z',
})

function createRepository(): LinkTripDocumentsBatchPort & {
  readonly calls: { nfeDocumentIds: readonly string[] }[]
} {
  const calls: { nfeDocumentIds: readonly string[] }[] = []
  return {
    calls,
    async linkDocumentsBatch(input) {
      calls.push({ nfeDocumentIds: input.nfeDocumentIds })
      return { linked: [], skipped: [], tripStatus: 'draft' }
    },
  }
}

describe('link trip documents batch contract', () => {
  /**
   * A busca por filtro e o bipe podem trazer a mesma nota. Repetida dentro do próprio corpo, a
   * segunda colidiria com a primeira **da mesma transação** — um erro de banco que não diz nada ao
   * operador, num lote em que as outras duzentas e noventa e nove estavam boas.
   */
  test('sends each invoice once, even when the caller repeats it', async () => {
    const repository = createRepository()
    const useCase = createLinkTripDocumentsBatchUseCase({ repository })

    await useCase.execute({
      context: { companyId: COMPANY_ID },
      nfeDocumentIds: ['doc-a', 'doc-b', 'doc-a', 'doc-c', 'doc-b'],
      tripId: TRIP_ID,
    })

    expect(repository.calls).toHaveLength(1)
    expect(repository.calls[0]?.nfeDocumentIds).toEqual(['doc-a', 'doc-b', 'doc-c'])
  })

  /** A empresa vem do contexto autenticado, nunca do corpo — é o que o repositório filtra. */
  test('takes the company from the authenticated context', async () => {
    const seen: string[] = []
    const useCase = createLinkTripDocumentsBatchUseCase({
      repository: {
        async linkDocumentsBatch(input) {
          seen.push(input.companyId)
          return { linked: [], skipped: [], tripStatus: 'draft' }
        },
      },
    })

    await useCase.execute({
      context: { companyId: COMPANY_ID },
      nfeDocumentIds: ['doc-a'],
      tripId: TRIP_ID,
    })

    expect(seen).toEqual([COMPANY_ID])
  })

  /**
   * O lote é **uma** chamada. Se ele voltar a iterar por nota, a rota deixa de resolver o problema
   * que a criou — trezentas idas ao servidor com a viagem já criada no meio.
   */
  test('reaches the database once for the whole batch', async () => {
    const repository = createRepository()
    const useCase = createLinkTripDocumentsBatchUseCase({ repository })

    await useCase.execute({
      context: { companyId: COMPANY_ID },
      nfeDocumentIds: Array.from({ length: 120 }, (_, index) => `doc-${String(index)}`),
      tripId: TRIP_ID,
    })

    expect(repository.calls).toHaveLength(1)
    expect(repository.calls[0]?.nfeDocumentIds).toHaveLength(120)
  })
})

/** D6: vincular nota muda o conjunto de paradas — recalcula a rota com `cheapest`, D5 valendo. */
describe('link trip documents batch route recalculation (D6)', () => {
  function createFreezer(
    options: { readonly shouldFail?: boolean } = {},
  ): PlanTripRouteTollFreezer & { readonly freezeCalls: unknown[] } {
    const freezeCalls: unknown[] = []
    return {
      freezeCalls,
      async freeze(input) {
        freezeCalls.push(input)
        if (options.shouldFail === true) throw new Error('OSRM indisponível')
      },
    }
  }

  test('recalculates the route with cheapest when at least one document is linked', async () => {
    const repository: LinkTripDocumentsBatchPort = {
      async linkDocumentsBatch() {
        return { linked: [linkedDocument('doc-a')], skipped: [], tripStatus: 'draft' }
      },
    }
    const routeFreezer = createFreezer()
    const useCase = createLinkTripDocumentsBatchUseCase({ repository, routeFreezer })

    await useCase.execute({
      context: { companyId: COMPANY_ID },
      nfeDocumentIds: ['doc-a'],
      tripId: TRIP_ID,
    })

    expect(routeFreezer.freezeCalls).toEqual([{ companyId: COMPANY_ID, tripId: TRIP_ID }])
  })

  test('does not recalculate the route when every document in the batch was skipped', async () => {
    const repository: LinkTripDocumentsBatchPort = {
      async linkDocumentsBatch() {
        return {
          linked: [],
          skipped: [{ nfeDocumentId: 'doc-a', reason: 'already_linked' }],
          tripStatus: 'draft',
        }
      },
    }
    const routeFreezer = createFreezer()
    const useCase = createLinkTripDocumentsBatchUseCase({ repository, routeFreezer })

    await useCase.execute({
      context: { companyId: COMPANY_ID },
      nfeDocumentIds: ['doc-a'],
      tripId: TRIP_ID,
    })

    expect(routeFreezer.freezeCalls).toEqual([])
  })

  test('still returns the batch result when the route freezer fails (D5, OSRM fora do ar)', async () => {
    const repository: LinkTripDocumentsBatchPort = {
      async linkDocumentsBatch() {
        return { linked: [linkedDocument('doc-a')], skipped: [], tripStatus: 'draft' }
      },
    }
    const routeFreezer = createFreezer({ shouldFail: true })
    const useCase = createLinkTripDocumentsBatchUseCase({ repository, routeFreezer })

    const result = await useCase.execute({
      context: { companyId: COMPANY_ID },
      nfeDocumentIds: ['doc-a'],
      tripId: TRIP_ID,
    })

    expect(result.linked).toHaveLength(1)
  })
})
