/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const TRIP_LOCATION_PURGE_JOB = 'trip.location.purge'

/**
 * A varredura anda em lotes porque a tabela é escrita o dia inteiro pela execução de campo: um
 * `UPDATE` único sobre toda a retenção vencida seguraria a escrita do motorista que está na rua.
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

/** Spec 196 D8: nomes de tabela citados em mais de um ponto do expurgo (listas, log e redatores). */
export const TRIP_STOP_EVENTS_TABLE = 'trip_stop_events'
export const TRIP_DELIVERY_PROOFS_TABLE = 'trip_delivery_proofs'
export const TRIP_STATUS_EVENTS_TABLE = 'trip_status_events'
export const TRIP_STOP_OCCURRENCES_TABLE = 'trip_stop_occurrences'
export const TRIP_DOCUMENT_OCCURRENCES_TABLE = 'trip_document_occurrences'

/**
 * Spec 196 D8: as cinco tabelas de evento que carregam o ponto do toque, cada uma com a coluna de
 * tempo que o corte por empresa compara. ⚠️ Cópia por valor do que o worker enxerga — o
 * contrato de paridade lê o schema da API e reprova tabela com `latitude` fora desta lista e da
 * `TRIP_LOCATION_UNSTAMPED_TABLES`.
 */
export const TRIP_LOCATION_STAMPED_TABLES = [
  { table: TRIP_STOP_EVENTS_TABLE, timeColumn: 'created_at' },
  { table: TRIP_DELIVERY_PROOFS_TABLE, timeColumn: 'created_at' },
  { table: TRIP_STATUS_EVENTS_TABLE, timeColumn: 'recorded_at' },
  { table: TRIP_STOP_OCCURRENCES_TABLE, timeColumn: 'created_at' },
  { table: TRIP_DOCUMENT_OCCURRENCES_TABLE, timeColumn: 'created_at' },
] as const

const ADDRESS_NOT_PERSON_POSITION_REASON =
  'endereço ou cadastro de lugar, não a posição de uma pessoa em um instante'

/** Spec 196 D8: tabelas com coordenada que o expurgo da posição **não** varre, e por quê. */
export const TRIP_LOCATION_UNSTAMPED_TABLES = [
  { table: 'trip_stops', reason: ADDRESS_NOT_PERSON_POSITION_REASON },
  { table: 'client_delivery_addresses', reason: ADDRESS_NOT_PERSON_POSITION_REASON },
  { table: 'geocoded_addresses', reason: ADDRESS_NOT_PERSON_POSITION_REASON },
  { table: 'geocoded_address_corrections', reason: ADDRESS_NOT_PERSON_POSITION_REASON },
  { table: 'municipality_centroids', reason: ADDRESS_NOT_PERSON_POSITION_REASON },
  { table: 'toll_booths', reason: ADDRESS_NOT_PERSON_POSITION_REASON },
  {
    table: 'trip_location_pings',
    reason: 'rastro ao vivo, com expurgo próprio de horas (ADR-0056 §2) que apaga a linha inteira',
  },
  {
    table: 'fleet_drivers',
    reason:
      'coordenada da casa do motorista: cadastro que vale enquanto ele está na frota, e não o lugar onde ele esteve num instante — vive e morre com a ficha, não com prazo',
  },
] as const

const MILLISECONDS_PER_HOUR = 3_600_000

/**
 * ADR-0056 §2. ⚠️ **Cópia por valor** de `TRIP_TRACKING_MAX_AGE_HOURS`
 * (`api-transportada/src/trips/domain/tracking-window.policy.ts`): o worker não importa código da
 * API. Mudou lá? mude aqui — e o contrato de paridade compara os dois números.
 *
 * O rastro ao vivo tem prazo muito mais curto que o prazo por empresa da coordenada de entrega (90 dias por padrão), e é
 * de propósito: a coordenada carimba um fato que se audita depois, e o ping é o trajeto — que a
 * ADR-0050 §5 decidiu **não** guardar.
 */
export const TRIP_TRACKING_MAX_AGE_HOURS = 36

export function resolveTrackingPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - TRIP_TRACKING_MAX_AGE_HOURS * MILLISECONDS_PER_HOUR)
}
