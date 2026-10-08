/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 228 D4, D5, D7, D8: o endereço corrigido da parada como evento da linha do tempo, derivado das
 * duas trilhas de correção humana (`geocoded_address_corrections` e o refino `refined` de
 * `geocoding_refinement_requests`) — sem tabela nem coluna nova. UMA consulta para as duas trilhas: o pool tem 10
 * conexões e o `Promise.all` da linha do tempo já abre nove. Nenhuma junção com a tabela global de
 * geocodificação: o ponto novo vem da própria correção, e no refino não há ponto guardado. Só origem,
 * deslocamento e ponto saem; nenhum texto livre. Erro de fonte propaga: o `nextCursor` sai do último item.
 */
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import { distanceInMetres } from '../../addresses/domain/coordinate-distance.js'
import { SERVICE_COMPANY_ROLES } from '../../database/identity.schema.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../../identity/domain/system-distribution-actor.constant.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import type { TripTimelineRow } from '../application/trip-timeline-merge.service.js'
import type {
  ReadTripTimelineParams,
  TripTimelineAddressChangeOrigin,
  TripTimelineLocation,
} from '../application/trip-timeline.types.js'
import type { TripQueryable } from './trip-queryable.type.js'
import {
  constantPriority,
  formatTimelineTimestampKey,
  timelineKeysetCondition,
  timelineOrderExpression,
} from './trip-timeline-condition.helper.js'
import { documentStopScope } from './trip-timeline-stop.query.js'

export type AddressCorrectionQueryRow = {
  readonly actorName: string | null
  readonly createdAt: Date
  readonly id: string
  readonly isSystemActor: boolean
  readonly newLatitude: string | null
  readonly newLongitude: string | null
  readonly occurredAtKey: string
  readonly origin: TripTimelineAddressChangeOrigin
  readonly previousLatitude: string | null
  readonly previousLongitude: string | null
  readonly stopId: string
  readonly stopSequence: bigint | number | string
}

type AddressCorrectionSqlRow = {
  readonly actor_name: string | null
  readonly created_at: Date | string
  readonly id: string
  readonly is_system_actor: boolean
  readonly new_latitude: string | null
  readonly new_longitude: string | null
  readonly occurred_at_key: string
  readonly origin: TripTimelineAddressChangeOrigin
  readonly previous_latitude: string | null
  readonly previous_longitude: string | null
  readonly stop_id: string
  readonly stop_sequence: bigint | number | string
}

function toNewLocation(row: AddressCorrectionQueryRow): TripTimelineLocation | null {
  if (row.newLatitude === null || row.newLongitude === null) return null
  return {
    accuracyMeters: null,
    capturedAt: row.createdAt.toISOString(),
    distanceMeters: null,
    latitude: Number(row.newLatitude),
    longitude: Number(row.newLongitude),
  }
}

function toDisplacementMeters(row: AddressCorrectionQueryRow): number | null {
  if (
    row.previousLatitude === null ||
    row.previousLongitude === null ||
    row.newLatitude === null ||
    row.newLongitude === null
  ) {
    return null
  }
  const distance = distanceInMetres(
    { latitude: row.previousLatitude, longitude: row.previousLongitude },
    { latitude: row.newLatitude, longitude: row.newLongitude },
  )
  return distance === null ? null : Math.round(distance)
}

export function toAddressCorrectedTimelineRow(row: AddressCorrectionQueryRow): TripTimelineRow {
  return {
    actorName: row.actorName ?? null,
    isSystemActor: row.isSystemActor,
    addressChange: { displacementMeters: toDisplacementMeters(row), origin: row.origin },
    channel: null,
    closeReason: null,
    document: null,
    fromStatus: null,
    id: row.id,
    kind: 'stop.address_corrected',
    lateRegistration: false,
    location: toNewLocation(row),
    locationState: null,
    occurrence: null,
    occurredAt: row.createdAt,
    occurredAtKey: row.occurredAtKey,
    onBehalfOfDriverName: null,
    recordedAt: null,
    returnReason: null,
    stop: { id: row.stopId, sequence: Number(row.stopSequence) },
    toStatus: null,
  }
}

function fromSqlRow(row: AddressCorrectionSqlRow): AddressCorrectionQueryRow {
  return {
    actorName: row.actor_name,
    createdAt: new Date(row.created_at),
    id: row.id,
    isSystemActor: row.is_system_actor,
    newLatitude: row.new_latitude,
    newLongitude: row.new_longitude,
    occurredAtKey: row.occurred_at_key,
    origin: row.origin,
    previousLatitude: row.previous_latitude,
    previousLongitude: row.previous_longitude,
    stopId: row.stop_id,
    stopSequence: row.stop_sequence,
  }
}

const ADDRESS_INSTANT = sql`matched.created_at`

function buildDocumentStopFilter(params: ReadTripTimelineParams): SQL {
  if (params.documentId === undefined) return sql``
  return sql`and ${documentStopScope(params)}`
}

function buildKeysetFilter(params: ReadTripTimelineParams): SQL {
  if (params.cursor === null) return sql``
  const condition = timelineKeysetCondition(
    ADDRESS_INSTANT,
    constantPriority('stop.address_corrected'),
    sql`matched.id`,
    params.cursor,
  )
  return sql`where ${condition}`
}

export async function listAddressCorrectedRows(
  queryable: TripQueryable,
  params: ReadTripTimelineParams,
): Promise<readonly TripTimelineRow[]> {
  const order = sql.join(
    [
      ...timelineOrderExpression(
        ADDRESS_INSTANT,
        constantPriority('stop.address_corrected'),
        sql`matched.id`,
      ),
    ],
    sql`, `,
  )
  const rows = await queryable.execute<AddressCorrectionSqlRow>(sql`
    select
      matched.id,
      matched.created_at,
      matched.origin,
      matched.new_latitude,
      matched.new_longitude,
      matched.previous_latitude,
      matched.previous_longitude,
      matched.stop_id,
      matched.stop_sequence,
      actor_profile.name as actor_name,
      (actor_membership.user_id = ${SYSTEM_DISTRIBUTION_ACTOR_USER_ID}::uuid or exists (
        select 1 from membership_roles
        where membership_roles.membership_id = actor_membership.id
          and membership_roles.role in (${sql.join(
            SERVICE_COMPANY_ROLES.map((role) => sql`${role}`),
            sql`, `,
          )})
      )) as is_system_actor,
      ${formatTimelineTimestampKey(ADDRESS_INSTANT)} as occurred_at_key
    from (
      select distinct on (changes.id)
        changes.id,
        changes.created_at,
        changes.origin,
        changes.new_latitude,
        changes.new_longitude,
        changes.previous_latitude,
        changes.previous_longitude,
        changes.actor_user_id,
        trip_stops.id as stop_id,
        trip_stops.sequence as stop_sequence
      from trip_stops
      join (
        select id, address_key, created_at, origin, new_latitude, new_longitude,
          previous_latitude, previous_longitude, actor_user_id
        from geocoded_address_corrections
        where company_id = ${params.companyId}
          and address_key in (
            select address_key from trip_stops
            where company_id = ${params.companyId} and trip_id = ${params.tripId}
          )
        union all
        select id, address_key, created_at, 'refinement'::text, null::numeric, null::numeric,
          null::numeric, null::numeric, actor_user_id
        from geocoding_refinement_requests
        where company_id = ${params.companyId} and outcome = 'refined'
          and address_key in (
            select address_key from trip_stops
            where company_id = ${params.companyId} and trip_id = ${params.tripId}
          )
      ) changes
        on changes.address_key = trip_stops.address_key
        and changes.created_at >= trip_stops.created_at
      where trip_stops.company_id = ${params.companyId}
        and trip_stops.trip_id = ${params.tripId}
        ${buildDocumentStopFilter(params)}
      order by changes.id, trip_stops.sequence asc
    ) matched
    left join user_company_memberships actor_membership
      on actor_membership.company_id = ${params.companyId}
      and actor_membership.user_id = matched.actor_user_id
      and actor_membership.status = ${ACTIVE_MEMBERSHIP_STATUS}
    left join identity_user_profiles actor_profile
      on actor_profile.user_id = actor_membership.user_id
    ${buildKeysetFilter(params)}
    order by ${order}
    limit ${params.limit + 1}
  `)

  return rows.map((row) => toAddressCorrectedTimelineRow(fromSqlRow(row)))
}
