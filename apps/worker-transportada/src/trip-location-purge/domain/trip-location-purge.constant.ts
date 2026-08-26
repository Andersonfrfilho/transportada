/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const TRIP_LOCATION_PURGE_JOB = 'trip.location.purge'

/**
 * ADR-0045 §3.3: noventa dias. Dado de localização de pessoa identificada é dado pessoal na LGPD, e
 * reter para sempre "por garantia" transforma comprovante em passivo.
 *
 * O prazo mora aqui e em `docs/SECURITY.md`, e é o mesmo número: retenção que a documentação promete
 * e o código não cumpre é retenção que não existe.
 */
export const TRIP_LOCATION_RETENTION_DAYS = 90

/**
 * A varredura anda em lotes porque a tabela é escrita o dia inteiro pela execução de campo: um
 * `UPDATE` único sobre noventa dias de eventos seguraria a escrita do motorista que está na rua.
 */
export const TRIP_LOCATION_PURGE_BATCH_SIZE = 500

/** Teto de lotes por ciclo: o que sobrar espera a próxima batida, e o log diz que sobrou. */
export const TRIP_LOCATION_PURGE_MAX_BATCHES = 200

const HOURS_PER_DAY = 24
const MILLISECONDS_PER_HOUR = 3_600_000

export function resolveRetentionCutoff(now: Date): Date {
  return new Date(
    now.getTime() - TRIP_LOCATION_RETENTION_DAYS * HOURS_PER_DAY * MILLISECONDS_PER_HOUR,
  )
}
