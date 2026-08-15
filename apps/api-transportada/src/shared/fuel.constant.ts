/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Catálogo da ANP. A unidade é atributo do produto, não coluna: o GNV é vendido em metro cúbico e
 * os outros quatro em litro, e guardá-la por linha abriria a porta para duas linhas do mesmo
 * produto discordarem entre si.
 */
export const FUEL_TYPES = [
  { product: 'diesel-s10', unit: 'litre' },
  { product: 'diesel-s500', unit: 'litre' },
  { product: 'gasolina-comum', unit: 'litre' },
  { product: 'etanol-hidratado', unit: 'litre' },
  { product: 'gnv', unit: 'cubic-metre' },
] as const

export type FuelType = (typeof FUEL_TYPES)[number]
export type FuelProduct = FuelType['product']
export type FuelUnit = FuelType['unit']

export const FUEL_PRODUCTS: readonly FuelProduct[] = FUEL_TYPES.map((entry) => entry.product)

export const FUEL_UNIT_BY_PRODUCT = Object.fromEntries(
  FUEL_TYPES.map(({ product, unit }) => [product, unit]),
) as Record<FuelProduct, FuelUnit>

export const FUEL_PRODUCT_MAX_LENGTH = 20

export const DEFAULT_FUEL_PRODUCT: FuelProduct = 'diesel-s10'
