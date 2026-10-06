/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState } from 'react'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { useCargoArrivalsQuery, useReloadCargoArrivals } from '../queries/useCargoArrivals.query'
import { useCargoContractorsQuery } from '../queries/useCargoContractors.query'
import type { CargoArrivalSummary, CargoContractor } from '../shared/cargoArrival.types'
import { resolveServerFilters } from '../shared/cargoArrivalTable.service'
import { CARGO_RECEIVING_ERROR } from '../shared/cargoReceiving.constant'
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
  /** O cursor era de outra ordem e a lista recomeçou: aviso neutro, vale até o critério mudar. */
  hasOrderNotice: boolean
  isLoading: boolean
  isLoadingMore: boolean
  loadMore: () => Promise<void>
  loadedCount: number
  openDetail: (arrivalId: string) => void
  openRegister: () => void
  openSeparation: (arrivalId: string) => void
  table: CargoArrivalTableController
  visible: readonly CargoArrivalSummary[]
}>

function isOrderMismatch(error: unknown): boolean {
  return error instanceof Error && error.message === CARGO_RECEIVING_ERROR.CURSOR_ORDER_MISMATCH
}

/** O erro de cursor tem aviso próprio e a lista recarrega: ele não vira o alerta de falha de carga. */
function readListErrorCode(error: unknown): string | undefined {
  return error instanceof Error && !isOrderMismatch(error) ? error.message : undefined
}

/** Lista, estado da tabela e navegação juntos; o que se vê é derivado no render, nunca guardado. */
export function useCargoArrivalList(): CargoArrivalListController {
  const table = useCargoArrivalTable()
  const filters = resolveServerFilters(table.state)
  const arrivalsQuery = useCargoArrivalsQuery(filters)
  const reload = useReloadCargoArrivals(filters)
  const contractorsQuery = useCargoContractorsQuery()
  const [orderNoticeKey, setOrderNoticeKey] = useState<string | undefined>(undefined)
  const criteriaKey = JSON.stringify(filters)
  const navigator = useMemo(createBrowserWorkspaceNavigator, [])

  const loaded = useMemo(
    () => arrivalsQuery.data?.pages.flatMap((page) => page.items) ?? NO_ARRIVALS,
    [arrivalsQuery.data],
  )

  async function loadMore(): Promise<void> {
    const { error } = await arrivalsQuery.fetchNextPage()
    if (!isOrderMismatch(error)) return
    setOrderNoticeKey(criteriaKey)
    await reload()
  }

  return {
    contractors: contractorsQuery.data ?? NO_CONTRACTORS,
    errorCode: readListErrorCode(arrivalsQuery.error),
    hasNextPage: arrivalsQuery.hasNextPage,
    hasOrderNotice: orderNoticeKey === criteriaKey,
    isLoading: arrivalsQuery.isLoading,
    isLoadingMore: arrivalsQuery.isFetchingNextPage,
    loadMore,
    loadedCount: loaded.length,
    openDetail: (arrivalId) => navigateToCargoArrivalDetail({ arrivalId, navigator }),
    openRegister: () => navigateToCargoArrivalRegister(navigator),
    openSeparation: (arrivalId) => navigateToCargoArrivalSeparation({ arrivalId, navigator }),
    table,
    visible: loaded,
  }
}
