/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T26 (RF32): a seleção é do operador, linha a linha — o total do rodapé acompanha ela,
 * e o fechamento parte do que ela cobre. `sumScaledAmounts` (shared) faz a conta em inteiro
 * escalado, nunca `number`/`parseFloat`.
 */
import { sumScaledAmounts } from '@/modules/shared/decimalAmount.service'

import type { OccurrenceChargeReportRow } from './extraCharges.types'

export function toggleReimbursementRow(
  selectedIds: ReadonlySet<string>,
  rowId: string,
): ReadonlySet<string> {
  const next = new Set(selectedIds)
  if (next.has(rowId)) next.delete(rowId)
  else next.add(rowId)
  return next
}

export function sumSelectedReimbursementAmounts(
  rows: readonly OccurrenceChargeReportRow[],
  selectedIds: ReadonlySet<string>,
): string {
  const amounts = rows.filter((row) => selectedIds.has(row.id)).map((row) => row.amount)
  return amounts.length === 0 ? '0.00' : sumScaledAmounts(amounts)
}

/**
 * Revisão de design da T30: a linha que não pode entrar no fechamento **se anuncia** na própria
 * linha. Antes ela aceitava a marcação e só o rodapé, depois, dizia que a seleção era inválida —
 * o operador descobria o problema longe de onde ele estava.
 */
export const ROW_INELIGIBILITY = {
  MISSING_CONTRACTOR: 'MISSING_CONTRACTOR',
  OTHER_CONTRACTOR: 'OTHER_CONTRACTOR',
} as const
export type RowIneligibility = (typeof ROW_INELIGIBILITY)[keyof typeof ROW_INELIGIBILITY]

/** O contratante que a seleção já fixou; `null` enquanto nada está marcado. */
export function resolveSelectedContractorId(
  rows: readonly OccurrenceChargeReportRow[],
  selectedIds: ReadonlySet<string>,
): string | null {
  const selected = rows.find((row) => selectedIds.has(row.id))
  return selected?.contractorId ?? null
}

export function resolveRowIneligibility(
  row: OccurrenceChargeReportRow,
  selectedContractorId: string | null,
): RowIneligibility | null {
  if (row.contractorId === null) return ROW_INELIGIBILITY.MISSING_CONTRACTOR
  if (selectedContractorId !== null && selectedContractorId !== row.contractorId) {
    return ROW_INELIGIBILITY.OTHER_CONTRACTOR
  }
  return null
}

export type SelectionPeriod = Readonly<{
  chargeIds: readonly string[]
  contractorId: string
  periodEnd: string
  periodStart: string
}>

export const SELECTION_PERIOD_ERROR = {
  EMPTY: 'EMPTY',
  MIXED_CONTRACTOR: 'MIXED_CONTRACTOR',
  MISSING_CONTRACTOR: 'MISSING_CONTRACTOR',
} as const

/**
 * `closeBatch` (API) aceita `chargeIds` (spec 164, revisão RF32): o fechamento passa a pegar
 * exatamente as linhas marcadas, nunca mais "todas as cobranças sem lote do contratante no
 * período". `periodStart`/`periodEnd` seguem enviados — são o intervalo que as linhas marcadas
 * cobrem — mas o recorte de elegibilidade agora é a lista de ids.
 */
export function resolveSelectionPeriod(
  rows: readonly OccurrenceChargeReportRow[],
  selectedIds: ReadonlySet<string>,
): SelectionPeriod | (typeof SELECTION_PERIOD_ERROR)[keyof typeof SELECTION_PERIOD_ERROR] {
  const selected = rows.filter((row) => selectedIds.has(row.id))
  if (selected.length === 0) return SELECTION_PERIOD_ERROR.EMPTY

  const contractorIds = new Set(selected.map((row) => row.contractorId))
  if (contractorIds.size > 1) return SELECTION_PERIOD_ERROR.MIXED_CONTRACTOR
  const [contractorId] = contractorIds
  if (contractorId === null || contractorId === undefined) {
    return SELECTION_PERIOD_ERROR.MISSING_CONTRACTOR
  }

  const dates = selected.map((row) => row.chargedOn).sort()
  const periodStart = dates[0]
  const periodEnd = dates[dates.length - 1]
  if (periodStart === undefined || periodEnd === undefined) return SELECTION_PERIOD_ERROR.EMPTY

  return { chargeIds: selected.map((row) => row.id), contractorId, periodEnd, periodStart }
}
