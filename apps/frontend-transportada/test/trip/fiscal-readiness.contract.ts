/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'
import {
  TRIP_DOCUMENT_READINESS_REASONS,
  TRIP_FISCAL_READINESS_STATES,
} from '@/modules/trip/shared/trip.types'

const adapters = createTripResponseAdapters()

const READY_DOCUMENT = {
  cteAccessKey: '1'.repeat(44),
  cteFiscalDocumentId: '00000000-0000-4000-8000-000000000001',
  reason: 'ok',
  rejectionCode: null,
  rejectionMessage: null,
  tripDocumentId: '00000000-0000-4000-8000-000000000002',
}

function payload(overrides: Record<string, unknown> = {}): unknown {
  return {
    documents: [READY_DOCUMENT],
    readyCount: 1,
    state: 'ready',
    totalCount: 1,
    ...overrides,
  }
}

describe('a prontidão fiscal que chega da API', () => {
  it('aceita a resposta completa', () => {
    expect(adapters.tripFiscalReadinessFromApi(payload())).toMatchObject({
      readyCount: 1,
      state: 'ready',
      totalCount: 1,
    })
  })

  it('carrega o cStat e a mensagem da rejeição, que é o que decide o próximo passo', () => {
    const readiness = adapters.tripFiscalReadinessFromApi(
      payload({
        documents: [
          {
            ...READY_DOCUMENT,
            cteAccessKey: null,
            cteFiscalDocumentId: null,
            reason: 'cte_rejected',
            rejectionCode: '539',
            rejectionMessage: 'Duplicidade',
          },
        ],
        readyCount: 0,
        state: 'incomplete',
      }),
    )

    expect(readiness.documents[0]).toMatchObject({
      reason: 'cte_rejected',
      rejectionCode: '539',
      rejectionMessage: 'Duplicidade',
    })
  })

  /**
   * Esta resposta decide se um botão de **emissão fiscal** aparece. Motivo fora do vocabulário tem
   * de virar recusa: `undefined` atravessando faria a tela dizer que está tudo pronto.
   */
  it('recusa motivo que não está no vocabulário', () => {
    expect(() =>
      adapters.tripFiscalReadinessFromApi(
        payload({ documents: [{ ...READY_DOCUMENT, reason: 'talvez' }] }),
      ),
    ).toThrow()
  })

  it('recusa estado fora do vocabulário', () => {
    expect(() => adapters.tripFiscalReadinessFromApi(payload({ state: 'quase' }))).toThrow()
  })

  it('recusa resposta sem a lista de notas', () => {
    expect(() => adapters.tripFiscalReadinessFromApi(payload({ documents: undefined }))).toThrow()
  })

  /** ⚠️ Cópia por valor da API: divergir aqui faria a tela mostrar motivo que ela não sabe traduzir. */
  it('os vocabulários são os que a API publica', () => {
    expect([...TRIP_DOCUMENT_READINESS_REASONS]).toEqual([
      'ok',
      'no_cte',
      'cte_in_progress',
      'cte_rejected',
      'cte_cancelled',
    ])
    expect([...TRIP_FISCAL_READINESS_STATES]).toEqual([
      'incomplete',
      'ready',
      'manifested',
      'divergent',
    ])
  })
})
