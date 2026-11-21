/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  isOccurrenceBulkResolvable,
  OCCURRENCE_BULK_RESOLUTION_LIMIT,
} from '../shared/occurrenceBulkResolution.service'
import type { TripOccurrenceFeedItem } from '../shared/tripOccurrenceFeed.service'

/**
 * Seleção da lista: só as que se resolvem, entre as carregadas e filtradas agora. É derivada dos itens à
 * mostra, então mudar o filtro tira da seleção o que saiu da lista. Sem cliente de consulta: a ação mora na barra.
 */
export function useOccurrenceBulkSelection(items: readonly TripOccurrenceFeedItem[]) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())

  const resolvable = items.filter(isOccurrenceBulkResolvable)
  const selected = resolvable.filter((item) => selectedIds.has(item.id))

  function toggle(id: string): void {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  function toggleAll(): void {
    setSelectedIds(
      selected.length === resolvable.length
        ? new Set()
        : new Set(resolvable.map((item) => item.id)),
    )
  }

  return {
    clear: () => setSelectedIds(new Set()),
    isAllSelected: resolvable.length > 0 && selected.length === resolvable.length,
    isOverLimit: selected.length > OCCURRENCE_BULK_RESOLUTION_LIMIT,
    resolvableCount: resolvable.length,
    selected,
    selectedCount: selected.length,
    selectedIds: new Set(selected.map((item) => item.id)),
    toggle,
    toggleAll,
  }
}

export type OccurrenceBulkSelection = ReturnType<typeof useOccurrenceBulkSelection>
