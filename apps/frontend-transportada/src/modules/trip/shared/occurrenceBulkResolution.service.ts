/* Copyright (c) 2026 Ada Technology. MIT License. */

import {
  OCCURRENCE_RESOLUTION_ERROR,
  resolveOccurrenceViewState,
  type OccurrenceResolutionKind,
} from './occurrenceResolution.service'
import type { TripOccurrenceFeedItem } from './tripOccurrenceFeed.service'

/** Teto da seleção: a resolução em massa é uma chamada por ocorrência, em sequência. */
export const OCCURRENCE_BULK_RESOLUTION_LIMIT = 100

/** Só em aberto ou reaberta se resolve; resolvida e cancelada o servidor recusaria com 409. */
export function isOccurrenceBulkResolvable(item: TripOccurrenceFeedItem): boolean {
  const state = resolveOccurrenceViewState(item.resolution)
  return state === 'open' || state === 'reopened'
}

export type OccurrenceBulkResolutionOutcome = Readonly<{
  alreadyResolved: number
  failed: number
  resolved: number
}>

type ResolveOne = (
  input: Readonly<{ kind: OccurrenceResolutionKind; note: string; occurrenceId: string }>,
) => Promise<unknown>

/**
 * Uma observação para todas; resolve uma a uma. 409 de "já resolvida" conta como pronta (o estado final é o
 * pedido) e uma falha nunca derruba as demais.
 */
export async function runOccurrenceBulkResolution(
  input: Readonly<{
    items: readonly Pick<TripOccurrenceFeedItem, 'id' | 'source'>[]
    note: string
    resolveOne: ResolveOne
  }>,
): Promise<OccurrenceBulkResolutionOutcome> {
  let alreadyResolved = 0
  let failed = 0
  let resolved = 0
  for (const item of input.items) {
    try {
      await input.resolveOne({ kind: item.source, note: input.note, occurrenceId: item.id })
      resolved += 1
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === OCCURRENCE_RESOLUTION_ERROR.ALREADY_RESOLVED
      ) {
        alreadyResolved += 1
      } else {
        failed += 1
      }
    }
  }
  return { alreadyResolved, failed, resolved }
}
