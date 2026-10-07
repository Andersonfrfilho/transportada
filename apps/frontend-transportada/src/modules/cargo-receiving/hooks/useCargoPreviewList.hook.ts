/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo } from 'react'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { useCargoContractorsQuery } from '../queries/useCargoContractors.query'
import { useCargoPreviewsQuery } from '../queries/useCargoPreviews.query'
import type { CargoContractor } from '../shared/cargoArrival.types'
import type { CargoPreviewSummary } from '../shared/cargoPreview.types'
import {
  applyCargoPreviewTable,
  resolveCargoPreviewServerFilters,
} from '../shared/cargoPreviewTable.service'
import { navigateToCargoPreviewDetail } from '../shared/cargoReceivingRoute.service'
import { useCargoPreviewTable, type CargoPreviewTableController } from './useCargoPreviewTable.hook'

const NO_PREVIEWS: readonly CargoPreviewSummary[] = []
const NO_CONTRACTORS: readonly CargoContractor[] = []

export type CargoPreviewListController = Readonly<{
  contractors: readonly CargoContractor[]
  errorCode: string | undefined
  hasNextPage: boolean
  isLoading: boolean
  isLoadingMore: boolean
  loadMore: () => void
  loadedCount: number
  openDetail: (previewId: string) => void
  table: CargoPreviewTableController
  visible: readonly CargoPreviewSummary[]
}>

/** Lista, estado da tabela e navegação juntos; o que se vê é derivado no render, nunca guardado. */
export function useCargoPreviewList(): CargoPreviewListController {
  const table = useCargoPreviewTable()
  const previewsQuery = useCargoPreviewsQuery(resolveCargoPreviewServerFilters(table.state))
  const contractorsQuery = useCargoContractorsQuery()
  const navigator = useMemo(createBrowserWorkspaceNavigator, [])

  const loaded = useMemo(
    () => previewsQuery.data?.pages.flatMap((page) => page.items) ?? NO_PREVIEWS,
    [previewsQuery.data],
  )

  return {
    contractors: contractorsQuery.data ?? NO_CONTRACTORS,
    errorCode: previewsQuery.error instanceof Error ? previewsQuery.error.message : undefined,
    hasNextPage: previewsQuery.hasNextPage,
    isLoading: previewsQuery.isLoading,
    isLoadingMore: previewsQuery.isFetchingNextPage,
    loadMore: () => void previewsQuery.fetchNextPage(),
    loadedCount: loaded.length,
    openDetail: (previewId) => navigateToCargoPreviewDetail({ navigator, previewId }),
    table,
    visible: applyCargoPreviewTable({ previews: loaded, state: table.state }),
  }
}
