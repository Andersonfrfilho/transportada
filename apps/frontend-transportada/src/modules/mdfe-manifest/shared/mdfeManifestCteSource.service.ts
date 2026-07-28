/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CTE_BATCH_ITEM_STATUS } from '@/modules/cte-batch/shared/cteBatchItem.types'
import type { CteBatchItem } from '@/modules/cte-batch/shared/cteBatchItem.types'

export type MdfeCteCandidate = Readonly<{
  accessKey: string
  batchId: string
  batchName: string
  fiscalDocumentId: string
  fiscalNumber: null | string
  fiscalSeries: null | string
  totalAmount: string
}>

type CollectInput = Readonly<{
  batch: Readonly<{ id: string; name: string }>
  items: readonly CteBatchItem[]
}>

/** Só CT-e autorizado com documento fiscal gravado pode entrar num MDF-e — o resto a API recusa. */
export function collectManifestCteCandidates(input: CollectInput): readonly MdfeCteCandidate[] {
  return input.items.flatMap((item) => {
    if (item.status !== CTE_BATCH_ITEM_STATUS.AUTHORIZED) return []
    if (item.fiscalDocumentId === null || item.accessKey === null) return []
    return [
      {
        accessKey: item.accessKey,
        batchId: input.batch.id,
        batchName: input.batch.name,
        fiscalDocumentId: item.fiscalDocumentId,
        fiscalNumber: item.fiscalNumber,
        fiscalSeries: item.fiscalSeries,
        totalAmount: item.totalAmount,
      },
    ]
  })
}

export function toggleCteCandidate(
  selectedIds: readonly string[],
  fiscalDocumentId: string,
): readonly string[] {
  return selectedIds.includes(fiscalDocumentId)
    ? selectedIds.filter((selected) => selected !== fiscalDocumentId)
    : [...selectedIds, fiscalDocumentId]
}

export function retainSelectableCandidates(
  candidates: readonly MdfeCteCandidate[],
  selectedIds: readonly string[],
): readonly string[] {
  return selectedIds.filter((selected) =>
    candidates.some((candidate) => candidate.fiscalDocumentId === selected),
  )
}
