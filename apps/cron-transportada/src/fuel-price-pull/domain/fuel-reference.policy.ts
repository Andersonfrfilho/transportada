/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A planilha da ANP já publica uma média por posto pesquisado, então juntar duas linhas do mesmo
 * par `(produto, UF)` é média ponderada pelo número de postos — aritmética, não regra fiscal. A
 * conta é em `bigint` na escala 4, meio-para-cima, a mesma do `numeric(19,4)` que recebe o valor.
 */
import type { FuelProduct } from './fuel.constant.js'

const SCALED_PRICE_PATTERN = /^([0-9]+)\.([0-9]{4})$/
const PRICE_SCALE = 4

export type FuelReferenceSample = {
  readonly averagePricePerUnit: string
  readonly product: FuelProduct
  readonly state: string
  readonly stationCount: number
}

export type AggregatedFuelReference = {
  readonly pricePerUnit: string
  readonly product: FuelProduct
  readonly state: string
  readonly stationCount: number
}

type Accumulator = {
  readonly product: FuelProduct
  readonly state: string
  stationCount: number
  weight: bigint
  weightedPrice: bigint
}

function toScaledPrice(text: string): bigint {
  const match = SCALED_PRICE_PATTERN.exec(text)

  if (!match) {
    throw new Error('FUEL_INVALID_PRICE')
  }

  const [, whole = '0', fraction = ''] = match

  return BigInt(`${whole}${fraction}`)
}

function formatScaledPrice(value: bigint): string {
  const digits = value.toString().padStart(PRICE_SCALE + 1, '0')
  const separator = digits.length - PRICE_SCALE

  return `${digits.slice(0, separator)}.${digits.slice(separator)}`
}

function divideHalfUp(input: { readonly divisor: bigint; readonly value: bigint }): bigint {
  const quotient = input.value / input.divisor
  const remainder = input.value % input.divisor

  return remainder * 2n >= input.divisor ? quotient + 1n : quotient
}

export function aggregateFuelReferences(input: {
  readonly samples: readonly FuelReferenceSample[]
}): readonly AggregatedFuelReference[] {
  const accumulators = new Map<string, Accumulator>()

  for (const sample of input.samples) {
    const key = `${sample.product}:${sample.state}`
    const accumulator = accumulators.get(key) ?? {
      product: sample.product,
      state: sample.state,
      stationCount: 0,
      weight: 0n,
      weightedPrice: 0n,
    }
    // Posto nenhum pesquisado ainda é uma linha publicada: ela entra com peso 1, não some da média.
    const weight = BigInt(sample.stationCount === 0 ? 1 : sample.stationCount)

    accumulator.stationCount += sample.stationCount
    accumulator.weight += weight
    accumulator.weightedPrice += toScaledPrice(sample.averagePricePerUnit) * weight
    accumulators.set(key, accumulator)
  }

  return [...accumulators.values()].map((accumulator) => ({
    pricePerUnit: formatScaledPrice(
      divideHalfUp({ divisor: accumulator.weight, value: accumulator.weightedPrice }),
    ),
    product: accumulator.product,
    state: accumulator.state,
    stationCount: accumulator.stationCount,
  }))
}
