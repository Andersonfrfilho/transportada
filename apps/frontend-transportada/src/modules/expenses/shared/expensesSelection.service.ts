/* Copyright (c) 2026 Ada Technology. MIT License. */
import { sumScaledAmounts } from '@/modules/shared/decimalAmount.service'

import type { ExpenseOccurrenceListItem } from './expenses.types'

export type ExpenseListSearch = Readonly<{
  /** Data civil `AAAA-MM-DD`; vazio = sem limite. */
  dueFrom: string
  dueTo: string
  /** Trecho do nome da conta, da categoria, do tipo ou de quem aparece na linha. */
  text: string
}>

export const EMPTY_LIST_SEARCH: ExpenseListSearch = { dueFrom: '', dueTo: '', text: '' }

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

function searchableText(item: ExpenseOccurrenceListItem): string {
  return normalize(
    [
      item.expenseName,
      item.categoryName,
      item.subtypeName,
      item.payeeDriverName,
      item.employeeName,
      item.employeeDriverName,
      item.employeeUserName,
      item.causedByName,
      item.causedByDriverName,
      item.causedByUserName,
    ]
      .filter((part): part is string => typeof part === 'string')
      .join(' '),
  )
}

/** Spec 333: busca por nome e faixa de vencimento sobre o que o servidor já trouxe do mês. */
export function filterListItems(
  items: readonly ExpenseOccurrenceListItem[],
  search: ExpenseListSearch,
): readonly ExpenseOccurrenceListItem[] {
  const text = normalize(search.text)
  return items.filter((item) => {
    if (search.dueFrom !== '' && item.dueDate < search.dueFrom) return false
    if (search.dueTo !== '' && item.dueDate > search.dueTo) return false
    return text === '' || searchableText(item).includes(text)
  })
}

/** Só conta em aberto entra em ação rápida: paga ou cancelada não tem o que fazer. */
export function selectableItems(
  items: readonly ExpenseOccurrenceListItem[],
): readonly ExpenseOccurrenceListItem[] {
  return items.filter((item) => item.status === 'open')
}

export function summarizeSelection(
  items: readonly ExpenseOccurrenceListItem[],
  selectedIds: ReadonlySet<string>,
): Readonly<{ count: number; expected: string }> {
  const chosen = items.filter((item) => selectedIds.has(item.id) && item.status === 'open')
  return { count: chosen.length, expected: sumScaledAmounts(chosen.map((i) => i.expectedAmount)) }
}

export type BulkRunResult = Readonly<{ failed: readonly string[]; succeeded: number }>

/** Em série, uma por vez: a falha de uma conta não derruba as outras, e nenhuma fica pela metade. */
export async function runBulk(
  ids: readonly string[],
  action: (id: string) => Promise<unknown>,
): Promise<BulkRunResult> {
  const failed: string[] = []
  let succeeded = 0
  for (const id of ids) {
    try {
      await action(id)
      succeeded += 1
    } catch {
      failed.push(id)
    }
  }
  return { failed, succeeded }
}
