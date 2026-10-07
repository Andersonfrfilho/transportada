/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.4: a soma da linha e a soma geral que a correção mostra como referência — a mesma conta da API,
 * em inteiro (`occurrenceAmount.service.ts`). Linha sem conta confiável (unidade que não é a da nota,
 * quantidade ilegível, item que a nota não tem) fica sem soma, e sem soma de uma linha não há soma geral.
 */
import { calculateItemLineAmount, formatBrazilianAmount } from './occurrenceAmount.service'
import type { OccurrenceQuantitiesByCode } from './occurrenceProductSelection.service'
import type { TripDocumentProduct } from './trip.types'

export type CorrectionLineSums = Readonly<{
  /** A soma de cada linha, já formatada (`57,20`); a linha sem conta confiável não tem entrada. */
  lines: ReadonlyMap<string, string>
  /** A soma das linhas arredondadas; `null` quando alguma linha ficou sem soma, ou não há linha. */
  total: null | string
}>

function readLineCents(
  input: Readonly<{ product: TripDocumentProduct; quantity: string; unit: string | undefined }>,
): bigint | null {
  const { product, quantity, unit } = input
  try {
    if (quantity === '') {
      return calculateItemLineAmount({
        quantity: null,
        totalValue: product.totalValue,
        unitValue: product.unitValue,
      })
    }
    if (unit !== product.commercialUnit) return null
    return calculateItemLineAmount({
      quantity,
      totalValue: product.totalValue,
      unitValue: product.unitValue,
    })
  } catch {
    /** Quantidade que não é decimal: a tela não inventa conta, só não mostra a soma. */
    return null
  }
}

export function readCorrectionLineSums(
  input: Readonly<{
    codes: readonly string[]
    products: readonly TripDocumentProduct[]
    quantitiesByCode: OccurrenceQuantitiesByCode
  }>,
): CorrectionLineSums {
  const lines = new Map<string, string>()
  const cents: bigint[] = []
  for (const code of input.codes) {
    const product = input.products.find((candidate) => candidate.code === code)
    const entry = input.quantitiesByCode.get(code)
    if (product === undefined) continue
    const lineCents = readLineCents({
      product,
      quantity: entry?.quantity.trim() ?? '',
      unit: entry?.unit,
    })
    if (lineCents === null) continue
    lines.set(code, formatBrazilianAmount(lineCents))
    cents.push(lineCents)
  }
  const isComplete = input.codes.length > 0 && cents.length === input.codes.length
  return {
    lines,
    total: isComplete ? formatBrazilianAmount(cents.reduce((sum, value) => sum + value, 0n)) : null,
  }
}
