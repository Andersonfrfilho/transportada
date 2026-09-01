/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import { createTripCteBatch } from '../../src/trips/application/create-trip-cte-batch.use-case.js'
import type {
  TripDocumentReadiness,
  TripFiscalReadinessSnapshot,
} from '../../src/trips/application/read-trip-fiscal-readiness.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const TRIP_ID = '00000000-0000-4000-8000-000000000003'
const BATCH_ID = '00000000-0000-4000-8000-000000000004'

function document(input: {
  readonly nfeDocumentId: string
  readonly reason: TripDocumentReadiness['reason']
}): TripDocumentReadiness {
  const expected = input.reason === 'nfse_expected' ? 'nfse' : 'cte'

  return {
    cteAccessKey: null,
    cteFiscalDocumentId: null,
    expectedDocument: input.reason === 'city_unknown' ? null : expected,
    nfeDocumentId: input.nfeDocumentId,
    reason: input.reason,
    rejectionCode: null,
    rejectionMessage: null,
    tripDocumentId: crypto.randomUUID(),
  }
}

function buildWorld(documents: readonly TripDocumentReadiness[]) {
  const calls: Array<{ readonly documentIds: readonly string[]; readonly name: string }> = []
  const readiness: TripFiscalReadinessSnapshot = {
    documents,
    manifestableCount: documents.filter((entry) => entry.expectedDocument === 'cte').length,
    nfseCount: documents.filter((entry) => entry.expectedDocument === 'nfse').length,
    readyCount: 0,
    state: 'incomplete',
    totalCount: documents.length,
  }

  return {
    calls,
    run: () =>
      createTripCteBatch({
        companyId: COMPANY_ID,
        correlationId: 'correlation-urgent',
        createBatch: (input) => {
          calls.push({ documentIds: input.documentIds, name: input.name })
          return Promise.resolve({ id: BATCH_ID })
        },
        idempotencyKey: 'chave-do-clique',
        readReadiness: () => Promise.resolve(readiness),
        tripId: TRIP_ID,
        userId: USER_ID,
      }),
  }
}

describe('o lote urgente da viagem', () => {
  it('leva as notas que ainda têm CT-e a emitir', async () => {
    const world = buildWorld([
      document({ nfeDocumentId: 'nfe-1', reason: 'no_cte' }),
      document({ nfeDocumentId: 'nfe-2', reason: 'cte_rejected' }),
    ])

    expect(await world.run()).toEqual({ batchId: BATCH_ID, documentCount: 2 })
    expect(world.calls[0]?.documentIds).toEqual(['nfe-1', 'nfe-2'])
  })

  /**
   * A urbana não tem CT-e a emitir — ela vira NFS-e. Entraria no lote como linha que nunca autoriza,
   * e o lote ficaria eternamente incompleto esperando por ela.
   */
  it('deixa a nota de entrega urbana de fora', async () => {
    const world = buildWorld([
      document({ nfeDocumentId: 'nfe-1', reason: 'no_cte' }),
      document({ nfeDocumentId: 'nfe-urbana', reason: 'nfse_expected' }),
    ])

    await world.run()

    expect(world.calls[0]?.documentIds).toEqual(['nfe-1'])
  })

  /** Nota já autorizada não volta ao lote: emitir duas vezes o mesmo transporte é bitributação. */
  it('deixa de fora a nota que já tem CT-e autorizado', async () => {
    const world = buildWorld([
      document({ nfeDocumentId: 'nfe-1', reason: 'no_cte' }),
      document({ nfeDocumentId: 'nfe-2', reason: 'ok' }),
    ])

    await world.run()

    expect(world.calls[0]?.documentIds).toEqual(['nfe-1'])
  })

  /** Nota em lote é recusada por vínculo de qualquer forma; incluí-la só produziria a recusa. */
  it('deixa de fora a nota que já está num lote', async () => {
    const world = buildWorld([
      document({ nfeDocumentId: 'nfe-1', reason: 'no_cte' }),
      document({ nfeDocumentId: 'nfe-2', reason: 'cte_in_progress' }),
    ])

    await world.run()

    expect(world.calls[0]?.documentIds).toEqual(['nfe-1'])
  })

  /**
   * Viagem só de entrega urbana cai aqui, e o código diz qual dos dois casos é o dela. Um lote vazio
   * nasceria, seria submetido e voltaria sem nada.
   */
  it('recusa com nome quando não há CT-e a emitir', async () => {
    const world = buildWorld([document({ nfeDocumentId: 'nfe-urbana', reason: 'nfse_expected' })])

    try {
      await world.run()
      throw new Error('EXPECTED_REFUSAL')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).code).toBe('TRIP_CTE_BATCH_EMPTY')
    }
    expect(world.calls).toHaveLength(0)
  })

  it('viagem já toda emitida também recusa, sem criar lote vazio', async () => {
    const world = buildWorld([document({ nfeDocumentId: 'nfe-1', reason: 'ok' })])

    await expect(world.run()).rejects.toBeInstanceOf(ApiError)
    expect(world.calls).toHaveLength(0)
  })

  /** Nota sem município não se classifica, então ela não entra num lote de CT-e por engano. */
  it('deixa de fora a nota que não se decidiu', async () => {
    const world = buildWorld([
      document({ nfeDocumentId: 'nfe-1', reason: 'no_cte' }),
      document({ nfeDocumentId: 'nfe-2', reason: 'city_unknown' }),
    ])

    await world.run()

    expect(world.calls[0]?.documentIds).toEqual(['nfe-1'])
  })
})
