/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 227 D4: o comprovante tem dois eixos independentes — a conferência do canhoto e a pontualidade
 * da baixa. Cada um vira um selo, e nenhum esconde o outro: recusado e longe do ponto diz as duas coisas.
 */
import type {
  DeliveryProof,
  DeliveryProofCanhotoReview,
  DeliveryProofPunctuality,
} from './deliveryProof.service'

export type TripDocumentProofBadges = Readonly<{
  punctuality?: Exclude<DeliveryProofPunctuality, 'not_required'>
  review?: DeliveryProofCanhotoReview
}>

/** Mesma ordem do cartão do comprovante (`resolveDeliveryProofPieces`): canhoto, assinatura, mercadoria. */
export function pickMainDeliveryProof(proofs: readonly DeliveryProof[]): DeliveryProof | undefined {
  return (
    proofs.find((proof) => proof.kind === 'photo') ??
    proofs.find((proof) => proof.kind === 'signature') ??
    proofs.find((proof) => proof.kind === 'cargo')
  )
}

/** Sem comprovante, ou sem nada a dizer sobre ele, não há selo — nunca um rótulo vazio. */
export function resolveTripDocumentProofBadges(
  proof: DeliveryProof | undefined,
): TripDocumentProofBadges | undefined {
  if (proof === undefined) return undefined
  const { canhotoReview, punctuality } = proof
  const hasPunctuality = punctuality !== undefined && punctuality !== 'not_required'
  if (canhotoReview === undefined && !hasPunctuality) return undefined
  return {
    ...(canhotoReview === undefined ? {} : { review: canhotoReview }),
    ...(hasPunctuality ? { punctuality } : {}),
  }
}

export function buildTripDocumentProofBadgesByDocumentId(
  proofs: readonly (DeliveryProof & Readonly<{ documentId: string }>)[],
): ReadonlyMap<string, TripDocumentProofBadges> {
  const proofsByDocumentId = Map.groupBy(proofs, (proof) => proof.documentId)
  const badgesByDocumentId = new Map<string, TripDocumentProofBadges>()
  for (const [documentId, documentProofs] of proofsByDocumentId) {
    const badges = resolveTripDocumentProofBadges(pickMainDeliveryProof(documentProofs))
    if (badges !== undefined) badgesByDocumentId.set(documentId, badges)
  }
  return badgesByDocumentId
}
