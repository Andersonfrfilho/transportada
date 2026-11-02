/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 RF19: o guard da linha do tempo é **estrito** — a rota nasceu com a 183, então campo
 * ausente ou ator fora dos quatro é resposta inválida, não API antiga.
 * Spec 266 T1.2: tipo de evento desconhecido sai da linha; o resto da resposta segue valendo.
 * Spec 266 T3.3: `resolution.resolved` e `resolution.reopened` entram na lista dos conhecidos.
 * Spec 276 T3: `contractor.reply` entra; as etapas e `resolvedAt` são tolerantes — etapa malformada ou de
 * nome desconhecido sai, e a resposta sem elas (API anterior) segue valendo.
 * Spec 278: a conferência do boleto, a entrega ao motorista e a leitura dele entram, estritas como as demais; o
 * `attachmentCount`/`awaitingAttachment` do e-mail recebido é opcional (API anterior).
 */
import { isRecord, isString } from './tripGuards.validation'
import {
  OCCURRENCE_TIMELINE_ACTOR_KINDS,
  OCCURRENCE_TIMELINE_STAGES,
  type OccurrenceTimeline,
  type OccurrenceTimelineEvent,
  type OccurrenceTimelineStage,
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
  'resolution.resolved',
  'resolution.reopened',
  'contractor.reply',
  'contractor.reply.document',
  'contractor.reply.delivery',
  'contractor.reply.driver_read',
  'contractor.client.whatsapp',
  'contractor.client.email',
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
    case 'resolution.resolved':
      return isNullableString(value.note)
    case 'resolution.reopened':
      return true
    case 'contractor.reply':
      return isNullableString(value.reason) && isString(value.toStatus)
    case 'contractor.reply.document':
      return (
        isNullableString(value.invoiceNumber) && isString(value.result) && isString(value.toStatus)
      )
    case 'contractor.reply.delivery':
      return (
        typeof value.attempt === 'number' &&
        isString(value.channel) &&
        isString(value.documentKind) &&
        isNullableString(value.driverName) &&
        isNullableString(value.reason) &&
        isString(value.status)
      )
    case 'contractor.reply.driver_read':
      return isString(value.documentKind)
    case 'contractor.client.whatsapp':
    case 'contractor.client.email':
      return isNullableString(value.reason) && isString(value.status)
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

function isStage(value: unknown): value is OccurrenceTimelineStage {
  return (
    isRecord(value) &&
    isActor(value.actor) &&
    OCCURRENCE_TIMELINE_STAGES.some((stage) => stage === value.stage) &&
    isString(value.startedAt) &&
    isNullableString(value.endedAt) &&
    isNullableString(value.reason) &&
    typeof value.terminal === 'boolean' &&
    (value.durationSeconds === null || typeof value.durationSeconds === 'number')
  )
}

/** `resolvedAt` ausente ou malformado some sozinho: os outros tempos seguem valendo. */
function withoutMalformedResolvedAt(timings: unknown): unknown {
  if (!isRecord(timings) || isNullableString(timings.resolvedAt)) return timings
  return Object.fromEntries(Object.entries(timings).filter(([key]) => key !== 'resolvedAt'))
}

/** Spec 266 T1.2: evento de tipo desconhecido é descartado antes do guard estrito dos demais. */
export function parseOccurrenceTimeline(value: unknown): OccurrenceTimeline | null {
  if (!isRecord(value) || !Array.isArray(value.events)) return null
  const { stages: rawStages, ...rest } = value
  const stages = Array.isArray(rawStages) ? rawStages.filter(isStage) : undefined
  const timings = withoutMalformedResolvedAt(value.timings)
  const candidate = {
    ...rest,
    events: value.events.filter(isKnownEventKind),
    ...(stages === undefined ? {} : { stages }),
    timings,
  }
  return isOccurrenceTimeline(candidate) ? candidate : null
}
