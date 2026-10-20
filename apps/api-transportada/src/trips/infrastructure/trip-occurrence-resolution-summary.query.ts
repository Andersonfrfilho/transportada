/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 277 RF5: a resolução média por tipo de ocorrência. É o dado da 276 (registro até o evento
 * `resolved` mais recente, o mesmo `resolvedAt` da linha do tempo) somado por tipo, nunca um cálculo
 * paralelo: conta só quem está resolvida **agora** (o último evento é `resolved`), e a cancelada (167)
 * fica de fora, como no andamento do feed. O nome do tipo é o do feed: o cadastrado, ou o `kind` da parada.
 */
import { sql } from 'drizzle-orm'

import type { TripOccurrenceResolutionSummaryItem } from '../application/trip-occurrence-feed.use-case.js'
import type { TripQueryable } from './trip-queryable.type.js'

type SummaryRow = {
  readonly resolved_count: number | string
  readonly seconds_total: number | string
  readonly type_name: string
}

export async function summarizeTripOccurrenceResolution(
  queryable: TripQueryable,
  input: { readonly companyId: string },
): Promise<readonly TripOccurrenceResolutionSummaryItem[]> {
  const rows = await queryable.execute<SummaryRow>(sql`
    select
      resolved.type_name,
      count(*)::int as resolved_count,
      sum(greatest(extract(epoch from (resolved.resolved_at - resolved.registered_at)), 0))::float8 as seconds_total
    from (
      select
        company_occurrence_types.name as type_name,
        trip_document_occurrences.created_at as registered_at,
        latest.created_at as resolved_at
      from trip_document_occurrences
      inner join company_occurrence_types
        on company_occurrence_types.company_id = trip_document_occurrences.company_id
        and company_occurrence_types.id = trip_document_occurrences.occurrence_type_id
      inner join lateral (
        select events.kind, events.created_at
        from trip_occurrence_resolution_events events
        where events.company_id = trip_document_occurrences.company_id
          and events.document_occurrence_id = trip_document_occurrences.id
        order by events.seq desc
        limit 1
      ) latest on latest.kind = 'resolved'
      where trip_document_occurrences.company_id = ${input.companyId}::uuid
        and trip_document_occurrences.cancelled_at is null
      union all
      select
        trip_stop_occurrences.kind as type_name,
        trip_stop_occurrences.created_at as registered_at,
        latest.created_at as resolved_at
      from trip_stop_occurrences
      inner join lateral (
        select events.kind, events.created_at
        from trip_occurrence_resolution_events events
        where events.company_id = trip_stop_occurrences.company_id
          and events.stop_occurrence_id = trip_stop_occurrences.id
        order by events.seq desc
        limit 1
      ) latest on latest.kind = 'resolved'
      where trip_stop_occurrences.company_id = ${input.companyId}::uuid
    ) resolved
    group by resolved.type_name
  `)
  return [...rows]
    .map((row) => {
      const resolvedCount = Number(row.resolved_count)
      return {
        averageSeconds: Math.round(Number(row.seconds_total) / resolvedCount),
        resolvedCount,
        typeName: row.type_name,
      }
    })
    .sort((a, b) => a.typeName.localeCompare(b.typeName, 'pt-BR'))
}
