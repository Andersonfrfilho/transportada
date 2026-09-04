/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createLinkTripDocumentsBatchUseCase } from '../../src/trips/application/link-trip-documents-batch.use-case.js'
import type { LinkTripDocumentsBatchPort } from '../../src/trips/application/link-trip-documents-batch.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-0000000000a1'

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
