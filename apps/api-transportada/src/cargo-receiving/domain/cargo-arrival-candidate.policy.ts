/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: a nota candidata a uma chegada é do emitente do contratante, autorizada, fora de
 * viagem viva e de outra chegada. Sem I/O: o repositório traz as linhas, a decisão é daqui.
 */
import { createHash } from 'node:crypto'

import { NFE_DOCUMENT_AUTHORIZED_STATUS } from '../../nfe-documents/domain/nfe-document-status.constant.js'
import {
  CARGO_ARRIVAL_RETURN_STATE,
  type CargoArrivalReturnState,
} from '../../shared/cargo-arrival.constant.js'

export const CARGO_ARRIVAL_DOCUMENT_REFUSAL = {
  alreadyInArrival: 'DOCUMENT_ALREADY_IN_ARRIVAL',
  anotherIssuer: 'DOCUMENT_FROM_ANOTHER_ISSUER',
  inLiveTrip: 'DOCUMENT_IN_LIVE_TRIP',
  notAuthorized: 'DOCUMENT_NOT_AUTHORIZED',
  notFound: 'DOCUMENT_NOT_FOUND',
  returnToContractor: 'DOCUMENT_RETURN_TO_CONTRACTOR',
} as const
export type CargoArrivalDocumentRefusal =
  (typeof CARGO_ARRIVAL_DOCUMENT_REFUSAL)[keyof typeof CARGO_ARRIVAL_DOCUMENT_REFUSAL]

export type ArrivalCandidateRow = {
  readonly emitterTaxId: string | null
  readonly id: string
  readonly isInArrival: boolean
  readonly isInLiveTrip: boolean
  /** A marcação da nota na chegada em que ela está; `null` fora de chegada (spec 237 RF8a). */
  readonly returnToContractor: CargoArrivalReturnState | null
  readonly status: string
}

export type ArrivalCandidateRefusal = {
  readonly documentId: string
  readonly index: number
  readonly reason: CargoArrivalDocumentRefusal
}

/** O emitente errado vem primeiro: da nota alheia não se diz mais nada. */
function classifyArrivalCandidate({
  contractorTaxId,
  row,
}: {
  readonly contractorTaxId: string
  readonly row: ArrivalCandidateRow | undefined
}): CargoArrivalDocumentRefusal | null {
  if (row === undefined) return CARGO_ARRIVAL_DOCUMENT_REFUSAL.notFound
  if (row.emitterTaxId !== contractorTaxId) return CARGO_ARRIVAL_DOCUMENT_REFUSAL.anotherIssuer
  if (row.status !== NFE_DOCUMENT_AUTHORIZED_STATUS)
    return CARGO_ARRIVAL_DOCUMENT_REFUSAL.notAuthorized
  if (
    row.returnToContractor !== null &&
    row.returnToContractor !== CARGO_ARRIVAL_RETURN_STATE.none
  ) {
    return CARGO_ARRIVAL_DOCUMENT_REFUSAL.returnToContractor
  }
  if (row.isInArrival) return CARGO_ARRIVAL_DOCUMENT_REFUSAL.alreadyInArrival
  if (row.isInLiveTrip) return CARGO_ARRIVAL_DOCUMENT_REFUSAL.inLiveTrip
  return null
}

export type FindArrivalCandidateRefusalsParams = {
  readonly contractorTaxId: string
  readonly documentIds: readonly string[]
  readonly rows: readonly ArrivalCandidateRow[]
}

/** Todas as recusadas de uma vez, na posição do pedido — nunca só a primeira. */
export function findArrivalCandidateRefusals({
  contractorTaxId,
  documentIds,
  rows,
}: FindArrivalCandidateRefusalsParams): readonly ArrivalCandidateRefusal[] {
  const rowsById = new Map(rows.map((row) => [row.id, row]))
  return documentIds.flatMap((documentId, index) => {
    const reason = classifyArrivalCandidate({ contractorTaxId, row: rowsById.get(documentId) })
    return reason === null ? [] : [{ documentId, index, reason }]
  })
}

export type ArrivalRequestFingerprintParams = {
  readonly arrivedAt: Date
  readonly contractorId: string
  readonly documentIds: readonly string[]
  readonly palletCount: number | null
  readonly reference: string | null
}

/** A mesma chave com outro conteúdo é reuso; a ordem das notas não é conteúdo. */
export function buildArrivalRequestFingerprint(params: ArrivalRequestFingerprintParams): string {
  const canonical = JSON.stringify([
    params.contractorId,
    [...params.documentIds].sort(),
    params.arrivedAt.toISOString(),
    params.palletCount,
    params.reference,
  ])
  return createHash('sha256').update(canonical).digest('hex')
}
