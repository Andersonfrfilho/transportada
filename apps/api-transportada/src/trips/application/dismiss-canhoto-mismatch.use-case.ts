/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5d (D9, "Descartar"): o escritório decide manter a foto nesta nota e o alerta "parece
 * ser de outra nota" some daquela foto. ⚠️ Não aprova, não recusa e não move: só apaga o alerta, e a
 * conferência humana segue como estava. A recaptura (foto nova) volta a ter alerta.
 */
import { CanhotoReviewProofNotFoundError } from '../domain/canhoto-review.error.js'
import {
  CanhotoDismissNotFlaggedError,
  CanhotoDismissNotPendingError,
} from '../domain/canhoto-dismiss.error.js'
import type {
  CanhotoDismissResult,
  CanhotoDismissUnitOfWork,
  DismissCanhotoMismatchCommand,
} from './canhoto-dismiss.port.js'

export const CANHOTO_MISMATCH_DISMISSED_AUDIT_ACTION = 'trip.canhoto-mismatch.dismissed'
const DISMISS_PERMISSION = 'trip.manage'

export async function dismissCanhotoMismatch(
  input: DismissCanhotoMismatchCommand & { readonly unitOfWork: CanhotoDismissUnitOfWork },
): Promise<CanhotoDismissResult> {
  const { companyId, documentId, tripId } = input

  return input.unitOfWork.execute(async (transaction) => {
    const source = await transaction.lockSourceProof({ companyId, documentId, tripId })
    if (source === null) throw new CanhotoReviewProofNotFoundError()
    if (source.mismatchDismissed) return { alreadyDismissed: true, documentId }
    if (source.review !== 'pending') throw new CanhotoDismissNotPendingError()

    const mismatch = await transaction.deriveMismatch({ companyId, source, tripId })
    if (mismatch === null) throw new CanhotoDismissNotFlaggedError()

    await transaction.markDismissed({ at: new Date(), companyId, proofId: source.proofId })
    await transaction.insertAudit({
      action: CANHOTO_MISMATCH_DISMISSED_AUDIT_ACTION,
      actorUserId: input.actorUserId,
      companyId,
      correlationId: input.correlationId,
      documentId,
      ipAddress: input.ipAddress,
      permission: DISMISS_PERMISSION,
      proofId: source.proofId,
      tripId,
    })
    return { alreadyDismissed: false, documentId }
  })
}
