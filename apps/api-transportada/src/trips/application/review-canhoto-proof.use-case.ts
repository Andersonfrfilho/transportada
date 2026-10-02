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
  CanhotoReviewView,
  ReviewCanhotoProofInput,
} from './canhoto-review.port.js'

const AUDIT_ACTION_BY_MANUAL_ACTION = {
  approve: 'trip.canhoto-review.approve',
  reject: 'trip.canhoto-review.reject',
} as const
const AUTOMATIC_AUDIT_ACTION = 'trip.canhoto-review.automatic'
const MANUAL_REVIEW_PERMISSION = 'trip.manage'
const AUTOMATIC_REVIEW_PERMISSION = 'trip.canhoto-auto-review'

/**
 * O ramo automático só deixa trilha pelo canal do robô: pelo navegador há gente logada olhando
 * (herança da 220). Sem nota, série ou leitura — só ator, alvo, IP e a ação (RNF1).
 */
function buildAuditEntry(
  input: ReviewCanhotoProofInput,
  proofId: string,
): CanhotoReviewAuditEntry | undefined {
  const { command } = input
  const base = {
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    correlationId: input.correlationId,
    ipAddress: input.ipAddress,
    proofId,
    tripId: input.tripId,
  }
  if (command.action === 'automatic') {
    if (input.channel !== 'service') return undefined
    return {
      ...base,
      action: AUTOMATIC_AUDIT_ACTION,
      permission: AUTOMATIC_REVIEW_PERMISSION,
      reason: null,
    }
  }
  return {
    ...base,
    action: AUDIT_ACTION_BY_MANUAL_ACTION[command.action],
    permission: MANUAL_REVIEW_PERMISSION,
    reason: command.action === 'approve' ? null : command.reason,
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
        ? resolveAutomaticCanhotoReview({
            command,
            documentId: input.documentId,
            documentNumber: proof.documentNumber,
            reviewedAt,
            state,
          })
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
      const auditEntry = buildAuditEntry(input, proof.id)
      if (auditEntry !== undefined) await transaction.insertAudit(auditEntry)
    }

    return transaction.readReviewView({ companyId: input.companyId, proofId: proof.id })
  })
}
