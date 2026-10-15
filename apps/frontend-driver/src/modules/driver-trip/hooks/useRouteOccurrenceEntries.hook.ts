/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { conversationDigestsQueryOptions } from '@/modules/conversation/shared/conversationDigests.query'
import { DRIVER_CONVERSATION_SUBJECT_TYPE } from '@/modules/conversation/shared/driverConversation.constant'

import type { DriverTrip } from '../shared/driverTrip.types'
import type { QueuedReport } from '../shared/offlineQueue.service'
import {
  buildRouteOccurrenceEntries,
  countOpenRouteOccurrences,
  groupRouteOccurrencesByStop,
} from '../shared/routeOccurrenceView.service'
import type {
  RouteOccurrenceEntry,
  RouteOccurrenceStopGroup,
} from '../shared/routeOccurrenceView.types'
import { useDriverRouteOccurrences } from '../shared/useDriverRouteOccurrences.query'

export type RouteOccurrenceView = Readonly<{
  entries: readonly RouteOccurrenceEntry[]
  openCount: number
  stopGroupById: ReadonlyMap<string, RouteOccurrenceStopGroup>
  stopIdsWithOpenOccurrence: ReadonlySet<string>
}>

/** Spec 266: o que a rota sabe das ocorrências — servidor, fila local e mensagens novas juntos. */
export function useRouteOccurrenceEntries(input: {
  readonly canSync: boolean
  readonly queuedReports: readonly QueuedReport[]
  readonly trip: DriverTrip | undefined
}): RouteOccurrenceView {
  const { canSync, queuedReports, trip } = input
  const occurrences = useDriverRouteOccurrences({ canSync, tripId: trip?.id })
  const digests = useQuery(conversationDigestsQueryOptions(canSync))

  const serverOccurrences =
    occurrences.data?.status === 'loaded' ? occurrences.data.occurrences : []
  const unreadByOccurrenceId = new Map(
    (digests.data ?? [])
      .filter((digest) => digest.subjectType === DRIVER_CONVERSATION_SUBJECT_TYPE)
      .map((digest) => [digest.subjectId, digest.unreadCount] as const),
  )
  const entries = buildRouteOccurrenceEntries({
    queuedReports,
    serverOccurrences,
    stops: (trip?.stops ?? []).map((stop) => ({
      documents: stop.documents.map((document) => ({ id: document.id, number: document.number })),
      id: stop.id,
      sequence: stop.sequence,
    })),
    unreadByOccurrenceId,
  })
  const openEntries = entries.filter((entry) => countOpenRouteOccurrences([entry]) > 0)

  return {
    entries,
    openCount: openEntries.length,
    stopGroupById: new Map(
      groupRouteOccurrencesByStop(entries).map((group) => [group.stopId, group]),
    ),
    stopIdsWithOpenOccurrence: new Set(openEntries.map((entry) => entry.stopId)),
  }
}
