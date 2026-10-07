/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O corte da retenção: prévia cujo último movimento é igual ou anterior a ele já completou os dias
 * do prazo. O relógio entra como argumento — a política nunca lê `new Date()`.
 */
export function resolveCargoPreviewRetentionCutoff(now: Date): Date {
  return now
}

export function isCargoPreviewRetentionDue(input: {
  readonly now: Date
  readonly referenceAt: Date
}): boolean {
  return input.referenceAt.getTime() > resolveCargoPreviewRetentionCutoff(input.now).getTime()
}
