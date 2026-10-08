/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.4: a soma da linha e a soma geral que a correção mostra como referência — a mesma conta da API,
 * em inteiro (`occurrenceAmount.service.ts`). Linha sem conta confiável (unidade que não é a da nota,
 * quantidade ilegível, item que a nota não tem) fica sem soma, e sem soma de uma linha não há soma geral.
 */
import {
  calculateItemLineAmount,
  formatBrazilianAmount,
  parseAmountToCents,
} from './occurrenceAmount.service'
import type { CorrectionFinalAmounts } from './occurrenceRecordedAmounts.service'
import type { OccurrenceQuantitiesByCode } from './occurrenceProductSelection.service'
import type { TripDocumentProduct } from './trip.types'
import type { TripOccurrenceItemValue } from './tripOccurrenceFeed.service'

export type CorrectionLineSums = Readonly<{
  /**
   * Spec 247 T7.2: o `valorDeclarado` que o e-mail imprime — a mesma regra de RF9 espelhada do servidor: o valor
   * pago da ocorrência, senão a soma dos valores das linhas (o pago digitado, senão a soma da linha). `null` quando
   * alguma linha não tem valor pago nem conta confiável.
   */
  emailAmount: null | string
  /** A soma de cada linha, já formatada (`57,20`); a linha sem conta confiável não tem entrada. */
  lines: ReadonlyMap<string, string>
  /** A soma das linhas arredondadas; `null` quando alguma linha ficou sem soma, ou não há linha. */
  total: null | string
}>

function readLineCents(
  input: Readonly<{
    product: TripDocumentProduct
    quantity: string
    unit: string | undefined
    unitValue: string
  }>,
): bigint | null {
  const { product, quantity, unit, unitValue } = input
  try {
    if (quantity === '') {
      return calculateItemLineAmount({
        quantity: null,
        totalValue: product.totalValue,
        unitValue,
      })
    }
    if (unit !== product.commercialUnit) return null
    return calculateItemLineAmount({
      quantity,
      totalValue: product.totalValue,
      unitValue,
    })
  } catch {
    /** Quantidade que não é decimal: a tela não inventa conta, só não mostra a soma. */
    return null
  }
}

function readEmailAmount(
  input: Readonly<{
    calculated: ReadonlyMap<string, bigint>
    codes: readonly string[]
    final: CorrectionFinalAmounts
  }>,
): null | string {
  const { calculated, codes, final } = input
  if (final.occurrenceAmount !== null) {
    return formatBrazilianAmount(parseAmountToCents(final.occurrenceAmount))
  }
  if (codes.length === 0) return null
  const parts = codes.map((code) => {
    const typed = final.lineAmounts.get(code)
    return typed === undefined || typed === null ? calculated.get(code) : parseAmountToCents(typed)
  })
  if (parts.some((part) => part === undefined)) return null
  return formatBrazilianAmount(parts.reduce((sum: bigint, part) => sum + (part ?? 0n), 0n))
}

export function readCorrectionLineSums(
  input: Readonly<{
    codes: readonly string[]
    /** O que valerá depois do salvar; ausente não calcula o valor do e-mail. */
    final?: CorrectionFinalAmounts
    /** O valor unitário que o registro copiou: a conta o usa no lugar do preço atual da nota (RF9). */
    itemValues?: readonly TripOccurrenceItemValue[] | undefined
    products: readonly TripDocumentProduct[]
    quantitiesByCode: OccurrenceQuantitiesByCode
  }>,
): CorrectionLineSums {
  const lines = new Map<string, string>()
  const calculated = new Map<string, bigint>()
  const cents: bigint[] = []
  for (const code of input.codes) {
    const product = input.products.find((candidate) => candidate.code === code)
    const entry = input.quantitiesByCode.get(code)
    if (product === undefined) continue
    const copied = input.itemValues?.find((value) => value.productCode === code)
    const lineCents = readLineCents({
      product,
      quantity: entry?.quantity.trim() ?? '',
      unit: entry?.unit,
      unitValue: copied?.unitValue ?? product.unitValue,
    })
    if (lineCents === null) continue
    lines.set(code, formatBrazilianAmount(lineCents))
    calculated.set(code, lineCents)
    cents.push(lineCents)
  }
  const isComplete = input.codes.length > 0 && cents.length === input.codes.length
  return {
    emailAmount:
      input.final === undefined
        ? null
        : readEmailAmount({ calculated, codes: input.codes, final: input.final }),
    lines,
    total: isComplete ? formatBrazilianAmount(cents.reduce((sum, value) => sum + value, 0n)) : null,
  }
}
