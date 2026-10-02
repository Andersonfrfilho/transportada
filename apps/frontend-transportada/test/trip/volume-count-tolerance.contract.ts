/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Revisão da spec 227 (M5): `documents[].volumeCount` é a soma de `nfe_volumes.quantity`, que é decimal.
 * A guarda exigia inteiro e uma nota com qVol fracionário derrubava a viagem inteira ("Não foi possível
 * carregar esta viagem"). Um refinamento de tela não pode recusar a resposta: a guarda aceita número
 * finito não negativo ou nulo; quem decide se o número é imprimível é a tela.
 */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

function buildDetail(volumeCount: unknown) {
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
        volumeCount,
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

describe('volumeCount na viagem não derruba a resposta (revisão 227 M5)', () => {
  it.each([12, 0, null, 2.5])('aceita %p', (volumeCount) => {
    expect(adapters.tripDetailFromApi(buildDetail(volumeCount)).documents).toHaveLength(1)
  })

  it('aceita a nota sem o campo (API anterior)', () => {
    const detail = buildDetail(0)
    delete (detail.documents[0] as { volumeCount?: unknown }).volumeCount
    expect(adapters.tripDetailFromApi(detail).documents).toHaveLength(1)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, '12', true])('recusa %p', (volumeCount) => {
    expect(() => adapters.tripDetailFromApi(buildDetail(volumeCount))).toThrow()
  })
})
