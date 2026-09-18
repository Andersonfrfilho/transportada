/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T5/T9 (correção do orquestrador): a linha do tempo une seis fontes de uma viagem só,
 * cada uma em seu próprio arquivo de infraestrutura (`trip-timeline-status.query.ts`,
 * `trip-timeline-stop.query.ts`, `trip-timeline-document.query.ts`, D5: `trip_stop_events` cobre
 * três `kind`s). Este arquivo só orquestra: existência da viagem na empresa
 * (`findTripCompanyScope`) e a leitura paginada (`listTripTimeline`, `Promise.all`, sem N+1) — SQL
 * comum e o codec do cursor vivem em `trip-timeline-condition.helper.ts` e
 * `trip-timeline-cursor.service.ts`.
 */
import { and, eq } from 'drizzle-orm'

import { trips } from '../../database/trip.schema.js'
import { encodeTripTimelineCursor } from '../application/trip-timeline-cursor.service.js'
import { mergeTripTimeline } from '../application/trip-timeline-merge.service.js'
import { TRIP_TIMELINE_KIND_PRIORITY } from '../application/trip-timeline.types.js'
import type {
  ReadTripTimelineParams,
  ReadTripTimelineResult,
} from '../application/trip-timeline.types.js'
import type { TripQueryable } from './trip-queryable.type.js'
import {
  listDocumentOccurrenceRows,
  listDocumentStatusChangedRows,
} from './trip-timeline-document.query.js'
import { listDispatchedRows, listStatusChangedRows } from './trip-timeline-status.query.js'
import { listStopEventRows, listStopOccurrenceRows } from './trip-timeline-stop.query.js'

export {
  encodeTripTimelineCursor,
  parseTripTimelineCursor,
} from '../application/trip-timeline-cursor.service.js'
export { mergeTripTimeline } from '../application/trip-timeline-merge.service.js'
export type { TripTimelineRow } from '../application/trip-timeline-merge.service.js'

/**
 * Spec 158 T6: existência da viagem **nesta empresa**, antes de ler qualquer fonte da linha do
 * tempo — molde de `DrizzleTripCostRepository.listByTrip` (`select({ id: trips.id })`). As seis
 * fontes de `listTripTimeline` não servem para isso: viagem sem nenhum evento ainda devolveria
 * itens vazios tanto para "existe e está silenciosa" quanto para "não existe", e o 404 se perderia.
 */
export async function findTripCompanyScope(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<{ readonly id: string } | null> {
  const [trip] = await queryable
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
    .limit(1)
  return trip ?? null
}

/**
 * A linha do tempo de uma viagem: seis consultas (D5 — `trip_stop_events` cobre três `kind`s),
 * escopadas por `companyId` e `tripId`, unidas em memória por `mergeTripTimeline`. RNF: uma consulta
 * por fonte, `Promise.all`, sem N+1.
 */
export async function listTripTimeline(
  queryable: TripQueryable,
  params: ReadTripTimelineParams,
): Promise<ReadTripTimelineResult> {
  const [
    dispatched,
    statusChanged,
    stopEvents,
    stopOccurrences,
    documentOccurrences,
    documentStatusChanged,
  ] = await Promise.all([
    listDispatchedRows(queryable, params),
    listStatusChangedRows(queryable, params),
    listStopEventRows(queryable, params),
    listStopOccurrenceRows(queryable, params),
    listDocumentOccurrenceRows(queryable, params),
    listDocumentStatusChangedRows(queryable, params),
  ])

  const merged = mergeTripTimeline({
    limit: params.limit,
    sources: [
      dispatched,
      statusChanged,
      stopEvents,
      stopOccurrences,
      documentOccurrences,
      documentStatusChanged,
    ],
  })
  const last = merged.items[merged.items.length - 1]

  return {
    items: merged.items.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
      recordedAt: row.recordedAt === null ? null : row.recordedAt.toISOString(),
    })),
    nextCursor:
      merged.hasMore && last !== undefined
        ? encodeTripTimelineCursor({
            id: last.id,
            kindPriority: TRIP_TIMELINE_KIND_PRIORITY[last.kind],
            occurredAt: last.occurredAtKey,
          })
        : null,
  }
}
