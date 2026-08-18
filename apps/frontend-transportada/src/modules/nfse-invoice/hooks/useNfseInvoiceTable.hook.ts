/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import {
  canGoToPreviousCursorPage,
  FIRST_CURSOR_PAGE,
  nextCursorPage,
  previousCursorPage,
  type CursorPageState,
} from '@/modules/shared/cursorPagination.service'

import {
  NFSE_INVOICE_PAGE_SIZES,
  NFSE_INVOICES_QUERY_KEY,
  type NfseInvoicePageSize,
} from '../shared/nfseInvoice.constant'
import type { NfseInvoice, NfseInvoiceStatus } from '../shared/nfseInvoice.types'
import {
  countActiveNfseConditions,
  evaluateNfseAdvancedFilter,
} from '../shared/nfseInvoiceAdvancedFilter.service'
import {
  clearNfseInvoiceFilterField,
  type NfseInvoicePillField,
} from '../shared/nfseInvoiceFilterPills.service'
import {
  countActiveNfseInvoiceFilters,
  EMPTY_NFSE_INVOICE_FILTERS,
  nextNfseInvoiceSortState,
  readNfseInvoiceColumnPreferences,
  reorderNfseInvoiceColumns,
  serializeNfseInvoiceQuery,
  sortNfseInvoices,
  sumNfseInvoiceServiceAmount,
  toggleNfseInvoiceStatus,
  writeNfseInvoiceColumnPreferences,
  type NfseInvoiceColumnKey,
  type NfseInvoiceColumnPreferences,
  type NfseInvoiceSortState,
  type NfseInvoiceTableFilters,
} from '../shared/nfseInvoiceTable.service'
import { useNfseAdvancedFilterModel } from './useNfseAdvancedFilter.hook'
import { useNfseInvoiceBulkCancel } from './useNfseInvoiceBulkCancel.hook'
import { useNfseInvoiceBulkDiscard } from './useNfseInvoiceBulkDiscard.hook'
import { useNfseInvoiceBulkExport } from './useNfseInvoiceBulkExport.hook'
import { useNfseInvoiceBulkReissue } from './useNfseInvoiceBulkReissue.hook'
import { useNfseInvoiceRowActions } from './useNfseInvoiceRowActions.hook'
import { createNfseInvoiceController, getNfseInvoiceClient } from './useNfseInvoices.hook'

export type NfseInvoiceTableController = ReturnType<typeof useNfseInvoiceTable>

export type NfseInvoiceTextFilterField = keyof Omit<NfseInvoiceTableFilters, 'statuses'>

export type NfseInvoiceFilterMode = 'advanced' | 'simple'

type UseNfseInvoiceTableInput = Readonly<{
  companyId?: string
  /** Nota a abrir de saída, vinda do link da tabela de NF-e. */
  openInvoiceId?: null | string
  permissions: readonly string[]
}>

function getColumnStorage(): null | Storage {
  return typeof window === 'undefined' ? null : window.localStorage
}

/** A soma da seleção atravessa páginas: o que saiu da tela continua no mapa acumulado. */
function rememberInvoices(
  known: ReadonlyMap<string, NfseInvoice>,
  invoices: readonly NfseInvoice[],
): ReadonlyMap<string, NfseInvoice> {
  const remembered = new Map(known)
  for (const invoice of invoices) remembered.set(invoice.id, invoice)
  return remembered
}

export function useNfseInvoiceTable(input: UseNfseInvoiceTableInput) {
  const [filters, setFilters] = useState<NfseInvoiceTableFilters>(EMPTY_NFSE_INVOICE_FILTERS)
  const [sort, setSort] = useState<NfseInvoiceSortState>(null)
  const [page, setPage] = useState<CursorPageState>(FIRST_CURSOR_PAGE)
  const [pageSize, setPageSize] = useState<NfseInvoicePageSize>(NFSE_INVOICE_PAGE_SIZES[0])
  const [filterMode, setFilterMode] = useState<NfseInvoiceFilterMode>('simple')
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [columnPreferences, setColumnPreferences] = useState<NfseInvoiceColumnPreferences>(() =>
    readNfseInvoiceColumnPreferences(getColumnStorage()),
  )
  const knownInvoices = useRef<ReadonlyMap<string, NfseInvoice>>(new Map())

  /** Trocar filtro com cursor na mão devolveria a página de outro recorte — a pilha reinicia. */
  function restartPagination(): void {
    setPage(FIRST_CURSOR_PAGE)
  }

  const advancedFilter = useNfseAdvancedFilterModel(restartPagination)
  const rowActions = useNfseInvoiceRowActions({
    ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
    openInvoiceId: input.openInvoiceId ?? null,
    permissions: input.permissions,
  })
  const controller = createNfseInvoiceController({
    client: getNfseInvoiceClient(),
    permissions: input.companyId === undefined ? [] : input.permissions,
  })
  const query = serializeNfseInvoiceQuery({ cursor: page.cursor, filters, limit: pageSize })
  const invoicesQuery = useQuery({
    enabled: controller.canReadInvoices,
    queryFn: () => controller.listInvoices(query),
    queryKey: [NFSE_INVOICES_QUERY_KEY, input.companyId, JSON.stringify(query)] as const,
  })

  const invoices = invoicesQuery.data?.items ?? []
  const nextCursor = invoicesQuery.data?.nextCursor ?? null
  knownInvoices.current = rememberInvoices(knownInvoices.current, invoices)

  /** Grupo aninhado a API não conhece: o construtor avançado recorta a página já carregada. */
  const matchedInvoices =
    filterMode === 'advanced'
      ? invoices.filter((invoice) => evaluateNfseAdvancedFilter(invoice, advancedFilter.model))
      : invoices
  const visibleInvoices = sortNfseInvoices(matchedInvoices, sort)
  const visibleColumns = columnPreferences.order.filter(
    (column) => columnPreferences.visibility[column],
  )
  const selectedInvoices = selectedIds.flatMap((id) => {
    const invoice = knownInvoices.current.get(id)
    return invoice === undefined ? [] : [invoice]
  })

  const bulkCancel = useNfseInvoiceBulkCancel({
    ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
    invoices: selectedInvoices,
    permissions: input.permissions,
  })
  const bulkExport = useNfseInvoiceBulkExport({
    ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
    invoices: selectedInvoices,
    permissions: input.permissions,
  })
  const bulkReissue = useNfseInvoiceBulkReissue({
    ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
    invoices: selectedInvoices,
    permissions: input.permissions,
  })
  const bulkDiscard = useNfseInvoiceBulkDiscard({
    ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
    invoices: selectedInvoices,
    permissions: input.permissions,
  })

  function persistColumns(preferences: NfseInvoiceColumnPreferences): void {
    setColumnPreferences(preferences)
    writeNfseInvoiceColumnPreferences({ preferences, storage: getColumnStorage() })
  }

  return {
    activeFilterCount:
      filterMode === 'advanced'
        ? countActiveNfseConditions(advancedFilter.model)
        : countActiveNfseInvoiceFilters(filters),
    advancedFilter,
    bulkCancel,
    bulkDiscard,
    bulkExport,
    bulkReissue,
    canGoToPreviousPage: canGoToPreviousCursorPage(page),
    canReadInvoices: controller.canReadInvoices,
    clearFilterField: (field: NfseInvoicePillField) => {
      setFilters((current) => clearNfseInvoiceFilterField({ field, filters: current }))
      restartPagination()
    },
    clearFilters: () => {
      setFilters(EMPTY_NFSE_INVOICE_FILTERS)
      setSort(null)
      setSelectedIds([])
      restartPagination()
    },
    clearSelection: () => setSelectedIds([]),
    columnPreferences,
    filterMode,
    filters,
    goToNextPage: () => setPage((current) => nextCursorPage(current, nextCursor)),
    goToPreviousPage: () => setPage((current) => previousCursorPage(current)),
    hasNextPage: nextCursor !== null,
    hideColumn: (column: NfseInvoiceColumnKey, isVisible: boolean) =>
      persistColumns({
        ...columnPreferences,
        visibility: { ...columnPreferences.visibility, [column]: isVisible },
      }),
    invoicesQuery,
    loadedCount: invoices.length,
    moveColumn: (column: NfseInvoiceColumnKey, direction: 'down' | 'up') =>
      persistColumns({
        ...columnPreferences,
        order: reorderNfseInvoiceColumns(columnPreferences.order, column, direction),
      }),
    pageSize,
    rowActions,
    selectedIds,
    selectedInvoices,
    selectionCount: selectedInvoices.length,
    selectionTotal: sumNfseInvoiceServiceAmount(selectedInvoices),
    setFilterMode: (mode: NfseInvoiceFilterMode) => {
      setFilterMode(mode)
      restartPagination()
    },
    /** Trocar o tamanho move a borda da página: o cursor guardado apontaria para outro recorte. */
    setPageSize: (size: NfseInvoicePageSize) => {
      setPageSize(size)
      restartPagination()
    },
    setTextFilter: (field: NfseInvoiceTextFilterField, value: string) => {
      setFilters((current) => ({ ...current, [field]: value }))
      restartPagination()
    },
    sort,
    toggleAllSelection: () =>
      setSelectedIds((current) => {
        const pageIds = visibleInvoices.map((invoice) => invoice.id)
        const isPageSelected = pageIds.every((id) => current.includes(id))
        return isPageSelected
          ? current.filter((id) => !pageIds.includes(id))
          : [...current, ...pageIds.filter((id) => !current.includes(id))]
      }),
    toggleSelection: (invoiceId: string) =>
      setSelectedIds((current) =>
        current.includes(invoiceId)
          ? current.filter((id) => id !== invoiceId)
          : [...current, invoiceId],
      ),
    toggleSort: (column: NfseInvoiceColumnKey) =>
      setSort((current) => nextNfseInvoiceSortState(current, column)),
    toggleStatus: (status: NfseInvoiceStatus) => {
      setFilters((current) => ({
        ...current,
        statuses: toggleNfseInvoiceStatus(current.statuses, status),
      }))
      restartPagination()
    },
    visibleColumns,
    visibleInvoices,
  }
}
