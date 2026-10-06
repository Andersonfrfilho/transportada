/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'

import {
  EMPTY_OCCURRENCE_TYPE_FILTERS,
  toggleOccurrenceTypeFilterChip,
  type OccurrenceTypeFilterChipId,
  type OccurrenceTypeFilters,
} from '../shared/occurrenceTypeFilterChips.service'

export type OccurrenceTypeFiltersController = Readonly<{
  clear: () => void
  filters: OccurrenceTypeFilters
  setQuery: (query: string) => void
  toggleChip: (chipId: OccurrenceTypeFilterChipId) => void
}>

/** A busca e as pílulas da aba Tipos: só estado de tela, nada vai para a API nem para a URL. */
export function useOccurrenceTypeFilters(): OccurrenceTypeFiltersController {
  const [filters, setFilters] = useState<OccurrenceTypeFilters>(EMPTY_OCCURRENCE_TYPE_FILTERS)

  return {
    clear: () => setFilters(EMPTY_OCCURRENCE_TYPE_FILTERS),
    filters,
    setQuery: (query) => setFilters((current) => ({ ...current, query })),
    toggleChip: (chipId) =>
      setFilters((current) => toggleOccurrenceTypeFilterChip(current, chipId)),
  }
}
