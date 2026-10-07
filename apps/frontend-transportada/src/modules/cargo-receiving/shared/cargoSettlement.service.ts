/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isPositiveDecimalAmount,
  maskAmountFromDecimal,
  unmaskAmountInput,
} from '@/modules/trip/shared/occurrenceSettlementMoney.service'

import {
  CARGO_SETTLEMENT_AMOUNT_SOURCE,
  CARGO_SETTLEMENT_PAYER_KINDS,
} from './cargoOccurrenceCase.constant'
import type { CargoSettlementItem, CargoSettlementPayerKind } from './cargoOccurrenceCase.types'

export type SettlementDraftRow = Readonly<{
  /** O valor MASCARADO que o campo mostra (`1.234,56`); o decimal sai de `unmaskAmountInput`. */
  amount: string
  id: string
  payerKind: CargoSettlementPayerKind
  productCode: string
}>

export type SettlementRowIssue = 'amountRequired' | 'productCodeDuplicated' | 'productCodeRequired'

const DEFAULT_PAYER_KIND: CargoSettlementPayerKind = 'carrier'

/** Uma linha por item, com o valor em decimal: sem `payerId` (a avaria não tem viagem, logo nem motorista). */
export function buildSettlementItems(rows: readonly SettlementDraftRow[]): CargoSettlementItem[] {
  return rows.map((row) => ({
    amount: unmaskAmountInput(row.amount),
    amountSource: CARGO_SETTLEMENT_AMOUNT_SOURCE.manual,
    payerKind: row.payerKind,
    productCode: row.productCode.trim(),
  }))
}

/**
 * A linha que não pode seguir diz o que falta, nunca some em silêncio. O item repetido é recusado aqui: o servidor
 * grava UM acerto por item, e a segunda linha do mesmo item o sobrescreveria calada.
 */
export function listSettlementRowIssues(
  rows: readonly SettlementDraftRow[],
): ReadonlyMap<string, readonly SettlementRowIssue[]> {
  const seen = new Set<string>()
  const issues = new Map<string, readonly SettlementRowIssue[]>()
  for (const row of rows) {
    const code = row.productCode.trim()
    const rowIssues: SettlementRowIssue[] = []
    if (code === '') rowIssues.push('productCodeRequired')
    else if (seen.has(code)) rowIssues.push('productCodeDuplicated')
    seen.add(code)
    if (!isPositiveDecimalAmount(unmaskAmountInput(row.amount))) rowIssues.push('amountRequired')
    if (rowIssues.length > 0) issues.set(row.id, rowIssues)
  }
  return issues
}

function toOfferedPayerKind(kind: string): CargoSettlementPayerKind {
  return CARGO_SETTLEMENT_PAYER_KINDS.find((offered) => offered === kind) ?? DEFAULT_PAYER_KIND
}

/** O acerto gravado volta ao formulário com o valor mascarado; o pagador que a tela não oferece (motorista) vira o padrão. */
export function toSettlementDraftRows(
  input: Readonly<{ createId: (index: number) => string; items: readonly CargoSettlementItem[] }>,
): SettlementDraftRow[] {
  return input.items.map((item, index) => ({
    amount: maskAmountFromDecimal(item.amount),
    id: input.createId(index),
    payerKind: toOfferedPayerKind(item.payerKind),
    productCode: item.productCode,
  }))
}
