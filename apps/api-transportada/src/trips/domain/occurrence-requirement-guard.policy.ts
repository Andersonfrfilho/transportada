/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 179 T203 (RF3) e spec 246 (RF1c, RF3, RF8): o que o tipo **efetivo** da nota cobra do registro
 * do motorista, campo a campo. A regra fixa "foto obrigatória arrasta a observação" saiu daqui e
 * virou dado (`note_mode`); cada campo é cobrado só pelo próprio modo:
 *
 * - observação `required`: texto não vazio;
 * - foto `required`: ao menos um anexo e a quantidade ≥ `photoMinimumCount` (lido só aqui);
 * - assinatura `required`: a referência a uma assinatura já confirmada.
 *
 * `off` e `optional` nunca recusam: o que a tela esconde ou oferece não é cobrança do servidor.
 */
import { REQUIRED_PROOF_FIELD_MODE } from './delivery-event.constant.js'
import type { OccurrenceRequirements } from './occurrence-requirements.policy.js'
import {
  TripOccurrenceAttachmentRequiredError,
  TripOccurrenceNoteRequiredError,
  TripOccurrencePhotoMinimumNotMetError,
  TripOccurrenceSignatureRequiredError,
} from './trip.error.js'

export type AssertDriverOccurrenceRequirementsParams = {
  readonly attachmentCount: number
  readonly hasSignature: boolean
  readonly note: string
  readonly requirements: OccurrenceRequirements
}

export function assertDriverOccurrenceRequirements(
  params: AssertDriverOccurrenceRequirementsParams,
): void {
  const { requirements } = params
  if (requirements.noteMode === REQUIRED_PROOF_FIELD_MODE && params.note.trim() === '') {
    throw new TripOccurrenceNoteRequiredError()
  }
  if (requirements.photoMode === REQUIRED_PROOF_FIELD_MODE) {
    if (params.attachmentCount === 0) throw new TripOccurrenceAttachmentRequiredError()
    if (params.attachmentCount < requirements.photoMinimumCount) {
      throw new TripOccurrencePhotoMinimumNotMetError()
    }
  }
  if (requirements.signatureMode === REQUIRED_PROOF_FIELD_MODE && !params.hasSignature) {
    throw new TripOccurrenceSignatureRequiredError()
  }
}
