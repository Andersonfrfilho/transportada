/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'

import type { MdfeManifestStatus, MdfeManifestSummary } from '../shared/mdfeManifest.types'
import {
  applyConditionChanges,
  countActiveConditions,
  createAdvancedFilterModel,
  createCondition,
  createConditionGroup,
  evaluateAdvancedFilter,
  type MdfeManifestAdvancedFilter,
  type MdfeManifestCondition,
} from '../shared/mdfeManifestAdvancedFilter.service'
import {
  clearMdfeManifestFilterField,
  type MdfeManifestPillField,
} from '../shared/mdfeManifestFilterPills.service'
import {
  EMPTY_MDFE_MANIFEST_FILTERS,
  countActiveFilters,
  manifestMatchesFilters,
  nextSortState,
  readColumnPreferences,
  reorderColumns,
  sortManifests,
  toggleStatusFilter,
  writeColumnPreferences,
  type MdfeManifestColumnKey,
  type MdfeManifestColumnPreferences,
  type MdfeManifestSortState,
  type MdfeManifestTableFilters,
} from '../shared/mdfeManifestTable.service'

export type MdfeManifestFilterMode = 'advanced' | 'simple'

export type MdfeManifestTableController = ReturnType<typeof useMdfeManifestTable>

function getColumnStorage(): null | Storage {
  return typeof window === 'undefined' ? null : window.localStorage
}

export function useMdfeManifestTable(
  input: Readonly<{ manifests: readonly MdfeManifestSummary[] }>,
) {
  const conditionSequence = useRef(0)
  const nextId = (): string => `mdfe-manifest-condition-${(conditionSequence.current += 1)}`

  const [filters, setFilters] = useState<MdfeManifestTableFilters>(EMPTY_MDFE_MANIFEST_FILTERS)
  const [filterMode, setFilterMode] = useState<MdfeManifestFilterMode>('simple')
  const [advancedFilter, setAdvancedFilter] = useState<MdfeManifestAdvancedFilter>(() =>
    createAdvancedFilterModel(nextId),
  )
  const [sort, setSort] = useState<MdfeManifestSortState>(null)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [columnPreferences, setColumnPreferences] = useState<MdfeManifestColumnPreferences>(() =>
    readColumnPreferences(getColumnStorage()),
  )

  const activeFilterCount =
    filterMode === 'advanced' ? countActiveConditions(advancedFilter) : countActiveFilters(filters)
  const matchedManifests = input.manifests.filter((manifest) =>
    filterMode === 'advanced'
      ? evaluateAdvancedFilter(manifest, advancedFilter)
      : manifestMatchesFilters(manifest, filters),
  )
  const visibleManifests = sortManifests(matchedManifests, sort)
  const visibleColumns = columnPreferences.order.filter(
    (column) => columnPreferences.visibility[column],
  )
  const selectedManifests = visibleManifests.filter((manifest) => selectedIds.includes(manifest.id))

  function persistColumns(preferences: MdfeManifestColumnPreferences): void {
    setColumnPreferences(preferences)
    writeColumnPreferences({ preferences, storage: getColumnStorage() })
  }

  function updateGroup(
    groupId: string,
    update: (
      group: MdfeManifestAdvancedFilter['groups'][number],
    ) => MdfeManifestAdvancedFilter['groups'][number],
  ): void {
    setAdvancedFilter((current) => ({
      ...current,
      groups: current.groups.map((group) => (group.id === groupId ? update(group) : group)),
    }))
  }

  return {
    activeFilterCount,
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
    advancedFilter,
    changeCondition: (
      groupId: string,
      conditionId: string,
      changes: Readonly<Partial<MdfeManifestCondition>>,
    ) =>
      updateGroup(groupId, (group) => ({
        ...group,
        conditions: group.conditions.map((condition) =>
          condition.id === conditionId ? applyConditionChanges(condition, changes) : condition,
        ),
      })),
    clearFilterField: (field: MdfeManifestPillField) =>
      setFilters((current) => clearMdfeManifestFilterField({ field, filters: current })),
    clearFilters: () => {
      setFilters(EMPTY_MDFE_MANIFEST_FILTERS)
      setAdvancedFilter(createAdvancedFilterModel(nextId))
      setSort(null)
      setSelectedIds([])
    },
    clearSelection: () => setSelectedIds([]),
    columnPreferences,
    filterMode,
    filters,
    hideColumn: (column: MdfeManifestColumnKey, isVisible: boolean) =>
      persistColumns({
        ...columnPreferences,
        visibility: { ...columnPreferences.visibility, [column]: isVisible },
      }),
    moveColumn: (column: MdfeManifestColumnKey, direction: 'down' | 'up') =>
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
    selectedIds,
    selectedManifests,
    setFilterMode,
    setGroupConnector: (groupId: string, connector: 'and' | 'or') =>
      updateGroup(groupId, (group) => ({ ...group, connector })),
    setModelConnector: (connector: 'and' | 'or') =>
      setAdvancedFilter((current) => ({ ...current, connector })),
    setTextFilter: (
      field: keyof Omit<MdfeManifestTableFilters, 'destinationStates' | 'statuses'>,
      value: string,
    ) => setFilters((current) => ({ ...current, [field]: value })),
    sort,
    toggleAllSelection: () =>
      setSelectedIds((current) =>
        current.length === visibleManifests.length
          ? []
          : visibleManifests.map((manifest) => manifest.id),
      ),
    toggleSelection: (manifestId: string) =>
      setSelectedIds((current) =>
        current.includes(manifestId)
          ? current.filter((id) => id !== manifestId)
          : [...current, manifestId],
      ),
    toggleSort: (column: MdfeManifestColumnKey) =>
      setSort((current) => nextSortState(current, column)),
    toggleStatus: (status: MdfeManifestStatus) =>
      setFilters((current) => ({
        ...current,
        statuses: toggleStatusFilter(current.statuses, status),
      })),
    totalCount: input.manifests.length,
    visibleColumns,
    visibleManifests,
  }
}
