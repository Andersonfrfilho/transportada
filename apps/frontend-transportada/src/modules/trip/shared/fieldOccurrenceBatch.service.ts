/* Copyright (c) 2026 Ada Technology. MIT License. */

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
