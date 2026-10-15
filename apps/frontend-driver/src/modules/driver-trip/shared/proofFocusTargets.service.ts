/* Copyright (c) 2026 Ada Technology. MIT License. */
import { countMissingCargoPhotos, type ProofFormPlan } from './proofFormPlan.service'

export const PHOTO_FOCUS_TARGET = 'proof-photo'
export const SIGNATURE_FOCUS_TARGET = 'proof-signature'
export const CARGO_FOCUS_TARGET = 'proof-cargo'
export const RECEIVED_BY_FOCUS_TARGET = 'proof-received-by'
export const RECEIVER_NAME_FOCUS_TARGET = 'proof-receiver-name'
export const RECEIVER_DOCUMENT_FOCUS_TARGET = 'proof-receiver-document'

export type ProofFocusTargets = Readonly<{
  cargo: string | undefined
  photo: string | undefined
  receivedBy: string | undefined
  receiverDocument: string | undefined
  receiverName: string | undefined
  signature: string | undefined
}>

export type ProofFocusState = Readonly<{
  cargoCount: number
  /** A foto está anexada na tela ou já foi confirmada pelo servidor. */
  hasPhoto: boolean
  hasSignature: boolean
  receivedBy: string
  receiverDocument: string
  receiverName: string
}>

/**
 * Pedido do usuário (15/10): um campo é alvo de foco quando a empresa o exige e ele ainda está vazio.
 * É esta tabela que diz para onde o foco vai depois do "Cheguei", da foto e do "Concluir" — vale para
 * qualquer combinação de comprovantes, não só para o canhoto. Campo opcional ou desligado nunca é alvo.
 */
export function resolveProofFocusTargets(input: {
  readonly plan: ProofFormPlan
  readonly state: ProofFocusState
}): ProofFocusTargets {
  const { fields } = input.plan
  const { state } = input
  const cargoMissing = countMissingCargoPhotos({
    plan: input.plan,
    values: {
      cargoCount: state.cargoCount,
      hasPhoto: state.hasPhoto,
      hasSignature: state.hasSignature,
      receiverDocument: state.receiverDocument,
      receiverName: state.receiverName,
    },
  })
  return {
    cargo: cargoMissing > 0 ? CARGO_FOCUS_TARGET : undefined,
    photo: fields.photo === 'required' && !state.hasPhoto ? PHOTO_FOCUS_TARGET : undefined,
    receivedBy:
      fields.receivedBy === 'required' && state.receivedBy === ''
        ? RECEIVED_BY_FOCUS_TARGET
        : undefined,
    receiverDocument:
      fields.receiverDocument === 'required' && state.receiverDocument === ''
        ? RECEIVER_DOCUMENT_FOCUS_TARGET
        : undefined,
    receiverName:
      fields.receiverName === 'required' && state.receiverName.trim() === ''
        ? RECEIVER_NAME_FOCUS_TARGET
        : undefined,
    signature:
      fields.signature === 'required' && !state.hasSignature ? SIGNATURE_FOCUS_TARGET : undefined,
  }
}
