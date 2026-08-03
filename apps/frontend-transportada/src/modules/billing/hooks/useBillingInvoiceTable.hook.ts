/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import {
  createBillingDocumentDownloadController,
  resolveBillingDocumentMessageKey,
} from '../shared/billingDocumentDownload.service'
import {
  clearBillingInvoiceFilterField,
  type BillingInvoicePillField,
} from '../shared/billingInvoiceFilterPills.service'
import { navigateToBillingInvoice } from '../shared/billingInvoiceRoute.service'
import {
  BILLING_INVOICE_DATE_RANGES,
  BILLING_INVOICE_FIRST_PAGE,
  canGoToPreviousBillingInvoicePage,
  countActiveBillingInvoiceFilters,
  EMPTY_BILLING_INVOICE_FILTERS,
  nextBillingInvoicePage,
  nextBillingInvoiceSortState,
  previousBillingInvoicePage,
  readBillingInvoiceColumnPreferences,
  reorderBillingInvoiceColumns,
  serializeBillingInvoiceQuery,
  sortBillingInvoices,
  toggleAllBillingInvoiceSelection,
  toggleBillingInvoiceSelection,
  writeBillingInvoiceColumnPreferences,
  type BillingInvoiceColumnKey,
  type BillingInvoiceColumnPreferences,
  type BillingInvoiceDateRangeField,
  type BillingInvoicePageState,
  type BillingInvoiceSortState,
  type BillingInvoiceTableFilters,
} from '../shared/billingInvoiceTable.service'
import { BILLING_INVOICE_LIST_QUERY_KEY } from '../shared/billingQueryKey.constant'
import { getBillingClient } from './useBillingWorkspace.hook'

const BILLING_READ_PERMISSION = 'billing.read'
const BILLING_CREATE_PERMISSION = 'billing.create'
const BILLING_INVOICE_PAGE_SIZE = 25

export { BILLING_INVOICE_LIST_QUERY_KEY }

type BillingInvoiceTextFilterField = keyof BillingInvoiceTableFilters

type UseBillingInvoiceTableInput = Readonly<{
  companyId?: string
  permissions: readonly string[]
}>

export type BillingInvoiceTableController = ReturnType<typeof useBillingInvoiceTable>

function getColumnStorage(): null | Storage {
  return typeof window === 'undefined' ? null : window.localStorage
}

const documentDownload = createBillingDocumentDownloadController({
  openUrl: (url) => {
    if (typeof window === 'undefined') return
    window.open(url, '_blank', 'noopener,noreferrer')
  },
})

export function useBillingInvoiceTable(input: UseBillingInvoiceTableInput) {
  const [filters, setFilters] = useState<BillingInvoiceTableFilters>(EMPTY_BILLING_INVOICE_FILTERS)
  const [sort, setSort] = useState<BillingInvoiceSortState>(null)
  const [page, setPage] = useState<BillingInvoicePageState>(BILLING_INVOICE_FIRST_PAGE)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [columnPreferences, setColumnPreferences] = useState<BillingInvoiceColumnPreferences>(() =>
    readBillingInvoiceColumnPreferences(getColumnStorage()),
  )

  const canReadInvoices =
    input.companyId !== undefined && input.permissions.includes(BILLING_READ_PERMISSION)
  const client = getBillingClient()
  const invoicesQuery = useQuery({
    enabled: canReadInvoices,
    queryFn: () =>
      client.listInvoices({ cursor: page.cursor, filters, limit: BILLING_INVOICE_PAGE_SIZE }),
    queryKey: [
      BILLING_INVOICE_LIST_QUERY_KEY,
      input.companyId,
      serializeBillingInvoiceQuery({
        cursor: page.cursor,
        filters,
        limit: BILLING_INVOICE_PAGE_SIZE,
      }),
    ],
  })

  const canGenerateDocuments =
    input.companyId !== undefined && input.permissions.includes(BILLING_CREATE_PERMISSION)
  const documentMutation = useMutation({
    mutationFn: (invoiceId: string) => client.generateDocument({ invoiceId }),
    onSuccess: (document) => documentDownload.openDocument(document),
  })

  const items = invoicesQuery.data?.items ?? []
  const nextCursor = invoicesQuery.data?.nextCursor ?? null
  const visibleItems = sortBillingInvoices(items, sort)
  const visibleColumns = columnPreferences.order.filter(
    (column) => columnPreferences.visibility[column],
  )

  function restartPagination(): void {
    setPage(BILLING_INVOICE_FIRST_PAGE)
  }

  function persistColumns(preferences: BillingInvoiceColumnPreferences): void {
    setColumnPreferences(preferences)
    writeBillingInvoiceColumnPreferences({ preferences, storage: getColumnStorage() })
  }

  return {
    activeFilterCount: countActiveBillingInvoiceFilters(filters),
    canGenerateDocuments,
    canGoToPreviousPage: canGoToPreviousBillingInvoicePage(page),
    canReadInvoices,
    clearFilterField: (field: BillingInvoicePillField) => {
      setFilters((current) => clearBillingInvoiceFilterField({ field, filters: current }))
      restartPagination()
    },
    clearFilters: () => {
      setFilters(EMPTY_BILLING_INVOICE_FILTERS)
      setSort(null)
      setSelectedIds([])
      restartPagination()
    },
    clearSelection: () => setSelectedIds([]),
    columnPreferences,
    documentMessageKey: documentMutation.isError
      ? resolveBillingDocumentMessageKey(documentMutation.error)
      : null,
    filters,
    generateDocument: (invoiceId: string) => {
      if (!canGenerateDocuments || documentMutation.isPending) return
      documentMutation.mutate(invoiceId)
    },
    goToNextPage: () => setPage((current) => nextBillingInvoicePage(current, nextCursor)),
    goToPreviousPage: () => setPage((current) => previousBillingInvoicePage(current)),
    hasNextPage: nextCursor !== null,
    hideColumn: (column: BillingInvoiceColumnKey, isVisible: boolean) =>
      persistColumns({
        ...columnPreferences,
        visibility: { ...columnPreferences.visibility, [column]: isVisible },
      }),
    invoicesQuery,
    moveColumn: (column: BillingInvoiceColumnKey, direction: 'down' | 'up') =>
      persistColumns({
        ...columnPreferences,
        order: reorderBillingInvoiceColumns(columnPreferences.order, column, direction),
      }),
    openInvoice: (invoiceId: string) =>
      navigateToBillingInvoice({ invoiceId, navigator: createBrowserWorkspaceNavigator() }),
    pageSize: BILLING_INVOICE_PAGE_SIZE,
    pendingDocumentInvoiceId: documentMutation.isPending
      ? (documentMutation.variables ?? null)
      : null,
    selectedIds,
    /** Os dois extremos da faixa numa atualização só: meia faixa nunca chega a virar consulta. */
    setDateRange: (field: BillingInvoiceDateRangeField, from: string, to: string) => {
      const range = BILLING_INVOICE_DATE_RANGES[field]
      setFilters((current) => ({ ...current, [range.from]: from, [range.to]: to }))
      restartPagination()
    },
    setTextFilter: (field: BillingInvoiceTextFilterField, value: string) => {
      setFilters((current) => ({ ...current, [field]: value }))
      restartPagination()
    },
    sort,
    toggleAllSelection: () =>
      setSelectedIds((current) =>
        toggleAllBillingInvoiceSelection({
          pageIds: visibleItems.map((item) => item.id),
          selectedIds: current,
        }),
      ),
    toggleSelection: (invoiceId: string) =>
      setSelectedIds((current) => toggleBillingInvoiceSelection(current, invoiceId)),
    toggleSort: (column: BillingInvoiceColumnKey) =>
      setSort((current) => nextBillingInvoiceSortState(current, column)),
    visibleColumns,
    visibleItems,
  }
}
