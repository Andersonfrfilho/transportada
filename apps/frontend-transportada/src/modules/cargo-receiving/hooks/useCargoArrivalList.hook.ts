/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo } from 'react'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { useCargoArrivalsQuery } from '../queries/useCargoArrivals.query'
import { useCargoContractorsQuery } from '../queries/useCargoContractors.query'
import type { CargoArrivalSummary, CargoContractor } from '../shared/cargoArrival.types'
import { applyCargoArrivalTable, resolveServerFilters } from '../shared/cargoArrivalTable.service'
import {
  navigateToCargoArrivalDetail,
  navigateToCargoArrivalRegister,
  navigateToCargoArrivalSeparation,
} from '../shared/cargoReceivingRoute.service'
import { useCargoArrivalTable, type CargoArrivalTableController } from './useCargoArrivalTable.hook'

const NO_ARRIVALS: readonly CargoArrivalSummary[] = []
const NO_CONTRACTORS: readonly CargoContractor[] = []

export type CargoArrivalListController = Readonly<{
  contractors: readonly CargoContractor[]
  errorCode: string | undefined
  hasNextPage: boolean
  isLoading: boolean
  isLoadingMore: boolean
  loadMore: () => void
  loadedCount: number
  openDetail: (arrivalId: string) => void
  openRegister: () => void
  openSeparation: (arrivalId: string) => void
  table: CargoArrivalTableController
  visible: readonly CargoArrivalSummary[]
}>

/** Lista, estado da tabela e navegação juntos; o que se vê é derivado no render, nunca guardado. */
export function useCargoArrivalList(): CargoArrivalListController {
  const table = useCargoArrivalTable()
  const arrivalsQuery = useCargoArrivalsQuery(resolveServerFilters(table.state))
  const contractorsQuery = useCargoContractorsQuery()
  const navigator = useMemo(createBrowserWorkspaceNavigator, [])

  const loaded = useMemo(
    () => arrivalsQuery.data?.pages.flatMap((page) => page.items) ?? NO_ARRIVALS,
    [arrivalsQuery.data],
  )

  return {
    contractors: contractorsQuery.data ?? NO_CONTRACTORS,
    errorCode: arrivalsQuery.error instanceof Error ? arrivalsQuery.error.message : undefined,
    hasNextPage: arrivalsQuery.hasNextPage,
    isLoading: arrivalsQuery.isLoading,
    isLoadingMore: arrivalsQuery.isFetchingNextPage,
    loadMore: () => void arrivalsQuery.fetchNextPage(),
    loadedCount: loaded.length,
    openDetail: (arrivalId) => navigateToCargoArrivalDetail({ arrivalId, navigator }),
    openRegister: () => navigateToCargoArrivalRegister(navigator),
    openSeparation: (arrivalId) => navigateToCargoArrivalSeparation({ arrivalId, navigator }),
    table,
    visible: applyCargoArrivalTable({ arrivals: loaded, state: table.state }),
  }
}
