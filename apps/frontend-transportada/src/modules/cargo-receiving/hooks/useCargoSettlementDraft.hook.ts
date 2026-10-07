/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  sumOccurrenceSettlementAmounts,
  unmaskAmountInput,
} from '@/modules/trip/shared/occurrenceSettlementMoney.service'

import { useRecordCargoSettlementMutation } from '../mutations/useRecordCargoSettlement.mutation'
import type { CargoSettlementItem } from '../shared/cargoOccurrenceCase.types'
import {
  buildSettlementItems,
  listSettlementRowIssues,
  toSettlementDraftRows,
  type SettlementDraftRow,
  type SettlementRowIssue,
} from '../shared/cargoSettlement.service'

export type CargoSettlementDraftController = Readonly<{
  addRow: () => void
  errorCode: string | undefined
  isSaving: boolean
  issues: ReadonlyMap<string, readonly SettlementRowIssue[]>
  removeRow: (id: string) => void
  rows: readonly SettlementDraftRow[]
  save: () => void
  savedTotal: string | undefined
  total: string
  updateRow: (
    input: Readonly<{ id: string; patch: Partial<Omit<SettlementDraftRow, 'id'>> }>,
  ) => void
}>

type DraftInput = Readonly<{
  initialItems: readonly CargoSettlementItem[]
  occurrenceId: string
  onDirtyChange: (isDirty: boolean) => void
}>

const createRowId = (): string => crypto.randomUUID()

function emptyRow(): SettlementDraftRow {
  return { amount: '', id: createRowId(), payerKind: 'carrier', productCode: '' }
}

/**
 * O rascunho do acerto: começa do que já está gravado (ou de uma linha vazia). A linha incompleta ou repetida para o
 * envio INTEIRO e só mostra o que falta depois da primeira tentativa de salvar; salvar substitui a lista toda.
 */
export function useCargoSettlementDraft(input: DraftInput): CargoSettlementDraftController {
  const mutation = useRecordCargoSettlementMutation()
  const [rows, setRows] = useState<readonly SettlementDraftRow[]>(() =>
    input.initialItems.length === 0
      ? [emptyRow()]
      : toSettlementDraftRows({ createId: createRowId, items: input.initialItems }),
  )
  const [isValidationShown, setValidationShown] = useState(false)
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined)
  const [savedTotal, setSavedTotal] = useState<string | undefined>(undefined)
  const allIssues = listSettlementRowIssues(rows)

  function publish(next: readonly SettlementDraftRow[]): void {
    setRows(next)
    setSavedTotal(undefined)
    input.onDirtyChange(true)
  }

  function save(): void {
    setValidationShown(true)
    setErrorCode(undefined)
    if (allIssues.size > 0) return
    mutation.mutate(
      { items: buildSettlementItems(rows), occurrenceId: input.occurrenceId },
      {
        onError: (error) => setErrorCode(error.message),
        onSuccess: (result) => {
          setValidationShown(false)
          setSavedTotal(result.total)
          input.onDirtyChange(false)
        },
      },
    )
  }

  return {
    addRow: () => publish([...rows, emptyRow()]),
    errorCode,
    isSaving: mutation.isPending,
    issues: isValidationShown ? allIssues : new Map(),
    removeRow: (id) => publish(rows.filter((row) => row.id !== id)),
    rows,
    save,
    savedTotal,
    total: sumOccurrenceSettlementAmounts(rows.map((row) => unmaskAmountInput(row.amount))),
    updateRow: ({ id, patch }) =>
      publish(rows.map((row) => (row.id === id ? { ...row, ...patch } : row))),
  }
}
