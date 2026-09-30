/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DeliveryProof,
  DeliveryProofCanhotoReviewReason,
} from '@/modules/trip/shared/deliveryProof.service'
import { formatCanhotoOcrNumber } from '@/modules/trip/shared/fieldDeliveryReview.service'

export type CanhotoReviewMessageKey =
  | 'approvedAutomatic'
  | 'approvedManual'
  | 'pendingBarcode'
  | 'pendingOcr'
  | 'pendingUnread'
  | 'rejected'

/**
 * Chaves de `deliveryProof.canhotoReview.*` e valores crus: texto e data formatada são da tela,
 * que tem o idioma e o formatador (`formatMoment`).
 */
export type CanhotoReviewPresentation = Readonly<{
  isExperimental: boolean
  messageKey: CanhotoReviewMessageKey
  note?: string
  readNumber?: string
  reason?: DeliveryProofCanhotoReviewReason
  reviewedAt?: string
  reviewerName?: string
}>

function formatReadNumber(proof: DeliveryProof): string | undefined {
  if (proof.canhotoReadNumber === undefined) return undefined
  return formatCanhotoOcrNumber({
    number: proof.canhotoReadNumber,
    series: proof.canhotoReadSeries ?? null,
  })
}

function presentApproved(proof: DeliveryProof): CanhotoReviewPresentation {
  if (proof.canhotoReviewOrigin !== 'manual') {
    return { isExperimental: false, messageKey: 'approvedAutomatic' }
  }
  return {
    isExperimental: false,
    messageKey: 'approvedManual',
    ...(proof.canhotoReviewByName === undefined ? {} : { reviewerName: proof.canhotoReviewByName }),
    ...(proof.canhotoReviewAt === undefined ? {} : { reviewedAt: proof.canhotoReviewAt }),
  }
}

function presentPending(proof: DeliveryProof): CanhotoReviewPresentation {
  const readNumber = formatReadNumber(proof)
  if (readNumber === undefined) return { isExperimental: false, messageKey: 'pendingUnread' }
  if (proof.canhotoReadSource === 'ocr') {
    return { isExperimental: true, messageKey: 'pendingOcr', readNumber }
  }
  return { isExperimental: false, messageKey: 'pendingBarcode', readNumber }
}

function presentRejected(proof: DeliveryProof): CanhotoReviewPresentation {
  const { canhotoReviewNote: note, canhotoReviewReason: reason } = proof
  return {
    isExperimental: false,
    messageKey: 'rejected',
    ...(reason === 'other' && note !== undefined ? { note } : {}),
    ...(reason === undefined ? {} : { reason }),
  }
}

/** Sem veredito (assinatura, foto da mercadoria, comprovante antigo) não há o que mostrar. */
export function presentCanhotoReview(proof: DeliveryProof): CanhotoReviewPresentation | undefined {
  switch (proof.canhotoReview) {
    case undefined:
      return undefined
    case 'approved':
      return presentApproved(proof)
    case 'pending':
      return presentPending(proof)
    case 'rejected':
      return presentRejected(proof)
  }
}
