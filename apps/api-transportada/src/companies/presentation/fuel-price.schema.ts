/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { invalidRequest, parseBody } from '../../http/request-parsing.service.js'
import { FUEL_PRODUCTS, type FuelProduct } from '../../shared/fuel.constant.js'

const PRICE_DECIMAL = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{4})$/

const adjustFuelPriceBodySchema = z
  .object({ pricePerUnit: z.string().regex(PRICE_DECIMAL) })
  .strict()

/**
 * O catálogo é fechado e enumerável: pedir `glp` é pedido malformado, não recurso ausente — daí 400
 * e não 404.
 */
export function parseFuelProduct(value: string): FuelProduct {
  const product = FUEL_PRODUCTS.find((candidate) => candidate === value)
  if (product === undefined)
    throw invalidRequest([{ field: 'product', message: 'unknown product' }])
  return product
}

export function parseAdjustFuelPriceBody(request: Request): Promise<{
  readonly pricePerUnit: string
}> {
  return parseBody(adjustFuelPriceBodySchema, request)
}
