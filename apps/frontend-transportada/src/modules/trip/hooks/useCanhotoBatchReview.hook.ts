/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useTripDeliveryProofsQuery } from '../queries/useTripDeliveryProofs.query'
import type { CanhotoBatchApprovalResult } from '../shared/canhotoBatchApproval.service'
import {
  resolveCanhotoBatchSelection,
  type CanhotoBatchItem,
  type CanhotoBatchSelection,
  type ResolveCanhotoBatchSelectionInput,
} from '../shared/canhotoBatchSelection.service'
import type { CanhotoBatchDialogStatus } from '../components/TripCanhotoBatchDialog.component'
import type { TripDocumentSelectionController } from './useTripDocumentSelection.hook'

type UseCanhotoBatchReviewInput = Readonly<{
  approveBatch: (input: {
    readonly documentIds: readonly string[]
    readonly tripId: string
  }) => Promise<CanhotoBatchApprovalResult>
  canManage: boolean
  companyId: string
  documents: ResolveCanhotoBatchSelectionInput['documents']
  selection: TripDocumentSelectionController
  tripId: string
  tripStatus: ResolveCanhotoBatchSelectionInput['tripStatus']
}>

export type CanhotoBatchFailureNotice = Readonly<{ failedCount: number; totalCount: number }>

type StoredFailure = CanhotoBatchFailureNotice & Readonly<{ tripId: string }>

const NO_ITEMS: readonly CanhotoBatchItem[] = []

/**
 * Spec 222 T2.8: do maço marcado ao diálogo de conferência. O que o botão oferece sai da consulta dos
 * comprovantes da viagem (só com `trip.manage` e seleção); abrir relê (RF-A9) e o diálogo só mostra
 * fotos depois dessa leitura; confirmar tira da seleção o que saiu da fila — aprovado ou em conflito
 * (409) — e deixa marcado só o que falhou, com a contagem "N de M" para o aviso.
 */
export function useCanhotoBatchReview(input: UseCanhotoBatchReviewInput) {
  const { selection, tripId } = input
  const [isOpen, setIsOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [storedFailure, setStoredFailure] = useState<StoredFailure | null>(null)
  const proofsQuery = useTripDeliveryProofsQuery({
    canManage: input.canManage,
    companyId: input.companyId,
    hasSelection: selection.selectedIds.size > 0,
    tripId,
  })
  const batch: CanhotoBatchSelection = input.canManage
    ? resolveCanhotoBatchSelection({
        documents: input.documents,
        proofs: proofsQuery.data ?? [],
        selectedIds: selection.selectedIds,
        tripStatus: input.tripStatus,
      })
    : { eligible: NO_ITEMS, excludedCount: 0, overflowCount: 0 }

  function resolveStatus(): CanhotoBatchDialogStatus {
    if (isSubmitting) return 'submitting'
    if (isRefreshing) return 'loading'
    return proofsQuery.isError ? 'failed' : 'ready'
  }
  const status = resolveStatus()
  const isShowingItems = status === 'ready' || status === 'submitting'

  async function open(): Promise<void> {
    setStoredFailure(null)
    setIsOpen(true)
    setIsRefreshing(true)
    try {
      await proofsQuery.refetch()
    } finally {
      setIsRefreshing(false)
    }
  }

  function close(): void {
    setIsOpen(false)
  }

  async function confirm(documentIds: readonly string[]): Promise<void> {
    setIsSubmitting(true)
    try {
      const result = await input.approveBatch({ documentIds, tripId })
      selection.toggleMany([...result.approved, ...result.conflicted], false)
      setStoredFailure(
        result.failed.length === 0
          ? null
          : { failedCount: result.failed.length, totalCount: documentIds.length, tripId },
      )
      setIsOpen(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const failure: CanhotoBatchFailureNotice | null =
    storedFailure === null || storedFailure.tripId !== tripId
      ? null
      : { failedCount: storedFailure.failedCount, totalCount: storedFailure.totalCount }

  return {
    batch,
    close,
    confirm,
    dialog: {
      isOpen,
      items: isShowingItems ? batch.eligible : NO_ITEMS,
      overflowCount: isShowingItems ? batch.overflowCount : 0,
      status,
    },
    failure,
    open,
  }
}
