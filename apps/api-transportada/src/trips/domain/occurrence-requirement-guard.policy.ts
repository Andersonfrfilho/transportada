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
 * Spec 247 (RF14), depois desses três e nesta ordem:
 *
 * - número do documento do cliente `required`: texto não vazio;
 * - valor pago `required`: na ocorrência, ou em **toda** linha, conforme onde ele se digita
 *   (`resolveDeclaredAmountTarget`);
 * - valor pago ligado (≠ `off`), digitado por linha, e o código com valor unitário que varia na nota:
 *   a linha precisa do valor — a soma não saberia qual preço usar.
 *
 * `off` e `optional` nunca recusam: o que a tela esconde ou oferece não é cobrança do servidor.
 */
import { REQUIRED_PROOF_FIELD_MODE } from './delivery-event.constant.js'
import {
  OCCURRENCE_DECLARED_AMOUNT_FIELD,
  OCCURRENCE_DECLARED_AMOUNT_SCOPE,
  OCCURRENCE_ITEMS_MODE,
} from '../../shared/trip-occurrence.constant.js'
import { resolveDeclaredAmountTarget } from './occurrence-declared-amount-target.policy.js'
import type { OccurrenceRequirements } from './occurrence-requirements.policy.js'
import {
  TripOccurrenceAttachmentRequiredError,
  TripOccurrenceDeclaredAmountRequiredError,
  TripOccurrenceNoteRequiredError,
  TripOccurrencePhotoMinimumNotMetError,
  TripOccurrenceReferenceNumberRequiredError,
  TripOccurrenceSignatureRequiredError,
} from './trip.error.js'

/** O que o guarda precisa de cada linha: o valor digitado e se o preço varia na nota. */
export type RequirementGuardLine = {
  readonly declaredAmount: null | string
  readonly hasVaryingUnitValue: boolean
}

export type AssertDriverOccurrenceRequirementsParams = {
  readonly attachmentCount: number
  /** O valor pago da ocorrência; nulo é não digitado (`"0"` é digitado). */
  readonly declaredAmount: null | string
  readonly hasSignature: boolean
  readonly lines: readonly RequirementGuardLine[]
  readonly note: string
  readonly referenceNumber: null | string
  readonly requirements: OccurrenceRequirements
}

export function lineDeclaredAmountField(index: number): string {
  return `items[${String(index)}].${OCCURRENCE_DECLARED_AMOUNT_FIELD}`
}

function assertDeclaredAmountRequirement(params: AssertDriverOccurrenceRequirementsParams): void {
  const { lines, requirements } = params
  if (requirements.declaredAmountMode === OCCURRENCE_ITEMS_MODE.off) return
  const target = resolveDeclaredAmountTarget({
    itemsMode: requirements.itemsMode,
    lineCount: lines.length,
    scope: requirements.declaredAmountScope,
  })
  const isRequired = requirements.declaredAmountMode === REQUIRED_PROOF_FIELD_MODE
  if (target === OCCURRENCE_DECLARED_AMOUNT_SCOPE.occurrence) {
    if (isRequired && params.declaredAmount === null) {
      throw new TripOccurrenceDeclaredAmountRequiredError(OCCURRENCE_DECLARED_AMOUNT_FIELD)
    }
    return
  }
  const missingIndex = lines.findIndex(
    (line) => line.declaredAmount === null && (isRequired || line.hasVaryingUnitValue),
  )
  if (missingIndex >= 0) {
    throw new TripOccurrenceDeclaredAmountRequiredError(lineDeclaredAmountField(missingIndex))
  }
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
  if (
    requirements.referenceNumberMode === REQUIRED_PROOF_FIELD_MODE &&
    params.referenceNumber === null
  ) {
    throw new TripOccurrenceReferenceNumberRequiredError()
  }
  assertDeclaredAmountRequirement(params)
}
