/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.4 (RF12, D11): a sugestão do valor de cada item do acerto da tratativa (164), a partir do
 * registro — o valor pago digitado, senão a soma da linha. **Sugere, não grava**: o operador confirma, e
 * nenhuma regra da 164 muda. A 164 exige `amount > 0` (422 `OCCURRENCE_SETTLEMENT_AMOUNT_INVALID`), então
 * a linha com valor pago zero ("a loja não pagou") **não** gera sugestão e nada é preenchido com 0.
 *
 * Spec 247 T7.2 (M3, D9): a conta usa o valor unitário **copiado** no registro (`itemValues`), não o preço atual da
 * nota; soma todas as linhas do mesmo código (o acerto é um item por código); e o valor pago digitado — da linha
 * ou da ocorrência — vence a soma. Sem `itemValues` (ocorrência ou API antigas) vale o que a nota diz hoje.
 */
import type { TripDocumentProduct } from './trip.types'
import type {
  TripOccurrenceDetailItem,
  TripOccurrenceItemValue,
} from './tripOccurrenceFeed.service'
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
  /** O valor pago da ocorrência inteira, que não tem como ser atribuído a um item só (vários códigos). */
  unsplitAmountCents: bigint | null
}>

export type SettlementSuggestionOptions = Readonly<{
  /** O valor pago de escopo ocorrência (2 casas); `null` ou ausente é "não digitado". */
  occurrenceAmount?: null | string
}>

function readLineCents(line: SettlementSuggestionLine): bigint | null {
  if (line.totalValue === null || line.unitValue === null) return null
  return calculateItemLineAmount({
    quantity: line.quantity,
    totalValue: line.totalValue,
    unitValue: line.unitValue,
  })
}

function groupByCode(
  lines: readonly SettlementSuggestionLine[],
): ReadonlyMap<string, readonly SettlementSuggestionLine[]> {
  const groups = new Map<string, SettlementSuggestionLine[]>()
  for (const line of lines) groups.set(line.code, [...(groups.get(line.code) ?? []), line])
  return groups
}

/** A soma das linhas já arredondadas; `null` quando alguma linha não tem conta confiável. */
function sumReference(lines: readonly SettlementSuggestionLine[]): bigint | null {
  let total = 0n
  for (const line of lines) {
    const cents = readLineCents(line)
    if (cents === null) return null
    total += cents
  }
  return total
}

type GroupVerdict =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unpaid' }>
  | Readonly<{ amountCents: bigint; amountSource: 'manual' | 'nfe'; kind: 'row' }>

/** O valor pago da linha vence a soma da linha; a linha sem um nem outro impede a sugestão do código. */
function judgeGroup(lines: readonly SettlementSuggestionLine[]): GroupVerdict {
  let total = 0n
  let hasDeclared = false
  for (const line of lines) {
    if (line.declaredAmount !== undefined && line.declaredAmount !== null) {
      hasDeclared = true
      total += parseAmountToCents(line.declaredAmount)
      continue
    }
    const cents = readLineCents(line)
    if (cents === null) return { kind: 'none' }
    total += cents
  }
  if (total === 0n) return hasDeclared ? { kind: 'unpaid' } : { kind: 'none' }
  return { amountCents: total, amountSource: hasDeclared ? 'manual' : 'nfe', kind: 'row' }
}

function buildOccurrenceLevelSuggestion(
  groups: ReadonlyMap<string, readonly SettlementSuggestionLine[]>,
  amountText: string,
): SettlementSuggestion {
  const paidCents = parseAmountToCents(amountText)
  const entries = [...groups].map(([productCode, lines]) => ({
    lines,
    productCode,
    referenceCents: sumReference(lines),
  }))
  if (paidCents === 0n) {
    return {
      rows: [],
      unpaid: entries.map(({ productCode, referenceCents }) => ({ productCode, referenceCents })),
      unsplitAmountCents: null,
    }
  }
  const [only] = entries
  if (entries.length !== 1 || only === undefined) {
    return { rows: [], unpaid: [], unsplitAmountCents: paidCents }
  }
  return {
    rows: [
      {
        amount: formatCentsAsDecimal(paidCents),
        amountCents: paidCents,
        amountSource: 'manual',
        productCode: only.productCode,
        referenceCents: only.referenceCents,
      },
    ],
    unpaid: [],
    unsplitAmountCents: null,
  }
}

export function buildSettlementSuggestion(
  lines: readonly SettlementSuggestionLine[],
  options: SettlementSuggestionOptions = {},
): SettlementSuggestion {
  const groups = groupByCode(lines)
  if (options.occurrenceAmount !== undefined && options.occurrenceAmount !== null) {
    return buildOccurrenceLevelSuggestion(groups, options.occurrenceAmount)
  }

  const rows: SettlementSuggestionRow[] = []
  const unpaid: { productCode: string; referenceCents: bigint | null }[] = []
  for (const [productCode, group] of groups) {
    const referenceCents = sumReference(group)
    const verdict = judgeGroup(group)
    if (verdict.kind === 'unpaid') unpaid.push({ productCode, referenceCents })
    if (verdict.kind !== 'row') continue
    rows.push({
      amount: formatCentsAsDecimal(verdict.amountCents),
      amountCents: verdict.amountCents,
      amountSource: verdict.amountSource,
      productCode,
      referenceCents,
    })
  }
  return { rows, unpaid, unsplitAmountCents: null }
}

/**
 * Os itens da ocorrência casados com o que o registro copiou (`itemValues`, na mesma ordem) e com a nota. A conta de
 * quantidade × valor unitário só vale na unidade da nota: em outra unidade (a caixa de fallback), a tela não tem o
 * preço e não inventa — a linha inteira, sem quantidade, vale o `vProd` seja qual for a unidade.
 */
export function buildSettlementSuggestionLines(
  input: Readonly<{
    itemValues?: readonly TripOccurrenceItemValue[]
    items: readonly TripOccurrenceDetailItem[]
    products: readonly TripDocumentProduct[]
  }>,
): readonly SettlementSuggestionLine[] {
  return input.items.map((item, index) => {
    const product = input.products.find((candidate) => candidate.code === item.code)
    const copied = input.itemValues?.[index]
    const recorded = copied?.productCode === item.code ? copied : undefined
    const isNoteUnit = item.quantity === null || item.unit === product?.commercialUnit
    return {
      code: item.code,
      declaredAmount: recorded === undefined ? item.declaredAmount : recorded.declaredAmount,
      quantity: item.quantity,
      totalValue: product?.totalValue ?? null,
      unitValue: isNoteUnit ? (recorded?.unitValue ?? product?.unitValue ?? null) : null,
    }
  })
}
