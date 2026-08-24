/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia por valor de `apps/api-transportada/src/shared/fuel.constant.ts`. As apps não importam
 * código-fonte uma da outra; a paridade da lista vive em `test/fuel-price-pull/catalog.contract.ts`,
 * e o mesmo contrato existe nas outras duas apps. Mudou o catálogo de um lado? mude dos três.
 */

/**
 * O que o veículo consome, com o preço publicado por unidade. Os cinco primeiros são o catálogo da
 * ANP; `eletrico` não está na planilha dela — a tarifa de energia é da ANEEL, e é a segunda metade
 * deste mesmo job que a coleta, na tabela `energy_tariff_references`. O preço efetivo do kWh não sai
 * daqui: ele é resolvido na API, a partir da distribuidora que a empresa escolheu.
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
