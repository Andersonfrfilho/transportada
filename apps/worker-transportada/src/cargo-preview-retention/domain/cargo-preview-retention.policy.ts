/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CARGO_PREVIEW_RETENTION_DAYS } from '../../shared/cargo-preview.constant.js'
import { CARGO_PREVIEW_RETENTION_MILLISECONDS_PER_DAY } from './cargo-preview-retention.constant.js'

/**
 * O corte da retenção: prévia cujo último movimento é igual ou anterior a ele já completou os dias
 * do prazo. O relógio entra como argumento — a política nunca lê o relógio do sistema.
 */
export function resolveCargoPreviewRetentionCutoff(now: Date): Date {
  return new Date(
    now.getTime() - CARGO_PREVIEW_RETENTION_DAYS * CARGO_PREVIEW_RETENTION_MILLISECONDS_PER_DAY,
  )
}

export function isCargoPreviewRetentionDue(input: {
  readonly now: Date
  readonly referenceAt: Date
}): boolean {
  return input.referenceAt.getTime() <= resolveCargoPreviewRetentionCutoff(input.now).getTime()
}
