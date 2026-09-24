/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type { DeleteStoredObjectBytes } from './trip-occurrence-upload-expire-unit.port.js'

export type ExpireOccurrenceUploadBatchInput = {
  /** `trip_occurrence_uploads.expires_at` anterior a este instante (já com a folga aplicada) entra na varredura. */
  readonly before: Date
  readonly limit: number
}

export type ExpireOccurrenceUploadBatchResult = {
  /** Candidatos examinados no lote — é o que decide se o laço continua, nunca `expired` sozinho. */
  readonly processed: number
  /** Unidades expiradas de verdade: objeto apagado do bucket (ou já ausente) e linha marcada. */
  readonly expired: number
  /** Unidade que outro ciclo/`confirm` já converge: perdeu o lock, ou o estado já mudou. */
  readonly missing: number
  /** Exclusão de bucket que falhou — a unidade não é tocada no banco. */
  readonly failed: number
}

/**
 * Expira **um lote** de pedidos de upload vencidos (achado [3], spec 179). A unidade de trabalho é
 * o próprio pedido: apaga o objeto do bucket (se existir) e marca `status = 'expired'`, numa
 * transação por unidade — nunca a do lote inteiro, para a falha de uma não desfazer o que as
 * anteriores já confirmaram.
 */
export type ExpireOccurrenceUploadBatch = (
  input: ExpireOccurrenceUploadBatchInput,
) => Promise<ExpireOccurrenceUploadBatchResult>
