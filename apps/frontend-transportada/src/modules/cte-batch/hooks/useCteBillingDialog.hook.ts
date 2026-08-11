/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { BILLING_INVOICE_LIST_QUERY_KEY } from '@/modules/billing/hooks/useBillingInvoiceTable.hook'
import { getBillingClient } from '@/modules/billing/hooks/useBillingWorkspace.hook'
import {
  collectBillableCtesForBatches,
  groupEligibleCtesByCustomer,
  type BillingBatchCteGroup,
} from '@/modules/billing/shared/billingBatchSelection.service'
import type { BillingPreviewGroup } from '@/modules/billing/shared/billingClient.service'
import {
  BILLING_DUE_DATE_ERROR,
  resolveBillingProgress,
  submitBillingGroups,
  validateBillingDueDate,
  type BillingDueDateError,
  type BillingGroupOutcome,
} from '@/modules/billing/shared/billingFromSelection.service'

import { COMPANY_CTE_ITEMS_QUERY_KEY } from '../queries/cteBatchItems.query'
import type { BillableCte } from '../shared/cteBatchBilling.service'

const CTE_BILLING_PREVIEW_QUERY_KEY = 'cte-billing-preview'
const CTE_BILLING_BATCH_QUERY_KEY = 'cte-billing-batch'

export type CteBillingGroup = BillingBatchCteGroup | BillingPreviewGroup

export type CteBillingDialogController = ReturnType<typeof useCteBillingDialog>

type UseCteBillingDialogInput = Readonly<{
  batchIds: null | readonly string[]
  onClose: () => void
  request: null | readonly BillableCte[]
}>

function readErrorCode(error: unknown): null | string {
  return error instanceof Error && error.message !== '' ? error.message : null
}

export function useCteBillingDialog(input: UseCteBillingDialogInput) {
  const queryClient = useQueryClient()
  const [dueDate, setDueDate] = useState('')
  const [dueDateError, setDueDateError] = useState<BillingDueDateError | null>(null)
  const [outcomes, setOutcomes] = useState<readonly BillingGroupOutcome[]>([])
  const [completed, setCompleted] = useState(0)

  const cteIds = (input.request ?? []).map((billable) => billable.fiscalDocumentId)
  const batchIds = input.batchIds ?? []
  const client = getBillingClient()

  const previewQuery = useQuery({
    enabled: cteIds.length > 0,
    queryFn: () => client.previewInvoice({ cteIds }),
    queryKey: [CTE_BILLING_PREVIEW_QUERY_KEY, ...cteIds],
  })

  // O lote inteiro é resolvido pela listagem de elegíveis, que pagina por cursor, e agrupado por
  // tomador aqui mesmo — um grupo por tomador, que é uma fatura por tomador.
  const batchQuery = useQuery({
    enabled: batchIds.length > 0,
    queryFn: async () => {
      const collection = await collectBillableCtesForBatches({
        batchIds,
        listPage: (query) => client.listBillableCtesForBatches(query),
      })
      return {
        groups: groupEligibleCtesByCustomer(collection.items),
        truncated: collection.truncated,
      }
    },
    queryKey: [CTE_BILLING_BATCH_QUERY_KEY, ...batchIds],
  })

  const groups: readonly CteBillingGroup[] =
    input.batchIds === null ? (previewQuery.data?.groups ?? []) : (batchQuery.data?.groups ?? [])
  const blocked = input.batchIds === null ? (previewQuery.data?.blocked ?? []) : []

  const submitMutation = useMutation({
    mutationFn: () =>
      submitBillingGroups({
        client,
        dueDate: dueDate.trim(),
        groups,
        onProgress: (event) => {
          setCompleted(event.completed)
          setOutcomes((current) => [...current, event.outcome])
        },
      }),
    onSuccess: async (results) => {
      setOutcomes(results)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [COMPANY_CTE_ITEMS_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [BILLING_INVOICE_LIST_QUERY_KEY] }),
      ])
    },
  })

  function close(): void {
    setDueDate('')
    setDueDateError(null)
    setOutcomes([])
    setCompleted(0)
    input.onClose()
  }

  function confirm(): void {
    const error = validateBillingDueDate(dueDate)
    setDueDateError(error)
    if (error !== null || groups.length === 0) return
    setOutcomes([])
    setCompleted(0)
    submitMutation.mutate()
  }

  return {
    blocked,
    close,
    confirm,
    dueDate,
    dueDateError,
    groups,
    isLoading: previewQuery.isLoading || batchQuery.isLoading,
    isOpen: input.request !== null || input.batchIds !== null,
    isSubmitting: submitMutation.isPending,
    loadErrorCode: readErrorCode(previewQuery.error ?? batchQuery.error),
    outcomes,
    progress: resolveBillingProgress({
      completed,
      outcomes,
      total: groups.length,
      totalCteCount: groups.reduce((sum, group) => sum + group.cteCount, 0),
    }),
    setDueDate: (value: string) => {
      setDueDate(value)
      setDueDateError(null)
    },
    truncated: batchQuery.data?.truncated ?? false,
  }
}

export { BILLING_DUE_DATE_ERROR }
