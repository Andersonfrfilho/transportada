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
import type { DELIVERY_PROOF_RECEIVED_BY_OPTIONS } from './trip.constant'

export type DeliveryProofKind = 'photo' | 'signature' | 'cargo'

/** Spec 193 D1: a relação de quem recebeu com o destinatário (`DELIVERY_PROOF_RECEIVED_BY_OPTIONS`). */
export type DeliveryProofReceivedBy = (typeof DELIVERY_PROOF_RECEIVED_BY_OPTIONS)[number]

export type DeliveryProof = Readonly<{
  createdAt: string
  downloadUrl: string
  expiresAt: string
  id: string
  kind: DeliveryProofKind
  /** Spec 193 D3: quem recebeu, da mesma linha do nome. Ausente na API anterior; `null` no antigo. */
  receivedBy?: DeliveryProofReceivedBy | null
  receivedByDetail?: null | string
  /** Nome de quem recebeu, na assinatura. **Nunca documento** — ADR-0045 §7. */
  receiverName: string
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
