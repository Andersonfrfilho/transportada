/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.4 (RF12, D11): a sugestão do valor de cada item do acerto da tratativa (164), a partir do
 * registro — o valor pago digitado, senão a soma da linha. **Sugere, não grava**: o operador confirma, e
 * nenhuma regra da 164 muda. A 164 exige `amount > 0` (422 `OCCURRENCE_SETTLEMENT_AMOUNT_INVALID`), então
 * a linha com valor pago zero ("a loja não pagou") **não** gera sugestão e nada é preenchido com 0.
 */
import type { TripDocumentProduct } from './trip.types'
import type { TripOccurrenceDetailItem } from './tripOccurrenceFeed.service'
import {
  calculateItemLineAmount,
  formatCentsAsDecimal,
  parseAmountToCents,
} from './occurrenceAmount.service'

export type SettlementSuggestionLine = Readonly<{
  code: string
  /** O valor pago digitado na linha; `undefined` é "a API não publicou", `null` é "não digitado". */
  declaredAmount: null | string | undefined
  /** A quantidade devolvida; `null` é a linha inteira da nota, que vale o `vProd`. */
  quantity: null | string
  /** O `vProd` da nota; `null` quando a tela não tem a nota. */
  totalValue: null | string
  /** O `vUnCom` da nota; `null` quando a tela não tem a nota ou a unidade não é a dela. */
  unitValue: null | string
}>

export type SettlementSuggestionRow = Readonly<{
  /** O valor sugerido no texto de decimal que o acerto grava (`57.20`). */
  amount: string
  amountCents: bigint
  /** `nfe`: o valor saiu da nota (a soma da linha); `manual`: o operador do registro digitou o pago. */
  amountSource: 'manual' | 'nfe'
  productCode: string
  /** A soma da linha, para ficar visível ao lado do valor sugerido. */
  referenceCents: bigint | null
}>

export type SettlementSuggestion = Readonly<{
  rows: readonly SettlementSuggestionRow[]
  /** A loja não pagou: sem valor a acertar. A soma da linha continua visível. */
  unpaid: readonly Readonly<{ productCode: string; referenceCents: bigint | null }>[]
}>

function readLineCents(line: SettlementSuggestionLine): bigint | null {
  if (line.totalValue === null || line.unitValue === null) return null
  return calculateItemLineAmount({
    quantity: line.quantity,
    totalValue: line.totalValue,
    unitValue: line.unitValue,
  })
}

export function buildSettlementSuggestion(
  lines: readonly SettlementSuggestionLine[],
): SettlementSuggestion {
  const rows: SettlementSuggestionRow[] = []
  const unpaid: { productCode: string; referenceCents: bigint | null }[] = []

  for (const line of lines) {
    const referenceCents = readLineCents(line)
    if (line.declaredAmount !== undefined && line.declaredAmount !== null) {
      const paidCents = parseAmountToCents(line.declaredAmount)
      if (paidCents === 0n) {
        unpaid.push({ productCode: line.code, referenceCents })
        continue
      }
      rows.push({
        amount: formatCentsAsDecimal(paidCents),
        amountCents: paidCents,
        amountSource: 'manual',
        productCode: line.code,
        referenceCents,
      })
      continue
    }
    if (referenceCents === null || referenceCents === 0n) continue
    rows.push({
      amount: formatCentsAsDecimal(referenceCents),
      amountCents: referenceCents,
      amountSource: 'nfe',
      productCode: line.code,
      referenceCents,
    })
  }

  return { rows, unpaid }
}

/**
 * Os itens da ocorrência casados com a nota. A conta de quantidade × valor unitário só vale na unidade da
 * nota: em outra unidade (a caixa de fallback), a tela não tem o preço e não inventa — a linha inteira, sem
 * quantidade, vale o `vProd` seja qual for a unidade.
 */
export function buildSettlementSuggestionLines(
  input: Readonly<{
    items: readonly TripOccurrenceDetailItem[]
    products: readonly TripDocumentProduct[]
  }>,
): readonly SettlementSuggestionLine[] {
  return input.items.map((item) => {
    const product = input.products.find((candidate) => candidate.code === item.code)
    const isNoteUnit = item.quantity === null || item.unit === product?.commercialUnit
    return {
      code: item.code,
      declaredAmount: item.declaredAmount,
      quantity: item.quantity,
      totalValue: product?.totalValue ?? null,
      unitValue: isNoteUnit ? (product?.unitValue ?? null) : null,
    }
  })
}
