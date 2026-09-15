/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const RATE_LIMIT_WINDOW_PURGE_JOB = 'rate-limit.window.purge'

/**
 * A janela mais longa que a API aceita (`RATE_LIMIT_CONTRACTOR_MAIL_WINDOW_SECONDS` ≤ 86400). O
 * worker não lê o ambiente da API; o teto do schema de lá é o que torna este corte seguro.
 */
export const RATE_LIMIT_WINDOW_MAX_SECONDS = 86_400

/** Folga depois de a janela vencer: a linha fica um dia a mais para quem for investigar um 429. */
export const RATE_LIMIT_WINDOW_RETENTION_AFTER_EXPIRY_SECONDS = 86_400

/** Lotes curtos: cada um é um `DELETE` que trava as linhas que apaga, e nada além delas. */
export const RATE_LIMIT_WINDOW_PURGE_BATCH_SIZE = 1_000

/** Teto de lotes por ciclo: o que sobrar espera a próxima batida, e o log diz que sobrou. */
export const RATE_LIMIT_WINDOW_PURGE_MAX_BATCHES = 100

const MILLISECONDS_PER_SECOND = 1_000

/**
 * Janela que começou antes deste instante já venceu há mais de 24 h, qualquer que seja a duração
 * dela: começo + janela máxima + folga.
 */
export function resolveRateLimitWindowPurgeCutoff(now: Date): Date {
  const keepSeconds =
    RATE_LIMIT_WINDOW_MAX_SECONDS + RATE_LIMIT_WINDOW_RETENTION_AFTER_EXPIRY_SECONDS
  return new Date(now.getTime() - keepSeconds * MILLISECONDS_PER_SECOND)
}
