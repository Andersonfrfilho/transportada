/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: o que o motorista vê da ocorrência da rota. A resolução do sistema vira uma
 * frase fixa por status terminal (nunca a nota interna da tratativa), e `case.transition` não entra
 * na linha do tempo (informação comercial, ADR-0045 §6).
 */
import {
  resolveOccurrenceResolutionState,
  resolveSystemResolutionPhraseKey,
} from './occurrence-resolution.policy.js'
import type {
  DriverRouteOccurrenceDetail,
  DriverRouteOccurrenceFacts,
  DriverRouteOccurrenceFileFact,
  DriverRouteOccurrenceFileView,
  DriverRouteOccurrenceItem,
  DriverRouteOccurrenceResolutionView,
  DriverRouteOccurrenceTimelineEvent,
} from './driver-route-occurrence.types.js'
import type { ResolveOccurrenceResolutionStateResult } from './occurrence-resolution.types.js'

function toResolutionView(
  state: ResolveOccurrenceResolutionStateResult,
): DriverRouteOccurrenceResolutionView | null {
  if (state.state !== 'resolved' || state.lastResolution === null) return null
  const { actorKind, at, caseEventStatus, note } = state.lastResolution
  if (actorKind === 'internal') return { actorKind, at, note: note ?? null, phraseKey: null }
  const phraseKey =
    caseEventStatus === undefined ? undefined : resolveSystemResolutionPhraseKey(caseEventStatus)
  return { actorKind: 'system', at, note: null, phraseKey: phraseKey ?? null }
}

export function isRouteOccurrenceFileExpired(
  file: DriverRouteOccurrenceFileFact,
  now: Date,
): boolean {
  return (
    file.retentionUntil !== undefined && new Date(file.retentionUntil).getTime() < now.getTime()
  )
}

export function buildDriverRouteOccurrenceItem(
  facts: DriverRouteOccurrenceFacts,
): DriverRouteOccurrenceItem {
  const state = resolveOccurrenceResolutionState({
    cancelledAt: facts.cancelledAt,
    events: facts.events,
  })
  const documentCount =
    facts.photos.length + facts.chatAttachments.length + (facts.signature === null ? 0 : 1)
  return {
    conversation: { exists: facts.hasConversation },
    documentCount,
    documentId: facts.documentId,
    documentNumber: facts.documentNumber,
    id: facts.id,
    kind: facts.kind,
    recordedAt: facts.recordedAt,
    recordedByMe: facts.recordedByMe,
    reopenedAt: state.reopenedAt,
    reportKey: facts.recordedByMe ? facts.reportKey : null,
    resolution: toResolutionView(state),
    state: state.state,
    stopId: facts.stopId,
    stopSequence: facts.stopSequence,
    type: facts.type,
  }
}

function toFileView(file: DriverRouteOccurrenceFileFact): DriverRouteOccurrenceFileView {
  return {
    contentType: file.contentType,
    name: file.fileName,
    objectId: file.objectId,
    sizeBytes: file.sizeBytes,
  }
}

function buildTimeline(
  facts: DriverRouteOccurrenceFacts,
): readonly DriverRouteOccurrenceTimelineEvent[] {
  const entries: DriverRouteOccurrenceTimelineEvent[] = [
    { at: facts.recordedAt, kind: 'recorded' },
    ...facts.photos.map((photo) => ({ at: photo.createdAt, kind: 'photo' as const })),
    ...facts.events.map((event) => ({
      at: event.createdAt,
      kind:
        event.kind === 'resolved'
          ? ('resolution.resolved' as const)
          : ('resolution.reopened' as const),
    })),
  ]
  if (facts.cancelledAt !== undefined) entries.push({ at: facts.cancelledAt, kind: 'cancelled' })
  return entries.sort((first, second) => (first.at < second.at ? -1 : first.at > second.at ? 1 : 0))
}

export function buildDriverRouteOccurrenceDetail(
  facts: DriverRouteOccurrenceFacts,
): DriverRouteOccurrenceDetail {
  return {
    ...buildDriverRouteOccurrenceItem(facts),
    attachments: facts.chatAttachments.map((attachment) => ({
      ...toFileView(attachment),
      messageId: attachment.messageId,
    })),
    note: facts.note,
    photos: facts.photos.map(toFileView),
    signature: facts.signature === null ? null : toFileView(facts.signature),
    timeline: buildTimeline(facts),
  }
}
