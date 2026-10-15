/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: o andamento da ocorrência com o motorista. O estado é o último evento (sem
 * evento = em aberto); a ocorrência cancelada (167) vence qualquer histórico.
 */
import type { TripOccurrenceCaseStatus } from '../../database/database.schema.js'
import type {
  OccurrenceResolutionEventFact,
  ResolveOccurrenceResolutionStateParams,
  ResolveOccurrenceResolutionStateResult,
  SystemResolutionPhraseKey,
} from './occurrence-resolution.types.js'

/** Chave fixa por status terminal: o motorista nunca lê a nota interna da tratativa (ADR-0105 §2). */
const SYSTEM_RESOLUTION_PHRASE_KEYS: Partial<
  Record<TripOccurrenceCaseStatus, SystemResolutionPhraseKey>
> = {
  cancelled: 'case_cancelled',
  closed: 'case_closed',
  returned_to_warehouse: 'case_returned_to_warehouse',
}

export function resolveSystemResolutionPhraseKey(
  status: TripOccurrenceCaseStatus,
): SystemResolutionPhraseKey | undefined {
  return SYSTEM_RESOLUTION_PHRASE_KEYS[status]
}

function compareByCreation(
  first: OccurrenceResolutionEventFact,
  second: OccurrenceResolutionEventFact,
): number {
  if (first.createdAt !== second.createdAt) return first.createdAt < second.createdAt ? -1 : 1
  if (first.id === second.id) return 0
  return first.id < second.id ? -1 : 1
}

export function resolveOccurrenceResolutionState(
  params: ResolveOccurrenceResolutionStateParams,
): ResolveOccurrenceResolutionStateResult {
  const ordered = [...params.events].sort(compareByCreation)
  const lastEvent = ordered.at(-1)
  const lastResolved = ordered.findLast((fact) => fact.kind === 'resolved')
  const lastResolution = lastResolved
    ? {
        actorKind: lastResolved.actorKind,
        at: lastResolved.createdAt,
        caseEventStatus: lastResolved.caseEventStatus,
        note: lastResolved.note,
      }
    : null

  if (params.cancelledAt !== undefined) {
    return { lastResolution, reopenedAt: null, resolvedAt: null, state: 'cancelled' }
  }
  if (lastEvent?.kind === 'resolved') {
    return { lastResolution, reopenedAt: null, resolvedAt: lastEvent.createdAt, state: 'resolved' }
  }
  return {
    lastResolution,
    reopenedAt: lastEvent?.createdAt ?? null,
    resolvedAt: null,
    state: 'open',
  }
}
