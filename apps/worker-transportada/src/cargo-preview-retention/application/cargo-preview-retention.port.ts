/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type ApplyCargoPreviewRetentionBatchInput = {
  /** Prévia que já falhou ou ficou parcial neste ciclo: a próxima execução tenta de novo. */
  readonly excludedPreviewIds: readonly string[]
  readonly limit: number
  readonly now: Date
}

export type ApplyCargoPreviewRetentionBatchResult = {
  /** Prévias que falharam no bucket ou ficaram parciais — o ciclo não as repete. */
  readonly deferredPreviewIds: readonly string[]
  /** Falha de bucket: a prévia não é marcada e volta na próxima execução. */
  readonly failed: number
  /** Teto de objetos por prévia atingido: o evento só sai quando o último objeto some. */
  readonly partial: number
  /** Candidatas examinadas — é o que decide se o laço continua, nunca `retained`. */
  readonly processed: number
  readonly retained: number
  /** Outro ciclo tratou ou travou a prévia entre a consulta e o lock. */
  readonly skipped: number
}

/** Trata **um lote** de prévias vencidas, uma transação por prévia, nunca uma por lote. */
export type ApplyCargoPreviewRetentionBatch = (
  input: ApplyCargoPreviewRetentionBatchInput,
) => Promise<ApplyCargoPreviewRetentionBatchResult>
