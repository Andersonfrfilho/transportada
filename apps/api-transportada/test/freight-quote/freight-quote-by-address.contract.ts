/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 342: a cotação por endereço nunca estima. Cada recusa é um caso; o caminho feliz prova que a
 * distância e o pedágio são os da estrada medida, e não os que o chamador pudesse ter mandado.
 */
import { describe, expect, test } from 'bun:test'

import {
  createCalculateFreightQuoteByAddressUseCase,
  metersToKilometres,
  type QuoteAddress,
  type QuoteLocation,
  type QuoteRoadReading,
} from '../../src/freight-quote/application/freight-quote-by-address.use-case.js'
import type { FreightQuoteRequest } from '../../src/freight-quote/application/freight-quote.use-case.js'

const ADDRESS: QuoteAddress = {
  city: 'Ribeirão Preto',
  cityIbgeCode: '3543402',
  district: 'Centro',
  number: '10',
  postalCode: '14010000',
  state: 'SP',
  street: 'Rua A',
}
const STREET: QuoteLocation = { latitude: '-21.17', longitude: '-47.81', precision: 'street' }
const TOLL = {
  boothsFallenBackToManual: 0,
  boothsWithoutCharge: 0,
  catalogStatus: 'current',
  total: '87.6000',
} as const

function build(input: {
  readonly locations?: Record<string, null | QuoteLocation>
  readonly road?: null | QuoteRoadReading
}) {
  const calls: FreightQuoteRequest[] = []
  const useCase = createCalculateFreightQuoteByAddressUseCase({
    calculate: {
      execute: async (request) => {
        calls.push(request)
        return { totalAmount: '999.0000' } as never
      },
    },
    locator: {
      locate: async ({ address }) =>
        (input.locations ?? {})[address.street] === undefined
          ? STREET
          : (input.locations ?? {})[address.street]!,
    },
    road: {
      read: async () =>
        input.road === undefined ? { distanceMeters: 123_456, toll: TOLL } : input.road,
    },
  })
  const request = {
    axles: 5,
    cargoType: 5,
    cargoValue: '0',
    companyId: 'c1',
    destination: { ...ADDRESS, street: 'Rua B' },
    fuelPricePerLitre: null,
    highPerformance: false,
    origin: ADDRESS,
    shareOfVehiclePercent: '100',
    vehicleType: 'truck',
  } as const
  return { calls, request, useCase }
}

describe('cotação por endereço (spec 342)', () => {
  test('usa a distância e o pedágio da estrada medida, nada que o chamador mande', async () => {
    const { calls, request, useCase } = build({})
    const result = await useCase.execute({ ...request, distanceKm: '1', tollAmount: '0' } as never)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.distanceKm).toBe('123.456')
    expect(calls[0]?.tollAmount).toBe('87.6000')
    expect(result.distanceKm).toBe('123.456')
  })

  test('recusa endereço só localizado pela cidade, ou não localizado, nos dois lados', async () => {
    const city: QuoteLocation = { ...STREET, precision: 'city' }
    const origin = build({ locations: { 'Rua A': city } })
    await expect(origin.useCase.execute(origin.request)).rejects.toMatchObject({
      code: 'FREIGHT_QUOTE_ADDRESS_NOT_LOCATED',
      status: 422,
    })
    const destination = build({ locations: { 'Rua B': null } })
    await expect(destination.useCase.execute(destination.request)).rejects.toMatchObject({
      code: 'FREIGHT_QUOTE_ADDRESS_NOT_LOCATED',
    })
    expect(origin.calls).toHaveLength(0)
  })

  test('sem estrada medida é 503, nunca uma reta', async () => {
    const { calls, request, useCase } = build({ road: null })
    await expect(useCase.execute(request)).rejects.toMatchObject({
      code: 'FREIGHT_QUOTE_ROUTE_UNAVAILABLE',
      status: 503,
    })
    expect(calls).toHaveLength(0)
  })

  test('pedágio parcial é recusado: catálogo vazio ou velho, praça sem tarifa, leitura ausente', async () => {
    for (const toll of [
      { ...TOLL, catalogStatus: 'empty' as const },
      { ...TOLL, catalogStatus: 'stale' as const },
      { ...TOLL, boothsWithoutCharge: 1 },
      null,
    ]) {
      const { calls, request, useCase } = build({ road: { distanceMeters: 50_000, toll } })
      await expect(useCase.execute(request)).rejects.toMatchObject({
        code: 'FREIGHT_QUOTE_TOLL_UNKNOWN',
        status: 422,
      })
      expect(calls).toHaveLength(0)
    }
  })

  test('metros viram quilômetros por aritmética inteira, com três casas', () => {
    expect(metersToKilometres(123_456)).toBe('123.456')
    expect(metersToKilometres(999.6)).toBe('1.000')
    expect(metersToKilometres(50)).toBe('0.050')
  })
})
