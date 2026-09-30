/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF27/RF30/RF31 (T6.8): grava o veredito do canhoto.
 *
 * ⚠️ **Conferência, não portão** (RF30): nenhum veredito daqui bloqueia entrega, viagem, fatura ou
 * CT-e. Este caso de uso escreve uma decisão e uma trilha, e não toca em estado de viagem.
 */
import {
  resolveAutomaticCanhotoReview,
  resolveManualCanhotoReview,
} from '../domain/canhoto-review-decision.policy.js'
import { CanhotoReviewProofNotFoundError } from '../domain/canhoto-review.error.js'
import type {
  CanhotoReviewAuditEntry,
  CanhotoReviewCommand,
  CanhotoReviewView,
  ReviewCanhotoProofInput,
} from './canhoto-review.port.js'

const AUDIT_ACTION_BY_MANUAL_ACTION = {
  approve: 'trip.canhoto-review.approve',
  reject: 'trip.canhoto-review.reject',
} as const

function buildAuditEntry(
  input: ReviewCanhotoProofInput,
  command: Exclude<CanhotoReviewCommand, { action: 'automatic' }>,
  proofId: string,
): CanhotoReviewAuditEntry {
  return {
    action: AUDIT_ACTION_BY_MANUAL_ACTION[command.action],
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    correlationId: input.correlationId,
    ipAddress: input.ipAddress,
    proofId,
    reason: command.action === 'approve' ? null : command.reason,
    tripId: input.tripId,
  }
}

export async function reviewCanhotoProof(
  input: ReviewCanhotoProofInput,
): Promise<CanhotoReviewView> {
  const { command } = input

  return input.unitOfWork.execute(async (transaction) => {
    const proof = await transaction.lockCanhotoProof({
      companyId: input.companyId,
      documentId: input.documentId,
      tripId: input.tripId,
    })
    if (proof === null) throw new CanhotoReviewProofNotFoundError()

    const reviewedAt = new Date()
    const state = { review: proof.review, reviewOrigin: proof.reviewOrigin }
    const decision =
      command.action === 'automatic'
        ? resolveAutomaticCanhotoReview({ command, reviewedAt, state })
        : resolveManualCanhotoReview({
            actorUserId: input.actorUserId,
            command,
            reviewedAt,
            state,
          })

    if (decision.kind === 'apply') {
      await transaction.applyReview({
        companyId: input.companyId,
        proofId: proof.id,
        update: decision.update,
      })
      if (command.action !== 'automatic') {
        await transaction.insertAudit(buildAuditEntry(input, command, proof.id))
      }
    }

    return transaction.readReviewView({ companyId: input.companyId, proofId: proof.id })
  })
}
