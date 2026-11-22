/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 344 RF5 (ADR-0081 §9): o alerta "parece ser da NF X" que a API deriva no comprovante. O
 * painel o **aceita antes** de a API mandá-lo: `isDeliveryProof` recusa chave desconhecida e, sem
 * esta guarda, a chave nova descartaria o comprovante inteiro — a tela da nota ficaria sem foto, sem
 * erro nenhum.
 *
 * Alerta malformado sai **sozinho** (`withoutMalformedCanhotoMismatch`): o comprovante continua. A
 * tela do alerta é a T5 da 344; aqui só a forma.
 */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

export const CANHOTO_MISMATCH_KINDS = ['other_document', 'other_series'] as const
export type CanhotoMismatchKind = (typeof CANHOTO_MISMATCH_KINDS)[number]

/** Os estados da NF-e citada; cancelada é citada com o estado (spec 344, casos extremos). */
export const CANHOTO_MISMATCH_DOCUMENT_STATUSES = [
  'authorized',
  'cancelled',
  'denied',
  'unsigned',
] as const
export type CanhotoMismatchDocumentStatus = (typeof CANHOTO_MISMATCH_DOCUMENT_STATUSES)[number]

export const CANHOTO_MISMATCH_KEYS = [
  'kind',
  'matchedDocument',
  'readNumber',
  'readSeries',
] as const

export const CANHOTO_MISMATCH_MATCHED_DOCUMENT_KEYS = [
  'canhotoApproved',
  'nfeDocumentId',
  'number',
  'sameTrip',
  'series',
  'status',
  'tripDocumentId',
  'tripId',
] as const

export type CanhotoMismatchMatchedDocument = Readonly<{
  /** Q4: a NF X já tem canhoto aprovado ("duplicidade"). */
  canhotoApproved: boolean
  nfeDocumentId: string
  number: string
  sameTrip: boolean
  series: string
  status: CanhotoMismatchDocumentStatus
  /** O vínculo vivo da NF X (o desta viagem, quando há); é o alvo do "Mover para a NF X" (T5b). */
  tripDocumentId: null | string
  tripId: null | string
}>

export type CanhotoMismatch = Readonly<{
  kind: CanhotoMismatchKind
  /** `null`: a NF X não está no sistema, ou há mais de uma e nenhuma desempata. */
  matchedDocument: CanhotoMismatchMatchedDocument | null
  readNumber: string
  readSeries: null | string
}>

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

function isNullableNonEmptyString(value: unknown): value is null | string {
  return value === null || isNonEmptyString(value)
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
}

function isMatchedDocument(value: unknown): value is CanhotoMismatchMatchedDocument {
  return (
    hasExactKeys(value, CANHOTO_MISMATCH_MATCHED_DOCUMENT_KEYS) &&
    typeof value.canhotoApproved === 'boolean' &&
    isNonEmptyString(value.nfeDocumentId) &&
    isNonEmptyString(value.number) &&
    typeof value.sameTrip === 'boolean' &&
    isNonEmptyString(value.series) &&
    isOneOf(value.status, CANHOTO_MISMATCH_DOCUMENT_STATUSES) &&
    isNullableNonEmptyString(value.tripDocumentId) &&
    isNullableNonEmptyString(value.tripId)
  )
}

export function isCanhotoMismatch(value: unknown): value is CanhotoMismatch {
  return (
    hasExactKeys(value, CANHOTO_MISMATCH_KEYS) &&
    isOneOf(value.kind, CANHOTO_MISMATCH_KINDS) &&
    isNonEmptyString(value.readNumber) &&
    isNullableNonEmptyString(value.readSeries) &&
    (value.matchedDocument === null || isMatchedDocument(value.matchedDocument))
  )
}

/**
 * O comprovante com o alerta conferido: ausente fica ausente, válido passa, malformado sai sem
 * levar o comprovante junto.
 */
export function withoutMalformedCanhotoMismatch(
  proof: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (!('canhotoMismatch' in proof) || isCanhotoMismatch(proof.canhotoMismatch)) return proof
  return Object.fromEntries(Object.entries(proof).filter(([key]) => key !== 'canhotoMismatch'))
}
