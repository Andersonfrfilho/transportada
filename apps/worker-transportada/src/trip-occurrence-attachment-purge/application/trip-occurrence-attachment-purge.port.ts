/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type { DeleteStoredObjectBytes } from './trip-occurrence-attachment-purge-unit.port.js'

export type PurgeOccurrenceAttachmentBatchInput = {
  /** `stored_objects.retention_until` anterior a este instante entra na varredura. */
  readonly before: Date
  readonly limit: number
}

export type PurgeOccurrenceAttachmentBatchResult = {
  /** Candidatos examinados no lote — é o que decide se o laço continua (ajuste 5: nunca `deleted`). */
  readonly processed: number
  /** Unidades apagadas de verdade: anexo + os dois objetos, ou o objeto órfão (ajuste 6). */
  readonly deleted: number
  /** Unidade que outro ciclo já convergiu: perdeu o lock, ou já estava `deleted` ao reconferir. */
  readonly missing: number
  /** Exclusão de bucket que falhou — a unidade não é tocada no banco (rollback, ajuste 4). */
  readonly failed: number
}

/**
 * Apaga **um lote** de anexos vencidos. A unidade de trabalho é o anexo (CA13, ajuste 4): cada
 * candidato resolve a linha de `trip_document_occurrence_attachments` por `stored_object_id OR
 * thumbnail_object_id` e os dois objetos saem juntos, numa transação por unidade — nunca a do lote
 * inteiro, porque a falha de uma unidade não pode desfazer o que as anteriores já confirmaram.
 */
export type PurgeOccurrenceAttachmentBatch = (
  input: PurgeOccurrenceAttachmentBatchInput,
) => Promise<PurgeOccurrenceAttachmentBatchResult>
