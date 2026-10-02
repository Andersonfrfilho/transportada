/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O detalhe da viagem abria com 200 na rede e "Não foi possível carregar esta viagem" na tela, sem nada
 * no console, a cada chave nova ou campo opcional fora da forma (volumeCount fracionário, campo de
 * outra spec). Chave desconhecida é descartada (a proteção contra vazamento fica), opcional malformado
 * cai, e o que a tela precisa para existir continua obrigatório.
 */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

const TIMESTAMP = '2026-09-16T16:16:57.548Z'

function buildDocument(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: TIMESTAMP,
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
    updatedAt: TIMESTAMP,
    ...overrides,
  }
}

function buildStop(overrides: Record<string, unknown> = {}) {
  return {
    addressKey: '3543402|14076400|2296',
    arrivedAt: null,
    completedAt: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [buildDocument()],
    id: 's1',
    label: 'AVENIDA ARMANDO PENTEADO, 61',
    sequence: 1,
    ...overrides,
  }
}

function buildDetail(overrides: Record<string, unknown> = {}) {
  return {
    amounts: null,
    companyId: 'ce523659-5e30-4b13-96ce-8d603d8cb9e9',
    createdAt: TIMESTAMP,
    documents: [buildDocument()],
    driverNames: [],
    drivers: [],
    estimatedArrivalFrozenAt: null,
    estimatedFinishAt: null,
    id: '66667bb0-1618-417a-96da-f3148da475a3',
    requiresMdfe: null,
    requiresMdfeReason: null,
    status: 'separating',
    stops: [buildStop()],
    updatedAt: TIMESTAMP,
    vehicleId: '42283aa7-f0c6-45dd-8e33-31b38c38ef24',
    ...overrides,
  }
}

describe('o detalhe da viagem tolera o que é refinamento', () => {
  it('abre a viagem completa sem alterar o que veio bem-formado', () => {
    const detail = adapters.tripDetailFromApi(buildDetail())
    expect(detail.id).toBe('66667bb0-1618-417a-96da-f3148da475a3')
    expect(detail.documents).toHaveLength(1)
    expect(detail.stops[0]?.documents).toHaveLength(1)
  })

  it('descarta chave desconhecida da viagem, da nota e da parada sem deixá-la passar', () => {
    const detail = adapters.tripDetailFromApi(
      buildDetail({
        accessToken: 'segredo',
        documents: [buildDocument({ nfeXml: '<xml/>' })],
        stops: [buildStop({ routeScore: 7, documents: [buildDocument({ internalNote: 'x' })] })],
        tenantSecret: 'segredo',
      }),
    )
    expect(detail.id).toBe('66667bb0-1618-417a-96da-f3148da475a3')
    expect(JSON.stringify(detail)).not.toContain('segredo')
    expect(JSON.stringify(detail)).not.toContain('<xml/>')
    expect(JSON.stringify(detail)).not.toContain('internalNote')
    expect(JSON.stringify(detail)).not.toContain('routeScore')
  })

  it('abre a viagem quando um bloco opcional da própria viagem vem com forma errada', () => {
    const detail = adapters.tripDetailFromApi(
      buildDetail({ occupancy: 'cheio', trailer: 5, cargoWeight: { total: 'x' } }),
    )
    expect(detail.id).toBe('66667bb0-1618-417a-96da-f3148da475a3')
    expect(detail.occupancy).toBeUndefined()
    expect(detail.trailer).toBeUndefined()
    expect(detail.cargoWeight).toBeUndefined()
  })

  it('abre a viagem quando um rótulo opcional da nota vem com forma errada', () => {
    const detail = adapters.tripDetailFromApi(
      buildDetail({
        documents: [buildDocument({ freightSource: 'inventado', proofPending: 'sim' })],
      }),
    )
    expect(detail.documents[0]?.id).toBe('d1')
    expect(detail.documents[0]?.freightSource).toBeUndefined()
  })
})

describe('o detalhe da viagem segue estrito no que a tela precisa para existir', () => {
  it('reprova estado da viagem desconhecido', () => {
    expect(() => adapters.tripDetailFromApi(buildDetail({ status: 'inventado' }))).toThrow()
  })

  it('reprova viagem sem identificador', () => {
    const withoutId = buildDetail()
    Reflect.deleteProperty(withoutId, 'id')
    expect(() => adapters.tripDetailFromApi(withoutId)).toThrow()
  })

  it('reprova nota com campo obrigatório de tipo errado, em vez de esconder a nota', () => {
    expect(() =>
      adapters.tripDetailFromApi(buildDetail({ documents: [buildDocument({ id: 7 })] })),
    ).toThrow()
  })

  it('reprova parada com campo obrigatório de tipo errado', () => {
    expect(() =>
      adapters.tripDetailFromApi(buildDetail({ stops: [buildStop({ sequence: 'primeira' })] })),
    ).toThrow()
  })

  it('reprova a lista de paradas ausente ou fora de lista', () => {
    expect(() => adapters.tripDetailFromApi(buildDetail({ stops: null }))).toThrow()
    const withoutStops = buildDetail()
    Reflect.deleteProperty(withoutStops, 'stops')
    expect(() => adapters.tripDetailFromApi(withoutStops)).toThrow()
  })

  it('reprova corpo que não é objeto', () => {
    expect(() => adapters.tripDetailFromApi(null)).toThrow()
    expect(() => adapters.tripDetailFromApi([])).toThrow()
  })
})
