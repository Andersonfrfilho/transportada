/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import {
  createBillingEligibleAdvancedFilter,
  countActiveBillingEligibleConditions,
  evaluateBillingEligibleAdvancedFilter,
  type BillingEligibleAdvancedFilter,
} from '../shared/billingEligibleAdvancedFilter.service'
import {
  accumulateBillingEligibleAmounts,
  BILLING_ELIGIBLE_FIRST_PAGE,
  canGoToPreviousBillingEligiblePage,
  countActiveBillingEligibleFilters,
  EMPTY_BILLING_ELIGIBLE_FILTERS,
  nextBillingEligiblePage,
  nextBillingEligibleSortState,
  previousBillingEligiblePage,
  readBillingEligibleColumnPreferences,
  reorderBillingEligibleColumns,
  serializeBillingEligibleQuery,
  sortBillingEligibleCtes,
  summarizeBillingEligibleSelection,
  toggleAllBillingEligibleSelection,
  toggleBillingEligibleSelection,
  writeBillingEligibleColumnPreferences,
  type BillingEligibleAmounts,
  type BillingEligibleColumnKey,
  type BillingEligibleColumnPreferences,
  type BillingEligiblePageState,
  type BillingEligibleSortState,
  type BillingEligibleTableFilters,
} from '../shared/billingEligibleTable.service'
import {
  clearBillingEligibleFilterField,
  type BillingEligiblePillField,
} from '../shared/billingEligibleFilterPills.service'
import {
  parseNumberFilterInput,
  type NumberFilterReason,
} from '../shared/billingEligibleFilterValue.service'
import { BILLING_ELIGIBLE_LIST_QUERY_KEY } from '../shared/billingQueryKey.constant'
import { getBillingClient } from './useBillingWorkspace.hook'

const BILLING_READ_PERMISSION = 'billing.read'
const BILLING_CREATE_PERMISSION = 'billing.create'
const BILLING_ELIGIBLE_PAGE_SIZE = 25

type BillingEligibleFilterField = keyof BillingEligibleTableFilters

export type BillingEligibleFilterErrors = Readonly<
  Partial<Record<BillingEligibleFilterField, NumberFilterReason>>
>

/** Entrada recusada precisa aparecer na tela: sem isso o filtro sumia e a lista parecia completa. */
function collectFilterErrors(filters: BillingEligibleTableFilters): BillingEligibleFilterErrors {
  const cteNumber = parseNumberFilterInput(filters.cteNumberQuery)
  const nfeNumber = parseNumberFilterInput(filters.nfeNumberQuery)
  return {
    ...(cteNumber.ok ? {} : { cteNumberQuery: cteNumber.reason }),
    ...(nfeNumber.ok ? {} : { nfeNumberQuery: nfeNumber.reason }),
  }
}

type UseBillingEligibleTableInput = Readonly<{
  companyId?: string
  permissions: readonly string[]
}>

export type BillingEligibleTableController = ReturnType<typeof useBillingEligibleTable>

function getColumnStorage(): null | Storage {
  return typeof window === 'undefined' ? null : window.localStorage
}

let conditionSequence = 0

function nextConditionId(): string {
  conditionSequence += 1
  return `billing-eligible-condition-${conditionSequence}`
}

export function useBillingEligibleTable(input: UseBillingEligibleTableInput) {
  const [filters, setFilters] = useState<BillingEligibleTableFilters>(
    EMPTY_BILLING_ELIGIBLE_FILTERS,
  )
  const [advancedFilter, setAdvancedFilter] = useState<BillingEligibleAdvancedFilter>(() =>
    createBillingEligibleAdvancedFilter(nextConditionId),
  )
  const [sort, setSort] = useState<BillingEligibleSortState>(null)
  const [page, setPage] = useState<BillingEligiblePageState>(BILLING_ELIGIBLE_FIRST_PAGE)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const knownAmounts = useRef<ReadonlyMap<string, BillingEligibleAmounts>>(new Map())
  const [columnPreferences, setColumnPreferences] = useState<BillingEligibleColumnPreferences>(() =>
    readBillingEligibleColumnPreferences(getColumnStorage()),
  )

  const canReadBilling =
    input.companyId !== undefined && input.permissions.includes(BILLING_READ_PERMISSION)
  const canCreateInvoices =
    input.companyId !== undefined && input.permissions.includes(BILLING_CREATE_PERMISSION)
  const client = getBillingClient()
  const query = serializeBillingEligibleQuery({
    cursor: page.cursor,
    filters,
    limit: BILLING_ELIGIBLE_PAGE_SIZE,
  })
  const eligibleQuery = useQuery({
    enabled: canReadBilling,
    queryFn: () =>
      client.listEligibleCtes({
        cursor: page.cursor,
        filters,
        limit: BILLING_ELIGIBLE_PAGE_SIZE,
      }),
    queryKey: [BILLING_ELIGIBLE_LIST_QUERY_KEY, input.companyId, query],
  })

  const items = eligibleQuery.data?.items ?? []
  const nextCursor = eligibleQuery.data?.nextCursor ?? null

  /** A soma da seleção sobrevive à troca de página porque o mapa acumula o que já passou na tela. */
  knownAmounts.current = accumulateBillingEligibleAmounts({ items, known: knownAmounts.current })

  const filteredItems = items.filter((item) =>
    evaluateBillingEligibleAdvancedFilter(item, advancedFilter),
  )
  const visibleItems = sortBillingEligibleCtes(filteredItems, sort)
  const visibleColumns = columnPreferences.order.filter(
    (column) => columnPreferences.visibility[column],
  )
  const selection = summarizeBillingEligibleSelection({
    amounts: knownAmounts.current,
    selectedIds,
  })

  function restartPagination(): void {
    setPage(BILLING_ELIGIBLE_FIRST_PAGE)
  }

  function persistColumns(preferences: BillingEligibleColumnPreferences): void {
    setColumnPreferences(preferences)
    writeBillingEligibleColumnPreferences({ preferences, storage: getColumnStorage() })
  }

  return {
    activeConditionCount: countActiveBillingEligibleConditions(advancedFilter),
    activeFilterCount: countActiveBillingEligibleFilters(filters),
    advancedFilter,
    canCreateInvoices,
    canGoToPreviousPage: canGoToPreviousBillingEligiblePage(page),
    canReadBilling,
    clearFilters: () => {
      setFilters(EMPTY_BILLING_ELIGIBLE_FILTERS)
      setAdvancedFilter(createBillingEligibleAdvancedFilter(nextConditionId))
      setSort(null)
      setSelectedIds([])
      restartPagination()
    },
    clearFilterField: (field: BillingEligiblePillField) => {
      if (field === 'advanced') {
        setAdvancedFilter(createBillingEligibleAdvancedFilter(nextConditionId))
      } else {
        setFilters((current) => clearBillingEligibleFilterField({ field, filters: current }))
      }
      setSelectedIds([])
      restartPagination()
    },
    clearSelection: () => setSelectedIds([]),
    columnPreferences,
    eligibleQuery,
    filterErrors: collectFilterErrors(filters),
    filters,
    goToNextPage: () => setPage((current) => nextBillingEligiblePage(current, nextCursor)),
    goToPreviousPage: () => setPage((current) => previousBillingEligiblePage(current)),
    hasNextPage: nextCursor !== null,
    hideColumn: (column: BillingEligibleColumnKey, isVisible: boolean) =>
      persistColumns({
        ...columnPreferences,
        visibility: { ...columnPreferences.visibility, [column]: isVisible },
      }),
    moveColumn: (column: BillingEligibleColumnKey, direction: 'down' | 'up') =>
      persistColumns({
        ...columnPreferences,
        order: reorderBillingEligibleColumns(columnPreferences.order, column, direction),
      }),
    nextConditionId,
    pageSize: BILLING_ELIGIBLE_PAGE_SIZE,
    selectedIds,
    selection,
    setAdvancedFilter: (model: BillingEligibleAdvancedFilter) => {
      setAdvancedFilter(model)
      restartPagination()
    },
    setTextFilter: (field: BillingEligibleFilterField, value: string) => {
      setFilters((current) => ({ ...current, [field]: value }))
      setSelectedIds([])
      restartPagination()
    },
    sort,
    toggleAllSelection: () =>
      setSelectedIds((current) =>
        toggleAllBillingEligibleSelection({
          pageIds: visibleItems.map((item) => item.cteId),
          selectedIds: current,
        }),
      ),
    toggleSelection: (cteId: string) =>
      setSelectedIds((current) => toggleBillingEligibleSelection(current, cteId)),
    toggleSort: (column: BillingEligibleColumnKey) => {
      setSort((current) => nextBillingEligibleSortState(current, column))
      restartPagination()
    },
    visibleColumns,
    visibleItems,
  }
}
