/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { OccurrenceWatcherCandidate, OccurrenceWatcherItem } from './occurrenceWatchers.types'

/** Cópia por valor dos tetos da API (`occurrence-watcher.constant.ts`): 10 ativos e 30 linhas por lista. */
export const OCCURRENCE_WATCHER_MAX_ACTIVE = 10
export const OCCURRENCE_WATCHER_MAX_TOTAL = 30

/** Quem ainda não está na lista, na ordem de nome — o que o seletor de "adicionar" oferece. */
export function availableWatcherCandidates(
  candidates: readonly OccurrenceWatcherCandidate[],
  watchers: readonly OccurrenceWatcherItem[],
): readonly OccurrenceWatcherCandidate[] {
  const listed = new Set(watchers.map((watcher) => watcher.userId))
  return candidates
    .filter((candidate) => !listed.has(candidate.userId))
    .toSorted((left, right) => left.name.localeCompare(right.name))
}

/** Adicionar nasce ativo: vale o teto de ativos e o de linhas (o inativo só conta no segundo). */
export function canAddOccurrenceWatcher(watchers: readonly OccurrenceWatcherItem[]): boolean {
  const activeCount = watchers.filter((watcher) => watcher.status === 'active').length
  return (
    activeCount < OCCURRENCE_WATCHER_MAX_ACTIVE && watchers.length < OCCURRENCE_WATCHER_MAX_TOTAL
  )
}

export type WatcherListSourceKey = 'company' | 'companyOverridden' | 'contractor'

/**
 * A mensagem de qual lista vale na tela da contratante: a dela (há ativo), a da empresa (herdada), ou a da empresa
 * mesmo havendo linhas aqui — todas inativas.
 */
export function describeWatcherListSource(
  effectiveSource: 'company' | 'contractor' | null,
  rowCount: number,
): WatcherListSourceKey {
  if (effectiveSource === 'contractor') return 'contractor'
  return rowCount > 0 ? 'companyOverridden' : 'company'
}
