/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (RF10, casos extremos): o que a nota diz de cada código de produto. A ocorrência aponta
 * produto por **código** (166), e uma nota pode repetir o código em mais de uma linha:
 *
 * - o valor unitário é o da linha de **menor** `ordinal` com o código;
 * - `hasVaryingUnitValue` marca código cujas linhas têm valores diferentes (o valor pago passa a ser
 *   exigido naquela linha);
 * - a quantidade é a **soma** das linhas, e é o teto do que se devolve.
 *
 * Tudo em `bigint` sobre o texto do `numeric` — nada de ponto flutuante.
 */
import { formatScaledDecimal, parseScaledDecimal } from './occurrence-amount.policy.js'

export type PricedDocumentProduct = {
  readonly code: string
  readonly commercialUnit: string
  readonly ordinal: number
  readonly quantity: string
  readonly unitValue: string
}

export type DocumentProductPricing = {
  readonly commercialUnit: string
  readonly hasVaryingUnitValue: boolean
  /** A soma das quantidades das linhas do código, com as quatro casas da NF-e. */
  readonly totalQuantity: string
  /** `vUnCom` da linha de menor `ordinal`, como gravado na NF-e. */
  readonly unitValue: string
}

type Accumulator = {
  readonly first: PricedDocumentProduct
  readonly hasVaryingUnitValue: boolean
  readonly totalUnits: bigint
}

export function resolveDocumentProductPricing(
  products: readonly PricedDocumentProduct[],
): ReadonlyMap<string, DocumentProductPricing> {
  const byCode = new Map<string, Accumulator>()
  const ordered = [...products].sort((left, right) => left.ordinal - right.ordinal)
  for (const product of ordered) {
    const code = product.code.trim()
    const known = byCode.get(code)
    const units = parseScaledDecimal(product.quantity)
    if (known === undefined) {
      byCode.set(code, { first: product, hasVaryingUnitValue: false, totalUnits: units })
      continue
    }
    const differs =
      parseScaledDecimal(product.unitValue) !== parseScaledDecimal(known.first.unitValue)
    byCode.set(code, {
      first: known.first,
      hasVaryingUnitValue: known.hasVaryingUnitValue || differs,
      totalUnits: known.totalUnits + units,
    })
  }

  const pricing = new Map<string, DocumentProductPricing>()
  for (const [code, accumulator] of byCode) {
    pricing.set(code, {
      commercialUnit: accumulator.first.commercialUnit,
      hasVaryingUnitValue: accumulator.hasVaryingUnitValue,
      totalQuantity: formatScaledDecimal(accumulator.totalUnits),
      unitValue: accumulator.first.unitValue,
    })
  }
  return pricing
}
