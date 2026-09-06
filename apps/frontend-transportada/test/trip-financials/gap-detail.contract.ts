/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { toTripValuation } from '../../src/modules/trip-financials/shared/tripValuationResponse.validation'

const RESPONSE = {
  data: {
    costParcels: [
      {
        amount: '0.0000',
        detail: 'ITOBI/SP',
        gap: 'CITY_WITHOUT_REGION',
        kind: 'driver',
        source: 'missing',
      },
      { amount: '120.0000', detail: null, gap: null, kind: 'fuel', source: 'estimated' },
    ],
    hasGaps: true,
    marginPercentage: null,
    revenueLines: [],
    revenueSource: 'estimated',
    totalCost: '120.0000',
    totalMargin: '-120.0000',
    totalRevenue: '0.0000',
  },
}

/**
 * Spec 086 D2: **a lacuna nomeia a cidade a cadastrar.** "Destino sem zona de frete cadastrada"
 * numa viagem de doze paradas manda o operador conferir doze endereços; com o nome, ele vai à aba
 * Regiões e cadastra um. O nome atravessa a fronteira ou a decisão não vira ação.
 */
describe('the gap detail crosses the boundary (spec 086)', () => {
  test('the parser keeps the city the API named', () => {
    const valuation = toTripValuation(RESPONSE)

    expect(valuation?.costParcels[0]?.detail).toBe('ITOBI/SP')
    expect(valuation?.costParcels[1]?.detail).toBeNull()
  })

  /** Resposta antiga, sem o campo: ausência é `null`, nunca a string "undefined" na tela. */
  test('a parcel without the field reads as absence', () => {
    const legacy = toTripValuation({
      data: {
        ...RESPONSE.data,
        costParcels: [
          { amount: '0.0000', gap: 'NO_DRIVER_RATE', kind: 'driver', source: 'missing' },
        ],
      },
    })

    expect(legacy?.costParcels[0]?.detail).toBeNull()
  })

  test('the screen prints the detail next to the gap', () => {
    const source = readFileSync(
      new URL(
        '../../src/modules/trip/components/TripValuationPreview.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )

    expect(source).toInclude('parcel.detail')
  })
})
