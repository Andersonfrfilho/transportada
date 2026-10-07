/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (RF10, RF11, T4.4): os itens que o motorista marcou, conferidos contra a nota — e as linhas
 * que serão gravadas. O app manda código, quantidade e, se for o caso, o valor pago; **preço e unidade
 * saem da nota** (`resolveDocumentProductPricing`), nunca do corpo.
 *
 * Ordem das recusas: código fora da nota (422), mais de um item em tipo de item único (422),
 * quantidade acima da soma da nota para o código (400).
 */
import { parseScaledDecimal } from './occurrence-amount.policy.js'
import type { DocumentProductPricing } from './occurrence-product-pricing.policy.js'
import {
  OccurrenceItemQuantityAboveDocumentError,
  OccurrenceProductNotInDocumentError,
  OccurrenceTypeSingleItemError,
} from './trip.error.js'

export type DriverOccurrenceItemRequest = {
  readonly declaredAmount?: string | undefined
  readonly productCode: string
  readonly quantity: string
}

/** A linha pronta para gravar, com o que o guarda de exigência ainda precisa saber. */
export type DriverOccurrenceLine = {
  readonly declaredAmount: null | string
  readonly hasVaryingUnitValue: boolean
  readonly productCode: string
  readonly quantity: string
  /** `uCom` da nota — a unidade nunca vem do corpo. */
  readonly quantityUnit: string
  /** `vUnCom` da linha de menor `ordinal` com o código. */
  readonly unitValue: string
}

export type ResolveDriverOccurrenceLinesParams = {
  readonly allowsMultipleItems: boolean
  readonly items: readonly DriverOccurrenceItemRequest[]
  readonly pricing: ReadonlyMap<string, DocumentProductPricing>
}

function quantityField(index: number): string {
  return `items[${String(index)}].quantity`
}

export function resolveDriverOccurrenceLines(
  params: ResolveDriverOccurrenceLinesParams,
): readonly DriverOccurrenceLine[] {
  const priced = params.items.map((item) => {
    const pricing = params.pricing.get(item.productCode.trim())
    if (pricing === undefined) throw new OccurrenceProductNotInDocumentError()
    return { item, pricing }
  })
  if (priced.length > 1 && !params.allowsMultipleItems) throw new OccurrenceTypeSingleItemError()

  return priced.map(({ item, pricing }, index) => {
    if (parseScaledDecimal(item.quantity) > parseScaledDecimal(pricing.totalQuantity)) {
      throw new OccurrenceItemQuantityAboveDocumentError(quantityField(index))
    }
    return {
      declaredAmount: item.declaredAmount ?? null,
      hasVaryingUnitValue: pricing.hasVaryingUnitValue,
      productCode: item.productCode.trim(),
      quantity: item.quantity,
      quantityUnit: pricing.commercialUnit,
      unitValue: pricing.unitValue,
    }
  })
}
