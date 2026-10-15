/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: o andamento da ocorrência no feed do painel. O filtro mora no SQL, na mesma consulta
 * que corta o cursor (filtrar a página já cortada devolveria páginas quase vazias); a leitura por item é em
 * lote, uma consulta por tabela de ocorrência, nunca uma por linha.
 */
import { inArray, sql } from 'drizzle-orm'
import type { AnyColumn, SQL } from 'drizzle-orm'

import { tripOccurrenceResolutionEvents } from '../../database/occurrence-conversation.schema.js'
import { tripDocumentOccurrences, tripStopOccurrences } from '../../database/trip.schema.js'
import type {
  TripOccurrenceFeedFilters,
  TripOccurrenceFeedResolutionView,
} from '../application/trip-occurrence-feed.use-case.js'
import { buildFeedResolutionView } from '../domain/occurrence-resolution.policy.js'
import { listLatestResolutionEventsByOccurrence } from './drizzle-occurrence-resolution.repository.js'
import type { TripQueryable } from './trip-queryable.type.js'

/** O último evento da ocorrência (`resolved` → resolved; `reopened` → reopened; nenhum → open). */
function latestEventStateSql(
  owner: 'document' | 'stop',
  companyId: AnyColumn,
  occurrenceId: AnyColumn,
): SQL {
  const ownerColumn =
    owner === 'document'
      ? tripOccurrenceResolutionEvents.documentOccurrenceId
      : tripOccurrenceResolutionEvents.stopOccurrenceId
  return sql`coalesce((
    select case ${tripOccurrenceResolutionEvents.kind} when 'resolved' then 'resolved' else 'reopened' end
    from ${tripOccurrenceResolutionEvents}
    where ${tripOccurrenceResolutionEvents.companyId} = ${companyId}
      and ${ownerColumn} = ${occurrenceId}
    order by ${tripOccurrenceResolutionEvents.createdAt} desc, ${tripOccurrenceResolutionEvents.id} desc
    limit 1
  ), 'open')`
}

/** `null` quando o filtro não foi pedido. A nota cancelada (167) é `cancelled`; a de parada nunca é. */
export function resolutionStateCondition(
  filters: TripOccurrenceFeedFilters | undefined,
  owner: 'document' | 'stop',
): SQL | null {
  const states = filters?.resolutionStateIn
  if (states === undefined || states.length === 0) return null
  if (owner === 'stop') {
    return inArray(
      latestEventStateSql(owner, tripStopOccurrences.companyId, tripStopOccurrences.id),
      [...states],
    )
  }
  const state = sql`(case when ${tripDocumentOccurrences.cancelledAt} is not null then 'cancelled'
    else ${latestEventStateSql(owner, tripDocumentOccurrences.companyId, tripDocumentOccurrences.id)} end)`
  return inArray(state, [...states])
}

export type FeedResolutionTarget = {
  readonly cancelledAt: string | undefined
  readonly id: string
  readonly source: 'document' | 'stop'
}

/** O estado exibido de cada ocorrência da página, em duas leituras no máximo. */
export async function listFeedResolutionViews(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly targets: readonly FeedResolutionTarget[] },
): Promise<ReadonlyMap<string, TripOccurrenceFeedResolutionView | null>> {
  const sources = ['document', 'stop'] as const
  const eventsBySource = await Promise.all(
    sources.map((source) =>
      listLatestResolutionEventsByOccurrence(queryable, {
        companyId: input.companyId,
        occurrenceIds: input.targets.filter((target) => target.source === source).map((t) => t.id),
        occurrenceKind: source,
      }),
    ),
  )
  const events = new Map(eventsBySource.flatMap((map) => [...map]))
  return new Map(
    input.targets.map((target) => [
      target.id,
      buildFeedResolutionView({
        cancelledAt: target.cancelledAt,
        events: events.get(target.id) ?? [],
      }),
    ]),
  )
}
