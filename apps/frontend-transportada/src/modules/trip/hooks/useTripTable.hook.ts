/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import { FINANCIALS_PERMISSION } from '@/modules/trip-financials/shared/tripFinancialsQueryKey.constant'

import { TRIP_LIST_QUERY_KEY, TRIP_PAGE_SIZES, type TripPageSize } from '../shared/trip.constant'
import type { TripFilters, TripStatus } from '../shared/trip.types'
import { clearTripFilterField, type TripPillField } from '../shared/tripFilterPills.service'
import { navigateToTrip } from '../shared/tripRoute.service'
import {
  cancellableSelection,
  closeableSelection,
  pruneSelection,
  selectAllOnPage,
  selectAllState,
  toggleSelection,
} from '../shared/tripSelection.service'
import {
  canGoToPreviousTripPage,
  countActiveTripFilters,
  nextTripPage,
  nextTripSortState,
  previousTripPage,
  sortTrips,
  arrangeTripColumns,
  readTripColumnPreferences,
  reorderTripColumns,
  TRIP_FIRST_PAGE,
  tripPageAt,
  tripPageCount,
  tripPageNumber,
  visibleTripPageNumbers,
  visibleTripColumns,
  writeTripColumnPreferences,
  type TripColumnKey,
  type TripColumnPreferences,
  type TripPageState,
  type TripSortState,
} from '../shared/tripTable.service'
import { buildTripReportFilters } from '../shared/tripReportFilterState.service'
import { useTripReportFilters } from './useTripReportFilters.hook'
import { getTripClient } from './useTripWorkspace.hook'

const EMPTY_TRIP_FILTERS: TripFilters = {}

function getColumnStorage(): null | Storage {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

type UseTripTableInput = Readonly<{
  canReadTrips: boolean
  companyId?: string
  permissions: readonly string[]
  /** Dono da preferência de colunas; sem ele a tela usa o padrão e não grava nada. */
  userId?: string
}>

export type TripTableController = ReturnType<typeof useTripTable>

export function useTripTable(input: UseTripTableInput) {
  const [filters, setFilters] = useState<TripFilters>(EMPTY_TRIP_FILTERS)
  const [sort, setSort] = useState<TripSortState>(null)
  const [page, setPage] = useState<TripPageState>(TRIP_FIRST_PAGE)
  const [pageSize, setPageSize] = useState<TripPageSize>(TRIP_PAGE_SIZES[0])
  const [columnOverride, setColumnOverride] = useState<null | Readonly<{
    preferences: TripColumnPreferences
    userId: string | undefined
  }>>(null)
  const storedColumns = useMemo(
    () => readTripColumnPreferences({ storage: getColumnStorage(), userId: input.userId }),
    [input.userId],
  )
  const columnPreferences =
    columnOverride !== null && columnOverride.userId === input.userId
      ? columnOverride.preferences
      : storedColumns
  const reportFilters = useTripReportFilters()

  const client = getTripClient()
  const tripsQuery = useQuery({
    enabled: input.canReadTrips,
    queryFn: () =>
      client.listTrips({
        cursor: page.cursor,
        direction: page.direction,
        filters,
        limit: pageSize,
        ...(page.offset === null ? {} : { offset: page.offset }),
      }),
    queryKey: [
      ...TRIP_LIST_QUERY_KEY,
      input.companyId,
      page.cursor,
      page.direction,
      page.offset,
      pageSize,
      JSON.stringify(filters),
    ],
  })

  const items = tripsQuery.data?.items ?? []
  const nextCursor = tripsQuery.data?.nextCursor ?? null
  const previousCursor = tripsQuery.data?.previousCursor ?? null
  const visibleItems = sortTrips(items, sort)
  const pageCount = tripPageCount({ pageSize, total: tripsQuery.data?.total ?? null })
  const pageNumber = tripPageNumber({ offset: tripsQuery.data?.offset ?? null, pageSize })

  /**
   * Spec 102: a marcação vive aqui, e é **podada contra a página**. Paginação por cursor troca o
   * conjunto inteiro, e manter id invisível faria o operador cancelar o que não está vendo.
   */
  const [rawSelection, setRawSelection] = useState<readonly string[]>([])
  const selectedIds = pruneSelection({ selectedIds: rawSelection, trips: visibleItems })

  function restartPagination(): void {
    setPage(TRIP_FIRST_PAGE)
  }

  const allowedColumns = visibleTripColumns({
    canReadFinancials: input.permissions.includes(FINANCIALS_PERMISSION),
  })

  function persistColumns(preferences: TripColumnPreferences): void {
    setColumnOverride({ preferences, userId: input.userId })
    writeTripColumnPreferences({ preferences, storage: getColumnStorage(), userId: input.userId })
  }

  return {
    activeFilterCount: countActiveTripFilters(filters) + reportFilters.activeCount,
    /** As marcadas que **ainda podem** ser canceladas — nunca a marcação crua (spec 102). */
    cancellableSelection: cancellableSelection({ selectedIds, trips: visibleItems }),
    closeableSelection: closeableSelection({ selectedIds, trips: visibleItems }),
    clearSelection: () => setRawSelection([]),
    /** Spec 223 RF8: o lote devolve as que falharam, e só elas continuam marcadas. */
    replaceSelection: (tripIds: readonly string[]) => setRawSelection(tripIds),
    columnPreferences,
    /** As colunas que a tela mostra: ordem e visibilidade do usuário, já sem o que a permissão tirou. */
    columns: arrangeTripColumns({ allowed: allowedColumns, preferences: columnPreferences }),
    /** As colunas que o menu oferece: todas as permitidas, visíveis ou não. */
    manageableColumns: columnPreferences.order.filter((column) => allowedColumns.includes(column)),
    moveColumn: (column: TripColumnKey, direction: 'down' | 'up') =>
      persistColumns({
        ...columnPreferences,
        order: reorderTripColumns(columnPreferences.order, column, direction),
      }),
    toggleColumnVisibility: (column: TripColumnKey) =>
      persistColumns({
        ...columnPreferences,
        visibility: {
          ...columnPreferences.visibility,
          [column]: !columnPreferences.visibility[column],
        },
      }),
    selectedIds,
    selectAllState: selectAllState({ selectedIds, trips: visibleItems }),
    toggleSelectAll: () =>
      setRawSelection((current) =>
        selectAllState({ selectedIds: current, trips: visibleItems }) === 'all'
          ? []
          : selectAllOnPage(visibleItems),
      ),
    toggleSelection: (tripId: string) =>
      setRawSelection((current) => toggleSelection({ selectedIds: current, tripId })),
    canGoToPreviousPage: canGoToPreviousTripPage(previousCursor),
    clearFilterField: (field: TripPillField) => {
      setFilters((current) => clearTripFilterField({ field, filters: current }))
      restartPagination()
    },
    clearFilters: () => {
      setFilters(EMPTY_TRIP_FILTERS)
      reportFilters.clear()
      setSort(null)
      restartPagination()
    },
    filters,
    goToNextPage: () => setPage((current) => nextTripPage(current, nextCursor)),
    goToPreviousPage: () => setPage((current) => previousTripPage(current, previousCursor)),
    /** Primeira e última só fazem sentido quando há para onde ir: na própria página, ficam inertes. */
    goToFirstPage: restartPagination,
    goToLastPage: () => {
      if (pageCount !== null) setPage(tripPageAt({ pageNumber: pageCount, pageSize }))
    },
    /** Salto direto para a página N (a numeração parte de 1). */
    goToPage: (pageNumber: number) => setPage(tripPageAt({ pageNumber, pageSize })),
    pageCount,
    pageNumber,
    pageNumbers:
      pageCount === null ? [] : visibleTripPageNumbers({ count: pageCount, current: pageNumber }),
    total: tripsQuery.data?.total ?? null,
    canGoToFirstPage: previousCursor !== null,
    canGoToLastPage: pageCount !== null && pageNumber < pageCount,
    hasNextPage: nextCursor !== null,
    openTrip: (tripId: string) =>
      navigateToTrip({ navigator: createBrowserWorkspaceNavigator(), tripId }),
    pageSize,
    setPageSize: (size: TripPageSize) => {
      setPageSize(size)
      restartPagination()
    },
    reportFilters,
    /** Escopo do relatório: filtros da listagem + filtros de nota (a listagem não usa os de nota). */
    reportScope: buildTripReportFilters({ state: reportFilters.state, tripFilters: filters }),
    setDateRange: (from: string, to: string) => {
      setFilters((current) => {
        const next = { ...current }
        if (from === '') delete next.createdFrom
        else next.createdFrom = from
        if (to === '') delete next.createdUntil
        else next.createdUntil = to
        return next
      })
      restartPagination()
    },
    setProofPendingFilter: (isOnlyPending: boolean) => {
      setFilters((current) =>
        isOnlyPending
          ? { ...current, proofPendingEq: true }
          : clearTripFilterField({ field: 'proofPendingEq', filters: current }),
      )
      restartPagination()
    },
    /** Seleção vazia é "sem filtro": a chave sai do objeto, e não vira `statusIn=` na query. */
    setStatusFilter: (values: readonly TripStatus[]) => {
      setFilters((current) =>
        values.length === 0
          ? clearTripFilterField({ field: 'statusIn', filters: current })
          : { ...current, statusIn: values },
      )
      restartPagination()
    },
    setIdFilter: (field: 'driverIdIn' | 'vehicleIdIn', values: readonly string[]) => {
      setFilters((current) =>
        values.length === 0
          ? clearTripFilterField({ field, filters: current })
          : { ...current, [field]: values },
      )
      restartPagination()
    },
    sort,
    toggleSort: (column: TripColumnKey) => setSort((current) => nextTripSortState(current, column)),
    tripsQuery,
    visibleItems,
  }
}
