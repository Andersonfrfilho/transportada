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
  expectedDocument: 'cte',
  nfeDocumentId: '00000000-0000-4000-8000-000000000003',
  reason: 'ok',
  rejectionCode: null,
  rejectionMessage: null,
  tripDocumentId: '00000000-0000-4000-8000-000000000002',
}

function payload(overrides: Record<string, unknown> = {}): unknown {
  return {
    documents: [READY_DOCUMENT],
    manifestableCount: 1,
    nfseCount: 0,
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
      'nfse_expected',
      'city_unknown',
    ])
    expect([...TRIP_FISCAL_READINESS_STATES]).toEqual([
      'incomplete',
      'ready',
      'manifested',
      'divergent',
      'not_applicable',
    ])
  })

  /**
   * Spec 065 D4: a nota de entrega urbana chega com `nfse_expected`, e a tela precisa saber que ela
   * **não** espera CT-e — é o que decide se o botão de gerar lote aparece por causa dela.
   */
  it('distingue a nota que espera NFS-e da que espera CT-e', () => {
    const readiness = adapters.tripFiscalReadinessFromApi(
      payload({
        documents: [
          {
            ...READY_DOCUMENT,
            cteAccessKey: null,
            cteFiscalDocumentId: null,
            expectedDocument: 'nfse',
            reason: 'nfse_expected',
          },
        ],
        manifestableCount: 0,
        nfseCount: 1,
        readyCount: 0,
        state: 'not_applicable',
      }),
    )

    expect(readiness.documents[0]).toMatchObject({
      expectedDocument: 'nfse',
      reason: 'nfse_expected',
    })
    expect(readiness.state).toBe('not_applicable')
  })

  /** Documento fora do par conhecido vira `null` — o mesmo que "não se decidiu", nunca um chute. */
  it('documento desconhecido vira indefinido em vez de virar CT-e', () => {
    const readiness = adapters.tripFiscalReadinessFromApi(
      payload({ documents: [{ ...READY_DOCUMENT, expectedDocument: 'nfe' }] }),
    )

    expect(readiness.documents[0]?.expectedDocument).toBeNull()
  })
})

describe('a exigência de MDF-e que chega da API', () => {
  const REQUIREMENT = {
    effectiveRequiresMdfe: false,
    manifestableCount: 2,
    reason: 'frota própria',
    requiresMdfe: false,
  }

  it('aceita a resposta completa e devolve o efetivo já derivado pelo servidor', () => {
    expect(adapters.tripMdfeRequirementFromApi(REQUIREMENT)).toEqual(REQUIREMENT)
  })

  /** `null` é um dos três estados: recusá-lo transformaria "volte ao automático" em erro. */
  it('aceita null como sobrescrita ausente', () => {
    expect(
      adapters.tripMdfeRequirementFromApi({
        ...REQUIREMENT,
        effectiveRequiresMdfe: true,
        reason: null,
        requiresMdfe: null,
      }).requiresMdfe,
    ).toBeNull()
  })

  it('recusa a resposta sem o efetivo, que é o que a tela mostra', () => {
    expect(() =>
      adapters.tripMdfeRequirementFromApi({ ...REQUIREMENT, effectiveRequiresMdfe: undefined }),
    ).toThrow()
  })
})
