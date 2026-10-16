/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverRouteOccurrence,
  DriverRouteOccurrenceDetail,
  RouteOccurrenceAttachment,
  RouteOccurrenceFile,
  RouteOccurrenceKind,
  RouteOccurrenceResolution,
  RouteOccurrenceServerState,
  RouteOccurrenceTimelineEvent,
  StoredRouteOccurrences,
} from './driverRouteOccurrence.types'
import {
  ROUTE_OCCURRENCE_KINDS,
  ROUTE_OCCURRENCE_PHRASE_KEYS,
  ROUTE_OCCURRENCE_SERVER_STATES,
} from './driverRouteOccurrence.types'

/** Resposta de API é entrada não confiável: o que não tem a forma do contrato vira recusa explícita. */
export class DriverRouteOccurrenceResponseError extends Error {
  public constructor() {
    super('DRIVER_ROUTE_OCCURRENCE_RESPONSE_INVALID')
    this.name = 'DriverRouteOccurrenceResponseError'
  }
}

const TIMELINE_KINDS: readonly RouteOccurrenceTimelineEvent['kind'][] = [
  'recorded',
  'photo',
  'cancelled',
  'resolution.resolved',
  'resolution.reopened',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string {
  if (typeof value !== 'string') throw new DriverRouteOccurrenceResponseError()
  return value
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return readString(value)
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new DriverRouteOccurrenceResponseError()
  return value
}

function readArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new DriverRouteOccurrenceResponseError()
  return value
}

function readKind(value: unknown): RouteOccurrenceKind {
  const found = ROUTE_OCCURRENCE_KINDS.find((kind) => kind === value)
  if (found === undefined) throw new DriverRouteOccurrenceResponseError()
  return found
}

/** Estado desconhecido (API mais nova) conta como em aberto: nunca esconde do motorista algo que ele talvez deva ver. */
function readState(value: unknown): RouteOccurrenceServerState {
  return ROUTE_OCCURRENCE_SERVER_STATES.find((state) => state === value) ?? 'open'
}

function readResolution(value: unknown): RouteOccurrenceResolution | null {
  if (value === null || value === undefined) return null
  const record = readRecord(value)
  return {
    /** Ator desconhecido não nomeia ninguém: cai em `system`. */
    actorKind: record.actorKind === 'internal' ? 'internal' : 'system',
    at: readString(record.at),
    note: readNullableString(record.note),
    /** Frase desconhecida (API mais nova) não inventa texto: o quadro cai na nota ou fica sem frase. */
    phraseKey: ROUTE_OCCURRENCE_PHRASE_KEYS.find((key) => key === record.phraseKey) ?? null,
  }
}

function readType(value: unknown): DriverRouteOccurrence['type'] {
  const record = readRecord(value)
  return {
    iconName: readNullableString(record.iconName),
    id: readString(record.id),
    name: readString(record.name),
  }
}

function readCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new DriverRouteOccurrenceResponseError()
  }
  return value
}

export function toDriverRouteOccurrence(value: unknown): DriverRouteOccurrence {
  const record = readRecord(value)
  const conversation = isRecord(record.conversation) ? record.conversation : undefined
  return {
    conversationExists: conversation?.exists === true,
    documentCount: readCount(record.documentCount),
    documentId: readNullableString(record.documentId),
    documentNumber: readNullableString(record.documentNumber),
    id: readString(record.id),
    kind: readKind(record.kind),
    recordedAt: readString(record.recordedAt),
    recordedByMe: record.recordedByMe === true,
    reopenedAt: readNullableString(record.reopenedAt),
    reportKey: readNullableString(record.reportKey),
    resolution: readResolution(record.resolution),
    state: readState(record.state),
    stopId: readString(record.stopId),
    stopSequence: readCount(record.stopSequence),
    type: readType(record.type),
  }
}

export function toDriverRouteOccurrenceList(payload: unknown): readonly DriverRouteOccurrence[] {
  return readArray(readRecord(payload).data).map(toDriverRouteOccurrence)
}

function readFile(value: unknown): RouteOccurrenceFile {
  const record = readRecord(value)
  return {
    contentType: readNullableString(record.contentType),
    name: readNullableString(record.name),
    objectId: readString(record.objectId),
    sizeBytes: typeof record.sizeBytes === 'number' ? record.sizeBytes : null,
  }
}

function readAttachment(value: unknown): RouteOccurrenceAttachment {
  return { ...readFile(value), messageId: readNullableString(readRecord(value).messageId) }
}

/** `kind` fora do vocabulário (API mais nova) é descartado: uma linha desconhecida não derruba o detalhe. */
function readTimeline(value: unknown): readonly RouteOccurrenceTimelineEvent[] {
  return readArray(value).flatMap((item): readonly RouteOccurrenceTimelineEvent[] => {
    const record = readRecord(item)
    const kind = TIMELINE_KINDS.find((known) => known === record.kind)
    if (kind === undefined) return []
    return [{ at: readString(record.at), kind }]
  })
}

export function toDriverRouteOccurrenceDetail(payload: unknown): DriverRouteOccurrenceDetail {
  const data = readRecord(readRecord(payload).data)
  return {
    ...toDriverRouteOccurrence(data),
    attachments: readArray(data.attachments ?? []).map(readAttachment),
    note: readNullableString(data.note),
    photos: readArray(data.photos ?? []).map(readFile),
    signature:
      data.signature === null || data.signature === undefined ? null : readFile(data.signature),
    timeline: readTimeline(data.timeline ?? []),
  }
}

const FILE_URL_PROTOCOLS: readonly string[] = ['https:', 'http:']

/** O link vai para `fetch`/`window.open`: só http(s) (o http é do MinIO local) — `javascript:` e afins são recusados. */
export function toRouteOccurrenceFileUrl(payload: unknown): string {
  const url = readString(readRecord(readRecord(payload).data).url)
  if (!URL.canParse(url) || !FILE_URL_PROTOCOLS.includes(new URL(url).protocol)) {
    throw new DriverRouteOccurrenceResponseError()
  }
  return url
}

/** O IndexedDB devolve `unknown`: registro sem a forma do retrato não abre a tela. */
export function isStoredRouteOccurrences(value: unknown): value is StoredRouteOccurrences {
  if (!isRecord(value)) return false
  if (typeof value.savedAt !== 'string' || typeof value.tripId !== 'string') return false
  if (value.subHash !== undefined && typeof value.subHash !== 'string') return false
  if (!Array.isArray(value.occurrences)) return false
  try {
    value.occurrences.forEach(toDriverRouteOccurrence)
    return true
  } catch {
    return false
  }
}
