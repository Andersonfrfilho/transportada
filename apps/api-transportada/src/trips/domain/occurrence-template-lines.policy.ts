/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (RF8, RF9, RF10, T4.7): as linhas que o modelo de e-mail recebe, montadas do que o registro
 * gravou — quantidade, unidade, valor unitário copiado e valor pago — e do que a nota diz: descrição,
 * quantidade da NF-e e `vProd`. Sem linha gravada (ocorrência antiga, galpão), os códigos marcados viram
 * linhas inteiras da nota. Código que a nota não tem é omitido, nunca inventado.
 */
import { formatScaledDecimal, parseScaledDecimal } from './occurrence-amount.policy.js'
import { resolveDocumentProductPricing } from './occurrence-product-pricing.policy.js'
import type { OccurrenceTemplateLine } from './occurrence-template.types.js'

export type StoredOccurrenceLine = {
  readonly declaredAmount: null | string
  readonly position: number
  readonly productCode: string
  readonly quantity: null | string
  readonly quantityUnit: null | string
  readonly unitValue: null | string
}

export type OccurrenceTemplateNfeProduct = {
  readonly code: string
  readonly commercialUnit: string
  readonly description: string
  readonly ordinal: number
  readonly quantity: string
  readonly totalValue: string
  readonly unitValue: string
}

type BuildOccurrenceTemplateLinesParams = {
  readonly nfeProducts: readonly OccurrenceTemplateNfeProduct[]
  /** Os códigos marcados — valem só quando a ocorrência não tem linha gravada. */
  readonly productCodes: readonly string[]
  readonly storedLines: readonly StoredOccurrenceLine[]
}

function toWholeLine(code: string): StoredOccurrenceLine {
  return {
    declaredAmount: null,
    position: 0,
    productCode: code,
    quantity: null,
    quantityUnit: null,
    unitValue: null,
  }
}

function sumTotalValues(products: readonly OccurrenceTemplateNfeProduct[]): string {
  const total = products.reduce((sum, product) => sum + parseScaledDecimal(product.totalValue), 0n)
  return formatScaledDecimal(total)
}

export function buildOccurrenceTemplateLines(
  params: BuildOccurrenceTemplateLinesParams,
): readonly OccurrenceTemplateLine[] {
  const pricing = resolveDocumentProductPricing(
    params.nfeProducts.map((product) => ({ ...product, code: product.code.trim() })),
  )
  const ordered = [...params.nfeProducts].sort((left, right) => left.ordinal - right.ordinal)
  const sources =
    params.storedLines.length > 0
      ? [...params.storedLines].sort((left, right) => left.position - right.position)
      : params.productCodes.map((code) => toWholeLine(code.trim()))

  return sources.flatMap((source) => {
    const code = source.productCode.trim()
    const price = pricing.get(code)
    const ofCode = ordered.filter((product) => product.code.trim() === code)
    const first = ofCode[0]
    if (price === undefined || first === undefined) return []

    return [
      {
        code,
        declaredAmount: source.declaredAmount,
        description: first.description,
        nfeQuantity: price.totalQuantity,
        quantity: source.quantity,
        totalValue: sumTotalValues(ofCode),
        unit: source.quantityUnit ?? price.commercialUnit,
        unitValue: source.unitValue ?? price.unitValue,
      },
    ]
  })
}
