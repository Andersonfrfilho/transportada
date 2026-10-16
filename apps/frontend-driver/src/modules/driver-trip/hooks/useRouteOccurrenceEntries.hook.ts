/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { conversationDigestsQueryOptions } from '@/modules/conversation/shared/conversationDigests.query'
import { DRIVER_CONVERSATION_SUBJECT_TYPE } from '@/modules/conversation/shared/driverConversation.constant'

import type { RouteOccurrencesQueryData } from '../shared/driverRouteOccurrence.types'
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

/** `tripFinished`: a viagem acabou (404 do servidor); `loading`: nada lido ainda, nem retrato. */
export type RouteOccurrenceListStatus = 'loaded' | 'loading' | 'tripFinished'

export type RouteOccurrenceView = Readonly<{
  entries: readonly RouteOccurrenceEntry[]
  /** O retrato guardado no aparelho, não a leitura fresca: a tela avisa. */
  isFromSnapshot: boolean
  listStatus: RouteOccurrenceListStatus
  /** Quando o retrato foi guardado; só com `isFromSnapshot`. */
  savedAt: string | undefined
  openCount: number
  stopGroupById: ReadonlyMap<string, RouteOccurrenceStopGroup>
  stopIdsWithOpenOccurrence: ReadonlySet<string>
}>

function resolveListStatus(data: RouteOccurrencesQueryData | undefined): RouteOccurrenceListStatus {
  if (data === undefined) return 'loading'
  return data.status === 'tripFinished' ? 'tripFinished' : 'loaded'
}

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

  const listData = occurrences.data
  return {
    entries,
    isFromSnapshot: listData?.status === 'loaded' && listData.isFromSnapshot,
    listStatus: resolveListStatus(listData),
    openCount: openEntries.length,
    savedAt: listData?.status === 'loaded' ? listData.savedAt : undefined,
    stopGroupById: new Map(
      groupRouteOccurrencesByStop(entries).map((group) => [group.stopId, group]),
    ),
    stopIdsWithOpenOccurrence: new Set(openEntries.map((entry) => entry.stopId)),
  }
}
