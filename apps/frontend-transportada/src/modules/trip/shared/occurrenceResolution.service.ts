/* Copyright (c) 2026 Ada Technology. MIT License. */

export type OccurrenceResolutionKind = 'document' | 'stop'

/** Andamento que a tela sabe mostrar; o feed ainda não o entrega por item (spec 266 T2.9). */
export type OccurrenceResolutionViewState = 'cancelled' | 'open' | 'reopened' | 'resolved'

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
