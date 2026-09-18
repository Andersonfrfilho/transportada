/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7.3 (D7): a idempotência da ocorrência em massa. Uma chave por lote, vinda do cliente,
 * que se desdobra em duas reservas em `trip_field_reports`, sem migration.
 */
import { createHash } from 'node:crypto'

/**
 * A reserva do lote leva a **impressão do conteúdo** na operação: a mesma chave com outro tipo,
 * outra observação, outro motorista ou outras notas é erro do cliente (409), não repetição.
 */
export const OFFICE_OCCURRENCE_BATCH_OPERATION_PREFIX = 'office.document.occurrence-batch:'

/** Ressalva B1: a operação exclusiva da reserva de cada nota. */
export const OFFICE_OCCURRENCE_BATCH_ITEM_OPERATION = 'office.document.occurrence-batch-item'

/** Ressalva B1: o espaço próprio das chaves por nota — nenhuma chave de cliente começa aqui. */
const BATCH_ITEM_KEY_PREFIX = 'batch:'

export type BuildOccurrenceBatchOperationParams = {
  readonly attachmentSha256?: string | null
  readonly documentIds: readonly string[]
  readonly note: string
  readonly occurrenceTypeId: string
  readonly onBehalfOfDriverId: string
}

/**
 * T7b: a foto entra na impressão do lote — a mesma chave com outra foto (ou com foto onde antes
 * não havia) é outro conteúdo, e cai no mesmo 409 `TRIP_FIELD_REPORT_KEY_REUSED` do texto trocado.
 */
export function buildOccurrenceBatchOperation(params: BuildOccurrenceBatchOperationParams): string {
  const fingerprint = JSON.stringify([
    params.occurrenceTypeId,
    params.note,
    params.onBehalfOfDriverId,
    params.documentIds.toSorted(),
    params.attachmentSha256 ?? null,
  ])
  return `${OFFICE_OCCURRENCE_BATCH_OPERATION_PREFIX}${sha256(fingerprint)}`
}

/**
 * T7b (D7 §3.5): a chave do objeto do anexo do lote — sem PII, só a viagem e um id opaco, no molde
 * de `buildDeliveryProofObjectKey`.
 */
export function buildOccurrenceBatchAttachmentObjectKey(input: {
  readonly companyId: string
  readonly objectId: string
  readonly tripId: string
}): string {
  return `tenants/${input.companyId}/trip-occurrence-attachments/${input.tripId}/${input.objectId}`
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export type BuildOccurrenceBatchItemKeyParams = {
  readonly documentId: string
  readonly idempotencyKey: string
}

/**
 * `batch:<sha256(chave)>:<nota>`. O hash tira a chave do cliente do texto (e o comprimento dela da
 * conta), e o prefixo garante que uma chave mandada pelo cliente nunca caia neste espaço.
 */
export function buildOccurrenceBatchItemKey(params: BuildOccurrenceBatchItemKeyParams): string {
  return `${BATCH_ITEM_KEY_PREFIX}${sha256(params.idempotencyKey)}:${params.documentId}`
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
