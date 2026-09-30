/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T005: o que a tela mostra de uma entrega, e em qual dos quatro estados ela está.
 *
 * ⚠️ **"Não anexou o canhoto" e "não entregou" são fatos diferentes.** Uma tela que os funde manda
 * o operador atrás de uma entrega que já aconteceu — ou dá por entregue uma que não foi. Por isso o
 * estado é explícito, e não derivado de `proofs.length > 0` no meio de um JSX.
 *
 * O serviço é puro porque o teste desta app não tem DOM: o comportamento se prova na função.
 */
import type {
  DELIVERY_PROOF_CANHOTO_READ_SOURCE_OPTIONS,
  DELIVERY_PROOF_CANHOTO_REVIEW_OPTIONS,
  DELIVERY_PROOF_CANHOTO_REVIEW_ORIGIN_OPTIONS,
  DELIVERY_PROOF_CANHOTO_REVIEW_REASON_OPTIONS,
  DELIVERY_PROOF_PUNCTUALITY_OPTIONS,
  DELIVERY_PROOF_RECEIVED_BY_OPTIONS,
} from './trip.constant'

export type DeliveryProofKind = 'photo' | 'signature' | 'cargo'

/** Spec 193 D1: a relação de quem recebeu com o destinatário (`DELIVERY_PROOF_RECEIVED_BY_OPTIONS`). */
export type DeliveryProofReceivedBy = (typeof DELIVERY_PROOF_RECEIVED_BY_OPTIONS)[number]

export type DeliveryProofPunctuality = (typeof DELIVERY_PROOF_PUNCTUALITY_OPTIONS)[number]

export type DeliveryProofCanhotoReview = (typeof DELIVERY_PROOF_CANHOTO_REVIEW_OPTIONS)[number]

export type DeliveryProofCanhotoReviewOrigin =
  (typeof DELIVERY_PROOF_CANHOTO_REVIEW_ORIGIN_OPTIONS)[number]

export type DeliveryProofCanhotoReadSource =
  (typeof DELIVERY_PROOF_CANHOTO_READ_SOURCE_OPTIONS)[number]

export type DeliveryProofCanhotoReviewReason =
  (typeof DELIVERY_PROOF_CANHOTO_REVIEW_REASON_OPTIONS)[number]

export type DeliveryProof = Readonly<{
  /** Spec 220 RF24: todas as `canhoto*` ausentes (nunca `null`) quando não há o que dizer. */
  canhotoReadNumber?: string
  canhotoReadSeries?: string
  canhotoReadSource?: DeliveryProofCanhotoReadSource
  canhotoReview?: DeliveryProofCanhotoReview
  canhotoReviewAt?: string
  /** Nome de quem conferiu; nunca o id. Ausente no veredito automático. */
  canhotoReviewByName?: string
  canhotoReviewNote?: string
  canhotoReviewOrigin?: DeliveryProofCanhotoReviewOrigin
  canhotoReviewReason?: DeliveryProofCanhotoReviewReason
  /** Spec 220 RF14: hora da captura. Ausente em comprovante antigo. */
  capturedAt?: string
  /** Spec 220 RF15: distância ao ponto, em metros; ausente sem posição. Nunca a coordenada. */
  distanceMeters?: number
  createdAt: string
  downloadUrl: string
  expiresAt: string
  id: string
  kind: DeliveryProofKind
  /** Spec 205 RF8: o comprovante (ou a entrega dele) foi registrado depois. Ausente na API anterior. */
  lateRegistration?: boolean
  /** Spec 220 RF16: ausente em comprovante antigo. */
  punctuality?: DeliveryProofPunctuality
  /** ADR-0057 §3: sempre a máscara; esta tela não o mostra. */
  receiverDocument?: string
  /** Spec 193 D3: quem recebeu, da mesma linha do nome. Ausente na API anterior; `null` no antigo. */
  receivedBy?: DeliveryProofReceivedBy | null
  receivedByDetail?: null | string
  /** Nome de quem recebeu, na assinatura. **Nunca documento** — ADR-0045 §7. */
  receiverName: string
  /** Spec 220 RF20: omitida (nunca `null`) em comprovante antigo, assinatura e falha de geração. */
  thumbnailUrl?: string
}>

export type DeliveryProofDocument = Readonly<{
  deliveredAt: null | string
  returnedAt: null | string
  returnReason: null | string
  separationStatus: string
}>

export type DeliveryProofState =
  | 'delivered-with-proof'
  | 'delivered-without-proof'
  | 'not-delivered'
  | 'returned'

export type DeliveryProofView = Readonly<{
  cargoPhotos: readonly DeliveryProof[]
  deliveredAt: null | string
  photos: readonly DeliveryProof[]
  receiverName: null | string
  returnReason?: null | string
  signatures: readonly DeliveryProof[]
  state: DeliveryProofState
}>

/**
 * Devolvida é o quarto fato, e **não é entrega**: chamá-la de "entregue sem comprovante" seria
 * mentira sobre o que aconteceu na rua.
 *
 * O nome de quem recebeu sai, nesta ordem, da **assinatura digital** (app do motorista, onde o
 * recebedor está) e do **canhoto do escritório**. O escritório não colhe assinatura (ADR-0067 §5):
 * cumpre a exigência com a foto do canhoto assinado e o nome que o operador digita — e o CHECK
 * `trip_delivery_proofs_receiver_check` garante que `photo` só carrega nome quando o canal é
 * `office`, então ler o nome dali não inventa a identidade de ninguém. Foto de carga **nunca**
 * fornece nome: é registro da mercadoria, não de quem a recebeu.
 *
 * Pelo mesmo motivo, foto de carga sozinha não faz a entrega contar como "com comprovante".
 */
export function resolveDeliveryProofView(input: {
  readonly document: DeliveryProofDocument
  readonly proofs: readonly DeliveryProof[]
}): DeliveryProofView {
  const photos = input.proofs.filter((proof) => proof.kind === 'photo')
  const signatures = input.proofs.filter((proof) => proof.kind === 'signature')
  const cargoPhotos = input.proofs.filter((proof) => proof.kind === 'cargo')

  // Prioridade: assinatura > photo > nada. Foto de carga nunca fornece nome (ADR-0067 §5).
  const receiverName =
    signatures.find((proof) => proof.receiverName !== '')?.receiverName ??
    photos.find((proof) => proof.receiverName !== '')?.receiverName ??
    null

  if (input.document.returnedAt !== null) {
    return {
      cargoPhotos,
      deliveredAt: null,
      photos,
      receiverName,
      returnReason: input.document.returnReason,
      signatures,
      state: 'returned',
    }
  }

  if (input.document.deliveredAt === null) {
    return {
      cargoPhotos,
      deliveredAt: null,
      photos,
      receiverName,
      signatures,
      state: 'not-delivered',
    }
  }

  return {
    cargoPhotos,
    deliveredAt: input.document.deliveredAt,
    photos,
    receiverName,
    signatures,
    state:
      photos.length + signatures.length === 0 ? 'delivered-without-proof' : 'delivered-with-proof',
  }
}

/** Spec 220 RF20: a miniatura quando existe; o original quando não — o caminho normal, não um erro. */
export function resolveDeliveryProofImageSource(proof: DeliveryProof): string {
  return proof.thumbnailUrl ?? proof.downloadUrl
}

/** Spec 220 RF22: a tela cheia e o download são sempre o original, nunca a miniatura ampliada. */
export function resolveDeliveryProofFullSizeUrl(proof: DeliveryProof): string {
  return proof.downloadUrl
}
