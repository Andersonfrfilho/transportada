/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Cópia por valor do catálogo da API: o bundle não carrega código de lá, e
 * `test/shared/fuel-catalog.contract.ts` é o que garante que os dois não divergem. A unidade é
 * atributo do produto — o GNV é vendido em metro cúbico, a energia em quilowatt-hora e os quatro
 * líquidos em litro.
 */
export const FUEL_TYPES = [
  { product: 'diesel-s10', unit: 'litre' },
  { product: 'diesel-s500', unit: 'litre' },
  { product: 'gasolina-comum', unit: 'litre' },
  { product: 'etanol-hidratado', unit: 'litre' },
  { product: 'gnv', unit: 'cubic-metre' },
  { product: 'eletrico', unit: 'kilowatt-hour' },
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

/**
 * O único produto do catálogo cujo preço não vem da ANP: a referência dele é a tarifa homologada
 * pela ANEEL, por distribuidora. Ele é nomeado aqui, e não comparado por unidade, porque a unidade
 * é consequência — se um dia outro produto for vendido em kWh, quem decide a origem da referência
 * continua sendo o produto.
 */
export const ELECTRIC_FUEL_PRODUCT: FuelProduct = 'eletrico'

export function isFuelProduct(value: unknown): value is FuelProduct {
  return typeof value === 'string' && value in FUEL_UNIT_BY_PRODUCT
}
