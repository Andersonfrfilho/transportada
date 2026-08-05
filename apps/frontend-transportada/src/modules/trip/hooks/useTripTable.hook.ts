/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { TRIP_LIST_QUERY_KEY, TRIP_PAGE_SIZE } from '../shared/trip.constant'
import type { TripFilters, TripStatus } from '../shared/trip.types'
import { clearTripFilterField, type TripPillField } from '../shared/tripFilterPills.service'
import { navigateToTrip } from '../shared/tripRoute.service'
import {
  canGoToPreviousTripPage,
  countActiveTripFilters,
  nextTripPage,
  nextTripSortState,
  previousTripPage,
  sortTrips,
  TRIP_FIRST_PAGE,
  type TripColumnKey,
  type TripPageState,
  type TripSortState,
} from '../shared/tripTable.service'
import { getTripClient } from './useTripWorkspace.hook'

const EMPTY_TRIP_FILTERS: TripFilters = {}

type UseTripTableInput = Readonly<{
  canReadTrips: boolean
  companyId?: string
}>

export type TripTableController = ReturnType<typeof useTripTable>

export function useTripTable(input: UseTripTableInput) {
  const [filters, setFilters] = useState<TripFilters>(EMPTY_TRIP_FILTERS)
  const [sort, setSort] = useState<TripSortState>(null)
  const [page, setPage] = useState<TripPageState>(TRIP_FIRST_PAGE)

  const client = getTripClient()
  const tripsQuery = useQuery({
    enabled: input.canReadTrips,
    queryFn: () => client.listTrips({ cursor: page.cursor, filters, limit: TRIP_PAGE_SIZE }),
    queryKey: [...TRIP_LIST_QUERY_KEY, input.companyId, page.cursor, JSON.stringify(filters)],
  })

  const items = tripsQuery.data?.items ?? []
  const nextCursor = tripsQuery.data?.nextCursor ?? null
  const visibleItems = sortTrips(items, sort)

  function restartPagination(): void {
    setPage(TRIP_FIRST_PAGE)
  }

  return {
    activeFilterCount: countActiveTripFilters(filters),
    canGoToPreviousPage: canGoToPreviousTripPage(page),
    clearFilterField: (field: TripPillField) => {
      setFilters((current) => clearTripFilterField({ field, filters: current }))
      restartPagination()
    },
    clearFilters: () => {
      setFilters(EMPTY_TRIP_FILTERS)
      setSort(null)
      restartPagination()
    },
    filters,
    goToNextPage: () => setPage((current) => nextTripPage(current, nextCursor)),
    goToPreviousPage: () => setPage((current) => previousTripPage(current)),
    hasNextPage: nextCursor !== null,
    openTrip: (tripId: string) => navigateToTrip({ navigator: createBrowserWorkspaceNavigator(), tripId }),
    pageSize: TRIP_PAGE_SIZE,
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
    setStatusFilter: (value: '' | TripStatus) => {
      setFilters((current) =>
        value === ''
          ? clearTripFilterField({ field: 'statusEq', filters: current })
          : { ...current, statusEq: value },
      )
      restartPagination()
    },
    setTextFilter: (field: 'driverIdEq' | 'vehicleIdEq', value: string) => {
      setFilters((current) =>
        value === '' ? clearTripFilterField({ field, filters: current }) : { ...current, [field]: value },
      )
      restartPagination()
    },
    sort,
    toggleSort: (column: TripColumnKey) => setSort((current) => nextTripSortState(current, column)),
    tripsQuery,
    visibleItems,
  }
}
