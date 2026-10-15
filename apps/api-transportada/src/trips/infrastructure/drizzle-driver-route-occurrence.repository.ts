/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: o leitor das ocorrências da rota do motorista. Toda tripulação (principal e
 * ajudante) vê as ocorrências da viagem; a conversa e os anexos do chat são os do próprio usuário.
 */
import type { DriverRouteOccurrenceReaderPort } from '../application/driver-route-occurrence.port.js'
import type { OccurrenceKind } from '../application/occurrence-resolution.port.js'
import type { DriverRouteOccurrenceFacts } from '../domain/driver-route-occurrence.types.js'
import type { OccurrenceResolutionEventFact } from '../domain/occurrence-resolution.types.js'
import {
  listDocumentRouteOccurrenceRows,
  listReportKeysByOccurrence,
  listStopRouteOccurrenceRows,
  readDriverOccurrenceChat,
  type RouteOccurrenceRow,
} from './driver-route-occurrence.query.js'
import {
  NO_ROUTE_OCCURRENCE_FILES,
  readRouteOccurrenceFiles,
} from './driver-route-occurrence-file.query.js'
import {
  listAllResolutionEventsByOccurrence,
  listLatestResolutionEventsByOccurrence,
} from './drizzle-occurrence-resolution.repository.js'
import type { TripQueryable } from './trip-queryable.type.js'

type CurrentTripReader = {
  readCurrent(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<{ readonly tripId: string } | null>
}

async function readEvents(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly fullHistory: boolean
    readonly rows: readonly RouteOccurrenceRow[]
  },
): Promise<ReadonlyMap<string, readonly OccurrenceResolutionEventFact[]>> {
  const read = input.fullHistory
    ? listAllResolutionEventsByOccurrence
    : listLatestResolutionEventsByOccurrence
  const kinds: readonly OccurrenceKind[] = ['document', 'stop']
  const maps = await Promise.all(
    kinds.map((occurrenceKind) =>
      read(queryable, {
        companyId: input.companyId,
        occurrenceIds: input.rows.filter((row) => row.kind === occurrenceKind).map((row) => row.id),
        occurrenceKind,
      }),
    ),
  )
  return new Map(maps.flatMap((map) => [...map]))
}

export function createDrizzleDriverRouteOccurrenceReader(dependencies: {
  readonly currentTrips: CurrentTripReader
  readonly database: TripQueryable
}): DriverRouteOccurrenceReaderPort {
  const { database } = dependencies
  return {
    async findCurrentTripId(input) {
      const current = await dependencies.currentTrips.readCurrent(input)
      return current?.tripId ?? null
    },
    async readOccurrences(input) {
      const scope = {
        companyId: input.companyId,
        targetId: input.target?.id,
        tripId: input.tripId,
      }
      const [documentRows, stopRows] = await Promise.all([
        input.target?.kind === 'stop' ? [] : listDocumentRouteOccurrenceRows(database, scope),
        input.target?.kind === 'document' ? [] : listStopRouteOccurrenceRows(database, scope),
      ])
      const rows = [...documentRows, ...stopRows]
      if (rows.length === 0) return []

      const occurrenceIds = rows.map((row) => row.id)
      const [events, files, reportKeys, chat] = await Promise.all([
        readEvents(database, {
          companyId: input.companyId,
          fullHistory: input.target !== undefined,
          rows,
        }),
        readRouteOccurrenceFiles(database, { companyId: input.companyId, rows }),
        listReportKeysByOccurrence(database, {
          companyId: input.companyId,
          occurrenceIds: rows
            .filter((row) => row.actorUserId === input.driverUserId)
            .map((row) => row.id),
        }),
        readDriverOccurrenceChat(database, {
          companyId: input.companyId,
          driverUserId: input.driverUserId,
          occurrenceIds,
        }),
      ])

      return rows
        .map((row): DriverRouteOccurrenceFacts => {
          const rowFiles = files.get(row.id) ?? NO_ROUTE_OCCURRENCE_FILES
          return {
            cancelledAt: row.cancelledAt?.toISOString(),
            chatAttachments: chat.attachments.filter((item) => item.occurrenceId === row.id),
            documentId: row.documentId,
            documentNumber: row.documentNumber,
            events: events.get(row.id) ?? [],
            hasConversation: chat.occurrenceIdsWithConversation.has(row.id),
            id: row.id,
            kind: row.kind,
            note: row.note,
            photos: rowFiles.photos,
            recordedAt: row.createdAt.toISOString(),
            recordedByMe: row.actorUserId === input.driverUserId,
            reportKey: reportKeys.get(row.id) ?? null,
            signature: rowFiles.signature,
            stopId: row.stopId,
            stopSequence: row.stopSequence,
            type: row.type,
          }
        })
        .sort((first, second) => first.recordedAt.localeCompare(second.recordedAt))
    },
  }
}
