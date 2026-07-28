/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { CteIssuanceTracking } from '@/modules/cte-issuance/components/CteIssuanceStatusPanel.component'
import {
  getCteIssuanceClient,
  useCteIssuanceStatus,
} from '@/modules/cte-issuance/hooks/useCteIssuanceStatus.hook'
import { createCteDocumentDownloadController } from '@/modules/cte-issuance/shared/cteDocumentDownload.service'

import { createCteBatchDrafts } from '../shared/cteBatchDraft.service'
import { CTE_BATCH_ITEM_STATUS, type CteBatchItem } from '../shared/cteBatchItem.types'
import {
  summarizeBatchItems,
  validateCancellationJustification,
  type CteCancellationJustificationError,
} from '../shared/cteBatchItemActions.service'
import { createCteBatchController, getCteBatchClient } from './useCteBatchWorkspace.hook'

const CTE_BATCH_ITEMS_QUERY_KEY = 'cte-batch-items'
const CTE_BATCHES_QUERY_KEY = 'cte-batches'
const REPROCESS_REASON = 'Reprocessamento solicitado pelo operador do lote'
const ITEM_POLL_INTERVAL_MS = 5_000

export type CteBatchItemsController = ReturnType<typeof useCteBatchItems>

type UseCteBatchItemsInput = Readonly<{
  batchId?: string
  companyId?: string
  permissions: readonly string[]
}>

export function useCteBatchItems(input: UseCteBatchItemsInput) {
  const client = getCteBatchClient()
  const batchController = createCteBatchController({
    client,
    permissions: input.companyId === undefined ? [] : input.permissions,
  })
  const drafts = createCteBatchDrafts()
  const queryClient = useQueryClient()
  const [trackedItemId, setTrackedItemId] = useState<string | undefined>(undefined)
  const [cancellationItemId, setCancellationItemId] = useState<string | undefined>(undefined)
  const [justification, setJustification] = useState('')
  const [justificationError, setJustificationError] = useState<
    CteCancellationJustificationError | undefined
  >(undefined)
  const issuance = useCteIssuanceStatus({
    ...(input.batchId === undefined ? {} : { batchId: input.batchId }),
    ...(trackedItemId === undefined ? {} : { batchItemId: trackedItemId }),
    ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
    permissions: input.permissions,
  })
  const issuanceClient = getCteIssuanceClient()
  const download = createCteDocumentDownloadController({
    openUrl: (url) => {
      if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener')
    },
  })

  const itemsQuery = useQuery({
    enabled: input.batchId !== undefined && issuance.canSubmitCte,
    queryFn: () => client.listItems(input.batchId ?? ''),
    queryKey: [CTE_BATCH_ITEMS_QUERY_KEY, input.companyId, input.batchId] as const,
    refetchInterval: (query) =>
      (query.state.data ?? []).some(
        (item) =>
          item.status === CTE_BATCH_ITEM_STATUS.IN_FLIGHT ||
          item.status === CTE_BATCH_ITEM_STATUS.PENDING ||
          item.status === CTE_BATCH_ITEM_STATUS.RETRY_SCHEDULED,
      )
        ? ITEM_POLL_INTERVAL_MS
        : false,
  })

  const items: readonly CteBatchItem[] = itemsQuery.data ?? []
  const trackedItem = items.find((item) => item.id === trackedItemId)
  const cancellationItem = items.find((item) => item.id === cancellationItemId)

  const removeItemMutation = useMutation({
    mutationFn: (item: Readonly<{ id: string }>) => {
      if (input.batchId === undefined)
        return Promise.reject(new Error('CTE_BATCH_ITEM_UNAVAILABLE'))
      return batchController.removeItem({ batchId: input.batchId, itemId: item.id })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CTE_BATCH_ITEMS_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [CTE_BATCHES_QUERY_KEY] }),
      ])
    },
  })

  const downloadMutation = useMutation({
    mutationFn: async (target: Readonly<{ accessKey: null | string; id: string }>) => {
      if (input.batchId === undefined || target.accessKey === null) {
        throw new Error('CTE_DOCUMENT_DOWNLOAD_UNAVAILABLE')
      }
      const page = await issuanceClient.listDocuments({
        batchId: input.batchId,
        batchItemId: target.id,
      })
      download.openDocumentForAccessKey({ accessKey: target.accessKey, documents: page.items })
    },
  })

  const issuanceTracking: CteIssuanceTracking = {
    ...(downloadMutation.error === null
      ? {}
      : { downloadErrorCode: downloadMutation.error.message }),
    isDownloading: downloadMutation.isPending,
    isReprocessing: issuance.reprocessMutation.isPending,
    timeline: issuance.timeline,
    viewModel: issuance.viewModel,
  }

  function openCancellation(item: CteBatchItem): void {
    setCancellationItemId(item.id)
    setJustification('')
    setJustificationError(undefined)
  }

  function closeCancellation(): void {
    setCancellationItemId(undefined)
    setJustification('')
    setJustificationError(undefined)
  }

  function changeJustification(value: string): void {
    setJustification(value)
    setJustificationError(undefined)
  }

  /** A SEFAZ recusa xJust curta — bloqueia antes de gastar a chave de idempotência. */
  function confirmCancellation(): void {
    if (input.batchId === undefined || cancellationItemId === undefined) return
    const failure = validateCancellationJustification(justification)
    if (failure !== null) {
      setJustificationError(failure)
      return
    }
    issuance.cancelMutation.mutate(
      {
        batchId: input.batchId,
        batchItemId: cancellationItemId,
        idempotencyKey: issuance.newIdempotencyKey(),
        ...drafts.createItemCancelDraft({ justification }),
      },
      { onSuccess: closeCancellation },
    )
  }

  function reprocessItem(item: Readonly<{ id: string }>): void {
    if (input.batchId === undefined) return
    issuance.reprocessMutation.mutate({
      batchId: input.batchId,
      batchItemId: item.id,
      idempotencyKey: issuance.newIdempotencyKey(),
      reason: REPROCESS_REASON,
    })
  }

  return {
    canCancelCte: issuance.canCancelCte,
    canSubmitCte: issuance.canSubmitCte,
    cancelMutation: issuance.cancelMutation,
    cancellationItem,
    changeJustification,
    closeCancellation,
    closeTracking: () => setTrackedItemId(undefined),
    confirmCancellation,
    downloadItemXml: (item: CteBatchItem) => downloadMutation.mutate(item),
    downloadMutation,
    issuanceTracking,
    issueMutation: issuance.issueMutation,
    items,
    itemsQuery,
    justification,
    justificationError,
    openCancellation,
    removeItem: (item: CteBatchItem) => removeItemMutation.mutate(item),
    removeItemMutation,
    reprocessItem,
    reprocessMutation: issuance.reprocessMutation,
    selectItem: (item: CteBatchItem) =>
      setTrackedItemId((current) => (current === item.id ? undefined : item.id)),
    summary: summarizeBatchItems(items),
    trackedItem,
    transmitBatch: () => {
      if (input.batchId === undefined) return
      issuance.issueMutation.mutate({
        batchId: input.batchId,
        idempotencyKey: issuance.newIdempotencyKey(),
      })
    },
  }
}
