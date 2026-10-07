/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'

import { useOccurrenceSettlementQuery } from '../queries/tripOccurrenceFeed.query'
import {
  buildDraftRowsFromSavedItems,
  buildSettlementItems,
  createEmptySettlementRow,
  hasSettlementAmount,
  hasSettlementProductCode,
  isSettlementDraftPristine,
  type OccurrenceSettlementDraftRow,
} from '../shared/occurrenceSettlementDraft.service'
import {
  sumOccurrenceSettlementAmounts,
  unmaskAmountInput,
} from '../shared/occurrenceSettlementMoney.service'
import type { OccurrenceSettlementView } from '../shared/tripOccurrenceFeed.service'
import { useOccurrenceCaseActions } from './useOccurrenceCaseActions.hook'

export type OccurrenceSettlementDraftInput = Readonly<{
  canResolve: boolean
  occurrenceId: string
  /** Sobe para o painel da tratativa: encerrar com rascunho não gravado perde o acerto digitado. */
  onDraftDirtyChange: ((isDirty: boolean) => void) | undefined
}>

/**
 * Spec 164 T23 + achado 2: o rascunho do acerto. `GET .../case/settlement` traz o que já foi gravado — o
 * carregamento inicial só acontece uma vez por ocorrência (`loadedOccurrenceIdRef`), para não sobrescrever o
 * que o operador está digitando quando a consulta refaz depois de salvar/ressarcir.
 */
export function useOccurrenceSettlementDraft({
  canResolve,
  occurrenceId,
  onDraftDirtyChange,
}: OccurrenceSettlementDraftInput) {
  const actions = useOccurrenceCaseActions()
  const settlementQuery = useOccurrenceSettlementQuery({ enabled: canResolve, occurrenceId })
  const [rows, setRows] = useState<readonly OccurrenceSettlementDraftRow[]>([
    createEmptySettlementRow(),
  ])
  const [lastResult, setLastResult] = useState<null | OccurrenceSettlementView>(null)
  const [showValidation, setShowValidation] = useState(false)
  const loadedOccurrenceIdRef = useRef<null | string>(null)

  useEffect(() => {
    if (settlementQuery.data === undefined) return
    if (loadedOccurrenceIdRef.current === occurrenceId) return
    loadedOccurrenceIdRef.current = occurrenceId
    if (settlementQuery.data.items.length === 0) return
    setRows(buildDraftRowsFromSavedItems(settlementQuery.data.items))
    setLastResult(settlementQuery.data)
  }, [occurrenceId, settlementQuery.data])

  const hasInvalidRow = rows.some(
    (row) => !hasSettlementProductCode(row) || !hasSettlementAmount(row),
  )

  function replaceRows(nextRows: readonly OccurrenceSettlementDraftRow[]): void {
    setRows(nextRows)
    onDraftDirtyChange?.(true)
  }

  function updateRow(id: string, patch: Partial<OccurrenceSettlementDraftRow>): void {
    replaceRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function addRow(): void {
    replaceRows([...rows, createEmptySettlementRow()])
  }

  function removeRow(id: string): void {
    replaceRows(rows.filter((row) => row.id !== id))
  }

  /** Linha incompleta parava o envio caladamente — agora ela para o envio **dizendo**. */
  function submit(): void {
    setShowValidation(true)
    if (hasInvalidRow) return

    actions.recordSettlement.mutate(
      { items: buildSettlementItems(rows), occurrenceId },
      {
        /** `PUT` substitui a lista inteira — os itens gravados nascem sempre não ressarcidos. */
        onSuccess: (result) => {
          setShowValidation(false)
          onDraftDirtyChange?.(false)
          setLastResult({
            items: result.items.map((item) => ({ ...item, reimbursedAt: null })),
            total: result.total,
          })
        },
      },
    )
  }

  function reimburse(productCode: string): void {
    actions.reimburse.mutate({ occurrenceId, productCode })
  }

  return {
    addRow,
    clientTotal: sumOccurrenceSettlementAmounts(rows.map((row) => unmaskAmountInput(row.amount))),
    hasInvalidRow,
    hasSavedItems: (settlementQuery.data?.items.length ?? 0) > 0,
    isBusy: actions.recordSettlement.isPending,
    isLoading: settlementQuery.isLoading,
    isPristine: isSettlementDraftPristine(rows),
    isReimbursing: actions.reimburse.isPending,
    lastResult,
    reimburse,
    removeRow,
    replaceRows,
    rows,
    showValidation,
    submit,
    updateRow,
  }
}
