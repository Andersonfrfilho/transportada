/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 259 T3.1: o item de `GET /trips` ganha ocupação, gasto e lucro, e o painel publica antes da
 * API — resposta antiga e resposta nova têm de passar, e lixo no campo novo não derruba a lista.
 */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

function rawTrip(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    companyId: 'empresa-1',
    createdAt: '2026-10-01T10:00:00.000Z',
    driverNames: [],
    id: 'viagem-1',
    requiresMdfe: null,
    requiresMdfeReason: null,
    status: 'draft',
    updatedAt: '2026-10-01T10:00:00.000Z',
    vehicleId: 'veiculo-1',
    ...overrides,
  }
}

function listOf(...items: Record<string, unknown>[]): unknown {
  return { data: items, page: { nextCursor: null } }
}

const NEW_AMOUNTS = {
  costTotal: '800.0000',
  documentsTotal: '5000.0000',
  hasGaps: false,
  marginPercentage: '20.00',
  marginTotal: '200.0000',
  revenueSource: 'measured',
  revenueTotal: '1000.0000',
}

const NEW_OCCUPANCY = {
  capacityUnknownReason: null,
  volume: { documentsWithoutVolume: 0, occupancyRatio: '0.6200', source: 'measured' },
  weight: { documentsWithoutWeight: 1, payloadRatio: 0.8, source: 'estimated' },
}

describe('a listagem de viagens aceita o item antigo e o novo (spec 259)', () => {
  it('resposta antiga, sem ocupação nem gasto, passa e fica sem os campos', () => {
    const page = adapters.tripListFromApi(
      listOf(rawTrip({ amounts: { documentsTotal: '1.0000', revenueSource: 'missing' } })),
    )

    expect(page.items[0]?.occupancySummary).toBeUndefined()
    expect(page.items[0]?.amounts?.costTotal).toBeUndefined()
    expect(page.items[0]?.amounts?.hasGaps).toBeUndefined()
  })

  it('resposta nova entrega ocupação (razão numérica vira texto) e gasto e lucro', () => {
    const page = adapters.tripListFromApi(
      listOf(rawTrip({ amounts: NEW_AMOUNTS, occupancy: NEW_OCCUPANCY })),
    )
    const item = page.items[0]

    expect(item?.occupancySummary?.volume?.occupancyRatio).toBe('0.6200')
    expect(item?.occupancySummary?.weight?.payloadRatio).toBe('0.8')
    expect(item?.occupancySummary?.weight?.source).toBe('estimated')
    expect(item?.amounts?.costTotal).toBe('800.0000')
    expect(item?.amounts?.marginPercentage).toBe('20.00')
    expect(item?.amounts?.hasGaps).toBe(false)
    expect(Object.keys(item ?? {})).not.toContain('occupancy')
  })

  it('viagem sem veículo (occupancy null) fica como null, dito pela API', () => {
    const page = adapters.tripListFromApi(listOf(rawTrip({ occupancy: null, vehicleId: null })))

    expect(page.items[0]?.occupancySummary).toBeNull()
  })

  it('motivo de capacidade desconhecida e fatias nulas atravessam', () => {
    const page = adapters.tripListFromApi(
      listOf(
        rawTrip({
          occupancy: { capacityUnknownReason: 'bodyTypeMissing', volume: null, weight: null },
        }),
      ),
    )

    expect(page.items[0]?.occupancySummary).toEqual({
      capacityUnknownReason: 'bodyTypeMissing',
      volume: null,
      weight: null,
    })
  })

  it('ficha sem teto de carga (payloadRatio null) preserva o volume e deixa o peso sem razão', () => {
    const page = adapters.tripListFromApi(
      listOf(
        rawTrip({
          occupancy: {
            capacityUnknownReason: null,
            volume: { documentsWithoutVolume: 0, occupancyRatio: '0.6200', source: 'measured' },
            weight: { documentsWithoutWeight: 0, payloadRatio: null, source: 'declared' },
          },
        }),
      ),
    )
    const summary = page.items[0]?.occupancySummary

    expect(summary?.volume?.occupancyRatio).toBe('0.6200')
    expect(summary?.weight?.payloadRatio).toBeNull()
  })

  it('sem trip.financials o amounts não traz os campos novos e a lista passa', () => {
    const page = adapters.tripListFromApi(
      listOf(rawTrip({ amounts: { revenueSource: 'estimated' }, occupancy: NEW_OCCUPANCY })),
    )

    expect(page.items[0]?.amounts?.marginTotal).toBeUndefined()
    expect(page.items[0]?.occupancySummary?.weight).not.toBeNull()
  })

  it('ocupação malformada vira ausente e não derruba a listagem', () => {
    const page = adapters.tripListFromApi(
      listOf(
        rawTrip({ occupancy: { volume: { occupancyRatio: 'abc' }, weight: null } }),
        rawTrip({ id: 'viagem-2', occupancy: 'lixo' }),
      ),
    )

    expect(page.items).toHaveLength(2)
    expect(page.items[0]?.occupancySummary).toBeUndefined()
    expect(page.items[1]?.occupancySummary).toBeUndefined()
  })

  it('chave desconhecida na viagem continua recusando a resposta (defesa da spec 078)', () => {
    expect(() => adapters.tripListFromApi(listOf(rawTrip({ token: 'x' })))).toThrow()
  })

  it('gasto com tipo errado em amounts continua recusando', () => {
    expect(() =>
      adapters.tripListFromApi(listOf(rawTrip({ amounts: { ...NEW_AMOUNTS, hasGaps: 'sim' } }))),
    ).toThrow()
  })
})
