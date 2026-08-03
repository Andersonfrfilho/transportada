/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { SYNTHETIC_CURSOR, loadFutureModule } from './billing.fixture'

const INVOICE_TABLE_MODULE = '../../src/modules/billing/shared/billingInvoiceTable.service'

/** Espelha a allowlist de `parseBillingInvoiceList` na API — chave fora dela devolve 400. */
const ALLOWED_QUERY_KEYS: readonly string[] = [
  'cursor',
  'customerDocument',
  'dueFrom',
  'dueTo',
  'invoiceNumber',
  'issuedFrom',
  'issuedTo',
  'limit',
  'status',
]

const ROW_A = {
  createdAt: '2026-07-20T10:00:00.000Z',
  customer: { document: '12345678000199', name: 'Alfa Transportes' },
  dueDate: '2026-08-01',
  id: '00000000-0000-4000-8000-000000000801',
  invoiceNumber: 12,
  issuedAt: '2026-07-20T10:00:00.000Z',
  status: 'issued',
  totalAmount: '43.13',
  updatedAt: '2026-07-20T10:00:00.000Z',
} as const

const ROW_B = {
  createdAt: '2026-07-21T10:00:00.000Z',
  customer: { document: '98765432000188', name: 'Beta Cargas' },
  dueDate: '2026-07-25',
  id: '00000000-0000-4000-8000-000000000802',
  invoiceNumber: 5,
  issuedAt: '2026-07-21T10:00:00.000Z',
  status: 'cancelled',
  totalAmount: '9.00',
  updatedAt: '2026-07-21T10:00:00.000Z',
} as const

const ROW_C = {
  createdAt: '2026-07-19T10:00:00.000Z',
  customer: { document: '11122233000144', name: 'Gama Logistica' },
  dueDate: '2026-08-10',
  id: '00000000-0000-4000-8000-000000000803',
  invoiceNumber: 20,
  issuedAt: '2026-07-19T10:00:00.000Z',
  status: 'issued',
  totalAmount: '150.25',
  updatedAt: '2026-07-19T10:00:00.000Z',
} as const

function searchOf(query: string): URLSearchParams {
  return new URLSearchParams(query)
}

describe('billing invoice table contract', () => {
  test('exposes the columns the invoice list needs and keeps the storage key versioned', async () => {
    const { BILLING_INVOICE_COLUMNS_STORAGE_KEY, BILLING_INVOICE_COLUMN_KEYS } =
      await loadFutureModule<BillingInvoiceTableModule>(INVOICE_TABLE_MODULE)

    expect(BILLING_INVOICE_COLUMN_KEYS).toEqual([
      'invoiceNumber',
      'status',
      'customerName',
      'customerDocument',
      'issuedAt',
      'dueDate',
      'itemCount',
      'totalAmount',
      'createdAt',
    ])
    expect(new Set(BILLING_INVOICE_COLUMN_KEYS).size).toBe(BILLING_INVOICE_COLUMN_KEYS.length)
    expect(BILLING_INVOICE_COLUMNS_STORAGE_KEY).toBe('billing.invoices.columns.v1')
  })

  test('counts only the filled filter fields, matching the seven fields the API accepts', async () => {
    const { EMPTY_BILLING_INVOICE_FILTERS, countActiveBillingInvoiceFilters } =
      await loadFutureModule<BillingInvoiceTableModule>(INVOICE_TABLE_MODULE)

    expect(EMPTY_BILLING_INVOICE_FILTERS).toEqual({
      customerDocument: '',
      dueFrom: '',
      dueTo: '',
      invoiceNumber: '',
      issuedFrom: '',
      issuedTo: '',
      status: '',
    })
    expect(countActiveBillingInvoiceFilters(EMPTY_BILLING_INVOICE_FILTERS)).toBe(0)
    expect(
      countActiveBillingInvoiceFilters({ ...EMPTY_BILLING_INVOICE_FILTERS, status: 'issued' }),
    ).toBe(1)
    expect(
      countActiveBillingInvoiceFilters({
        ...EMPTY_BILLING_INVOICE_FILTERS,
        customerDocument: '12345678000199',
        dueFrom: '2026-08-01',
        dueTo: '2026-08-31',
        invoiceNumber: '17',
        issuedFrom: '2026-07-01',
        issuedTo: '2026-07-31',
        status: 'issued',
      }),
    ).toBe(7)
  })

  test('serializes only the filled fields and never a key the API rejects', async () => {
    const { EMPTY_BILLING_INVOICE_FILTERS, serializeBillingInvoiceQuery } =
      await loadFutureModule<BillingInvoiceTableModule>(INVOICE_TABLE_MODULE)

    const base = searchOf(
      serializeBillingInvoiceQuery({
        cursor: null,
        filters: EMPTY_BILLING_INVOICE_FILTERS,
        limit: 25,
      }),
    )
    expect(base.get('limit')).toBe('25')
    expect(base.has('cursor')).toBe(false)
    expect(base.has('customerDocument')).toBe(false)
    expect(base.has('dueFrom')).toBe(false)
    expect(base.has('dueTo')).toBe(false)
    expect(base.has('invoiceNumber')).toBe(false)
    expect(base.has('issuedFrom')).toBe(false)
    expect(base.has('issuedTo')).toBe(false)
    expect(base.has('status')).toBe(false)
    expect([...base.keys()].filter((key) => !ALLOWED_QUERY_KEYS.includes(key))).toEqual([])

    const filled = {
      ...EMPTY_BILLING_INVOICE_FILTERS,
      customerDocument: '12345678000199',
      dueFrom: '2026-08-01',
      dueTo: '2026-08-31',
      invoiceNumber: '17',
      issuedFrom: '2026-07-01',
      issuedTo: '2026-07-31',
      status: 'issued',
    }
    const search = searchOf(
      serializeBillingInvoiceQuery({ cursor: SYNTHETIC_CURSOR, filters: filled, limit: 50 }),
    )
    expect(search.get('cursor')).toBe(SYNTHETIC_CURSOR)
    expect(search.get('limit')).toBe('50')
    expect(search.get('customerDocument')).toBe('12345678000199')
    expect(search.get('dueFrom')).toBe('2026-08-01')
    expect(search.get('dueTo')).toBe('2026-08-31')
    expect(search.get('invoiceNumber')).toBe('17')
    expect(search.get('issuedFrom')).toBe('2026-07-01')
    expect(search.get('issuedTo')).toBe('2026-07-31')
    expect(search.get('status')).toBe('issued')
    expect([...search.keys()].filter((key) => !ALLOWED_QUERY_KEYS.includes(key))).toEqual([])

    const onlyStatus = { ...EMPTY_BILLING_INVOICE_FILTERS, status: 'cancelled' }
    const statusSearch = searchOf(
      serializeBillingInvoiceQuery({ cursor: null, filters: onlyStatus, limit: 25 }),
    )
    expect(statusSearch.get('status')).toBe('cancelled')
    expect(statusSearch.has('customerDocument')).toBe(false)
  })

  test('sorts by header through the value, not through the string', async () => {
    const { nextBillingInvoiceSortState, sortBillingInvoices } =
      await loadFutureModule<BillingInvoiceTableModule>(INVOICE_TABLE_MODULE)
    const rows = [ROW_A, ROW_B, ROW_C] as const

    expect(nextBillingInvoiceSortState(null, 'invoiceNumber')).toEqual({
      column: 'invoiceNumber',
      direction: 'asc',
    })
    expect(
      nextBillingInvoiceSortState({ column: 'invoiceNumber', direction: 'asc' }, 'invoiceNumber'),
    ).toEqual({ column: 'invoiceNumber', direction: 'desc' })
    expect(
      nextBillingInvoiceSortState({ column: 'invoiceNumber', direction: 'desc' }, 'invoiceNumber'),
    ).toBeNull()
    expect(
      nextBillingInvoiceSortState({ column: 'invoiceNumber', direction: 'desc' }, 'status'),
    ).toEqual({ column: 'status', direction: 'asc' })

    expect(sortBillingInvoices(rows, null)).toEqual(rows)
    /** 150.25 x 43.13 x 9.00: comparação lexicográfica de string inverteria a ordem. */
    expect(
      sortBillingInvoices(rows, { column: 'totalAmount', direction: 'asc' }).map((row) => row.id),
    ).toEqual([ROW_B.id, ROW_A.id, ROW_C.id])
    /** 12 x 5 x 20: comparação lexicográfica de string também erraria aqui. */
    expect(
      sortBillingInvoices(rows, { column: 'invoiceNumber', direction: 'asc' }).map((row) => row.id),
    ).toEqual([ROW_B.id, ROW_A.id, ROW_C.id])
    expect(
      sortBillingInvoices(rows, { column: 'customerName', direction: 'asc' }).map((row) => row.id),
    ).toEqual([ROW_A.id, ROW_B.id, ROW_C.id])
    expect(
      sortBillingInvoices(rows, { column: 'createdAt', direction: 'desc' }).map((row) => row.id),
    ).toEqual([ROW_B.id, ROW_A.id, ROW_C.id])
  })

  test('toggles selection per row and for the whole page at once', async () => {
    const { toggleAllBillingInvoiceSelection, toggleBillingInvoiceSelection } =
      await loadFutureModule<BillingInvoiceTableModule>(INVOICE_TABLE_MODULE)

    expect(toggleBillingInvoiceSelection([], ROW_A.id)).toEqual([ROW_A.id])
    expect(toggleBillingInvoiceSelection([ROW_A.id], ROW_A.id)).toEqual([])
    expect(toggleBillingInvoiceSelection([ROW_A.id], ROW_B.id)).toEqual([ROW_A.id, ROW_B.id])

    const pageIds = [ROW_A.id, ROW_B.id, ROW_C.id]
    expect(toggleAllBillingInvoiceSelection({ pageIds, selectedIds: [] })).toEqual(pageIds)
    expect(toggleAllBillingInvoiceSelection({ pageIds, selectedIds: pageIds })).toEqual([])
    expect(
      toggleAllBillingInvoiceSelection({
        pageIds,
        selectedIds: [ROW_A.id, 'external-id'],
      }),
    ).toEqual([ROW_A.id, 'external-id', ROW_B.id, ROW_C.id])
  })

  test('walks the cursor forward and back without losing the first page', async () => {
    const {
      BILLING_INVOICE_FIRST_PAGE,
      canGoToPreviousBillingInvoicePage,
      nextBillingInvoicePage,
      previousBillingInvoicePage,
    } = await loadFutureModule<BillingInvoiceTableModule>(INVOICE_TABLE_MODULE)

    expect(BILLING_INVOICE_FIRST_PAGE).toEqual({ cursor: null, history: [] })
    expect(canGoToPreviousBillingInvoicePage(BILLING_INVOICE_FIRST_PAGE)).toBe(false)

    const second = nextBillingInvoicePage(BILLING_INVOICE_FIRST_PAGE, 'cursor-2')
    expect(second).toEqual({ cursor: 'cursor-2', history: [null] })
    const third = nextBillingInvoicePage(second, 'cursor-3')
    expect(third).toEqual({ cursor: 'cursor-3', history: [null, 'cursor-2'] })
    expect(canGoToPreviousBillingInvoicePage(third)).toBe(true)

    expect(previousBillingInvoicePage(third)).toEqual(second)
    expect(previousBillingInvoicePage(second)).toEqual(BILLING_INVOICE_FIRST_PAGE)
    expect(previousBillingInvoicePage(BILLING_INVOICE_FIRST_PAGE)).toEqual(
      BILLING_INVOICE_FIRST_PAGE,
    )

    /** Última página não avança: `nextCursor` nulo mantém o estado. */
    expect(nextBillingInvoicePage(third, null)).toEqual(third)
  })

  test('persists invoice column order and visibility apart from the other tables', async () => {
    const {
      BILLING_INVOICE_COLUMNS_STORAGE_KEY,
      BILLING_INVOICE_COLUMN_KEYS,
      readBillingInvoiceColumnPreferences,
      reorderBillingInvoiceColumns,
      writeBillingInvoiceColumnPreferences,
    } = await loadFutureModule<BillingInvoiceTableModule>(INVOICE_TABLE_MODULE)
    const { CTE_ITEM_COLUMNS_STORAGE_KEY } = await loadFutureModule<{
      readonly CTE_ITEM_COLUMNS_STORAGE_KEY: string
    }>('../../src/modules/cte-batch/shared/cteBatchItemTable.service')

    expect(BILLING_INVOICE_COLUMNS_STORAGE_KEY).not.toBe(CTE_ITEM_COLUMNS_STORAGE_KEY)

    const firstColumn = BILLING_INVOICE_COLUMN_KEYS[0]
    const secondColumn = BILLING_INVOICE_COLUMN_KEYS[1]
    if (firstColumn === undefined || secondColumn === undefined) {
      throw new Error('BILLING_INVOICE_CONTRACT_COLUMN_MISSING')
    }
    const movedOrder = reorderBillingInvoiceColumns(
      BILLING_INVOICE_COLUMN_KEYS,
      firstColumn,
      'down',
    )
    expect(reorderBillingInvoiceColumns(BILLING_INVOICE_COLUMN_KEYS, firstColumn, 'up')).toEqual(
      BILLING_INVOICE_COLUMN_KEYS,
    )
    expect(movedOrder[0]).toBe(secondColumn)
    expect(movedOrder[1]).toBe(firstColumn)

    const storage = new Map<string, string>()
    const memoryStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    }
    writeBillingInvoiceColumnPreferences({
      preferences: {
        order: movedOrder,
        visibility: { ...allVisible(BILLING_INVOICE_COLUMN_KEYS), [secondColumn]: false },
      },
      storage: memoryStorage,
    })
    expect(storage.has(BILLING_INVOICE_COLUMNS_STORAGE_KEY)).toBe(true)
    const restored = readBillingInvoiceColumnPreferences(memoryStorage)
    expect(restored.order[0]).toBe(secondColumn)
    expect(restored.visibility[secondColumn]).toBe(false)
    expect(restored.visibility[firstColumn]).toBe(true)

    const brokenStorage = {
      getItem: (): string => {
        throw new Error('QuotaExceededError')
      },
      setItem: (): void => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(readBillingInvoiceColumnPreferences(brokenStorage).order).toEqual(
      BILLING_INVOICE_COLUMN_KEYS,
    )
    expect(readBillingInvoiceColumnPreferences(null).order).toEqual(BILLING_INVOICE_COLUMN_KEYS)
    expect(() =>
      writeBillingInvoiceColumnPreferences({
        preferences: {
          order: BILLING_INVOICE_COLUMN_KEYS,
          visibility: allVisible(BILLING_INVOICE_COLUMN_KEYS),
        },
        storage: brokenStorage,
      }),
    ).not.toThrow()
  })
})

function allVisible(columns: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(columns.map((column) => [column, true]))
}

type BillingInvoiceRow = {
  readonly createdAt: string
  readonly customer: Readonly<{ document: string; name: string }>
  readonly dueDate: string
  readonly id: string
  readonly invoiceNumber: number
  readonly issuedAt: string
  readonly status: 'cancelled' | 'issued'
  readonly totalAmount: string
  readonly updatedAt: string
}

type BillingInvoiceFiltersState = Readonly<{
  customerDocument: string
  dueFrom: string
  dueTo: string
  invoiceNumber: string
  issuedFrom: string
  issuedTo: string
  status: string
}>

type SortState = { readonly column: string; readonly direction: 'asc' | 'desc' } | null

type PageState = Readonly<{ cursor: null | string; history: readonly (null | string)[] }>

type ColumnPreferences = {
  readonly order: readonly string[]
  readonly visibility: Readonly<Record<string, boolean>>
}

type StorageAccessor = {
  readonly getItem: (key: string) => null | string
  readonly setItem: (key: string, value: string) => void
}

type BillingInvoiceTableModule = {
  readonly BILLING_INVOICE_COLUMNS_STORAGE_KEY: string
  readonly BILLING_INVOICE_COLUMN_KEYS: readonly string[]
  readonly BILLING_INVOICE_FIRST_PAGE: PageState
  readonly EMPTY_BILLING_INVOICE_FILTERS: BillingInvoiceFiltersState
  readonly canGoToPreviousBillingInvoicePage: (state: PageState) => boolean
  readonly countActiveBillingInvoiceFilters: (filters: BillingInvoiceFiltersState) => number
  readonly nextBillingInvoicePage: (state: PageState, nextCursor: null | string) => PageState
  readonly nextBillingInvoiceSortState: (current: SortState, column: string) => SortState
  readonly previousBillingInvoicePage: (state: PageState) => PageState
  readonly readBillingInvoiceColumnPreferences: (
    storage: StorageAccessor | null,
  ) => ColumnPreferences
  readonly reorderBillingInvoiceColumns: (
    order: readonly string[],
    column: string,
    direction: 'down' | 'up',
  ) => readonly string[]
  readonly serializeBillingInvoiceQuery: (input: {
    readonly cursor: null | string
    readonly filters: BillingInvoiceFiltersState
    readonly limit: number
  }) => string
  readonly sortBillingInvoices: (
    items: readonly BillingInvoiceRow[],
    sort: SortState,
  ) => readonly BillingInvoiceRow[]
  readonly toggleAllBillingInvoiceSelection: (input: {
    readonly pageIds: readonly string[]
    readonly selectedIds: readonly string[]
  }) => readonly string[]
  readonly toggleBillingInvoiceSelection: (
    selectedIds: readonly string[],
    invoiceId: string,
  ) => readonly string[]
  readonly writeBillingInvoiceColumnPreferences: (input: {
    readonly preferences: ColumnPreferences
    readonly storage: StorageAccessor | null
  }) => void
}
