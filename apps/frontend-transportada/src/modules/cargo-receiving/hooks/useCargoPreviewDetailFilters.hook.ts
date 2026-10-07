/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { CargoPreviewItemState } from '../shared/cargoPreview.types'
import {
  EMPTY_CARGO_PREVIEW_DETAIL_FILTERS,
  parseCargoPreviewDetailFilters,
  serializeCargoPreviewDetailFilters,
  type CargoPreviewDetailFilters,
} from '../shared/cargoPreviewDetailView.service'

export type CargoPreviewDetailFiltersController = Readonly<{
  clear: () => void
  filters: CargoPreviewDetailFilters
  setRouteNames: (routeNames: readonly string[]) => void
  setStates: (states: readonly CargoPreviewItemState[]) => void
}>

/** Estado e roteiro do detalhe moram na URL, escrita no próprio gesto (`web.md` §7). */
export function useCargoPreviewDetailFilters(): CargoPreviewDetailFiltersController {
  const [filters, setFilters] = useState<CargoPreviewDetailFilters>(() =>
    parseCargoPreviewDetailFilters(window.location.search),
  )

  function commit(next: CargoPreviewDetailFilters): void {
    setFilters(next)
    const search = serializeCargoPreviewDetailFilters({
      filters: next,
      search: window.location.search,
    })
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`)
  }

  return {
    clear: () => commit(EMPTY_CARGO_PREVIEW_DETAIL_FILTERS),
    filters,
    setRouteNames: (routeNames) => commit({ ...filters, routeNames }),
    setStates: (states) => commit({ ...filters, states }),
  }
}
