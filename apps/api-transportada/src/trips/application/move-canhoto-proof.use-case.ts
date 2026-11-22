/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 D9/RF10: passa a foto do canhoto da NF errada (A) para a certa (B), numa transação.
 *
 * ⚠️ **Correção de vínculo, não portão nem aprovação**: o veredito de B nasce `pending`, a
 * conferência humana continua, e A volta a "sem canhoto" — a pendência de recaptura sai da mesma
 * regra que já vale para a nota sem foto (RF29 da 220), nada novo para divergir dela.
 */
import { CanhotoReviewProofNotFoundError } from '../domain/canhoto-review.error.js'
import {
  resolveCanhotoMoveEvent,
  CANHOTO_MOVED_AUDIT_ACTION,
} from '../domain/canhoto-move.policy.js'
import type {
  CanhotoMoveResult,
  CanhotoMoveUnitOfWork,
  MoveCanhotoProofCommand,
} from './canhoto-move.port.js'

const MOVE_PERMISSION = 'trip.manage'

export async function moveCanhotoProof(
  input: MoveCanhotoProofCommand & { readonly unitOfWork: CanhotoMoveUnitOfWork },
): Promise<CanhotoMoveResult> {
  const { companyId, documentId, targetDocumentId, tripId } = input

  return input.unitOfWork.execute(async (transaction) => {
    const source = await transaction.lockSourceProof({ companyId, documentId, tripId })
    if (source === null) {
      // Repetição do mesmo pedido: a foto já foi para B, e A não tem mais prova para travar.
      const movedProofId = await transaction.findAlreadyMovedProof({
        companyId,
        fromDocumentId: documentId,
        toDocumentId: targetDocumentId,
        tripId,
      })
      if (movedProofId === null) throw new CanhotoReviewProofNotFoundError()
      return {
        alreadyMoved: true,
        review: await transaction.readReviewView({ companyId, proofId: movedProofId }),
        sourceDocumentId: documentId,
        targetDocumentId,
      }
    }

    const mismatch = await transaction.deriveMismatch({ companyId, source, tripId })
    const target = await transaction.findTarget({
      companyId,
      documentId: targetDocumentId,
      tripId,
    })
    const targetEventId = resolveCanhotoMoveEvent({
      mismatch,
      sourceReview: source.review,
      target,
      targetDocumentId,
    })

    await transaction.moveProof({ companyId, proofId: source.proofId, targetEventId })
    await transaction.insertAudit({
      action: CANHOTO_MOVED_AUDIT_ACTION,
      actorUserId: input.actorUserId,
      companyId,
      correlationId: input.correlationId,
      fromDocumentId: documentId,
      ipAddress: input.ipAddress,
      permission: MOVE_PERMISSION,
      proofId: source.proofId,
      reason: input.reason,
      toDocumentId: targetDocumentId,
      tripId,
    })

    return {
      alreadyMoved: false,
      review: await transaction.readReviewView({ companyId, proofId: source.proofId }),
      sourceDocumentId: documentId,
      targetDocumentId,
    }
  })
}
