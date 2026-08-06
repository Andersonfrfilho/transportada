/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  CTE_BATCH_ID,
  CTE_DOCUMENT_ID,
  CTE_DONE_BATCH_ID,
  CTE_REFERENCE_ACCESS_KEY,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_CURSOR,
  loadFutureModule,
} from './cte-batch.fixture'

const ITEM_TABLE_MODULE = '../../src/modules/cte-batch/shared/cteBatchItemTable.service'
const ITEM_CLIENT_MODULE = '../../src/modules/cte-batch/shared/cteBatchItemClient.service'
const ITEM_VALIDATION_MODULE = '../../src/modules/cte-batch/shared/cteBatchItem.validation'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

/** Espelha a allowlist de `parseCteBatchItemList` na API — chave fora dela devolve 400. */
const ALLOWED_QUERY_KEYS: readonly string[] = [
  'batchId',
  'billingStatusIn',
  'cteNumberGte',
  'cteNumberIn',
  'cteNumberLte',
  'cursor',
  'invoiceNumberGte',
  'invoiceNumberIn',
  'invoiceNumberLte',
  'issuedFrom',
  'issuedUntil',
  'limit',
  'statusIn',
]

const AUTHORIZED_ITEM_ID = '00000000-0000-4000-8000-000000000601'
const REJECTED_ITEM_ID = '00000000-0000-4000-8000-000000000602'
const PENDING_ITEM_ID = '00000000-0000-4000-8000-000000000603'

const REFERENCE_INVOICE = {
  accessKey: CTE_REFERENCE_ACCESS_KEY,
  id: CTE_DOCUMENT_ID,
  number: '000000022',
  position: '1',
  series: '001',
  totalAmount: '958.4800',
} as const

const AUTHORIZED_ROW = {
  accessKey: '35260761156864000191570010000000011000000010',
  authorizationProtocol: '135260000000001',
  authorizedAt: '2026-07-22T21:00:00.000Z',
  baseAmount: '1058.4800',
  batchId: CTE_BATCH_ID,
  batchName: 'Lote CT-e julho',
  billingStatus: 'invoiced',
  charges: [],
  createdAt: '2026-07-22T20:10:00.000Z',
  documents: [REFERENCE_INVOICE],
  fiscalAmount: '47.63',
  fiscalDocumentId: '00000000-0000-4000-8000-000000000604',
  fiscalNumber: '000000011',
  fiscalNumberChange: {
    previousNumber: '2',
    reason: 'sefaz_duplicate_number',
    rejectionCode: '539',
  },
  fiscalSeries: '001',
  id: AUTHORIZED_ITEM_ID,
  lastErrorCode: null,
  position: '1',
  status: 'authorized',
  totalAmount: '47.6316',
} as const

const REJECTED_ROW = {
  ...AUTHORIZED_ROW,
  accessKey: null,
  authorizationProtocol: null,
  authorizedAt: null,
  baseAmount: '958.4800',
  batchId: CTE_DONE_BATCH_ID,
  batchName: 'Lote CT-e agosto',
  billingStatus: 'pending',
  createdAt: '2026-07-21T20:10:00.000Z',
  fiscalAmount: '43.13',
  fiscalDocumentId: null,
  fiscalNumber: null,
  fiscalNumberChange: null,
  fiscalSeries: null,
  id: REJECTED_ITEM_ID,
  lastErrorCode: '539',
  position: '2',
  status: 'rejected',
  totalAmount: '43.1316',
} as const

/** Frete de 9,00 contra 43,13: comparação lexicográfica de string inverteria a ordem. */
const PENDING_ROW = {
  ...REJECTED_ROW,
  baseAmount: '200.0000',
  createdAt: '2026-07-23T20:10:00.000Z',
  fiscalAmount: '9.00',
  id: PENDING_ITEM_ID,
  lastErrorCode: null,
  status: 'pending',
  totalAmount: '9.0000',
} as const

const FIRST_PAGE_ROWS = [AUTHORIZED_ROW] as const
const SECOND_PAGE_ROWS = [REJECTED_ROW] as const

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function searchOf(query: string): URLSearchParams {
  return new URLSearchParams(query)
}

describe('CT-e item table contract', () => {
  test('exposes the columns the workspace needs and keeps the storage key versioned', async () => {
    const { CTE_ITEM_COLUMNS_STORAGE_KEY, CTE_ITEM_COLUMN_KEYS, CTE_ITEM_STATUS_VALUES } =
      await loadFutureModule<CteItemTableModule>(ITEM_TABLE_MODULE)

    expect(CTE_ITEM_COLUMN_KEYS).toEqual([
      'cteNumber',
      'status',
      'billingStatus',
      'batchName',
      'invoiceNumbers',
      'issuedAt',
      'baseAmount',
      'totalAmount',
      'fiscalAmount',
      'createdAt',
      'lastErrorCode',
      'accessKey',
    ])
    expect(new Set(CTE_ITEM_COLUMN_KEYS).size).toBe(CTE_ITEM_COLUMN_KEYS.length)
    expect(CTE_ITEM_COLUMNS_STORAGE_KEY).toBe('cte-batch.items.columns.v1')
    expect(CTE_ITEM_STATUS_VALUES).toEqual([
      'authorized',
      'cancelled',
      'failed',
      'in_flight',
      'pending',
      'reconciliation_required',
      'rejected',
      'retry_scheduled',
    ])
  })

  test('hides the CT-es already sent to SEFAZ until a chip reveals them', async () => {
    const {
      CTE_ITEM_DEFAULT_HIDDEN_STATUSES,
      CTE_ITEM_STATUS_VALUES,
      EMPTY_CTE_ITEM_FILTERS,
      countActiveCteItemFilters,
      toggleCteItemStatus,
    } = await loadFutureModule<CteItemTableModule>(ITEM_TABLE_MODULE)

    expect(CTE_ITEM_DEFAULT_HIDDEN_STATUSES).toEqual(['authorized', 'cancelled', 'in_flight'])
    expect(EMPTY_CTE_ITEM_FILTERS.statuses).toEqual(
      CTE_ITEM_STATUS_VALUES.filter((status) => !CTE_ITEM_DEFAULT_HIDDEN_STATUSES.includes(status)),
    )
    expect(countActiveCteItemFilters(EMPTY_CTE_ITEM_FILTERS)).toBe(0)

    const revealed = toggleCteItemStatus(EMPTY_CTE_ITEM_FILTERS, 'authorized')
    expect(revealed.statuses).toContain('authorized')
    expect(countActiveCteItemFilters(revealed)).toBe(1)

    const hiddenAgain = toggleCteItemStatus(revealed, 'authorized')
    expect(hiddenAgain.statuses).toEqual(EMPTY_CTE_ITEM_FILTERS.statuses)
    expect(countActiveCteItemFilters(hiddenAgain)).toBe(0)
  })

  test('filters the CT-es already turned into an invoice through a dedicated chip', async () => {
    const {
      CTE_ITEM_BILLING_STATUS_VALUES,
      EMPTY_CTE_ITEM_FILTERS,
      countActiveCteItemFilters,
      serializeCteItemQuery,
      toggleCteItemBillingStatus,
    } = await loadFutureModule<CteItemTableModule>(ITEM_TABLE_MODULE)

    expect(CTE_ITEM_BILLING_STATUS_VALUES).toEqual(['invoiced', 'pending'])
    // Sem chip marcado a listagem não restringe nada — as duas situações aparecem.
    expect(EMPTY_CTE_ITEM_FILTERS.billingStatuses).toEqual(CTE_ITEM_BILLING_STATUS_VALUES)
    expect(countActiveCteItemFilters(EMPTY_CTE_ITEM_FILTERS)).toBe(0)
    expect(
      searchOf(
        serializeCteItemQuery({ cursor: null, filters: EMPTY_CTE_ITEM_FILTERS, limit: 25 }),
      ).has('billingStatusIn'),
    ).toBe(false)

    const onlyPending = toggleCteItemBillingStatus(EMPTY_CTE_ITEM_FILTERS, 'invoiced')
    expect(onlyPending.billingStatuses).toEqual(['pending'])
    expect(countActiveCteItemFilters(onlyPending)).toBe(1)
    expect(
      searchOf(serializeCteItemQuery({ cursor: null, filters: onlyPending, limit: 25 })).get(
        'billingStatusIn',
      ),
    ).toBe('pending')

    const onlyInvoiced = toggleCteItemBillingStatus(EMPTY_CTE_ITEM_FILTERS, 'pending')
    expect(
      searchOf(serializeCteItemQuery({ cursor: null, filters: onlyInvoiced, limit: 25 })).get(
        'billingStatusIn',
      ),
    ).toBe('invoiced')

    const none = toggleCteItemBillingStatus(onlyPending, 'pending')
    expect(none.billingStatuses).toEqual([])
    expect(
      searchOf(serializeCteItemQuery({ cursor: null, filters: none, limit: 25 })).has(
        'billingStatusIn',
      ),
    ).toBe(false)

    const restored = toggleCteItemBillingStatus(onlyPending, 'invoiced')
    expect(restored.billingStatuses).toEqual(CTE_ITEM_BILLING_STATUS_VALUES)
    expect(countActiveCteItemFilters(restored)).toBe(0)
  })

  test('serializes only the filled ranges and never a key the API rejects', async () => {
    const {
      CTE_ITEM_STATUS_VALUES,
      EMPTY_CTE_ITEM_FILTERS,
      countActiveCteItemFilters,
      serializeCteItemQuery,
    } = await loadFutureModule<CteItemTableModule>(ITEM_TABLE_MODULE)

    const base = searchOf(
      serializeCteItemQuery({ cursor: null, filters: EMPTY_CTE_ITEM_FILTERS, limit: 25 }),
    )
    expect(base.get('limit')).toBe('25')
    expect(base.get('statusIn')).toBe(
      'failed,pending,reconciliation_required,rejected,retry_scheduled',
    )
    expect(base.has('cursor')).toBe(false)
    expect(base.has('issuedFrom')).toBe(false)
    expect(base.has('cteNumberGte')).toBe(false)
    expect(base.has('invoiceNumberIn')).toBe(false)
    expect(base.has('batchId')).toBe(false)
    expect([...base.keys()].filter((key) => !ALLOWED_QUERY_KEYS.includes(key))).toEqual([])

    const filled = {
      ...EMPTY_CTE_ITEM_FILTERS,
      batchId: CTE_BATCH_ID,
      cteNumberQuery: '10-90',
      invoiceNumberQuery: '22,23',
      issuedFrom: '2026-07-01',
      issuedTo: '2026-07-31',
    }
    const search = searchOf(
      serializeCteItemQuery({ cursor: SYNTHETIC_CURSOR, filters: filled, limit: 50 }),
    )
    expect(search.get('cursor')).toBe(SYNTHETIC_CURSOR)
    expect(search.get('limit')).toBe('50')
    expect(search.get('batchId')).toBe(CTE_BATCH_ID)
    expect(search.get('cteNumberGte')).toBe('10')
    expect(search.get('cteNumberLte')).toBe('90')
    expect(search.get('invoiceNumberIn')).toBe('22,23')
    expect(search.has('invoiceNumberGte')).toBe(false)
    expect(search.get('issuedFrom')).toBe('2026-07-01T00:00:00.000Z')
    expect(search.get('issuedUntil')).toBe('2026-07-31T23:59:59.999Z')
    expect([...search.keys()].filter((key) => !ALLOWED_QUERY_KEYS.includes(key))).toEqual([])
    expect(countActiveCteItemFilters(filled)).toBe(5)

    const exact = { ...EMPTY_CTE_ITEM_FILTERS, cteNumberQuery: '14093' }
    expect(
      searchOf(serializeCteItemQuery({ cursor: null, filters: exact, limit: 25 })).get(
        'cteNumberIn',
      ),
    ).toBe('14093')

    const invalid = { ...EMPTY_CTE_ITEM_FILTERS, cteNumberQuery: 'abc' }
    const invalidSearch = searchOf(
      serializeCteItemQuery({ cursor: null, filters: invalid, limit: 25 }),
    )
    expect(invalidSearch.has('cteNumberIn')).toBe(false)
    expect(invalidSearch.has('cteNumberGte')).toBe(false)

    const everyStatus = { ...EMPTY_CTE_ITEM_FILTERS, statuses: CTE_ITEM_STATUS_VALUES }
    expect(
      searchOf(serializeCteItemQuery({ cursor: null, filters: everyStatus, limit: 25 })).has(
        'statusIn',
      ),
    ).toBe(false)
    const noStatus = { ...EMPTY_CTE_ITEM_FILTERS, statuses: [] }
    expect(
      searchOf(serializeCteItemQuery({ cursor: null, filters: noStatus, limit: 25 })).has(
        'statusIn',
      ),
    ).toBe(false)
  })

  test('parses an exact value, a comma list or a hyphen range from the number search field', async () => {
    const { parseNumberQuery } = await loadFutureModule<CteItemTableModule>(ITEM_TABLE_MODULE)

    expect(parseNumberQuery('14093')).toEqual({ type: 'exact', value: '14093' })
    expect(parseNumberQuery('14093,14095')).toEqual({
      type: 'list',
      values: ['14093', '14095'],
    })
    expect(parseNumberQuery('14093-14150')).toEqual({
      type: 'range',
      from: '14093',
      to: '14150',
    })
    expect(parseNumberQuery(' 14093 , 14095 ')).toEqual({
      type: 'list',
      values: ['14093', '14095'],
    })
    expect(parseNumberQuery(' 14093 - 14150 ')).toEqual({
      type: 'range',
      from: '14093',
      to: '14150',
    })
    expect(parseNumberQuery('')).toEqual({ type: 'empty' })
    expect(parseNumberQuery('   ')).toEqual({ type: 'empty' })
    expect(parseNumberQuery('nota-14093')).toEqual({ type: 'invalid' })
    expect(parseNumberQuery('14093,abc')).toEqual({ type: 'invalid' })
    expect(parseNumberQuery('14093-')).toEqual({ type: 'invalid' })
  })

  test('sorts by header through the value, not through the string', async () => {
    const { nextCteItemSortState, sortCteItems } =
      await loadFutureModule<CteItemTableModule>(ITEM_TABLE_MODULE)
    const rows = [AUTHORIZED_ROW, REJECTED_ROW, PENDING_ROW] as const

    expect(nextCteItemSortState(null, 'cteNumber')).toEqual({
      column: 'cteNumber',
      direction: 'asc',
    })
    expect(nextCteItemSortState({ column: 'cteNumber', direction: 'asc' }, 'cteNumber')).toEqual({
      column: 'cteNumber',
      direction: 'desc',
    })
    expect(nextCteItemSortState({ column: 'cteNumber', direction: 'desc' }, 'cteNumber')).toBeNull()
    expect(nextCteItemSortState({ column: 'cteNumber', direction: 'desc' }, 'status')).toEqual({
      column: 'status',
      direction: 'asc',
    })

    expect(sortCteItems(rows, null)).toEqual(rows)
    expect(
      sortCteItems(rows, { column: 'totalAmount', direction: 'asc' }).map((row) => row.id),
    ).toEqual([PENDING_ITEM_ID, REJECTED_ITEM_ID, AUTHORIZED_ITEM_ID])
    expect(
      sortCteItems(rows, { column: 'createdAt', direction: 'desc' }).map((row) => row.id),
    ).toEqual([PENDING_ITEM_ID, AUTHORIZED_ITEM_ID, REJECTED_ITEM_ID])
    expect(
      sortCteItems(rows, { column: 'cteNumber', direction: 'asc' }).map((row) => row.id)[0],
    ).toBe(AUTHORIZED_ITEM_ID)
  })

  test('counts the selection and sums it across pages from the accumulated map', async () => {
    const { accumulateCteItemAmounts, summarizeCteItemSelection } =
      await loadFutureModule<CteItemTableModule>(ITEM_TABLE_MODULE)

    const firstPage = accumulateCteItemAmounts({ items: FIRST_PAGE_ROWS, known: new Map() })
    const bothPages = accumulateCteItemAmounts({ items: SECOND_PAGE_ROWS, known: firstPage })
    expect([...bothPages.keys()].toSorted()).toEqual([AUTHORIZED_ITEM_ID, REJECTED_ITEM_ID])
    expect(bothPages.get(AUTHORIZED_ITEM_ID)).toEqual({
      batchId: CTE_BATCH_ID,
      baseAmount: '1058.4800',
      fiscalDocumentId: '00000000-0000-4000-8000-000000000604',
      status: 'authorized',
      totalAmount: '47.6316',
    })

    expect(summarizeCteItemSelection({ amounts: bothPages, selectedIds: [] })).toEqual({
      baseAmount: '0.00',
      count: 0,
      totalAmount: '0.00',
    })
    expect(
      summarizeCteItemSelection({ amounts: bothPages, selectedIds: [AUTHORIZED_ITEM_ID] }),
    ).toEqual({ baseAmount: '1058.4800', count: 1, totalAmount: '47.6316' })
    expect(
      summarizeCteItemSelection({
        amounts: bothPages,
        selectedIds: [AUTHORIZED_ITEM_ID, REJECTED_ITEM_ID],
      }),
    ).toEqual({ baseAmount: '2016.9600', count: 2, totalAmount: '90.7632' })

    /** Linha que saiu do filtro não pode inflar a soma nem a contagem. */
    expect(
      summarizeCteItemSelection({
        amounts: firstPage,
        selectedIds: [AUTHORIZED_ITEM_ID, REJECTED_ITEM_ID],
      }),
    ).toEqual({ baseAmount: '1058.4800', count: 1, totalAmount: '47.6316' })
  })

  test('walks the cursor forward and back without losing the first page', async () => {
    const {
      CTE_ITEM_FIRST_PAGE,
      canGoToPreviousCteItemPage,
      nextCteItemPage,
      previousCteItemPage,
    } = await loadFutureModule<CteItemTableModule>(ITEM_TABLE_MODULE)

    expect(CTE_ITEM_FIRST_PAGE).toEqual({ cursor: null, history: [] })
    expect(canGoToPreviousCteItemPage(CTE_ITEM_FIRST_PAGE)).toBe(false)

    const second = nextCteItemPage(CTE_ITEM_FIRST_PAGE, 'cursor-2')
    expect(second).toEqual({ cursor: 'cursor-2', history: [null] })
    const third = nextCteItemPage(second, 'cursor-3')
    expect(third).toEqual({ cursor: 'cursor-3', history: [null, 'cursor-2'] })
    expect(canGoToPreviousCteItemPage(third)).toBe(true)

    expect(previousCteItemPage(third)).toEqual(second)
    expect(previousCteItemPage(second)).toEqual(CTE_ITEM_FIRST_PAGE)
    expect(previousCteItemPage(CTE_ITEM_FIRST_PAGE)).toEqual(CTE_ITEM_FIRST_PAGE)

    /** Última página não avança: `nextCursor` nulo mantém o estado. */
    expect(nextCteItemPage(third, null)).toEqual(third)
  })

  test('persists item column order and visibility apart from the batch table', async () => {
    const {
      CTE_ITEM_COLUMNS_STORAGE_KEY,
      CTE_ITEM_COLUMN_KEYS,
      readCteItemColumnPreferences,
      reorderCteItemColumns,
      writeCteItemColumnPreferences,
    } = await loadFutureModule<CteItemTableModule>(ITEM_TABLE_MODULE)
    const { CTE_BATCH_COLUMNS_STORAGE_KEY } = await loadFutureModule<{
      readonly CTE_BATCH_COLUMNS_STORAGE_KEY: string
    }>('../../src/modules/cte-batch/shared/cteBatchTable.service')

    expect(CTE_ITEM_COLUMNS_STORAGE_KEY).not.toBe(CTE_BATCH_COLUMNS_STORAGE_KEY)

    const firstColumn = CTE_ITEM_COLUMN_KEYS[0]
    const secondColumn = CTE_ITEM_COLUMN_KEYS[1]
    if (firstColumn === undefined || secondColumn === undefined) {
      throw new Error('CTE_ITEM_CONTRACT_COLUMN_MISSING')
    }
    const movedOrder = reorderCteItemColumns(CTE_ITEM_COLUMN_KEYS, firstColumn, 'down')
    expect(reorderCteItemColumns(CTE_ITEM_COLUMN_KEYS, firstColumn, 'up')).toEqual(
      CTE_ITEM_COLUMN_KEYS,
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
    writeCteItemColumnPreferences({
      preferences: {
        order: movedOrder,
        visibility: { ...allVisible(CTE_ITEM_COLUMN_KEYS), [secondColumn]: false },
      },
      storage: memoryStorage,
    })
    expect(storage.has(CTE_ITEM_COLUMNS_STORAGE_KEY)).toBe(true)
    const restored = readCteItemColumnPreferences(memoryStorage)
    expect(restored.order[0]).toBe(secondColumn)
    expect(restored.visibility[secondColumn]).toBe(false)
    expect(restored.visibility[firstColumn]).toBe(true)

    storage.set(CTE_ITEM_COLUMNS_STORAGE_KEY, JSON.stringify({ order: ['ghost', secondColumn] }))
    expect(readCteItemColumnPreferences(memoryStorage).order).toEqual([
      secondColumn,
      ...CTE_ITEM_COLUMN_KEYS.filter((column) => column !== secondColumn),
    ])

    const brokenStorage = {
      getItem: (): string => {
        throw new Error('QuotaExceededError')
      },
      setItem: (): void => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(readCteItemColumnPreferences(brokenStorage).order).toEqual(CTE_ITEM_COLUMN_KEYS)
    expect(readCteItemColumnPreferences(null).order).toEqual(CTE_ITEM_COLUMN_KEYS)
    expect(() =>
      writeCteItemColumnPreferences({
        preferences: { order: CTE_ITEM_COLUMN_KEYS, visibility: allVisible(CTE_ITEM_COLUMN_KEYS) },
        storage: brokenStorage,
      }),
    ).not.toThrow()
  })

  test('reads the tenant item list from the authenticated no-store endpoint', async () => {
    const requests: Request[] = []
    const { createCteBatchItemClient } =
      await loadFutureModule<CteItemClientModule>(ITEM_CLIENT_MODULE)
    const { EMPTY_CTE_ITEM_FILTERS } = await loadFutureModule<CteItemTableModule>(ITEM_TABLE_MODULE)
    const client = createCteBatchItemClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        requests.push(new Request(input, init))
        return Promise.resolve(
          Response.json({ data: FIRST_PAGE_ROWS, page: { nextCursor: SYNTHETIC_CURSOR } }),
        )
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(
      await client.listCompanyItems({
        cursor: null,
        filters: EMPTY_CTE_ITEM_FILTERS,
        limit: 25,
      }),
    ).toEqual({ items: FIRST_PAGE_ROWS, nextCursor: SYNTHETIC_CURSOR })

    const request = requests[0]
    if (request === undefined) throw new Error('CTE_ITEM_CONTRACT_REQUEST_MISSING')
    expect(request.url.startsWith('https://api.example.test/cte-batch-items?')).toBe(true)
    expect(request.method).toBe('GET')
    expect(request.cache).toBe('no-store')
    expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(request.headers.get('idempotency-key')).toBeNull()
    expect(new URL(request.url).searchParams.has('companyId')).toBe(false)
  })

  test('keeps the paged item envelope strict against tenant and fiscal leakage', async () => {
    const { createCompanyCteItemPageAdapter } =
      await loadFutureModule<CteItemPageAdapterModule>(ITEM_VALIDATION_MODULE)
    const pageFromApi = createCompanyCteItemPageAdapter()

    expect(pageFromApi({ data: FIRST_PAGE_ROWS, page: { nextCursor: null } })).toEqual({
      items: FIRST_PAGE_ROWS,
      nextCursor: null,
    })
    expect(pageFromApi({ data: [], page: { nextCursor: SYNTHETIC_CURSOR } })).toEqual({
      items: [],
      nextCursor: SYNTHETIC_CURSOR,
    })

    for (const invalid of [
      { data: FIRST_PAGE_ROWS },
      { data: FIRST_PAGE_ROWS, page: { nextCursor: null }, total: 1 },
      { data: [{ ...AUTHORIZED_ROW, companyId: 'forbidden-company' }], page: { nextCursor: null } },
      { data: [{ ...AUTHORIZED_ROW, xml: '<cteProc />' }], page: { nextCursor: null } },
      { data: [{ ...AUTHORIZED_ROW, totalAmount: 47.63 }], page: { nextCursor: null } },
      { data: [{ ...AUTHORIZED_ROW, batchName: 42 }], page: { nextCursor: null } },
      { data: [{ ...AUTHORIZED_ROW, createdAt: null }], page: { nextCursor: null } },
      { data: FIRST_PAGE_ROWS, page: { nextCursor: 42 } },
      { items: FIRST_PAGE_ROWS, page: { nextCursor: null } },
    ]) {
      expect(() => pageFromApi(invalid)).toThrow('CTE_BATCH_INVALID_ITEMS_RESPONSE')
    }
    const withoutBatch = Object.fromEntries(
      Object.entries(AUTHORIZED_ROW).filter(([key]) => key !== 'batchId'),
    )
    expect(() => pageFromApi({ data: [withoutBatch], page: { nextCursor: null } })).toThrow(
      'CTE_BATCH_INVALID_ITEMS_RESPONSE',
    )
  })

  /**
   * Numeração trocada sem explicação parece erro do sistema. A tela marca o CT-e cujo número o
   * worker avançou depois da duplicidade acusada pela SEFAZ, e diz de qual número ele veio.
   */
  test('carries the reason the fiscal number of a CT-e was advanced', async () => {
    const { createCompanyCteItemPageAdapter } =
      await loadFutureModule<CteItemPageAdapterModule>(ITEM_VALIDATION_MODULE)
    const pageFromApi = createCompanyCteItemPageAdapter()

    const page = pageFromApi({ data: [AUTHORIZED_ROW], page: { nextCursor: null } }) as {
      readonly items: readonly { readonly fiscalNumberChange: unknown }[]
    }
    expect(page.items[0]?.fiscalNumberChange).toEqual({
      previousNumber: '2',
      reason: 'sefaz_duplicate_number',
      rejectionCode: '539',
    })

    for (const invalid of [
      { ...AUTHORIZED_ROW, fiscalNumberChange: { previousNumber: '2', reason: 'whatever' } },
      { ...AUTHORIZED_ROW, fiscalNumberChange: { previousNumber: 2, rejectionCode: '539' } },
      { ...AUTHORIZED_ROW, fiscalNumberChange: 'advanced' },
    ]) {
      expect(() => pageFromApi({ data: [invalid], page: { nextCursor: null } })).toThrow(
        'CTE_BATCH_INVALID_ITEMS_RESPONSE',
      )
    }

    const [table, locale] = await Promise.all([
      readModule('src/modules/cte-batch/components/CteItemTable.component.tsx'),
      readModule('src/modules/cte-batch/locales/cteBatch.locale.json'),
    ])
    expect(table).toContain('fiscalNumberChange')
    expect(locale).toContain('fiscalNumberChange')
  })

  test('registers the CT-e table as a living reference of the data table rule', async () => {
    const [rule, projectContext] = await Promise.all([
      readModule('../../docs/frontend/data-tables.md'),
      readModule('../../CLAUDE.md'),
    ])

    expect(projectContext).toContain('docs/frontend/data-tables.md')
    // A regra continua sendo o contrato; o que a tabela de CT-es acrescenta precisa estar escrito.
    for (const anchor of [
      'cte-batch',
      'CTE_ITEM_DEFAULT_HIDDEN_STATUSES',
      'nextCursor',
      'sumScaledAmounts',
      'useCteItemTable',
    ]) {
      expect(rule).toContain(anchor)
    }
    expect(rule).toContain('test/cte-batch/item-table.contract.ts')
  })

  test('wires the panel with locale strings, the design system select and collapsed controls', async () => {
    const [filters, table, selection, pagination, hook, page, ptLocale, enLocale] =
      await Promise.all([
        readModule('src/modules/cte-batch/components/CteItemFilters.component.tsx'),
        readModule('src/modules/cte-batch/components/CteItemTable.component.tsx'),
        readModule('src/modules/cte-batch/components/CteItemSelectionBar.component.tsx'),
        readModule('src/modules/cte-batch/components/CteItemPagination.component.tsx'),
        readModule('src/modules/cte-batch/hooks/useCteItemTable.hook.ts'),
        readModule('src/modules/cte-batch/pages/CteBatchWorkspace.page.tsx'),
        readModule('src/modules/cte-batch/locales/cteBatch.locale.json'),
        readModule('src/modules/cte-batch/locales/cteBatch.en.locale.json'),
      ])

    for (const source of [filters, table, selection, pagination]) {
      expect(source).toContain('useTranslation')
      expect(source).not.toMatch(/<select[\s>]/)
      expect(source).not.toMatch(/style=\{\{/)
    }
    expect(filters).toContain("from '@/components/ui/select'")
    expect(filters).toContain('cteItems.filters')
    expect(table).toContain('aria-sort')
    expect(table).toContain('aria-expanded')
    expect(table).toContain('cteItems.columnsMenu')
    expect(selection).toContain('formatAmount')
    expect(pagination).toContain('cteItems.previousPage')

    expect(hook).toContain('accumulateCteItemAmounts')
    expect(hook).toContain('CTE_ITEM_FIRST_PAGE')
    expect(hook).toContain('canTransmitSelection')
    expect(hook).toContain('groupSelectionByBatch')
    expect(hook).toContain('getCteIssuanceClient')
    expect(hook).toContain('COMPANY_CTE_ITEMS_QUERY_KEY')
    expect(page).toContain('CteItemTable')

    expect(selection).toContain('canTransmit')
    expect(selection).toContain('transmitGroups')
    expect(selection).toContain('cteItems.transmitSelection')
    expect(selection).toContain('transmitSelection(')

    expect(filters).toContain('cteItems.filters.billingStatus')
    expect(table).toContain('itemBillingStatus.')

    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, Record<string, unknown>>
      const cteItems = dictionary.cteItems
      const itemBillingStatus = dictionary.itemBillingStatus
      if (cteItems === undefined || itemBillingStatus === undefined) {
        throw new Error('CTE_ITEM_CONTRACT_LOCALE_MISSING')
      }
      expect(Object.keys(itemBillingStatus).toSorted()).toEqual(['invoiced', 'pending'])
      expect(Object.keys(cteItems.columns as Record<string, unknown>)).toContain('billingStatus')
      expect(Object.keys(cteItems.filters as Record<string, unknown>)).toContain('billingStatus')
      for (const key of [
        'baseSelected',
        'clearFilters',
        'columnsMenu',
        'filters',
        'nextPage',
        'previousPage',
        'selectedCount',
        'title',
        'totalSelected',
        'transmitSelection',
      ]) {
        expect(Object.keys(cteItems)).toContain(key)
      }
    }
  })
})

function allVisible(columns: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(columns.map((column) => [column, true]))
}

type CteItemRow = {
  readonly baseAmount: string
  readonly batchId: string
  readonly createdAt: string
  readonly id: string
  readonly totalAmount: string
}

type CteItemAmounts = Readonly<{
  batchId: string
  baseAmount: string
  fiscalDocumentId: null | string
  status: string
  totalAmount: string
}>

type CteItemFiltersState = Readonly<{
  batchId: string
  billingStatuses: readonly string[]
  cteNumberQuery: string
  invoiceNumberQuery: string
  issuedFrom: string
  issuedTo: string
  statuses: readonly string[]
}>

type NumberQuery =
  | { readonly type: 'empty' }
  | { readonly type: 'exact'; readonly value: string }
  | { readonly type: 'invalid' }
  | { readonly type: 'list'; readonly values: readonly string[] }
  | { readonly type: 'range'; readonly from: string; readonly to: string }

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

type CteItemTableModule = {
  readonly CTE_ITEM_BILLING_STATUS_VALUES: readonly string[]
  readonly CTE_ITEM_COLUMNS_STORAGE_KEY: string
  readonly CTE_ITEM_COLUMN_KEYS: readonly string[]
  readonly CTE_ITEM_DEFAULT_HIDDEN_STATUSES: readonly string[]
  readonly CTE_ITEM_FIRST_PAGE: PageState
  readonly CTE_ITEM_STATUS_VALUES: readonly string[]
  readonly EMPTY_CTE_ITEM_FILTERS: CteItemFiltersState
  readonly accumulateCteItemAmounts: (input: {
    readonly items: readonly CteItemRow[]
    readonly known: ReadonlyMap<string, CteItemAmounts>
  }) => ReadonlyMap<string, CteItemAmounts>
  readonly canGoToPreviousCteItemPage: (state: PageState) => boolean
  readonly countActiveCteItemFilters: (filters: CteItemFiltersState) => number
  readonly nextCteItemPage: (state: PageState, nextCursor: null | string) => PageState
  readonly nextCteItemSortState: (current: SortState, column: string) => SortState
  readonly parseNumberQuery: (raw: string) => NumberQuery
  readonly previousCteItemPage: (state: PageState) => PageState
  readonly readCteItemColumnPreferences: (storage: StorageAccessor | null) => ColumnPreferences
  readonly reorderCteItemColumns: (
    order: readonly string[],
    column: string,
    direction: 'down' | 'up',
  ) => readonly string[]
  readonly serializeCteItemQuery: (input: {
    readonly cursor: null | string
    readonly filters: CteItemFiltersState
    readonly limit: number
  }) => string
  readonly sortCteItems: (
    items: readonly CteItemRow[],
    sort: SortState,
  ) => readonly { readonly id: string }[]
  readonly summarizeCteItemSelection: (input: {
    readonly amounts: ReadonlyMap<string, CteItemAmounts>
    readonly selectedIds: readonly string[]
  }) => { readonly baseAmount: string; readonly count: number; readonly totalAmount: string }
  readonly toggleCteItemBillingStatus: (
    filters: CteItemFiltersState,
    status: string,
  ) => CteItemFiltersState
  readonly toggleCteItemStatus: (
    filters: CteItemFiltersState,
    status: string,
  ) => CteItemFiltersState
  readonly writeCteItemColumnPreferences: (input: {
    readonly preferences: ColumnPreferences
    readonly storage: StorageAccessor | null
  }) => void
}

type CteItemClientModule = {
  readonly createCteBatchItemClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => {
    readonly listCompanyItems: (input: {
      readonly cursor: null | string
      readonly filters: CteItemFiltersState
      readonly limit: number
    }) => Promise<unknown>
  }
}

type CteItemPageAdapterModule = {
  readonly createCompanyCteItemPageAdapter: () => (input: unknown) => unknown
}
