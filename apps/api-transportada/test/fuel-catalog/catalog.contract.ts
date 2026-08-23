/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { companyFuelPrices, fuelPriceReferences } from '../../src/database/database.schema.js'
import { FUEL_TYPES } from '../../src/shared/fuel.constant.js'
import { checkSqlByName } from '../fiscal-schema/support.js'

/**
 * Cópia por valor entre quatro apps que não importam código umas das outras: a lista literal se
 * repete aqui de propósito, para a paridade ser assertada em vez de suposta.
 */
const CATALOG = [
  { product: 'diesel-s10', unit: 'litre' },
  { product: 'diesel-s500', unit: 'litre' },
  { product: 'gasolina-comum', unit: 'litre' },
  { product: 'etanol-hidratado', unit: 'litre' },
  { product: 'gnv', unit: 'cubic-metre' },
  { product: 'eletrico', unit: 'kilowatt-hour' },
] as const

describe('fuel catalog', () => {
  test('lists the five ANP products and the energy, in order, each declaring its unit', () => {
    expect(FUEL_TYPES).toEqual(CATALOG)
  })

  // Três unidades, e é por isso que ela é atributo do produto: litro, metro cúbico e quilowatt-hora
  test('sells the four liquids by the litre, the gas by the cubic metre, the energy by the kWh', () => {
    const unitByProduct = Object.fromEntries(FUEL_TYPES.map((entry) => [entry.product, entry.unit]))

    expect(unitByProduct).toEqual({
      'diesel-s10': 'litre',
      'diesel-s500': 'litre',
      eletrico: 'kilowatt-hour',
      'etanol-hidratado': 'litre',
      'gasolina-comum': 'litre',
      gnv: 'cubic-metre',
    })
  })

  test('closes the product column of both tables on the catalog, and on nothing else', () => {
    const referenceCheck = checkSqlByName(fuelPriceReferences).fuel_price_references_product_check
    const adjustmentCheck = checkSqlByName(companyFuelPrices).company_fuel_prices_product_check

    expect(referenceCheck).toBeString()
    expect(adjustmentCheck).toBeString()

    for (const { product } of CATALOG) {
      expect(referenceCheck).toContain(`'${product}'`)
      expect(adjustmentCheck).toContain(`'${product}'`)
    }
    expect(referenceCheck?.match(/'[a-z0-9-]+'/g)).toHaveLength(CATALOG.length)
    expect(adjustmentCheck?.match(/'[a-z0-9-]+'/g)).toHaveLength(CATALOG.length)
  })
})
