/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 176: a API passa a publicar `freightAmount`, `freightRuleName` e `freightSource` em cada
 * nota da viagem. O guard tem lista **fechada** (`occurrence-marker-tolerance.contract.ts` mediu o
 * defeito de campo desconhecido derrubando a resposta inteira) — os três entram como opcionais,
 * para instalação com API anterior à feature continuar funcionando.
 */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

function buildDetail(documentExtra: Readonly<Record<string, unknown>> = {}) {
  return {
    amounts: null,
    companyId: 'ce523659-5e30-4b13-96ce-8d603d8cb9e9',
    createdAt: '2026-09-16T16:16:57.548Z',
    documents: [
      {
        createdAt: '2026-09-16T16:16:57.548Z',
        cteAuthorized: false,
        deliveredAt: null,
        destinationOrigin: 'recipient',
        fiscalStatus: 'pending',
        freightCalculationId: null,
        id: 'd1',
        loadedAt: null,
        nfeDocumentId: 'n1',
        releasedAt: null,
        returnReason: null,
        returnedAt: null,
        separatedAt: null,
        separationStatus: 'pending',
        stopId: 's1',
        tripId: 't1',
        updatedAt: '2026-09-16T16:16:57.548Z',
        ...documentExtra,
      },
    ],
    driverNames: [],
    drivers: [],
    estimatedArrivalFrozenAt: null,
    estimatedFinishAt: null,
    id: '66667bb0-1618-417a-96da-f3148da475a3',
    requiresMdfe: null,
    requiresMdfeReason: null,
    status: 'separating',
    stops: [
      {
        addressKey: '3543402|14076400|2296',
        arrivedAt: null,
        completedAt: null,
        deliveryWindowEnd: null,
        deliveryWindowStart: null,
        documents: [],
        id: 's1',
        label: 'AVENIDA ARMANDO PENTEADO, 61',
        sequence: 1,
      },
    ],
    updatedAt: '2026-09-21T20:05:04.191Z',
    vehicleId: '31c6e233-e079-4691-8674-c9ed9be2d299',
  }
}

describe('frete da nota na viagem (spec 176)', () => {
  it('aceita a viagem de API anterior, sem os campos de frete', () => {
    const detail = adapters.tripDetailFromApi(buildDetail())

    expect(detail.documents[0]?.freightAmount).toBeUndefined()
    expect(detail.documents[0]?.freightSource).toBeUndefined()
  })

  it('aceita o caminho `measured`, com valor e sem nome de regra congelado', () => {
    const detail = adapters.tripDetailFromApi(
      buildDetail({ freightAmount: '680.5480', freightRuleName: null, freightSource: 'measured' }),
    )

    expect(detail.documents[0]?.freightAmount).toBe('680.5480')
    expect(detail.documents[0]?.freightRuleName).toBeNull()
    expect(detail.documents[0]?.freightSource).toBe('measured')
  })

  it('aceita o caminho `estimated`, com valor e nome de regra', () => {
    const detail = adapters.tripDetailFromApi(
      buildDetail({
        freightAmount: '680.5480',
        freightRuleName: 'Sudeste padrão',
        freightSource: 'estimated',
      }),
    )

    expect(detail.documents[0]?.freightAmount).toBe('680.5480')
    expect(detail.documents[0]?.freightRuleName).toBe('Sudeste padrão')
    expect(detail.documents[0]?.freightSource).toBe('estimated')
  })

  it('aceita ausência: sem valor, sem regra, fonte `missing`', () => {
    const detail = adapters.tripDetailFromApi(
      buildDetail({ freightAmount: null, freightRuleName: null, freightSource: 'missing' }),
    )

    expect(detail.documents[0]?.freightAmount).toBeNull()
    expect(detail.documents[0]?.freightRuleName).toBeNull()
    expect(detail.documents[0]?.freightSource).toBe('missing')
  })

  /** Tolerar a chave não é aceitar qualquer valor. */
  it('recusa freightSource fora do vocabulário', () => {
    expect(() => adapters.tripDetailFromApi(buildDetail({ freightSource: 'realized' }))).toThrow()
  })

  it('recusa freightAmount que não é string nem nulo', () => {
    expect(() => adapters.tripDetailFromApi(buildDetail({ freightAmount: 680.548 }))).toThrow()
  })
})
