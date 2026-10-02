/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0081 §2 / spec 196 D2: o estado do ponto do evento — `varchar(16)` com CHECK, nunca ENUM
 * nativo (code-standart §8). Mora aqui, e não em `trips/domain/`, porque o schema o usa nos CHECKs
 * das tabelas de evento; `trips/domain/event-location-state.policy.ts` o consome, no mesmo molde de
 * `TRIP_FIELD_CHANNELS`.
 *
 * `null` é **não se aplica**: escritório, backoffice, ação derivada, despacho automático e o evento
 * antigo sem coordenada. Sem o estado, "o GPS falhou", "o prazo apagou" e "não era toque do
 * motorista" seriam o mesmo `null`.
 */
import { sql } from 'drizzle-orm'
import type { AnyPgColumn, CheckBuilder, IndexBuilder } from 'drizzle-orm/pg-core'
import { check, index, numeric, timestamp, varchar } from 'drizzle-orm/pg-core'

import { inList } from './schema-check.constant.js'

export const EVENT_LOCATION_STATES = {
  /** Há coordenada na linha. O CHECK de consistência amarra os dois. */
  captured: 'captured',
  /** O motorista tocou e a posição não veio — recusa, sem sinal, tempo esgotado, app antiga. */
  unavailable: 'unavailable',
  /** O expurgo dos 90 dias apagou as quatro colunas. */
  expired: 'expired',
} as const
export type EventLocationState = (typeof EVENT_LOCATION_STATES)[keyof typeof EVENT_LOCATION_STATES]

const raw = (value: string): ReturnType<typeof sql.raw> => sql.raw(value)

/**
 * As cinco colunas de posição do evento, iguais nas cinco tabelas (`plan.md` §Dados). Três tabelas
 * passam a declará-las de uma vez, e repetir ~135 linhas à mão é o gatilho do `code-standart` §16.
 *
 * ⚠️ **Função, nunca constante de módulo.** Um builder de coluna é objeto mutável: ele recebe o nome
 * e o `build()` da tabela que o consome. Um `const` espalhado em três `pgTable` entregaria o mesmo
 * objeto três vezes, e a última a construir ganharia — defeito silencioso, sem erro de tipo.
 */
export const buildEventLocationColumns = () => ({
  accuracyMeters: numeric('accuracy_meters', { precision: 10, scale: 2 }),
  capturedAt: timestamp('captured_at', { withTimezone: true }),
  latitude: numeric('latitude', { precision: 10, scale: 7 }),
  locationState: varchar('location_state', { length: 16 }).$type<EventLocationState>(),
  longitude: numeric('longitude', { precision: 10, scale: 7 }),
})

type EventLocationCheckColumns = {
  readonly accuracyMeters: AnyPgColumn
  readonly channel: AnyPgColumn
  readonly latitude: AnyPgColumn
  readonly locationState: AnyPgColumn
  readonly longitude: AnyPgColumn
}

type BuildEventLocationChecksParams = {
  readonly columns: EventLocationCheckColumns
  readonly coordinateChannel: string
  readonly statefulChannels: readonly string[]
  readonly tableName: string
}

/**
 * Os oito CHECKs da posição, na ordem do contrato. `tableName` vem como texto porque dentro do
 * segundo argumento do `pgTable` a tabela ainda não está pronta — `getTableName` ali devolveria
 * vazio. Os canais entram por parâmetro para não importar `TRIP_FIELD_CHANNELS`: `trip.schema.ts` já
 * importa deste arquivo, e a volta fecharia um ciclo.
 */
export const buildEventLocationChecks = ({
  columns,
  coordinateChannel,
  statefulChannels,
  tableName,
}: BuildEventLocationChecksParams): readonly CheckBuilder[] => [
  check(
    `${tableName}_coordinates_check`,
    sql`(${columns.latitude} is null) = (${columns.longitude} is null)`,
  ),
  check(
    `${tableName}_latitude_range_check`,
    sql`${columns.latitude} is null or ${columns.latitude} between -90 and 90`,
  ),
  check(
    `${tableName}_longitude_range_check`,
    sql`${columns.longitude} is null or ${columns.longitude} between -180 and 180`,
  ),
  /** Coordenada sem precisão e precisão sem coordenada são as duas metades de um dado que mente. */
  check(
    `${tableName}_accuracy_check`,
    sql`${columns.accuracyMeters} is null or ${columns.latitude} is not null`,
  ),
  check(
    `${tableName}_location_state_check`,
    sql`${columns.locationState} is null or ${columns.locationState} in (${raw(inList(Object.values(EVENT_LOCATION_STATES)))})`,
  ),
  /**
   * ADR-0081 §2: `captured` e a coordenada são a mesma afirmação — uma sem a outra é dado que mente.
   *
   * ⚠️ `is not distinct from`, e não `=`. CHECK que avalia `NULL` **passa** em Postgres, então as
   * duas formas intuitivas deixam entrar justamente a linha que este CHECK existe para barrar:
   * `location_state is null or (...)` curto-circuita, e `(location_state = 'captured') = (...)`
   * devolve `NULL` quando o estado é nulo. Só a comparação null-safe amarra os dois lados.
   */
  check(
    `${tableName}_location_state_consistency_check`,
    sql`(${columns.locationState} is not distinct from 'captured') = (${columns.latitude} is not null)`,
  ),
  /**
   * Coordenada só nasce de toque do motorista no app; estado também vale para o canal que pede
   * posição e não a recebe. Estes dois entram apenas nas tabelas que nascem sem nenhuma linha com
   * coordenada — numa tabela antiga eles precisariam de contagem em produção antes.
   */
  check(
    `${tableName}_coordinates_channel_check`,
    sql`${columns.latitude} is null or ${columns.channel} = ${raw(inList([coordinateChannel]))}`,
  ),
  check(
    `${tableName}_location_state_channel_check`,
    sql`${columns.locationState} is null or ${columns.channel} in (${raw(inList(statefulChannels))})`,
  ),
]

type BuildEventLocationIndexParams = {
  readonly latitude: AnyPgColumn
  readonly tableName: string
  readonly timeColumn: AnyPgColumn
}

/**
 * O índice parcial do expurgo dos 90 dias: ele varre por data e apaga só a coordenada, então sem
 * este índice varre a tabela inteira. A coluna de tempo é de cada tabela — `trip_status_events` não
 * tem `created_at`, as duas de ocorrência não têm `recorded_at` —, e o nome sai dela para que índice
 * e coluna nunca discordem.
 */
export const buildEventLocationIndex = ({
  latitude,
  tableName,
  timeColumn,
}: BuildEventLocationIndexParams): IndexBuilder =>
  index(`${tableName}_located_${timeColumn.name}_idx`)
    .on(timeColumn)
    .where(sql`${latitude} is not null`)
