/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O que o card "Comprovante da entrega" decide antes de desenhar: qual peça é a principal, qual o
 * desfecho da conferência e se a captura foi longe da baixa. Puro, para provar sem DOM.
 */
import type {
  DeliveryProof,
  DeliveryProofCanhotoReview,
  DeliveryProofKind,
  DeliveryProofView,
} from './deliveryProof.service'

const ALT_KEY_BY_KIND = {
  cargo: 'deliveryProof.cargoPhotoAlt',
  photo: 'deliveryProof.photoAlt',
  signature: 'deliveryProof.signatureAlt',
} as const satisfies Record<DeliveryProofKind, string>

export type DeliveryProofPiece = Readonly<{
  altKey: (typeof ALT_KEY_BY_KIND)[DeliveryProofKind]
  labelKey: `deliveryProof.pieceLabel.${DeliveryProofKind}`
  proof: DeliveryProof
}>

export type DeliveryProofPieces = Readonly<{
  main: DeliveryProofPiece | undefined
  others: readonly DeliveryProofPiece[]
}>

function toPiece(proof: DeliveryProof): DeliveryProofPiece {
  return {
    altKey: ALT_KEY_BY_KIND[proof.kind],
    labelKey: `deliveryProof.pieceLabel.${proof.kind}`,
    proof,
  }
}

/** Canhoto primeiro, depois assinatura e mercadoria: a primeira peça é a grande, as demais vão para a tira. */
export function resolveDeliveryProofPieces(view: DeliveryProofView): DeliveryProofPieces {
  const [main, ...others] = [...view.photos, ...view.signatures, ...view.cargoPhotos].map(toPiece)
  return { main, others }
}

export function resolveDeliveryProofOutcome(
  proof: DeliveryProof,
): DeliveryProofCanhotoReview | undefined {
  return proof.canhotoReview
}

/**
 * O limite de "longe" é da API (`punctuality`); o front não inventa um segundo. A referência é onde
 * o motorista deu a baixa, nunca o endereço cadastrado da parada (ADR-0070 §4, emenda 2026-09-25).
 */
export function isDeliveryProofAwayFromDeliveryEvent(proof: DeliveryProof): boolean {
  return proof.punctuality === 'away' || proof.punctuality === 'late_and_away'
}

export function formatDeliveryProofTime({
  locale,
  value,
}: Readonly<{ locale: string; value: string }>): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  }).format(date)
}
