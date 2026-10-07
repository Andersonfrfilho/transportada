/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237, revisão de segurança da Fase 4a (S2): o orçamento cooperativo do vínculo de uma prévia.
 */
import type { MatchingBudget } from '../../cargo-receiving/domain/cargo-preview-matching.types.js'
import type { MonotonicClock } from '../../cargo-receiving/domain/cargo-preview-workbook.types.js'
import { CargoPreviewMatchTimeoutError } from './cargo-preview-match-timeout.error.js'

/** O prazo corre a partir da primeira consulta ao orçamento de cada prévia. */
export function createMatchBudget(input: {
  readonly budgetMs: number
  readonly clock: MonotonicClock
}): MatchingBudget {
  const startedAt = input.clock()
  return {
    check: () => {
      if (input.clock() - startedAt > input.budgetMs) throw new CargoPreviewMatchTimeoutError()
    },
  }
}
