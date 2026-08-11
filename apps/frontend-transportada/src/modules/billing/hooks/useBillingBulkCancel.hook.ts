/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { BillingClient, BillingInvoiceSummary } from '../shared/billingClient.service'
import {
  cancelBillingInvoices,
  resolveBillingCancelProgress,
  selectCancellableInvoices,
  validateBillingCancelReason,
  type BillingCancelOutcome,
  type BillingCancelReasonError,
} from '../shared/billingBulkCancel.service'
import { BILLING_INVOICE_LIST_QUERY_KEY } from '../shared/billingQueryKey.constant'

export type BillingBulkCancelController = ReturnType<typeof useBillingBulkCancel>

type UseBillingBulkCancelInput = Readonly<{
  canCancel: boolean
  client: BillingClient
  invoices: readonly BillingInvoiceSummary[]
  onCancelled: () => void
  selectedIds: readonly string[]
}>

export function useBillingBulkCancel(input: UseBillingBulkCancelInput) {
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<BillingCancelReasonError | null>(null)
  const [outcomes, setOutcomes] = useState<readonly BillingCancelOutcome[]>([])
  const [completed, setCompleted] = useState(0)

  const selection = selectCancellableInvoices({
    invoices: input.invoices,
    selectedIds: input.selectedIds,
  })

  const cancelMutation = useMutation({
    mutationFn: () =>
      cancelBillingInvoices({
        client: input.client,
        invoices: selection.cancellable,
        onProgress: (event) => {
          setCompleted(event.completed)
          setOutcomes((current) => [...current, event.outcome])
        },
        reason,
      }),
    onSuccess: async (results) => {
      setOutcomes(results)
      await queryClient.invalidateQueries({ queryKey: [BILLING_INVOICE_LIST_QUERY_KEY] })
      // Só depois da lista voltar do servidor a seleção perde sentido — antes disso o operador
      // ainda está lendo quais faturas saíram.
      if (results.every((outcome) => outcome.errorCode === undefined)) input.onCancelled()
    },
  })

  function close(): void {
    setIsOpen(false)
    setReason('')
    setReasonError(null)
    setOutcomes([])
    setCompleted(0)
  }

  function confirm(): void {
    const error = validateBillingCancelReason(reason)
    setReasonError(error)
    if (error !== null || selection.cancellable.length === 0) return
    setOutcomes([])
    setCompleted(0)
    cancelMutation.mutate()
  }

  return {
    alreadyCancelledCount: selection.alreadyCancelled.length,
    canCancel: input.canCancel,
    cancellable: selection.cancellable,
    close,
    confirm,
    isOpen,
    isSubmitting: cancelMutation.isPending,
    open: () => {
      if (!input.canCancel) return
      setIsOpen(true)
    },
    outcomes,
    progress: resolveBillingCancelProgress({
      completed,
      outcomes,
      total: selection.cancellable.length,
    }),
    reason,
    reasonError,
    setReason: (value: string) => {
      setReason(value)
      setReasonError(null)
    },
  }
}
