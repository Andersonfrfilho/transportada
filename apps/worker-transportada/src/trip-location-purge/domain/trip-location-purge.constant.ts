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

/**
 * Spec 196 D2 / ADR-0081 §2. ⚠️ **Cópia por valor** de `EVENT_LOCATION_STATES.expired`
 * (`api-transportada/src/database/event-location.schema.ts`): o worker não importa código da API.
 *
 * O expurgo é quem carimba este estado, e carimbá-lo não é cosmético: `captured` afirma que há
 * coordenada na linha, e o CHECK de consistência da API amarra as duas coisas com `is not distinct
 * from`. Apagar as quatro colunas sem trocar o estado deixa a linha afirmando uma coordenada que não
 * existe mais — e desde que o CHECK deixou de ter o buraco de `NULL`, faz o `UPDATE` do lote inteiro
 * falhar com 23514, derrubando a batida diária.
 */
export const EXPIRED_LOCATION_STATE = 'expired'

const HOURS_PER_DAY = 24
const MILLISECONDS_PER_HOUR = 3_600_000

export function resolveRetentionCutoff(now: Date): Date {
  return new Date(
    now.getTime() - TRIP_LOCATION_RETENTION_DAYS * HOURS_PER_DAY * MILLISECONDS_PER_HOUR,
  )
}

/**
 * ADR-0056 §2. ⚠️ **Cópia por valor** de `TRIP_TRACKING_MAX_AGE_HOURS`
 * (`api-transportada/src/trips/domain/tracking-window.policy.ts`): o worker não importa código da
 * API. Mudou lá? mude aqui — e o contrato de paridade compara os dois números.
 *
 * O rastro ao vivo tem prazo muito mais curto que os noventa dias da coordenada de entrega, e é
 * de propósito: a coordenada carimba um fato que se audita depois, e o ping é o trajeto — que a
 * ADR-0050 §5 decidiu **não** guardar.
 */
export const TRIP_TRACKING_MAX_AGE_HOURS = 36

export function resolveTrackingPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - TRIP_TRACKING_MAX_AGE_HOURS * MILLISECONDS_PER_HOUR)
}
