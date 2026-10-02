/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 RF-A6/RF-A7: aprovar o maço é a conferência de uma nota repetida por nota — não existe
 * rota de lote, e a de uma nota já é idempotente. A fila é a mesma das ações em massa do escritório,
 * que devolve o resultado **por item**: uma falha isolada não descarta o que as irmãs já fizeram.
 */
import { CANHOTO_BATCH_CONCURRENCY } from './canhotoBatch.constant'
import type { CanhotoReviewProofInput, CanhotoReviewResult } from './canhotoReviewResult.service'
import { CANHOTO_REVIEW_ALREADY_RESOLVED_CODE } from './trip.constant'
import { runFieldActionQueue } from './tripFieldActionQueue.service'

export type CanhotoBatchFailure = Readonly<{
  documentId: string
  errorCode: string
}>

export type CanhotoBatchApprovalResult = Readonly<{
  approved: readonly string[]
  /** Outra pessoa conferiu antes (409): não é falha, a nota só sai da lista com o veredito que valeu. */
  conflicted: readonly string[]
  failed: readonly CanhotoBatchFailure[]
}>

export type ApproveCanhotoBatchInput = Readonly<{
  documentIds: readonly string[]
  review: (input: CanhotoReviewProofInput) => Promise<CanhotoReviewResult>
  tripId: string
}>

const OUTCOME = { APPROVED: 'approved', CONFLICTED: 'conflicted' } as const

export async function approveCanhotoBatch(
  input: ApproveCanhotoBatchInput,
): Promise<CanhotoBatchApprovalResult> {
  const results = await runFieldActionQueue({
    concurrency: CANHOTO_BATCH_CONCURRENCY,
    items: input.documentIds,
    run: (documentId) =>
      input
        .review({ documentId, review: { action: 'approve' }, tripId: input.tripId })
        .then(() => OUTCOME.APPROVED)
        .catch((error: unknown) => {
          if (error instanceof Error && error.message === CANHOTO_REVIEW_ALREADY_RESOLVED_CODE) {
            return OUTCOME.CONFLICTED
          }
          throw error
        }),
  })

  const documentIdsWithOutcome = (outcome: string): readonly string[] =>
    results.filter((result) => result.value === outcome).map((result) => result.item)

  return {
    approved: documentIdsWithOutcome(OUTCOME.APPROVED),
    conflicted: documentIdsWithOutcome(OUTCOME.CONFLICTED),
    failed: results.flatMap((result) =>
      result.errorCode === null ? [] : [{ documentId: result.item, errorCode: result.errorCode }],
    ),
  }
}
