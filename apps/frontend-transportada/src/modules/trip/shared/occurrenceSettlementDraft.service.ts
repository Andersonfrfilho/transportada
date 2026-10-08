/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isPositiveDecimalAmount,
  maskAmountFromDecimal,
  unmaskAmountInput,
} from './occurrenceSettlementMoney.service'
import type { SettlementSuggestionRow } from './occurrenceSettlementSuggestion.service'
import type {
  OccurrenceSettlementAmountSource,
  OccurrenceSettlementItem,
  OccurrenceSettlementItemView,
  OccurrenceSettlementPayerKind,
} from './tripOccurrenceFeed.service'

export type OccurrenceSettlementDraftRow = Readonly<{
  /** O valor **mascarado** que o campo mostra (`1.234,56`); o decimal sai de `unmaskAmountInput`. */
  amount: string
  /** Spec 247 RF12: `nfe` só enquanto o valor é o que a nota sugeriu; o operador que o digita passa a `manual`. */
  amountSource: OccurrenceSettlementAmountSource
  id: string
  payerId: string
  payerKind: OccurrenceSettlementPayerKind
  productCode: string
}>

/** A chave pelo índice fazia o foco pular ao remover uma linha do meio: a identidade é da linha. */
function nextRowId(): string {
  return `row-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`
}

export function createEmptySettlementRow(): OccurrenceSettlementDraftRow {
  return {
    amount: '',
    amountSource: 'manual',
    id: nextRowId(),
    payerId: '',
    payerKind: 'driver',
    productCode: '',
  }
}

export function hasSettlementProductCode(row: OccurrenceSettlementDraftRow): boolean {
  return row.productCode.trim().length > 0
}

export function hasSettlementAmount(row: OccurrenceSettlementDraftRow): boolean {
  return isPositiveDecimalAmount(unmaskAmountInput(row.amount))
}

export function isSettlementDraftPristine(rows: readonly OccurrenceSettlementDraftRow[]): boolean {
  return rows.length === 1 && rows.every((row) => row.amount === '' && row.productCode === '')
}

/** O acerto já gravado reabre como rascunho: o valor chega mascarado, nunca como `10.0000`. */
export function buildDraftRowsFromSavedItems(
  items: readonly OccurrenceSettlementItemView[],
): readonly OccurrenceSettlementDraftRow[] {
  return items.map((item) => ({
    amount: maskAmountFromDecimal(item.amount),
    amountSource: item.amountSource,
    id: nextRowId(),
    payerId: item.payerId ?? '',
    payerKind: item.payerKind,
    productCode: item.productCode,
  }))
}

export function buildDraftRowsFromSuggestion(
  rows: readonly SettlementSuggestionRow[],
): readonly OccurrenceSettlementDraftRow[] {
  return rows.map((row) => ({
    amount: maskAmountFromDecimal(row.amount),
    amountSource: row.amountSource,
    id: nextRowId(),
    payerId: '',
    payerKind: 'driver',
    productCode: row.productCode,
  }))
}

export function buildSettlementItems(
  rows: readonly OccurrenceSettlementDraftRow[],
): OccurrenceSettlementItem[] {
  return rows.map((row) => ({
    amount: unmaskAmountInput(row.amount),
    amountSource: row.amountSource,
    payerKind: row.payerKind,
    productCode: row.productCode.trim(),
    ...(row.payerKind === 'driver' && row.payerId.trim().length > 0
      ? { payerId: row.payerId.trim() }
      : {}),
  }))
}

const dayFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })

export function formatReimbursedDay(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : dayFormatter.format(moment)
}
