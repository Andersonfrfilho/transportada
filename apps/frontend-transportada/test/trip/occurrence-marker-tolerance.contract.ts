/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T15 (RF21): a API publica `openOccurrenceCase` em cada nota e `hasOpenOccurrence` em
 * cada parada — o marcador de tratativa aberta. O bundle não conhecia nenhum dos dois, e o guard
 * tem lista **fechada**: chave desconhecida derruba a resposta inteira.
 *
 * ⚠️ Medido em staging em 22/09 às 19:40, com a sessão do operador: `GET /trips/:id` respondia
 * **200 com a viagem completa** e a tela mostrava "Não foi possível carregar esta viagem", mais a
 * linha do tempo caída junto. Nada estava fora do ar; o cliente é que recusava o que chegou.
 *
 * Os campos entram como **opcionais**: instalação com API antiga não os manda, e exigi-los
 * inverteria a quebra em vez de resolvê-la.
 */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

/** Cópia da resposta real de staging, reduzida ao que o guard olha. */
function buildDetail(extra: Readonly<Record<string, unknown>> = {}) {
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
        ...(extra.documentExtra as object | undefined),
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
        ...(extra.stopExtra as object | undefined),
      },
    ],
    updatedAt: '2026-09-21T20:05:04.191Z',
    vehicleId: '31c6e233-e079-4691-8674-c9ed9be2d299',
  }
}

describe('marcador de tratativa aberta na viagem (spec 164 T15)', () => {
  it('aceita a viagem de hoje, sem os marcadores', () => {
    expect(adapters.tripDetailFromApi(buildDetail()).id).toBe(
      '66667bb0-1618-417a-96da-f3148da475a3',
    )
  })

  it('aceita a nota com `openOccurrenceCase` e a parada com `hasOpenOccurrence`', () => {
    const detail = adapters.tripDetailFromApi(
      buildDetail({
        documentExtra: { openOccurrenceCase: true },
        stopExtra: { hasOpenOccurrence: true },
      }),
    )

    expect(detail.documents[0]?.openOccurrenceCase).toBe(true)
    expect(detail.stops[0]?.hasOpenOccurrence).toBe(true)
  })

  it('aceita os marcadores em `false`, que é o caso comum', () => {
    const detail = adapters.tripDetailFromApi(
      buildDetail({
        documentExtra: { openOccurrenceCase: false },
        stopExtra: { hasOpenOccurrence: false },
      }),
    )

    expect(detail.documents[0]?.openOccurrenceCase).toBe(false)
    expect(detail.stops[0]?.hasOpenOccurrence).toBe(false)
  })

  /** Tolerar a chave não é aceitar qualquer valor: marcador que não é booleano não chega à tela. */
  it('recusa marcador que não é booleano', () => {
    expect(() =>
      adapters.tripDetailFromApi(buildDetail({ documentExtra: { openOccurrenceCase: 'sim' } })),
    ).toThrow()
    expect(() =>
      adapters.tripDetailFromApi(buildDetail({ stopExtra: { hasOpenOccurrence: 1 } })),
    ).toThrow()
  })
})
