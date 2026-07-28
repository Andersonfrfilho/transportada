/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import {
  createCteBatchController,
  getCteBatchClient,
} from '@/modules/cte-batch/hooks/useCteBatchWorkspace.hook'

import {
  collectManifestCteCandidates,
  retainSelectableCandidates,
  toggleCteCandidate,
  type MdfeCteCandidate,
} from '../shared/mdfeManifestCteSource.service'
import {
  EMPTY_MDFE_MANIFEST_FORM,
  toggleDriver,
  type MdfeManifestFormDraft,
} from '../shared/mdfeManifestForm.service'

const CTE_BATCHES_QUERY_KEY = 'mdfe-cte-batches'
const CTE_BATCH_ITEMS_QUERY_KEY = 'mdfe-cte-batch-items'
const CTE_BATCH_PAGE_SIZE = 25

export type MdfeManifestCreationController = ReturnType<typeof useMdfeManifestCreation>

type CreationInput = Readonly<{
  companyId?: string
  permissions: readonly string[]
}>

export function useMdfeManifestCreation(input: CreationInput) {
  const client = getCteBatchClient()
  const controller = createCteBatchController({
    client,
    permissions: input.companyId === undefined ? [] : input.permissions,
  })
  const canReadBatches = controller.canManageBatches || controller.canSubmitBatches

  const [selectedBatchId, setSelectedBatchId] = useState<null | string>(null)
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<readonly string[]>([])
  const [draft, setDraft] = useState<MdfeManifestFormDraft>(EMPTY_MDFE_MANIFEST_FORM)

  const batchesQuery = useQuery({
    enabled: canReadBatches,
    queryFn: () => client.listBatches({ cursor: null, limit: CTE_BATCH_PAGE_SIZE }),
    queryKey: [CTE_BATCHES_QUERY_KEY, input.companyId] as const,
  })
  const itemsQuery = useQuery({
    enabled: canReadBatches && selectedBatchId !== null,
    queryFn: () => client.listItems(selectedBatchId ?? ''),
    queryKey: [CTE_BATCH_ITEMS_QUERY_KEY, input.companyId, selectedBatchId] as const,
  })

  const batches = batchesQuery.data?.items ?? []
  const selectedBatch = batches.find((batch) => batch.id === selectedBatchId) ?? null
  const candidates: readonly MdfeCteCandidate[] =
    selectedBatch === null
      ? []
      : collectManifestCteCandidates({
          batch: { id: selectedBatch.id, name: selectedBatch.name },
          items: itemsQuery.data ?? [],
        })
  const documentIds = retainSelectableCandidates(candidates, selectedDocumentIds)

  return {
    batches,
    canReadBatches,
    candidates,
    documentIds,
    draft,
    isLoadingBatches: batchesQuery.isPending && canReadBatches,
    isLoadingCandidates: selectedBatchId !== null && itemsQuery.isPending,
    reset: () => {
      setSelectedBatchId(null)
      setSelectedDocumentIds([])
      setDraft(EMPTY_MDFE_MANIFEST_FORM)
    },
    selectBatch: (batchId: null | string) => {
      setSelectedBatchId(batchId)
      setSelectedDocumentIds([])
    },
    selectedBatchId,
    setDraftField: <TField extends keyof MdfeManifestFormDraft>(
      field: TField,
      value: MdfeManifestFormDraft[TField],
    ) => setDraft((current) => ({ ...current, [field]: value })),
    toggleCandidate: (fiscalDocumentId: string) =>
      setSelectedDocumentIds((current) => toggleCteCandidate(current, fiscalDocumentId)),
    toggleDriverSelection: (driverId: string) =>
      setDraft((current) => ({ ...current, driverIds: toggleDriver(current.driverIds, driverId) })),
  }
}
