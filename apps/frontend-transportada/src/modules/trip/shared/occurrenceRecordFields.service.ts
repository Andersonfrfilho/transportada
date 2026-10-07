/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 RF1/RF3/D8: o número do documento do cliente e o valor pago do tipo — quais valem, o modo
 * gravado, o rótulo, e a recusa que a API devolveria em 422 (`OCCURRENCE_TYPE_DECLARED_AMOUNT_NEEDS_ITEMS`),
 * antecipada na tela.
 */
import {
  OCCURRENCE_ATTACHMENT_MODE,
  OCCURRENCE_ITEMS_MODE,
  type OccurrenceAttachmentMode,
  type OccurrenceType,
} from './occurrence.constant'
import type { OccurrenceRecordField } from './occurrenceRequirement.constant'
import type { OccurrenceTypeEdit } from './occurrenceTypeUpdate.service'

export type OccurrenceRecordLabels = Readonly<Record<OccurrenceRecordField, string>>

/** O modo gravado; o que a API não mandou lê-se desligado (só a tela usa isto, o `PUT` não). */
export function readOccurrenceRecordMode(
  type: OccurrenceType,
  field: OccurrenceRecordField,
): OccurrenceAttachmentMode {
  const mode = field === 'referenceNumber' ? type.referenceNumberMode : type.declaredAmountMode
  return mode ?? OCCURRENCE_ATTACHMENT_MODE.off
}

/** API anterior aos campos não manda nenhum dos dois modos: a aba não oferece o que a API recusaria. */
export function readOccurrenceRecordFields(type: OccurrenceType): readonly OccurrenceRecordField[] {
  return [
    ...(type.referenceNumberMode === undefined ? [] : (['referenceNumber'] as const)),
    ...(type.declaredAmountMode === undefined ? [] : (['declaredAmount'] as const)),
  ]
}

/** Os rótulos que o tipo escolheu, para a exceção usar o mesmo nome que o registro mostra; `undefined` é API anterior. */
export function readOccurrenceRecordLabels(
  type: OccurrenceType,
  fallback: OccurrenceRecordLabels,
): OccurrenceRecordLabels | undefined {
  if (readOccurrenceRecordFields(type).length === 0) return undefined
  return {
    declaredAmount: type.declaredAmountLabel ?? fallback.declaredAmount,
    referenceNumber: type.referenceNumberLabel ?? fallback.referenceNumber,
  }
}

/**
 * O predicado de três termos da API: valor pago ligado, digitado por linha e Produtos desligado não
 * tem onde digitar. Avalia o estado **depois** da edição, com o que ela não toca vindo do tipo.
 */
export function hasDeclaredAmountWithoutItems(
  type: OccurrenceType,
  edit: OccurrenceTypeEdit,
): boolean {
  const itemsMode = edit.itemsMode ?? type.itemsMode
  const amountMode = edit.declaredAmountMode ?? type.declaredAmountMode
  const scope = edit.declaredAmountScope ?? type.declaredAmountScope
  return (
    itemsMode === OCCURRENCE_ITEMS_MODE.off &&
    amountMode !== undefined &&
    amountMode !== OCCURRENCE_ATTACHMENT_MODE.off &&
    scope === 'item'
  )
}
