/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 RF1h (revisão do painel A2/M2/M5): quais exigências e quais exceções valem para um tipo,
 * decididas pelo **conjunto de momentos** — nunca por `stage`, que num tipo de galpão e rua diz só "galpão".
 */
import {
  DEFAULT_OCCURRENCE_NOTE_MODE,
  DEFAULT_OCCURRENCE_SIGNATURE_MODE,
  OCCURRENCE_ITEMS_MODE,
  type OccurrenceAttachmentMode,
  type OccurrenceMoment,
  type OccurrenceType,
} from './occurrence.constant'
import { resolveOccurrenceMoments } from './occurrenceMoments.service'
import { readOccurrenceRecordFields } from './occurrenceRecordFields.service'
import type {
  OccurrenceRecordField,
  OccurrenceRequirementField,
} from './occurrenceRequirement.constant'

export type OccurrenceRequirementScope = Readonly<{
  /** Os campos que uma exceção deste tipo pode declarar: os do momento, sem olhar o que a API mandou. */
  exceptionFields: readonly OccurrenceRequirementField[]
  /** A exceção pode declarar o mínimo de fotos (só a nota guarda N fotos, D-d), haja ou não o campo no tipo. */
  canExceptPhotoMinimum: boolean
  hasExceptions: boolean
  hasPhotoMinimum: boolean
  /** Galpão **e** rua no mesmo tipo: as exigências valem só nos momentos de rua, e a tela diz isso. */
  isMixed: boolean
  /** Só chegada à parada: o app cobra a foto e mais nada. */
  isStopOnly: boolean
  /** Spec 247 RF3: o número e o valor pago valem na nota e no escritório — e só os que a API trouxe. */
  recordFields: readonly OccurrenceRecordField[]
  /** Os campos que a tela edita: os do momento que a resposta da API também trouxe. */
  typeFields: readonly OccurrenceRequirementField[]
}>

/** Os campos de exigência que o conjunto de momentos cobra — a mesma regra do tipo, da exceção e do cadastro novo. */
export function readRequirementFieldsOfMoments(
  moments: readonly OccurrenceMoment[],
): readonly OccurrenceRequirementField[] {
  const hasDocument = moments.includes('document')
  const hasStop = moments.includes('stop')
  const hasItems = hasDocument || moments.includes('separation') || !hasStop
  return [
    ...(hasDocument || hasStop ? (['photo'] as const) : []),
    ...(hasDocument ? (['note', 'signature'] as const) : []),
    ...(hasItems ? (['items'] as const) : []),
  ]
}

export function readOccurrenceRequirementScope(type: OccurrenceType): OccurrenceRequirementScope {
  const moments = resolveOccurrenceMoments(type)
  const hasDocument = moments.includes('document')
  const hasStop = moments.includes('stop')
  const hasSeparation = moments.includes('separation')
  const hasStreet = hasDocument || hasStop || moments.includes('office')
  const exceptionFields = readRequirementFieldsOfMoments(moments)
  const isPresent: Readonly<Record<OccurrenceRequirementField, boolean>> = {
    items: type.itemsMode !== undefined,
    note: type.noteMode !== undefined,
    photo: true,
    signature: type.signatureMode !== undefined,
  }
  return {
    canExceptPhotoMinimum: hasDocument,
    exceptionFields,
    hasExceptions: hasStreet,
    hasPhotoMinimum: hasDocument && type.photoMinimumCount !== undefined,
    isMixed: hasSeparation && hasStreet,
    isStopOnly: hasStop && !hasDocument && !hasSeparation,
    recordFields: hasDocument || moments.includes('office') ? readOccurrenceRecordFields(type) : [],
    typeFields: exceptionFields.filter((field) => isPresent[field]),
  }
}

/** O modo gravado do campo; o que a API não mandou lê-se como o padrão de hoje (só a tela usa isto, o `PUT` não). */
export function readOccurrenceRequirementMode(
  type: OccurrenceType,
  field: OccurrenceRequirementField,
): OccurrenceAttachmentMode {
  if (field === 'photo') return type.attachmentMode
  if (field === 'note') return type.noteMode ?? DEFAULT_OCCURRENCE_NOTE_MODE
  if (field === 'signature') return type.signatureMode ?? DEFAULT_OCCURRENCE_SIGNATURE_MODE
  return type.itemsMode ?? OCCURRENCE_ITEMS_MODE.optional
}
