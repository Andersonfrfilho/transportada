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

export type DeliveryProofKind = 'photo' | 'signature'

export type DeliveryProof = Readonly<{
  createdAt: string
  downloadUrl: string
  expiresAt: string
  id: string
  kind: DeliveryProofKind
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
 * O nome de quem recebeu sai **só da assinatura**. Foto de canhoto não tem quem assine — o CHECK
 * `trip_delivery_proofs_receiver_check` já garante isso no banco —, e preencher o nome a partir de
 * uma foto seria inventar a identidade de um terceiro.
 */
export function resolveDeliveryProofView(input: {
  readonly document: DeliveryProofDocument
  readonly proofs: readonly DeliveryProof[]
}): DeliveryProofView {
  const photos = input.proofs.filter((proof) => proof.kind === 'photo')
  const signatures = input.proofs.filter((proof) => proof.kind === 'signature')
  const receiverName = signatures.find((proof) => proof.receiverName !== '')?.receiverName ?? null

  if (input.document.returnedAt !== null) {
    return {
      deliveredAt: null,
      photos,
      receiverName,
      returnReason: input.document.returnReason,
      signatures,
      state: 'returned',
    }
  }

  if (input.document.deliveredAt === null) {
    return { deliveredAt: null, photos, receiverName, signatures, state: 'not-delivered' }
  }

  return {
    deliveredAt: input.document.deliveredAt,
    photos,
    receiverName,
    signatures,
    state: input.proofs.length === 0 ? 'delivered-without-proof' : 'delivered-with-proof',
  }
}
