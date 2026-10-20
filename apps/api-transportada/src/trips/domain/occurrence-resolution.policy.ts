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
  FeedResolutionView,
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

/** Spec 276 T3b: a frase do evento `system` pela causa — o retorno entregue, senão o status da tratativa. */
export function resolveSystemResolutionCausePhraseKey(cause: {
  readonly caseEventStatus: TripOccurrenceCaseStatus | undefined
  readonly causedByContractorReply?: true
}): SystemResolutionPhraseKey | undefined {
  if (cause.causedByContractorReply === true) return 'contractor_reply_delivered'
  return cause.caseEventStatus === undefined
    ? undefined
    : resolveSystemResolutionPhraseKey(cause.caseEventStatus)
}

function compareBySequence(
  first: OccurrenceResolutionEventFact,
  second: OccurrenceResolutionEventFact,
): number {
  return first.sequence - second.sequence
}

export function resolveOccurrenceResolutionState(
  params: ResolveOccurrenceResolutionStateParams,
): ResolveOccurrenceResolutionStateResult {
  const ordered = [...params.events].sort(compareBySequence)
  const lastEvent = ordered.at(-1)
  const lastResolved = ordered.findLast((fact) => fact.kind === 'resolved')
  const lastResolution = lastResolved
    ? {
        actorKind: lastResolved.actorKind,
        at: lastResolved.createdAt,
        caseEventStatus: lastResolved.caseEventStatus,
        ...(lastResolved.causedByContractorReply === true
          ? { causedByContractorReply: true as const }
          : {}),
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

/** O andamento no feed do painel: `null` é "em aberto, sem nada a dizer" (nunca resolvida nem reaberta). */
export function buildFeedResolutionView(
  params: ResolveOccurrenceResolutionStateParams,
): FeedResolutionView | null {
  if (params.cancelledAt !== undefined) {
    return { actorKind: 'internal', at: params.cancelledAt, state: 'cancelled' }
  }
  const lastEvent = [...params.events].sort(compareBySequence).at(-1)
  if (lastEvent === undefined) return null
  return {
    actorKind: lastEvent.actorKind,
    at: lastEvent.createdAt,
    state: lastEvent.kind === 'resolved' ? 'resolved' : 'reopened',
  }
}
