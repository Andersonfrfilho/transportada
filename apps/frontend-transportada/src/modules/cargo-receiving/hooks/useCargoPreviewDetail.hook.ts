/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo } from 'react'

import { useCargoPreviewQuery } from '../queries/useCargoPreviews.query'
import type { CargoPreviewDetail, CargoPreviewItem } from '../shared/cargoPreview.types'
import {
  applyCargoPreviewItemFilters,
  buildCargoPreviewRouteSections,
  resolveCargoPreviewItemServerFilters,
  type CargoPreviewRouteSection,
} from '../shared/cargoPreviewDetailView.service'
import {
  useCargoPreviewDetailFilters,
  type CargoPreviewDetailFiltersController,
} from './useCargoPreviewDetailFilters.hook'

const NO_ITEMS: readonly CargoPreviewItem[] = []

export type CargoPreviewDetailController = Readonly<{
  errorCode: string | undefined
  filters: CargoPreviewDetailFiltersController
  hasNextPage: boolean
  /** O cabeçalho (contagens, roteiros, situação): vem da primeira página, sempre a mais recente. */
  header: CargoPreviewDetail | undefined
  isLoading: boolean
  isLoadingMore: boolean
  loadMore: () => void
  /** Todas as linhas carregadas, antes de agrupar: o aviso de desvincular conta o grupo nelas. */
  loadedItems: readonly CargoPreviewItem[]
  sections: readonly CargoPreviewRouteSection[]
}>

/** Consulta, filtros da URL e agrupamento por roteiro; o que se vê é derivado no render. */
export function useCargoPreviewDetail(previewId: string): CargoPreviewDetailController {
  const filters = useCargoPreviewDetailFilters()
  const query = useCargoPreviewQuery({
    filters: resolveCargoPreviewItemServerFilters(filters.filters),
    previewId,
  })
  const header = query.data?.pages[0]

  const loadedItems = useMemo(
    () => query.data?.pages.flatMap((page) => page.items.items) ?? NO_ITEMS,
    [query.data],
  )
  const sections = useMemo(
    () =>
      buildCargoPreviewRouteSections({
        items: applyCargoPreviewItemFilters({ filters: filters.filters, items: loadedItems }),
        routes: header?.routes ?? [],
      }),
    [filters.filters, header?.routes, loadedItems],
  )

  return {
    errorCode: query.error instanceof Error ? query.error.message : undefined,
    filters,
    hasNextPage: query.hasNextPage,
    header,
    isLoading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => void query.fetchNextPage(),
    loadedItems,
    sections,
  }
}
