/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 (R9): o lote do escritório recusado pelo escopo traz `details[].message` com os ids das notas
 * recusadas. A API só manda ids; o número da nota é lido aqui, do que a tela já tem.
 */
import { OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR } from './occurrence.constant'
import { tripDocumentLabel } from './tripDocument.service'

const DOCUMENT_IDS_FIELD = 'documentIds'

type DocumentLabelSource = Parameters<typeof tripDocumentLabel>[0]

export function readRefusedScopeDocuments(
  input: Readonly<{ documents: readonly DocumentLabelSource[]; error: unknown }>,
): readonly string[] {
  const { error } = input
  if (!(error instanceof Error) || error.message !== OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR) {
    return []
  }
  const details: unknown = (error as { details?: unknown }).details
  if (!Array.isArray(details)) return []
  return details.flatMap((detail: unknown) => {
    const { field, message } = (detail ?? {}) as { field?: unknown; message?: unknown }
    if (field !== DOCUMENT_IDS_FIELD || typeof message !== 'string') return []
    const document = input.documents.find((candidate) => candidate.id === message)
    return [document === undefined ? message : tripDocumentLabel(document)]
  })
}
