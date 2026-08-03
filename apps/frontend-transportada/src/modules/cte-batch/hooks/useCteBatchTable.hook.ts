/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'

import type { CteBatchStatus, CteBatchSummary } from '../shared/cteBatchClient.service'
import {
  applyConditionChanges,
  countActiveConditions,
  createAdvancedFilterModel,
  createCondition,
  createConditionGroup,
  evaluateAdvancedFilter,
  type CteBatchAdvancedFilter,
  type CteBatchCondition,
} from '../shared/cteBatchAdvancedFilter.service'
import {
  clearCteBatchFilterField,
  type CteBatchPillField,
} from '../shared/cteBatchFilterPills.service'
import {
  EMPTY_CTE_BATCH_FILTERS,
  batchMatchesFilters,
  countActiveFilters,
  nextSortState,
  readColumnPreferences,
  reorderColumns,
  sortBatches,
  toggleStatusFilter,
  writeColumnPreferences,
  type CteBatchColumnKey,
  type CteBatchColumnPreferences,
  type CteBatchSortState,
  type CteBatchTableFilters,
} from '../shared/cteBatchTable.service'

export type CteBatchFilterMode = 'advanced' | 'simple'

export type CteBatchTableController = ReturnType<typeof useCteBatchTable>

function getColumnStorage(): null | Storage {
  return typeof window === 'undefined' ? null : window.localStorage
}

export function useCteBatchTable(input: Readonly<{ batches: readonly CteBatchSummary[] }>) {
  const conditionSequence = useRef(0)
  const nextId = (): string => `cte-batch-condition-${(conditionSequence.current += 1)}`

  const [filters, setFilters] = useState<CteBatchTableFilters>(EMPTY_CTE_BATCH_FILTERS)
  const [filterMode, setFilterMode] = useState<CteBatchFilterMode>('simple')
  const [advancedFilter, setAdvancedFilter] = useState<CteBatchAdvancedFilter>(() =>
    createAdvancedFilterModel(nextId),
  )
  const [sort, setSort] = useState<CteBatchSortState>(null)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [columnPreferences, setColumnPreferences] = useState<CteBatchColumnPreferences>(() =>
    readColumnPreferences(getColumnStorage()),
  )

  const activeAdvancedCount = countActiveConditions(advancedFilter)
  const activeFilterCount =
    filterMode === 'advanced' ? activeAdvancedCount : countActiveFilters(filters)
  const matchedBatches = input.batches.filter((batch) =>
    filterMode === 'advanced'
      ? evaluateAdvancedFilter(batch, advancedFilter)
      : batchMatchesFilters(batch, filters),
  )
  const visibleBatches = sortBatches(matchedBatches, sort)
  const visibleColumns = columnPreferences.order.filter(
    (column) => columnPreferences.visibility[column],
  )
  const selectedBatches = visibleBatches.filter((batch) => selectedIds.includes(batch.id))

  function persistColumns(preferences: CteBatchColumnPreferences): void {
    setColumnPreferences(preferences)
    writeColumnPreferences({ preferences, storage: getColumnStorage() })
  }

  function updateGroup(
    groupId: string,
    update: (
      group: CteBatchAdvancedFilter['groups'][number],
    ) => CteBatchAdvancedFilter['groups'][number],
  ): void {
    setAdvancedFilter((current) => ({
      ...current,
      groups: current.groups.map((group) => (group.id === groupId ? update(group) : group)),
    }))
  }

  return {
    activeFilterCount,
    advancedFilter,
    addConditionGroup: () =>
      setAdvancedFilter((current) => ({
        ...current,
        groups: [...current.groups, createConditionGroup(nextId)],
      })),
    addGroupCondition: (groupId: string) =>
      updateGroup(groupId, (group) => ({
        ...group,
        conditions: [...group.conditions, createCondition(nextId())],
      })),
    changeCondition: (
      groupId: string,
      conditionId: string,
      changes: Readonly<Partial<CteBatchCondition>>,
    ) =>
      updateGroup(groupId, (group) => ({
        ...group,
        conditions: group.conditions.map((condition) =>
          condition.id === conditionId ? applyConditionChanges(condition, changes) : condition,
        ),
      })),
    clearFilterField: (field: CteBatchPillField) =>
      setFilters((current) => clearCteBatchFilterField({ field, filters: current })),
    clearFilters: () => {
      setFilters(EMPTY_CTE_BATCH_FILTERS)
      setAdvancedFilter(createAdvancedFilterModel(nextId))
      setSort(null)
      setSelectedIds([])
    },
    clearSelection: () => setSelectedIds([]),
    columnPreferences,
    filterMode,
    filters,
    hideColumn: (column: CteBatchColumnKey, isVisible: boolean) =>
      persistColumns({
        ...columnPreferences,
        visibility: { ...columnPreferences.visibility, [column]: isVisible },
      }),
    moveColumn: (column: CteBatchColumnKey, direction: 'down' | 'up') =>
      persistColumns({
        ...columnPreferences,
        order: reorderColumns(columnPreferences.order, column, direction),
      }),
    removeConditionGroup: (groupId: string) =>
      setAdvancedFilter((current) => ({
        ...current,
        groups: current.groups.filter((group) => group.id !== groupId),
      })),
    removeGroupCondition: (groupId: string, conditionId: string) =>
      updateGroup(groupId, (group) => ({
        ...group,
        conditions: group.conditions.filter((condition) => condition.id !== conditionId),
      })),
    selectedBatches,
    selectedIds,
    setFilterMode,
    setGroupConnector: (groupId: string, connector: 'and' | 'or') =>
      updateGroup(groupId, (group) => ({ ...group, connector })),
    setModelConnector: (connector: 'and' | 'or') =>
      setAdvancedFilter((current) => ({ ...current, connector })),
    setTextFilter: (field: keyof Omit<CteBatchTableFilters, 'statuses'>, value: string) =>
      setFilters((current) => ({ ...current, [field]: value })),
    sort,
    toggleAllSelection: () =>
      setSelectedIds((current) =>
        current.length === visibleBatches.length ? [] : visibleBatches.map((batch) => batch.id),
      ),
    toggleSelection: (batchId: string) =>
      setSelectedIds((current) =>
        current.includes(batchId) ? current.filter((id) => id !== batchId) : [...current, batchId],
      ),
    toggleSort: (column: CteBatchColumnKey) => setSort((current) => nextSortState(current, column)),
    toggleStatus: (status: CteBatchStatus) =>
      setFilters((current) => ({
        ...current,
        statuses: toggleStatusFilter(current.statuses, status),
      })),
    totalCount: input.batches.length,
    visibleBatches,
    visibleColumns,
  }
}
