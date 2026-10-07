/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const CARGO_PREVIEW_RETENTION_JOB = 'cargo-preview.retention.apply'

/** Prévia em estado terminal: a que ainda está na fila ou sendo lida não pode perder o arquivo. */
export const CARGO_PREVIEW_RETENTION_STATUSES = ['ready', 'failed'] as const

/** Lotes curtos: cada prévia abre I/O de rede contra o bucket dentro de uma transação própria. */
export const CARGO_PREVIEW_RETENTION_BATCH_SIZE = 25

/** Teto de lotes por ciclo: o que sobrar espera a próxima batida, e o log diz que sobrou. */
export const CARGO_PREVIEW_RETENTION_MAX_BATCHES = 200

/** Teto de objetos do bucket por prévia e por passada: o resto continua na execução seguinte. */
export const CARGO_PREVIEW_RETENTION_MAX_OBJECTS_PER_PREVIEW = 50

/** Falhas de bucket seguidas que encerram o ciclo: o storage está fora, insistir não apaga nada. */
export const CARGO_PREVIEW_RETENTION_MAX_CONSECUTIVE_STORAGE_FAILURES = 5

/** A transação da prévia fica aberta durante o I/O de rede, então o delete não pode pendurar. */
export const CARGO_PREVIEW_RETENTION_DELETE_TIMEOUT_MS = 10_000

export const CARGO_PREVIEW_RETENTION_MILLISECONDS_PER_DAY = 86_400_000

/** Como a unidade de trabalho (uma prévia) terminou — o laço do ciclo só soma. */
export const CARGO_PREVIEW_RETENTION_UNIT_RESULT = {
  failed: 'failed',
  partial: 'partial',
  retained: 'retained',
  skipped: 'skipped',
} as const
export type CargoPreviewRetentionUnitResult =
  (typeof CARGO_PREVIEW_RETENTION_UNIT_RESULT)[keyof typeof CARGO_PREVIEW_RETENTION_UNIT_RESULT]
