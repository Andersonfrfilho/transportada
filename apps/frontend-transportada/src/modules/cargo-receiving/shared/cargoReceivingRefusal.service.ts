/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CargoDocumentOutcome } from './cargoArrival.types'
import type { ArrivalFormIssues } from './cargoArrivalForm.validation'
import { CARGO_ARRIVAL_LIMITS } from './cargoReceiving.constant'
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

export type BatchOutcomeEntry = Readonly<{
  documentId: string
  number: string
  outcome: CargoDocumentOutcome['outcome']
  reason: string | undefined
}>

export type BatchOutcomeSummary = Readonly<{
  changedCount: number
  /** Uma entrada por nota pedida, na ordem do pedido: o resultado de CADA nota está na tela. */
  entries: readonly BatchOutcomeEntry[]
  refused: readonly RefusedDocument[]
  unchangedCount: number
}>

export type PendingDocument = Readonly<{ documentId: string; number: string }>

const ARRIVED_AT_TOO_OLD_CODE = 'CARGO_ARRIVAL_ARRIVED_AT_TOO_OLD'
const DOCUMENT_FIELD = /^documentIds\.(\d+)$/u
const PENDING_DOCUMENT_FIELD = /^pendingDocumentIds\.\d+$/u

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

function labelOf(
  input: Readonly<{ documentId: string; documents: readonly DocumentReference[] }>,
): string {
  return (
    input.documents.find((document) => document.id === input.documentId)?.number ?? input.documentId
  )
}

/** As notas do pedido como a recusa as lê: a posição `documentIds.<n>` é a da ordem em que foram enviadas. */
export function referDocuments(
  input: Readonly<{ documents: readonly DocumentReference[]; ids: readonly string[] }>,
): readonly DocumentReference[] {
  return input.ids.map((id) => ({
    id,
    number: labelOf({ documentId: id, documents: input.documents }),
  }))
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

/** A recusa do servidor que tem texto próprio no campo: "mais de 30 dias" diz mais que "o servidor recusou". */
export function describeServerFieldIssues(error: unknown): ArrivalFormIssues {
  if (!(error instanceof CargoReceivingRequestError)) return {}
  if (error.message !== ARRIVED_AT_TOO_OLD_CODE) return {}
  return { arrivedAt: { code: 'tooOld', max: CARGO_ARRIVAL_LIMITS.arrivedAtMaxAgeDays } }
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
            number: labelOf({ documentId: result.documentId, documents: input.documents }),
            reason: result.reason,
          },
        ]
      : [],
  )
  return {
    changedCount: input.results.filter((result) => result.outcome === 'changed').length,
    entries: input.results.map((result) => ({
      documentId: result.documentId,
      number: labelOf({ documentId: result.documentId, documents: input.documents }),
      outcome: result.outcome,
      reason: result.outcome === 'refused' ? result.reason : undefined,
    })),
    refused,
    unchangedCount: input.results.filter((result) => result.outcome === 'unchanged').length,
  }
}

/** O 409 do fechamento devolve o id de cada nota pendente em `documentId`, um item por nota. */
export function describePendingDocuments(
  input: Readonly<{ documents: readonly DocumentReference[]; error: unknown }>,
): readonly PendingDocument[] {
  if (!(input.error instanceof CargoReceivingRequestError)) return []
  const ids = new Set(
    input.error.details.flatMap((detail) =>
      PENDING_DOCUMENT_FIELD.test(detail.field) && detail.documentId !== undefined
        ? [detail.documentId]
        : [],
    ),
  )
  return [...ids].map((documentId) => ({
    documentId,
    number: labelOf({ documentId, documents: input.documents }),
  }))
}
