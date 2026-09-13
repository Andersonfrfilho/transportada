/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const TRIP_CARGO_LAYOUT_PURGE_JOB = 'trip.cargo-layout.purge'

/**
 * Spec 145 D19: um dia. O `input` da prévia carrega o nome do cliente e o endereço das paradas, e a
 * prévia que não virou viagem não tem por que guardar isso além do dia em que foi olhada.
 */
export const TRIP_CARGO_LAYOUT_PREVIEW_RETENTION_HOURS = 24

/** Lotes curtos: cada um é uma transação que trava as linhas que apaga, e nada além delas. */
export const TRIP_CARGO_LAYOUT_PURGE_BATCH_SIZE = 500

/** Teto de lotes por ciclo: o que sobrar espera a próxima batida, e o log diz que sobrou. */
export const TRIP_CARGO_LAYOUT_PURGE_MAX_BATCHES = 200

const MILLISECONDS_PER_HOUR = 3_600_000

export function resolveCargoLayoutPreviewCutoff(now: Date): Date {
  return new Date(now.getTime() - TRIP_CARGO_LAYOUT_PREVIEW_RETENTION_HOURS * MILLISECONDS_PER_HOUR)
}
