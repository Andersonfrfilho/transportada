/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { OccurrenceType } from './occurrence.constant'

export type OccurrenceTypeLoadStatus = 'error' | 'loading' | 'ready'

/** Lista ainda não chegou ≠ lista vazia: só `ready` autoriza dizer "nenhum tipo cadastrado". */
export function readOccurrenceTypeLoadStatus(
  query: Readonly<{
    data: readonly OccurrenceType[] | undefined
    isError: boolean
    isSuccess: boolean
  }>,
): OccurrenceTypeLoadStatus {
  if (query.data !== undefined) return 'ready'
  if (query.isError) return 'error'
  return query.isSuccess ? 'ready' : 'loading'
}
