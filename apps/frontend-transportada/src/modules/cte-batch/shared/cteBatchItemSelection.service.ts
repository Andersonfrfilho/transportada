/* Copyright (c) 2026 Ada Technology. MIT License. */
import { sumScaledAmounts } from '@/modules/shared/decimalAmount.service'

import type { CompanyCteItem } from './cteBatchItem.types'

export type CteItemAmounts = Readonly<{
  batchId: string
  baseAmount: string
  fiscalDocumentId: null | string
  status: string
  totalAmount: string
}>

export type CteItemSelectionSummary = Readonly<{
  baseAmount: string
  count: number
  totalAmount: string
}>

export type CteItemPageState = Readonly<{
  cursor: null | string
  history: readonly (null | string)[]
}>

export const CTE_ITEM_FIRST_PAGE: CteItemPageState = { cursor: null, history: [] }

export function accumulateCteItemAmounts(
  input: Readonly<{
    items: readonly CompanyCteItem[]
    known: ReadonlyMap<string, CteItemAmounts>
  }>,
): ReadonlyMap<string, CteItemAmounts> {
  const amounts = new Map(input.known)
  for (const item of input.items) {
    amounts.set(item.id, {
      batchId: item.batchId,
      baseAmount: item.baseAmount,
      fiscalDocumentId: item.fiscalDocumentId,
      status: item.status,
      totalAmount: item.totalAmount,
    })
  }
  return amounts
}

/** A soma sobrevive à troca de página porque vem do mapa acumulado, não da página em tela. */
export function summarizeCteItemSelection(
  input: Readonly<{
    amounts: ReadonlyMap<string, CteItemAmounts>
    selectedIds: readonly string[]
  }>,
): CteItemSelectionSummary {
  const selected = input.selectedIds.flatMap((id) => {
    const amounts = input.amounts.get(id)
    return amounts === undefined ? [] : [amounts]
  })
  return {
    baseAmount: sumScaledAmounts(selected.map((amounts) => amounts.baseAmount)),
    count: selected.length,
    totalAmount: sumScaledAmounts(selected.map((amounts) => amounts.totalAmount)),
  }
}

export function nextCteItemPage(
  state: CteItemPageState,
  nextCursor: null | string,
): CteItemPageState {
  if (nextCursor === null) return state
  return { cursor: nextCursor, history: [...state.history, state.cursor] }
}

export function previousCteItemPage(state: CteItemPageState): CteItemPageState {
  const previousCursor = state.history.at(-1)
  if (previousCursor === undefined) return CTE_ITEM_FIRST_PAGE
  return { cursor: previousCursor, history: state.history.slice(0, -1) }
}

export function canGoToPreviousCteItemPage(state: CteItemPageState): boolean {
  return state.history.length > 0
}
