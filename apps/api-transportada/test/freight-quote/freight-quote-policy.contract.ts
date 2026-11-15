/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { FREIGHT_QUOTE_DEFAULTS } from '../../src/freight-quote/domain/freight-quote-defaults.constant.js'
import {
  calculateFreightQuote,
  FreightQuoteInputError,
  type FreightQuoteInput,
} from '../../src/freight-quote/domain/freight-quote.policy.js'

const BASE: FreightQuoteInput = {
  axles: 5,
  cargoType: 5,
  cargoValue: '100000',
  distanceKm: '500',
  fuelPricePerLitre: '6',
  highPerformance: false,
  settings: { ...FREIGHT_QUOTE_DEFAULTS },
  shareOfVehiclePercent: '100',
  tollAmount: '0',
}

describe('freight quote by trip cost', () => {
  test('500 km, 5 axles, general cargo: cost 2550 + 15% margin is 3000, below the ANTT floor', () => {
    const quote = calculateFreightQuote(BASE)
    expect(quote.fuelKmPerLiter).toBe('2.5000')
    expect(quote.fuelKmPerLiterOrigin).toBe('reference')
    expect(quote.tripCostAmount).toBe('2550.0000')
    expect(quote.shipmentCostAmount).toBe('2550.0000')
    expect(quote.marginAmount).toBe('450.0000')
    // piso = 500 × 6,6718 + 657,56 = 3993,46
    expect(quote.anttFloor?.floorAmount).toBe('3993.4600')
    expect(quote.anttFloor?.applied).toBe(true)
    expect(quote.freightAmount).toBe('3993.4600')
    // ad valorem 0,30% e GRIS 0,20% de 100.000
    expect(quote.adValoremAmount).toBe('300.0000')
    expect(quote.grisAmount).toBe('200.0000')
    expect(quote.totalAmount).toBe('4493.4600')
  })

  test('with the floor turned off the freight is the cost plus margin', () => {
    const quote = calculateFreightQuote({
      ...BASE,
      settings: { ...BASE.settings, applyAnttFloor: false },
    })
    expect(quote.anttFloor?.applied).toBe(false)
    expect(quote.freightAmount).toBe('3000.0000')
    expect(quote.totalAmount).toBe('3500.0000')
  })

  test('a higher cost than the floor is kept, and the floor is only reported', () => {
    const quote = calculateFreightQuote({ ...BASE, tollAmount: '1500' })
    expect(quote.tripCostAmount).toBe('4050.0000')
    expect(quote.freightAmount).toBe('4764.7059')
    expect(quote.anttFloor?.applied).toBe(false)
  })

  test('a small share of the vehicle pays only its share of the trip, spread by expected occupancy', () => {
    const quote = calculateFreightQuote({
      ...BASE,
      settings: { ...BASE.settings, applyAnttFloor: false },
      shareOfVehiclePercent: '42.5',
    })
    expect(quote.costShareFactor).toBe('0.5000')
    expect(quote.shipmentCostAmount).toBe('1275.0000')
  })

  test('a full vehicle never pays more than the whole trip, even with occupancy below 100%', () => {
    const quote = calculateFreightQuote({
      ...BASE,
      settings: { ...BASE.settings, applyAnttFloor: false },
    })
    expect(quote.costShareFactor).toBe('1.0000')
    expect(quote.shipmentCostAmount).toBe(quote.tripCostAmount)
  })

  test('a consumption set by the company wins over the axle reference', () => {
    const quote = calculateFreightQuote({
      ...BASE,
      settings: { ...BASE.settings, applyAnttFloor: false, fuelKmPerLiter: '3.0000' },
    })
    expect(quote.fuelKmPerLiterOrigin).toBe('company')
    expect(quote.fuelKmPerLiter).toBe('3.0000')
    expect(quote.lines.find((line) => line.key === 'fuel')?.amount).toBe('1000.0000')
  })

  test('the cost lines add up to the trip cost', () => {
    const quote = calculateFreightQuote({ ...BASE, tollAmount: '120.5' })
    const sum = quote.lines.reduce(
      (total, line) => total + Math.round(Number.parseFloat(line.amount) * 10_000),
      0,
    )
    expect(sum).toBe(Math.round(Number.parseFloat(quote.tripCostAmount) * 10_000))
  })

  test('high performance uses table C', () => {
    const quote = calculateFreightQuote({ ...BASE, highPerformance: true })
    expect(quote.anttFloor?.table).toBe('C')
  })

  test.each([
    ['distance zero', { distanceKm: '0' }],
    ['fuel price zero', { fuelPricePerLitre: '0' }],
    ['share above 100', { shareOfVehiclePercent: '101' }],
    ['text instead of decimal', { distanceKm: '12,5' }],
  ])('%s is refused', (_name, override) => {
    expect(() => calculateFreightQuote({ ...BASE, ...override })).toThrow(FreightQuoteInputError)
  })

  test('a margin of 100% would divide by zero and is refused', () => {
    expect(() =>
      calculateFreightQuote({ ...BASE, settings: { ...BASE.settings, marginPercent: '100' } }),
    ).toThrow(FreightQuoteInputError)
  })
})
