/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Cópia por valor do catálogo da API: o bundle não carrega código de lá, e
 * `test/shared/fuel-catalog.contract.ts` é o que garante que os dois não divergem. A unidade é
 * atributo do produto — o GNV é vendido em metro cúbico e os outros quatro em litro.
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

export const FUEL_UNITS: readonly FuelUnit[] = [...new Set(FUEL_TYPES.map((entry) => entry.unit))]

export const FUEL_UNIT_BY_PRODUCT = Object.fromEntries(
  FUEL_TYPES.map(({ product, unit }) => [product, unit]),
) as Record<FuelProduct, FuelUnit>

export const DEFAULT_FUEL_PRODUCT: FuelProduct = 'diesel-s10'

export function isFuelProduct(value: unknown): value is FuelProduct {
  return typeof value === 'string' && value in FUEL_UNIT_BY_PRODUCT
}
