/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useTripOccurrenceFeedQuery } from '../queries/tripOccurrenceFeed.query'
import {
  clearTripOccurrenceFilterField,
  type TripOccurrencePillField,
} from '../shared/tripOccurrenceFilterPills.service'
import {
  countActiveTripOccurrenceFilters,
  EMPTY_TRIP_OCCURRENCE_FILTERS,
  readTripOccurrenceColumnPreferences,
  reorderTripOccurrenceColumns,
  setTripOccurrenceCaseStatuses,
  setTripOccurrenceContractorReplyOverdue,
  setTripOccurrenceResolutionStates,
  toggleTripOccurrenceOrder,
  toggleTripOccurrenceStage,
  TRIP_OCCURRENCE_STAGES,
  writeTripOccurrenceColumnPreferences,
  type TripOccurrenceCaseStatusFilterValue,
  type TripOccurrenceColumnKey,
  type TripOccurrenceColumnPreferences,
  type TripOccurrenceFeedFilters,
  type TripOccurrenceFeedOrder,
  type TripOccurrenceFeedStage,
  type TripOccurrenceFeedPage,
  type TripOccurrenceResolutionFilterValue,
} from '../shared/tripOccurrenceFeed.service'
import {
  readTripOccurrenceUrlFilters,
  writeTripOccurrenceUrlFilters,
} from '../shared/tripOccurrenceUrlFilters.service'

export type TripOccurrenceTableController = ReturnType<typeof useTripOccurrenceTable>

export type TripOccurrenceTextFilterField =
  | 'createdFrom'
  | 'createdUntil'
  | 'platesQuery'
  | 'typesQuery'

type UseTripOccurrenceTableInput = Readonly<{
  companyId?: string
  enabled: boolean
}>

function getColumnStorage(): null | Storage {
  return typeof window === 'undefined' ? null : window.localStorage
}

/** Spec 248 RF5: a lista abre já filtrada quando o endereço traz `?contractorReply=overdue`. */
function readInitialFilters(): TripOccurrenceFeedFilters {
  if (typeof window === 'undefined') return EMPTY_TRIP_OCCURRENCE_FILTERS
  return {
    ...EMPTY_TRIP_OCCURRENCE_FILTERS,
    ...readTripOccurrenceUrlFilters(window.location.search),
  }
}

/** `replaceState`: filtrar não empilha histórico; os outros parâmetros (`tab`) ficam como estão. */
function writeFiltersToUrl(filters: TripOccurrenceFeedFilters): void {
  if (typeof window === 'undefined') return
  const search = writeTripOccurrenceUrlFilters({ filters, search: window.location.search })
  if (search === window.location.search) return
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${search}${window.location.hash}`,
  )
}

export function useTripOccurrenceTable(input: UseTripOccurrenceTableInput) {
  const [filters, setFilters] = useState<TripOccurrenceFeedFilters>(readInitialFilters)
  const [order, setOrder] = useState<TripOccurrenceFeedOrder>('desc')
  const [expandedId, setExpandedId] = useState<null | string>(null)
  const [columnPreferences, setColumnPreferences] = useState<TripOccurrenceColumnPreferences>(() =>
    readTripOccurrenceColumnPreferences(getColumnStorage()),
  )

  const feedQuery = useTripOccurrenceFeedQuery({
    ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
    enabled: input.enabled,
    filters,
    order,
  })

  const items = feedQuery.data?.pages.flatMap((page: TripOccurrenceFeedPage) => page.items) ?? []
  const visibleColumns = columnPreferences.order.filter(
    (column) => columnPreferences.visibility[column],
  )
  const activeFilterCount = countActiveTripOccurrenceFilters(filters)

  /** Toda mudança de filtro reinicia a paginação — a chave da consulta faz isso sozinha. */
  function applyFilters(next: TripOccurrenceFeedFilters): void {
    setFilters(next)
    setExpandedId(null)
    writeFiltersToUrl(next)
  }

  function setContractorReplyOverdue(isOverdueOnly: boolean): void {
    applyFilters(setTripOccurrenceContractorReplyOverdue(filters, isOverdueOnly))
  }

  function setTextFilter(field: TripOccurrenceTextFilterField, value: string): void {
    applyFilters({ ...filters, [field]: value })
  }

  function setDateRange(from: string, to: string): void {
    applyFilters({ ...filters, createdFrom: from, createdUntil: to })
  }

  function toggleStage(stage: TripOccurrenceFeedStage): void {
    applyFilters(toggleTripOccurrenceStage(filters, stage))
  }

  /** O multi-select devolve a seleção inteira de uma vez — aplicar toggle a toggle perderia tudo menos o último. */
  function setStages(stages: readonly TripOccurrenceFeedStage[]): void {
    applyFilters({
      ...filters,
      stages: TRIP_OCCURRENCE_STAGES.filter((stage) => stages.includes(stage)),
    })
  }

  function setCaseStatuses(statuses: readonly TripOccurrenceCaseStatusFilterValue[]): void {
    applyFilters(setTripOccurrenceCaseStatuses(filters, statuses))
  }

  function setResolutionStates(states: readonly TripOccurrenceResolutionFilterValue[]): void {
    applyFilters(setTripOccurrenceResolutionStates(filters, states))
  }

  function clearFilters(): void {
    applyFilters(EMPTY_TRIP_OCCURRENCE_FILTERS)
  }

  function clearFilterField(field: TripOccurrencePillField): void {
    applyFilters(clearTripOccurrenceFilterField({ field, filters }))
  }

  function toggleOrder(): void {
    setOrder(toggleTripOccurrenceOrder(order))
    setExpandedId(null)
  }

  function toggleExpanded(occurrenceId: string): void {
    setExpandedId(expandedId === occurrenceId ? null : occurrenceId)
  }

  function persistColumnPreferences(next: TripOccurrenceColumnPreferences): void {
    setColumnPreferences(next)
    writeTripOccurrenceColumnPreferences(getColumnStorage(), next)
  }

  function toggleColumnVisibility(column: TripOccurrenceColumnKey): void {
    persistColumnPreferences({
      ...columnPreferences,
      visibility: {
        ...columnPreferences.visibility,
        [column]: !columnPreferences.visibility[column],
      },
    })
  }

  function moveColumn(column: TripOccurrenceColumnKey, direction: 'down' | 'up'): void {
    persistColumnPreferences({
      ...columnPreferences,
      order: reorderTripOccurrenceColumns(columnPreferences.order, column, direction),
    })
  }

  return {
    activeFilterCount,
    clearFilterField,
    clearFilters,
    columnPreferences,
    expandedId,
    fetchNextPage: () => void feedQuery.fetchNextPage(),
    filters,
    hasNextPage: feedQuery.hasNextPage,
    isFetchingNextPage: feedQuery.isFetchingNextPage,
    isLoading: feedQuery.isLoading,
    items,
    moveColumn,
    order,
    setCaseStatuses,
    setContractorReplyOverdue,
    setDateRange,
    setResolutionStates,
    setStages,
    setTextFilter,
    toggleColumnVisibility,
    toggleExpanded,
    toggleOrder,
    toggleStage,
    visibleColumns,
  }
}
