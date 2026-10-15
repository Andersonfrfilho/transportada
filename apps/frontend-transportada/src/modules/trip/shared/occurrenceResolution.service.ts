/* Copyright (c) 2026 Ada Technology. MIT License. */

import type { TripOccurrenceResolution } from './tripOccurrenceFeed.service'

export type OccurrenceResolutionKind = 'document' | 'stop'

/** Andamento que a tela sabe mostrar. */
export type OccurrenceResolutionViewState = 'cancelled' | 'open' | 'reopened' | 'resolved'

/** Spec 266 T3.2: sem andamento no item (ou `null`) é em aberto. */
export function resolveOccurrenceViewState(
  resolution: null | TripOccurrenceResolution | undefined,
): OccurrenceResolutionViewState {
  return resolution?.state ?? 'open'
}

export type OccurrenceResolutionResult = Readonly<{
  note: string
  occurrenceId: string
  occurrenceKind: OccurrenceResolutionKind
  resolvedAt: string
  state: string
}>

export const OCCURRENCE_RESOLUTION_ERROR = {
  ALREADY_RESOLVED: 'OCCURRENCE_ALREADY_RESOLVED',
  CANCELLED: 'OCCURRENCE_CANCELLED',
} as const

export type OccurrenceResolutionFeedback = Readonly<{
  isInformational: boolean
  key: 'alreadyResolved' | 'cancelled' | 'generic'
}>

/** 409 de resolvida é aviso (a tela só atualiza); os demais erros são recusa. */
export function resolveOccurrenceResolutionFeedback(error: unknown): OccurrenceResolutionFeedback {
  const code = error instanceof Error ? error.message : ''
  if (code === OCCURRENCE_RESOLUTION_ERROR.ALREADY_RESOLVED) {
    return { isInformational: true, key: 'alreadyResolved' }
  }
  if (code === OCCURRENCE_RESOLUTION_ERROR.CANCELLED) {
    return { isInformational: false, key: 'cancelled' }
  }
  return { isInformational: false, key: 'generic' }
}
