/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O que o veículo consome, com o preço publicado por unidade. Os cinco primeiros são a planilha
 * semanal da ANP, por UF; `eletrico` não está nela — a tarifa de energia é homologada pela ANEEL,
 * a chave dela é a distribuidora e não o estado, e quem a coleta é a segunda metade do mesmo job.
 *
 * A unidade é atributo do produto, não coluna: o GNV é vendido em metro cúbico, a energia em
 * quilowatt-hora e os quatro líquidos em litro, e guardá-la por linha abriria a porta para duas
 * linhas do mesmo produto discordarem entre si.
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

export const FUEL_UNIT_BY_PRODUCT = Object.fromEntries(
  FUEL_TYPES.map(({ product, unit }) => [product, unit]),
) as Record<FuelProduct, FuelUnit>

export const FUEL_PRODUCT_MAX_LENGTH = 20

export const DEFAULT_FUEL_PRODUCT: FuelProduct = 'diesel-s10'

/**
 * O único produto do catálogo cujo preço não vem da ANP. Ele é nomeado aqui, e não comparado por
 * unidade, porque a unidade é consequência: se um dia outro produto for vendido em kWh, quem decide
 * a origem da referência continua sendo o produto.
 */
export const ELECTRIC_FUEL_PRODUCT: FuelProduct = 'eletrico'
