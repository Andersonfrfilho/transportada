/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T5/T9: o SQL comum às seis fontes da linha do tempo — aliases dos joins de ator/motorista
 * "por conta de", o keyset do cursor, a ordenação e a prioridade constante por `kind`. Extraído do
 * orquestrador (`trip-timeline.query.ts`) para as três fontes (`trip-timeline-status.query.ts`,
 * `trip-timeline-stop.query.ts`, `trip-timeline-document.query.ts`) importarem sem duplicar.
 */
import { alias } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { SQL, SQLWrapper } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { fleetDrivers } from '../../database/fleet.schema.js'
import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
import { TRIP_TIMELINE_KIND_PRIORITY } from '../application/trip-timeline.types.js'
import type { TripTimelineCursor, TripTimelineKind } from '../application/trip-timeline.types.js'

export const timelineActorMembership = alias(
  userCompanyMemberships,
  'trip_timeline_actor_membership',
)
export const timelineActorProfile = alias(identityUserProfiles, 'trip_timeline_actor_profile')
export const timelineOnBehalfDriver = alias(fleetDrivers, 'trip_timeline_on_behalf_driver')

/** Texto em vez de `Date`: preserva os microssegundos que `occurred_at` guarda (T9). */
export function formatTimelineTimestampKey(column: AnyPgColumn): SQL<string> {
  return sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
}

/**
 * `(occurredAt, prioridade, id) < cursor`. `cursor.occurredAt` já é texto com microssegundos
 * (`TripTimelineCursor`), então o `::timestamptz` preserva a precisão total — nenhuma linha com o
 * mesmo instante do cursor e microssegundos maiores desaparece na página seguinte (T9).
 */
export function timelineKeysetCondition(
  occurredAtColumn: SQLWrapper,
  priorityExpression: SQL,
  idColumn: SQLWrapper,
  cursor: TripTimelineCursor,
): SQL {
  return sql`(${occurredAtColumn}, ${priorityExpression}, ${idColumn}) < (${cursor.occurredAt}::timestamptz, ${cursor.kindPriority}::int, ${cursor.id}::uuid)`
}

/**
 * Predicado adicional e redundante com o keyset, só para o planejador usar o índice
 * `(company, <fonte>, occurred_at)` em vez de varrer a tabela inteira (T9, item de performance):
 * `occurred_at <= cursor` é sargável sozinho, a tupla completa do keyset não é.
 */
export function timelineIndexablePredicate(
  occurredAtColumn: SQLWrapper,
  cursor: TripTimelineCursor,
): SQL {
  return sql`${occurredAtColumn} <= ${cursor.occurredAt}::timestamptz`
}

/**
 * Mesmo sentido decrescente do keyset (`<`) e do desempate em memória (`mergeTripTimeline`): maior
 * prioridade primeiro. Estava `asc` — o SQL cortava em `limit + 1` os itens de **menor** prioridade
 * por instante, o inverso do que o merge e o cursor esperam (T9, item crítico correlato).
 */
export function timelineOrderExpression(
  occurredAtColumn: SQLWrapper,
  priorityExpression: SQL,
  idColumn: SQLWrapper,
): readonly SQL[] {
  return [sql`${occurredAtColumn} desc`, sql`${priorityExpression} desc`, sql`${idColumn} desc`]
}

export function constantPriority(kind: TripTimelineKind): SQL {
  return sql`${TRIP_TIMELINE_KIND_PRIORITY[kind]}::int`
}
