/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CargoDocumentOutcome } from './cargoArrival.types'
import { CargoReceivingRequestError } from './cargoReceivingRequest.service'

export type DocumentReference = Readonly<{ id: string; number: string }>

/** `labelKey` é a chave do rótulo impresso; sem ela, a tela usa o nome cru que a API mandou. */
export type RefusedField = Readonly<{ field: string; labelKey: string | undefined }>

export type RefusedDocument = Readonly<{ documentId: string; number: string; reason: string }>

export type RegistrationRefusal = Readonly<{
  code: string | undefined
  documents: readonly RefusedDocument[]
  fields: readonly RefusedField[]
}>

export type BatchOutcomeSummary = Readonly<{
  changedCount: number
  refused: readonly RefusedDocument[]
  unchangedCount: number
}>

export type PendingDocument = Readonly<{ documentId: string; number: string }>

const DOCUMENT_FIELD = /^documentIds\.(\d+)$/u

/**
 * `web.md` §11.4: o rótulo impresso é o que aparece, nunca o caminho do corpo. O mapa mora aqui, num
 * arquivo só, e **campo sem rótulo conhecido não some do aviso**: sai com o nome que a API usou.
 */
const FIELD_LABEL_KEYS: Readonly<Record<string, string>> = {
  arrivedAt: 'fields.arrivedAt',
  contractorId: 'fields.contractorId',
  documentIds: 'fields.documentIds',
  palletCount: 'fields.palletCount',
  reference: 'fields.reference',
}

/** O índice de `documentIds.<n>` é a posição da nota no pedido enviado. */
function readDocumentIndex(field: string): number | undefined {
  const match = DOCUMENT_FIELD.exec(field)
  return match === null ? undefined : Number(match[1])
}

function labelOf(documents: readonly DocumentReference[], documentId: string): string {
  return documents.find((document) => document.id === documentId)?.number ?? documentId
}

export function describeRegistrationRefusal(
  input: Readonly<{ error: unknown; requestedDocuments: readonly DocumentReference[] }>,
): RegistrationRefusal {
  if (!(input.error instanceof CargoReceivingRequestError)) {
    return { code: undefined, documents: [], fields: [] }
  }
  const documents = new Map<string, RefusedDocument>()
  const fields = new Map<string, RefusedField>()
  for (const detail of input.error.details) {
    const requested = input.requestedDocuments[readDocumentIndex(detail.field) ?? -1]
    if (requested !== undefined) {
      documents.set(requested.id, {
        documentId: requested.id,
        number: requested.number,
        reason: detail.message,
      })
    } else {
      fields.set(detail.field, { field: detail.field, labelKey: FIELD_LABEL_KEYS[detail.field] })
    }
  }
  return {
    code: input.error.message,
    documents: [...documents.values()],
    fields: [...fields.values()],
  }
}

export function describeBatchOutcomes(
  input: Readonly<{
    documents: readonly DocumentReference[]
    results: readonly CargoDocumentOutcome[]
  }>,
): BatchOutcomeSummary {
  const refused = input.results.flatMap((result) =>
    result.outcome === 'refused'
      ? [
          {
            documentId: result.documentId,
            number: labelOf(input.documents, result.documentId),
            reason: result.reason,
          },
        ]
      : [],
  )
  return {
    changedCount: input.results.filter((result) => result.outcome === 'changed').length,
    refused,
    unchangedCount: input.results.filter((result) => result.outcome === 'unchanged').length,
  }
}

/** O 409 do fechamento devolve o id de cada nota pendente na mensagem do detalhe. */
export function describePendingDocuments(
  input: Readonly<{ documents: readonly DocumentReference[]; error: unknown }>,
): readonly PendingDocument[] {
  if (!(input.error instanceof CargoReceivingRequestError)) return []
  const ids = new Set(
    input.error.details
      .filter((detail) => readDocumentIndex(detail.field) !== undefined)
      .map((detail) => detail.message),
  )
  return [...ids].map((documentId) => ({
    documentId,
    number: labelOf(input.documents, documentId),
  }))
}
