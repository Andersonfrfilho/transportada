/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverRouteOccurrence } from './driverRouteOccurrence.types'
import type { DriverFieldReport } from './driverTrip.types'
import type { QueuedReport } from './offlineQueue.service'
import type {
  BuildRouteOccurrenceEntriesParams,
  FilterRouteOccurrencesParams,
  ListSiblingRouteOccurrencesParams,
  RouteOccurrenceEntry,
  RouteOccurrenceFilter,
  RouteOccurrenceGroups,
  RouteOccurrenceNoteGroup,
  RouteOccurrenceSiblings,
  RouteOccurrenceStopGroup,
  RouteOccurrenceStopLevelGroup,
  RouteOccurrenceStopReference,
  ScopeRouteOccurrencesParams,
} from './routeOccurrenceView.types'

/** Spec 266 RF3: com mais de 4 ocorrências numa nota a fileira mostra 3 e um "+N". */
const MAX_ICONS_WITHOUT_CUT = 4
const ICONS_SHOWN_WHEN_CUT = 3

/**
 * O servidor não devolve a chave de idempotência do toque, então não há elo exato entre o item da
 * fila e a ocorrência que ele criou. O elo é (nota ou parada, tipo, hora): o servidor guarda a hora
 * do toque corrigida pelo relógio (spec 234), perto do `createdAt` da fila. Cinco minutos cobre o
 * desvio sem confundir dois toques de verdade do mesmo tipo, que ainda se casam um a um.
 */
const QUEUE_MATCH_TOLERANCE_MS = 5 * 60 * 1000

type QueuedOccurrenceReport = Extract<
  DriverFieldReport,
  { kind: 'documentOccurrence' | 'occurrence' }
>

function isQueuedOccurrenceReport(report: DriverFieldReport): report is QueuedOccurrenceReport {
  return report.kind === 'documentOccurrence' || report.kind === 'occurrence'
}

function toTime(iso: string): number {
  const time = Date.parse(iso)
  return Number.isFinite(time) ? time : 0
}

function compareByRecordedAt(left: RouteOccurrenceEntry, right: RouteOccurrenceEntry): number {
  return toTime(left.recordedAt) - toTime(right.recordedAt)
}

export function toServerEntry(input: {
  readonly occurrence: DriverRouteOccurrence
  readonly unreadByOccurrenceId: ReadonlyMap<string, number>
}): RouteOccurrenceEntry {
  const { occurrence } = input
  return {
    documentId: occurrence.documentId,
    documentNumber: occurrence.documentNumber,
    hasConversation: occurrence.conversationExists,
    hasDocument: occurrence.documentCount > 0,
    iconName: occurrence.type.iconName,
    id: occurrence.id,
    isReopened: occurrence.reopenedAt !== null,
    kind: occurrence.kind,
    recordedAt: occurrence.recordedAt,
    rejectionCause: undefined,
    resolutionNote: occurrence.resolution?.note ?? undefined,
    resolutionPhraseKey: occurrence.resolution?.phraseKey ?? undefined,
    source: 'server',
    state: occurrence.state,
    stopId: occurrence.stopId,
    stopSequence: occurrence.stopSequence,
    typeId: occurrence.type.id,
    typeName: occurrence.type.name,
    unreadCount: input.unreadByOccurrenceId.get(occurrence.id) ?? 0,
  }
}

function toQueuedEntry(input: {
  readonly item: QueuedReport
  readonly report: QueuedOccurrenceReport
  readonly stops: readonly RouteOccurrenceStopReference[]
}): RouteOccurrenceEntry {
  const { item, report } = input
  const stop =
    report.kind === 'occurrence'
      ? input.stops.find((candidate) => candidate.id === report.stopId)
      : input.stops.find((candidate) =>
          candidate.documents.some((document) => document.id === report.documentId),
        )
  const documentId = report.documentId
  const document = stop?.documents.find((candidate) => candidate.id === documentId)
  return {
    documentId,
    documentNumber: document?.number ?? null,
    hasConversation: false,
    hasDocument: false,
    iconName: null,
    id: report.idempotencyKey,
    isReopened: false,
    kind: documentId === null ? 'stop' : 'document',
    recordedAt: item.createdAt,
    rejectionCause: item.rejectionCause,
    resolutionNote: undefined,
    resolutionPhraseKey: undefined,
    source: 'queue',
    state: item.rejectionCause === undefined ? 'queued' : 'rejected',
    stopId: report.kind === 'occurrence' ? report.stopId : (stop?.id ?? ''),
    stopSequence: stop?.sequence,
    typeId: report.occurrenceTypeId ?? null,
    typeName: report.kind === 'documentOccurrence' ? report.occurrenceTypeName : null,
    unreadCount: 0,
  }
}

function isSameSubjectAndType(server: RouteOccurrenceEntry, queued: RouteOccurrenceEntry): boolean {
  if (server.documentId !== queued.documentId) return false
  if (server.documentId === null && server.stopId !== queued.stopId) return false
  return queued.typeId === null || queued.typeId === server.typeId
}

/**
 * Com `reportKey` o elo é exato (a chave de idempotência do item da fila). Só a ocorrência sem
 * `reportKey` cai na heurística; casa cada item da fila (não recusado) com a mais próxima no tempo, um a um.
 */
function findAbsorbedQueueIds(input: {
  readonly queued: readonly RouteOccurrenceEntry[]
  readonly server: readonly RouteOccurrenceEntry[]
  readonly reportKeys: ReadonlyMap<string, string>
}): ReadonlySet<string> {
  const absorbed = new Set<string>()
  const queuedIds = new Set(input.queued.map(({ id }) => id))
  for (const reportKey of input.reportKeys.values()) {
    if (queuedIds.has(reportKey)) absorbed.add(reportKey)
  }
  for (const serverEntry of input.server) {
    const candidate = input.queued
      .filter(
        (queuedEntry) =>
          queuedEntry.state === 'queued' &&
          !absorbed.has(queuedEntry.id) &&
          isSameSubjectAndType(serverEntry, queuedEntry) &&
          Math.abs(toTime(queuedEntry.recordedAt) - toTime(serverEntry.recordedAt)) <=
            QUEUE_MATCH_TOLERANCE_MS,
      )
      .sort(
        (left, right) =>
          Math.abs(toTime(left.recordedAt) - toTime(serverEntry.recordedAt)) -
          Math.abs(toTime(right.recordedAt) - toTime(serverEntry.recordedAt)),
      )[0]
    if (candidate !== undefined) absorbed.add(candidate.id)
  }
  return absorbed
}

/** Junta o servidor com a fila local; o que o servidor já tem não aparece duas vezes. */
export function buildRouteOccurrenceEntries(
  params: BuildRouteOccurrenceEntriesParams,
): readonly RouteOccurrenceEntry[] {
  const serverEntries = params.serverOccurrences.map((occurrence) =>
    toServerEntry({ occurrence, unreadByOccurrenceId: params.unreadByOccurrenceId }),
  )
  /** Só o que eu registrei pode ter vindo da minha fila. */
  const ownWithoutReportKeyIds = new Set(
    params.serverOccurrences
      .filter((occurrence) => occurrence.recordedByMe && occurrence.reportKey === null)
      .map(({ id }) => id),
  )
  const reportKeys = new Map(
    params.serverOccurrences.flatMap((occurrence): [string, string][] =>
      occurrence.reportKey === null ? [] : [[occurrence.id, occurrence.reportKey]],
    ),
  )
  const queued = params.queuedReports.flatMap((item) =>
    isQueuedOccurrenceReport(item.report)
      ? [toQueuedEntry({ item, report: item.report, stops: params.stops })]
      : [],
  )
  const absorbed = findAbsorbedQueueIds({
    queued,
    reportKeys,
    server: serverEntries.filter((entry) => ownWithoutReportKeyIds.has(entry.id)),
  })
  return [...serverEntries, ...queued.filter((entry) => !absorbed.has(entry.id))]
}

function isOpenEntry(entry: RouteOccurrenceEntry): boolean {
  return entry.state === 'queued' || entry.state === 'rejected' || entry.state === 'open'
}

/** O número do alerta do cabeçalho: fila, recusadas e abertas. */
export function countOpenRouteOccurrences(entries: readonly RouteOccurrenceEntry[]): number {
  return entries.filter(isOpenEntry).length
}

/** Abertas primeiro; resolvidas e canceladas embaixo. Em cada bloco, a mais nova antes. */
export function groupRouteOccurrences(
  entries: readonly RouteOccurrenceEntry[],
): RouteOccurrenceGroups {
  const newestFirst = [...entries].sort((left, right) => compareByRecordedAt(right, left))
  return {
    closed: newestFirst.filter((entry) => !isOpenEntry(entry)),
    open: newestFirst.filter(isOpenEntry),
  }
}

const FILTER_PREDICATES: Readonly<
  Record<RouteOccurrenceFilter, (entry: RouteOccurrenceEntry) => boolean>
> = {
  all: () => true,
  documents: (entry) => entry.hasDocument,
  queued: (entry) => entry.state === 'queued',
  refused: (entry) => entry.state === 'rejected',
  unread: (entry) => entry.unreadCount > 0,
}

export function filterRouteOccurrences(
  params: FilterRouteOccurrencesParams,
): readonly RouteOccurrenceEntry[] {
  return params.entries.filter(FILTER_PREDICATES[params.filter])
}

export function countRouteOccurrencesByFilter(
  entries: readonly RouteOccurrenceEntry[],
): Readonly<Record<RouteOccurrenceFilter, number>> {
  return {
    all: entries.filter(FILTER_PREDICATES.all).length,
    documents: entries.filter(FILTER_PREDICATES.documents).length,
    queued: entries.filter(FILTER_PREDICATES.queued).length,
    refused: entries.filter(FILTER_PREDICATES.refused).length,
    unread: entries.filter(FILTER_PREDICATES.unread).length,
  }
}

function toStopLevelGroup(entries: readonly RouteOccurrenceEntry[]): RouteOccurrenceStopLevelGroup {
  const isCut = entries.length > MAX_ICONS_WITHOUT_CUT
  return {
    entries,
    moreCount: isCut ? entries.length - ICONS_SHOWN_WHEN_CUT : 0,
    visible: isCut ? entries.slice(0, ICONS_SHOWN_WHEN_CUT) : entries,
  }
}

function toNoteGroup(input: {
  readonly documentId: string
  readonly entries: readonly RouteOccurrenceEntry[]
}): RouteOccurrenceNoteGroup {
  return {
    ...toStopLevelGroup(input.entries),
    documentId: input.documentId,
    documentNumber:
      input.entries.find((entry) => entry.documentNumber !== null)?.documentNumber ?? null,
  }
}

function toStopGroup(entries: readonly RouteOccurrenceEntry[]): RouteOccurrenceStopGroup {
  const ordered = [...entries].sort(compareByRecordedAt)
  const byNote = new Map<string, RouteOccurrenceEntry[]>()
  const stopLevel: RouteOccurrenceEntry[] = []
  for (const entry of ordered) {
    if (entry.documentId === null) {
      stopLevel.push(entry)
      continue
    }
    byNote.set(entry.documentId, [...(byNote.get(entry.documentId) ?? []), entry])
  }
  return {
    noteGroups: [...byNote.entries()].map(([documentId, noteEntries]) =>
      toNoteGroup({ documentId, entries: noteEntries }),
    ),
    stopId: entries[0]?.stopId ?? '',
    stopLevel: stopLevel.length === 0 ? undefined : toStopLevelGroup(stopLevel),
    stopSequence: entries.find((entry) => entry.stopSequence !== undefined)?.stopSequence,
  }
}

/** Paradas em ordem de rota; em cada uma, as notas (ocorrências por registro) e o grupo das de parada. */
export function groupRouteOccurrencesByStop(
  entries: readonly RouteOccurrenceEntry[],
): readonly RouteOccurrenceStopGroup[] {
  const byStop = new Map<string, RouteOccurrenceEntry[]>()
  for (const entry of entries)
    byStop.set(entry.stopId, [...(byStop.get(entry.stopId) ?? []), entry])
  return [...byStop.values()]
    .map(toStopGroup)
    .sort(
      (left, right) =>
        (left.stopSequence ?? Number.MAX_SAFE_INTEGER) -
        (right.stopSequence ?? Number.MAX_SAFE_INTEGER),
    )
}

/** Outras da mesma nota primeiro; depois as demais da mesma parada. */
export function listSiblingRouteOccurrences(
  params: ListSiblingRouteOccurrencesParams,
): RouteOccurrenceSiblings {
  const { current } = params
  const others = params.entries
    .filter((entry) => entry.id !== current.id && entry.stopId === current.stopId)
    .sort(compareByRecordedAt)
  const isSameNote = (entry: RouteOccurrenceEntry) =>
    current.documentId !== null && entry.documentId === current.documentId
  return {
    sameNote: others.filter(isSameNote),
    sameStop: others.filter((entry) => !isSameNote(entry)),
  }
}

/** A nota filtra pelas ocorrências dela; a parada, só pelas de parada (sem nota), como o "+N" do grupo da parada. */
export function scopeRouteOccurrences(
  params: ScopeRouteOccurrencesParams,
): readonly RouteOccurrenceEntry[] {
  const { entries, scope } = params
  if (scope.documentId !== undefined)
    return entries.filter((entry) => entry.documentId === scope.documentId)
  if (scope.stopId !== undefined)
    return entries.filter((entry) => entry.stopId === scope.stopId && entry.documentId === null)
  return entries
}
