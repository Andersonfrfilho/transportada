/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import {
  createCteIssuanceController,
  getCteIssuanceClient,
} from '@/modules/cte-issuance/hooks/useCteIssuanceStatus.hook'

import {
  COMPANY_CTE_ITEMS_QUERY_KEY,
  useCompanyCteItemsQuery,
} from '../queries/cteBatchItems.query'
import type { CteBatchStatus, CteBatchSummary } from '../shared/cteBatchClient.service'
import { canBillSelection, collectBillableCtes } from '../shared/cteBatchBilling.service'
import type { BillableCte } from '../shared/cteBatchBilling.service'
import {
  canTransmitSelection,
  groupSelectionByBatch,
  selectTransmittableGroups,
} from '../shared/cteBatchItemActions.service'
import type { CteItemBatchGroup } from '../shared/cteBatchItemActions.service'
import { submitCteBatches } from '../shared/cteBatchSubmissionQueue.service'
import { CTE_BATCHES_QUERY_KEY } from './useCteBatchWorkspace.hook'
import {
  accumulateCteItemAmounts,
  canGoToPreviousCteItemPage,
  countActiveCteItemFilters,
  CTE_ITEM_FIRST_PAGE,
  EMPTY_CTE_ITEM_FILTERS,
  nextCteItemPage,
  nextCteItemSortState,
  previousCteItemPage,
  readCteItemColumnPreferences,
  reorderCteItemColumns,
  sortCteItems,
  summarizeCteItemSelection,
  toggleCteItemBillingStatus,
  toggleCteItemStatus,
  writeCteItemColumnPreferences,
  type CteItemAmounts,
  type CteItemBillingStatus,
  type CteItemColumnKey,
  type CteItemColumnPreferences,
  type CteItemPageState,
  type CteItemSortState,
  type CteItemStatus,
  type CteItemTableFilters,
} from '../shared/cteBatchItemTable.service'
import {
  clearCteItemFilterField,
  type CteItemPillField,
} from '../shared/cteItemFilterPills.service'
import { useCteDacteDownload } from './useCteDacteDownload.hook'
import { useCteItemExport } from './useCteItemExport.hook'

const CTE_SUBMIT_PERMISSION = 'cte.submit'
const CTE_ITEM_PAGE_SIZE = 25

export type CteItemTableController = ReturnType<typeof useCteItemTable>

export type CteItemTextFilterField = keyof Omit<CteItemTableFilters, 'statuses'>

type UseCteItemTableInput = Readonly<{
  batches: readonly CteBatchSummary[]
  companyId?: string
  permissions: readonly string[]
}>

function getColumnStorage(): null | Storage {
  return typeof window === 'undefined' ? null : window.localStorage
}

export function useCteItemTable(input: UseCteItemTableInput) {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<CteItemTableFilters>(EMPTY_CTE_ITEM_FILTERS)
  const [sort, setSort] = useState<CteItemSortState>(null)
  const [page, setPage] = useState<CteItemPageState>(CTE_ITEM_FIRST_PAGE)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  /** A seleção congela ao abrir o faturamento: paginar atrás do modal não muda o que será faturado. */
  const [billingRequest, setBillingRequest] = useState<null | readonly BillableCte[]>(null)
  const [columnPreferences, setColumnPreferences] = useState<CteItemColumnPreferences>(() =>
    readCteItemColumnPreferences(getColumnStorage()),
  )
  const knownAmounts = useRef<ReadonlyMap<string, CteItemAmounts>>(new Map())

  const canReadItems =
    input.companyId !== undefined && input.permissions.includes(CTE_SUBMIT_PERMISSION)
  const itemsQuery = useCompanyCteItemsQuery({
    ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
    cursor: page.cursor,
    enabled: canReadItems,
    filters,
    limit: CTE_ITEM_PAGE_SIZE,
  })

  const items = itemsQuery.data?.items ?? []
  const nextCursor = itemsQuery.data?.nextCursor ?? null
  knownAmounts.current = accumulateCteItemAmounts({ items, known: knownAmounts.current })

  const visibleItems = sortCteItems(items, sort)
  const visibleColumns = columnPreferences.order.filter(
    (column) => columnPreferences.visibility[column],
  )
  const selection = summarizeCteItemSelection({ amounts: knownAmounts.current, selectedIds })

  const batchStatuses = new Map<string, CteBatchStatus>(
    input.batches.map((batch) => [batch.id, batch.status]),
  )
  const knownSelectedItems = Array.from(knownAmounts.current, ([id, amounts]) => ({
    batchId: amounts.batchId,
    id,
  }))
  const selectedGroups = groupSelectionByBatch({ items: knownSelectedItems, selectedIds })
  const transmitGroups = selectTransmittableGroups({ batchStatuses, groups: selectedGroups })
  const canTransmit = canTransmitSelection({
    batchStatuses,
    groups: transmitGroups,
    permissions: input.permissions,
  })
  const billingSelection = collectBillableCtes({ amounts: knownAmounts.current, selectedIds })
  const canBill = canBillSelection({
    billable: billingSelection.billable,
    permissions: input.permissions,
  })

  const exportControls = useCteItemExport({
    filters,
    permissions: input.permissions,
    selectedCount: selection.count,
    selectedIds,
  })
  const dacteControls = useCteDacteDownload({ permissions: input.permissions })

  const transmitMutation = useMutation({
    /** A recusa de um lote não pode esconder os outros nem sumir da tela: cada um vira um resultado. */
    mutationFn: (groups: readonly CteItemBatchGroup[]) => {
      const controller = createCteIssuanceController({
        client: getCteIssuanceClient(),
        permissions: input.permissions,
      })
      const batchNames = new Map(input.batches.map((batch) => [batch.id, batch.name]))

      return submitCteBatches({
        batches: groups.map((group) => ({
          id: group.batchId,
          name: batchNames.get(group.batchId) ?? group.batchId,
        })),
        submitBatch: (batchId) =>
          controller.issueBatch({ batchId, idempotencyKey: crypto.randomUUID() }),
      })
    },
    /** Transmitir tira o lote do rascunho: mesmo com recusa parcial a listagem precisa reler. */
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [COMPANY_CTE_ITEMS_QUERY_KEY] }),
        queryClient.invalidateQueries({ queryKey: [CTE_BATCHES_QUERY_KEY] }),
      ])
    },
  })
  const transmitErrorCode = transmitMutation.data?.find(
    (outcome) => outcome.errorCode !== undefined,
  )?.errorCode

  /** Trocar filtro com cursor na mão devolveria a página de outro recorte — a pilha reinicia. */
  function restartPagination(): void {
    setPage(CTE_ITEM_FIRST_PAGE)
  }

  function persistColumns(preferences: CteItemColumnPreferences): void {
    setColumnPreferences(preferences)
    writeCteItemColumnPreferences({ preferences, storage: getColumnStorage() })
  }

  return {
    ...dacteControls,
    ...exportControls,
    activeFilterCount: countActiveCteItemFilters(filters),
    billingRequest,
    billingSelection,
    canBill,
    canReadItems,
    canGoToPreviousPage: canGoToPreviousCteItemPage(page),
    canTransmit,
    clearFilterField: (field: CteItemPillField) => {
      setFilters((current) => clearCteItemFilterField({ field, filters: current }))
      restartPagination()
    },
    clearFilters: () => {
      setFilters(EMPTY_CTE_ITEM_FILTERS)
      setSort(null)
      setSelectedIds([])
      restartPagination()
    },
    clearSelection: () => setSelectedIds([]),
    closeBilling: () => setBillingRequest(null),
    columnPreferences,
    filters,
    goToNextPage: () => setPage((current) => nextCteItemPage(current, nextCursor)),
    goToPreviousPage: () => setPage((current) => previousCteItemPage(current)),
    hasNextPage: nextCursor !== null,
    hideColumn: (column: CteItemColumnKey, isVisible: boolean) =>
      persistColumns({
        ...columnPreferences,
        visibility: { ...columnPreferences.visibility, [column]: isVisible },
      }),
    isTransmitting: transmitMutation.isPending,
    itemsQuery,
    moveColumn: (column: CteItemColumnKey, direction: 'down' | 'up') =>
      persistColumns({
        ...columnPreferences,
        order: reorderCteItemColumns(columnPreferences.order, column, direction),
      }),
    pageSize: CTE_ITEM_PAGE_SIZE,
    selectedIds,
    selection,
    setTextFilter: (field: CteItemTextFilterField, value: string) => {
      setFilters((current) => ({ ...current, [field]: value }))
      restartPagination()
    },
    sort,
    startBilling: () => setBillingRequest(billingSelection.billable),
    toggleAllSelection: () =>
      setSelectedIds((current) => {
        const pageIds = visibleItems.map((item) => item.id)
        const isPageSelected = pageIds.every((id) => current.includes(id))
        return isPageSelected
          ? current.filter((id) => !pageIds.includes(id))
          : [...current, ...pageIds.filter((id) => !current.includes(id))]
      }),
    toggleBillingStatus: (status: CteItemBillingStatus) => {
      setFilters((current) => toggleCteItemBillingStatus(current, status))
      restartPagination()
    },
    toggleSelection: (itemId: string) =>
      setSelectedIds((current) =>
        current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
      ),
    toggleSort: (column: CteItemColumnKey) =>
      setSort((current) => nextCteItemSortState(current, column)),
    toggleStatus: (status: CteItemStatus) => {
      setFilters((current) => toggleCteItemStatus(current, status))
      restartPagination()
    },
    transmitErrorCode,
    transmitGroups,
    transmitSelection: (groups: readonly CteItemBatchGroup[]) => transmitMutation.mutate(groups),
    visibleColumns,
    visibleItems,
  }
}
