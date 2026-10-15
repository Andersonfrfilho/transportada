/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF19: o guard da linha do tempo é **estrito** — a rota nasceu com a 183, então campo
 * ausente ou ator fora dos quatro é resposta inválida, não API antiga.
 * Spec 266 T1.2: tipo de evento desconhecido sai da linha; o resto da resposta segue valendo.
 */
import { isRecord, isString } from './tripGuards.validation'
import {
  OCCURRENCE_TIMELINE_ACTOR_KINDS,
  type OccurrenceTimeline,
  type OccurrenceTimelineEvent,
} from './tripOccurrenceTimeline.service'

function isNullableString(value: unknown): value is null | string {
  return value === null || isString(value)
}

function isActor(value: unknown): boolean {
  return (
    isRecord(value) &&
    OCCURRENCE_TIMELINE_ACTOR_KINDS.some((kind) => kind === value.kind) &&
    isNullableString(value.name)
  )
}

const KNOWN_EVENT_KINDS: readonly OccurrenceTimelineEvent['kind'][] = [
  'occurrence.recorded',
  'occurrence.photo',
  'occurrence.cancelled',
  'case.transition',
  'contractor.mail.received',
  'contractor.mail.sent',
]

function isKnownEventKind(value: unknown): boolean {
  return isRecord(value) && KNOWN_EVENT_KINDS.some((kind) => kind === value.kind)
}

function isEvent(value: unknown): value is OccurrenceTimelineEvent {
  if (
    !isRecord(value) ||
    !isActor(value.actor) ||
    !isString(value.id) ||
    typeof value.isKey !== 'boolean' ||
    !isString(value.occurredAt) ||
    !(value.sincePreviousSeconds === null || typeof value.sincePreviousSeconds === 'number')
  ) {
    return false
  }
  switch (value.kind) {
    case 'occurrence.recorded':
      return true
    case 'occurrence.photo':
      return typeof value.photoCount === 'number'
    case 'occurrence.cancelled':
      return isString(value.reason)
    case 'case.transition':
      return isNullableString(value.fromStatus) && isString(value.note) && isString(value.toStatus)
    case 'contractor.mail.received':
    case 'contractor.mail.sent':
      return isNullableString(value.deliveryStatus) && isNullableString(value.interpretation)
    default:
      return false
  }
}

function isOccurrenceTimeline(value: unknown): value is OccurrenceTimeline {
  if (!isRecord(value) || !Array.isArray(value.events) || !isRecord(value.timings)) return false
  const { timings } = value
  return (
    value.events.every(isEvent) &&
    isNullableString(timings.contractorAskedAt) &&
    isNullableString(timings.contractorRepliedAt) &&
    isNullableString(timings.driverReleasedAt) &&
    isNullableString(timings.openSince) &&
    isNullableString(timings.openUntil)
  )
}

/** Spec 266 T1.2: evento de tipo desconhecido é descartado antes do guard estrito dos demais. */
export function parseOccurrenceTimeline(value: unknown): OccurrenceTimeline | null {
  if (!isRecord(value) || !Array.isArray(value.events)) return null
  const candidate = { ...value, events: value.events.filter(isKnownEventKind) }
  return isOccurrenceTimeline(candidate) ? candidate : null
}
