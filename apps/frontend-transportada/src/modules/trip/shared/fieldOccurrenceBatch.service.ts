/* Copyright (c) 2026 Ada Technology. MIT License. */
import { OCCURRENCE_ATTACHMENT_MODE } from './occurrence.constant'
import type { FieldOccurrenceType } from './trip.types'

/** Spec 156 T7.3/T9: o mesmo teto de `MAX_BATCH_DOCUMENTS` da API — nunca duplica o número solto. */
export const MAX_FIELD_OCCURRENCE_DOCUMENTS = 50

export function isWithinFieldOccurrenceLimit(documentCount: number): boolean {
  return documentCount > 0 && documentCount <= MAX_FIELD_OCCURRENCE_DOCUMENTS
}

/** Uma nota é a ação da linha; mais de uma é o lote da seleção — o diálogo é o mesmo, o texto muda. */
export function resolveFieldOccurrenceDialogMode(
  documentIds: readonly string[],
): 'batch' | 'single' {
  return documentIds.length > 1 ? 'batch' : 'single'
}

/**
 * O que o diálogo pede do tipo escolhido: observação e foto só aparecem quando o tipo os aceita
 * (`noteMode`/`photoMode` diferentes de `off`). Ausente é API anterior ao campo: o formulário de
 * sempre. Sem tipo escolhido, nada além do seletor.
 */
export function resolveFieldOccurrenceDialogFields(type: FieldOccurrenceType | undefined): {
  readonly hasNote: boolean
  readonly hasPhoto: boolean
} {
  if (type === undefined) return { hasNote: false, hasPhoto: false }
  const photoMode = type.photoMode ?? type.attachmentMode
  return {
    hasNote: type.noteMode !== OCCURRENCE_ATTACHMENT_MODE.off,
    hasPhoto: photoMode !== OCCURRENCE_ATTACHMENT_MODE.off,
  }
}
