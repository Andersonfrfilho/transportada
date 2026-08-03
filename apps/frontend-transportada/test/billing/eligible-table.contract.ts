/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  BILLING_CTE_ID_PRIMARY,
  BILLING_CTE_ID_SECONDARY,
  SYNTHETIC_CURSOR,
  loadFutureModule,
} from './billing.fixture.js'

const ELIGIBLE_TABLE_MODULE = '../../src/modules/billing/shared/billingEligibleTable.service'
const ELIGIBLE_FILTER_MODULE =
  '../../src/modules/billing/shared/billingEligibleAdvancedFilter.service'
const INVOICE_TABLE_MODULE = '../../src/modules/billing/shared/billingInvoiceTable.service'

/** Espelha a allowlist de `parseBillingEligibleList` na API — chave fora dela devolve 400. */
const ALLOWED_QUERY_KEYS: readonly string[] = [
  'batchId',
  'batchIdIn',
  'cteNumber',
  'cteNumberFrom',
  'cteNumberIn',
  'cteNumberTo',
  'cursor',
  'customerDocument',
  'customerName',
  'issuedFrom',
  'issuedTo',
  'limit',
  'maxAmount',
  'minAmount',
  'nfeNumberFrom',
  'nfeNumberIn',
  'nfeNumberTo',
]

const BATCH_ID = '00000000-0000-4000-8000-000000000713'
const THIRD_CTE_ID = '00000000-0000-4000-8000-000000000715'

const ROW_A = {
  batchId: BATCH_ID,
  batchName: 'Lote julho',
  cteId: BILLING_CTE_ID_PRIMARY,
  cteNumber: '9',
  customerDocument: '12345678000199',
  customerName: 'Alfa Transportes',
  issuedAt: '2026-07-22T10:00:00.000Z',
  totalAmount: '150.2500',
} as const

/** CT-e 43 contra 9: comparação lexicográfica de string inverteria a ordem. */
const ROW_B = {
  batchId: '00000000-0000-4000-8000-000000000714',
  batchName: 'Lote agosto',
  cteId: BILLING_CTE_ID_SECONDARY,
  cteNumber: '43',
  customerDocument: '98765432000188',
  customerName: 'Beta Cargas',
  issuedAt: '2026-07-23T10:00:00.000Z',
  totalAmount: '9.0000',
} as const

const ROW_C = {
  batchId: BATCH_ID,
  batchName: 'Lote julho',
  cteId: THIRD_CTE_ID,
  cteNumber: '11',
  customerDocument: '12345678000199',
  customerName: 'Alfa Transportes',
  issuedAt: '2026-07-21T10:00:00.000Z',
  totalAmount: '43.1300',
} as const

const FIRST_PAGE_ROWS = [ROW_A, ROW_C] as const
const SECOND_PAGE_ROWS = [ROW_B] as const

function searchOf(query: string): URLSearchParams {
  return new URLSearchParams(query)
}

function allVisible(columns: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(columns.map((column) => [column, true]))
}

function memoryStorage(): {
  readonly accessor: StorageAccessor
  readonly entries: Map<string, string>
} {
  const entries = new Map<string, string>()
  return {
    accessor: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value)
      },
    },
    entries,
  }
}

describe('Billing eligible CT-e table contract', () => {
  test('exposes the seven columns the screen promises and a storage key of its own', async () => {
    const { BILLING_ELIGIBLE_COLUMN_KEYS, BILLING_ELIGIBLE_COLUMNS_STORAGE_KEY } =
      await loadFutureModule<EligibleTableModule>(ELIGIBLE_TABLE_MODULE)
    const { BILLING_INVOICE_COLUMNS_STORAGE_KEY } = await loadFutureModule<{
      readonly BILLING_INVOICE_COLUMNS_STORAGE_KEY: string
    }>(INVOICE_TABLE_MODULE)

    expect(BILLING_ELIGIBLE_COLUMN_KEYS).toEqual([
      'cteNumber',
      'nfeNumber',
      'customerName',
      'customerDocument',
      'batchName',
      'issuedAt',
      'totalAmount',
    ])
    expect(new Set(BILLING_ELIGIBLE_COLUMN_KEYS).size).toBe(BILLING_ELIGIBLE_COLUMN_KEYS.length)
    expect(BILLING_ELIGIBLE_COLUMNS_STORAGE_KEY).toBe('billing.eligible.columns.v1')
    expect(BILLING_ELIGIBLE_COLUMNS_STORAGE_KEY).not.toBe(BILLING_INVOICE_COLUMNS_STORAGE_KEY)
  })

  test('serializes only filled filters and never a key the API rejects', async () => {
    const {
      EMPTY_BILLING_ELIGIBLE_FILTERS,
      countActiveBillingEligibleFilters,
      serializeBillingEligibleQuery,
    } = await loadFutureModule<EligibleTableModule>(ELIGIBLE_TABLE_MODULE)

    expect(countActiveBillingEligibleFilters(EMPTY_BILLING_ELIGIBLE_FILTERS)).toBe(0)
    const base = searchOf(
      serializeBillingEligibleQuery({
        cursor: null,
        filters: EMPTY_BILLING_ELIGIBLE_FILTERS,
        limit: 25,
      }),
    )
    expect(base.get('limit')).toBe('25')
    expect([...base.keys()]).toEqual(['limit'])

    const filled = {
      ...EMPTY_BILLING_ELIGIBLE_FILTERS,
      batchId: BATCH_ID,
      cteNumberQuery: '9, 43',
      customerDocument: '12.345.678/0001-99',
      customerName: '  Alfa  ',
      issuedFrom: '2026-07-01',
      issuedTo: '2026-07-31',
      maxAmount: '350,5',
      minAmount: '100',
    }
    const search = searchOf(
      serializeBillingEligibleQuery({ cursor: SYNTHETIC_CURSOR, filters: filled, limit: 50 }),
    )
    expect(search.get('cursor')).toBe(SYNTHETIC_CURSOR)
    expect(search.get('limit')).toBe('50')
    expect(search.get('batchId')).toBe(BATCH_ID)
    expect(search.get('cteNumberIn')).toBe('9,43')
    expect(search.has('cteNumber')).toBe(false)
    expect(search.get('customerDocument')).toBe('12345678000199')
    expect(search.get('customerName')).toBe('Alfa')
    expect(search.get('issuedFrom')).toBe('2026-07-01')
    expect(search.get('issuedTo')).toBe('2026-07-31')
    expect(search.get('minAmount')).toBe('100.00')
    expect(search.get('maxAmount')).toBe('350.50')
    expect([...search.keys()].filter((key) => !ALLOWED_QUERY_KEYS.includes(key))).toEqual([])
    expect(countActiveBillingEligibleFilters(filled)).toBe(8)
  })

  test('drops what the API would refuse instead of sending a 400', async () => {
    const { EMPTY_BILLING_ELIGIBLE_FILTERS, serializeBillingEligibleQuery } =
      await loadFutureModule<EligibleTableModule>(ELIGIBLE_TABLE_MODULE)

    const searchFor = (filters: Partial<EligibleFiltersState>): URLSearchParams =>
      searchOf(
        serializeBillingEligibleQuery({
          cursor: null,
          filters: { ...EMPTY_BILLING_ELIGIBLE_FILTERS, ...filters },
          limit: 25,
        }),
      )

    expect(searchFor({ cteNumberQuery: 'abc' }).has('cteNumberIn')).toBe(false)
    expect(searchFor({ cteNumberQuery: '9,,43' }).has('cteNumberIn')).toBe(false)
    expect(searchFor({ cteNumberQuery: '   ' }).has('cteNumberIn')).toBe(false)
    expect(searchFor({ customerDocument: '123' }).has('customerDocument')).toBe(false)
    expect(searchFor({ customerName: 'A' }).has('customerName')).toBe(false)
    expect(searchFor({ minAmount: 'abc' }).has('minAmount')).toBe(false)
    expect(searchFor({ maxAmount: '350.123' }).has('maxAmount')).toBe(false)
    /** Teto de lista da API: 100 valores. */
    const overflow = Array.from({ length: 101 }, (_, index) => String(index + 1)).join(',')
    expect(searchFor({ cteNumberQuery: overflow }).has('cteNumberIn')).toBe(false)
  })

  test('sorts by header through the value, not through the string', async () => {
    const { nextBillingEligibleSortState, sortBillingEligibleCtes } =
      await loadFutureModule<EligibleTableModule>(ELIGIBLE_TABLE_MODULE)
    const rows = [ROW_A, ROW_B, ROW_C] as const

    expect(nextBillingEligibleSortState(null, 'cteNumber')).toEqual({
      column: 'cteNumber',
      direction: 'asc',
    })
    expect(
      nextBillingEligibleSortState({ column: 'cteNumber', direction: 'asc' }, 'cteNumber'),
    ).toEqual({ column: 'cteNumber', direction: 'desc' })
    expect(
      nextBillingEligibleSortState({ column: 'cteNumber', direction: 'desc' }, 'cteNumber'),
    ).toBeNull()
    expect(
      nextBillingEligibleSortState({ column: 'cteNumber', direction: 'desc' }, 'totalAmount'),
    ).toEqual({ column: 'totalAmount', direction: 'asc' })

    expect(sortBillingEligibleCtes(rows, null)).toEqual(rows)
    expect(
      sortBillingEligibleCtes(rows, { column: 'cteNumber', direction: 'asc' }).map(
        (row) => row.cteId,
      ),
    ).toEqual([BILLING_CTE_ID_PRIMARY, THIRD_CTE_ID, BILLING_CTE_ID_SECONDARY])
    expect(
      sortBillingEligibleCtes(rows, { column: 'totalAmount', direction: 'asc' }).map(
        (row) => row.cteId,
      ),
    ).toEqual([BILLING_CTE_ID_SECONDARY, THIRD_CTE_ID, BILLING_CTE_ID_PRIMARY])
    expect(
      sortBillingEligibleCtes(rows, { column: 'issuedAt', direction: 'desc' }).map(
        (row) => row.cteId,
      ),
    ).toEqual([BILLING_CTE_ID_SECONDARY, BILLING_CTE_ID_PRIMARY, THIRD_CTE_ID])
    expect(
      sortBillingEligibleCtes(rows, { column: 'customerName', direction: 'asc' }).map(
        (row) => row.cteId,
      )[2],
    ).toBe(BILLING_CTE_ID_SECONDARY)
  })

  test('accumulates the selection across pages and reports the customers it spans', async () => {
    const { accumulateBillingEligibleAmounts, summarizeBillingEligibleSelection } =
      await loadFutureModule<EligibleTableModule>(ELIGIBLE_TABLE_MODULE)

    const firstPage = accumulateBillingEligibleAmounts({ items: FIRST_PAGE_ROWS, known: new Map() })
    const bothPages = accumulateBillingEligibleAmounts({
      items: SECOND_PAGE_ROWS,
      known: firstPage,
    })
    expect([...bothPages.keys()].toSorted()).toEqual(
      [BILLING_CTE_ID_PRIMARY, BILLING_CTE_ID_SECONDARY, THIRD_CTE_ID].toSorted(),
    )
    expect(bothPages.get(BILLING_CTE_ID_PRIMARY)).toEqual({
      customerDocument: '12345678000199',
      customerName: 'Alfa Transportes',
      totalAmount: '150.2500',
    })

    expect(summarizeBillingEligibleSelection({ amounts: bothPages, selectedIds: [] })).toEqual({
      count: 0,
      customerDocuments: [],
      totalAmount: '0.00',
    })
    expect(
      summarizeBillingEligibleSelection({
        amounts: bothPages,
        selectedIds: [BILLING_CTE_ID_PRIMARY, THIRD_CTE_ID],
      }),
    ).toEqual({
      count: 2,
      customerDocuments: ['12345678000199'],
      totalAmount: '193.3800',
    })
    /** Uma fatura é de um tomador só: a seleção precisa denunciar quando cruza dois. */
    expect(
      summarizeBillingEligibleSelection({
        amounts: bothPages,
        selectedIds: [BILLING_CTE_ID_PRIMARY, BILLING_CTE_ID_SECONDARY],
      }),
    ).toEqual({
      count: 2,
      customerDocuments: ['12345678000199', '98765432000188'],
      totalAmount: '159.2500',
    })
    /** Linha que saiu do filtro não pode inflar a soma nem a contagem. */
    expect(
      summarizeBillingEligibleSelection({
        amounts: firstPage,
        selectedIds: [BILLING_CTE_ID_PRIMARY, BILLING_CTE_ID_SECONDARY],
      }),
    ).toEqual({
      count: 1,
      customerDocuments: ['12345678000199'],
      totalAmount: '150.2500',
    })
  })

  test('walks the cursor forward and back without losing the first page', async () => {
    const {
      BILLING_ELIGIBLE_FIRST_PAGE,
      canGoToPreviousBillingEligiblePage,
      nextBillingEligiblePage,
      previousBillingEligiblePage,
    } = await loadFutureModule<EligibleTableModule>(ELIGIBLE_TABLE_MODULE)

    expect(BILLING_ELIGIBLE_FIRST_PAGE).toEqual({ cursor: null, history: [] })
    expect(canGoToPreviousBillingEligiblePage(BILLING_ELIGIBLE_FIRST_PAGE)).toBe(false)

    const second = nextBillingEligiblePage(BILLING_ELIGIBLE_FIRST_PAGE, 'cursor-2')
    expect(second).toEqual({ cursor: 'cursor-2', history: [null] })
    const third = nextBillingEligiblePage(second, 'cursor-3')
    expect(third).toEqual({ cursor: 'cursor-3', history: [null, 'cursor-2'] })
    expect(canGoToPreviousBillingEligiblePage(third)).toBe(true)

    expect(previousBillingEligiblePage(third)).toEqual(second)
    expect(previousBillingEligiblePage(second)).toEqual(BILLING_ELIGIBLE_FIRST_PAGE)
    expect(previousBillingEligiblePage(BILLING_ELIGIBLE_FIRST_PAGE)).toEqual(
      BILLING_ELIGIBLE_FIRST_PAGE,
    )
    expect(nextBillingEligiblePage(third, null)).toEqual(third)
  })

  test('persists column order and visibility, tolerating no storage and broken storage', async () => {
    const {
      BILLING_ELIGIBLE_COLUMNS_STORAGE_KEY,
      BILLING_ELIGIBLE_COLUMN_KEYS,
      readBillingEligibleColumnPreferences,
      reorderBillingEligibleColumns,
      writeBillingEligibleColumnPreferences,
    } = await loadFutureModule<EligibleTableModule>(ELIGIBLE_TABLE_MODULE)

    const firstColumn = BILLING_ELIGIBLE_COLUMN_KEYS[0]
    const secondColumn = BILLING_ELIGIBLE_COLUMN_KEYS[1]
    const lastColumn = BILLING_ELIGIBLE_COLUMN_KEYS.at(-1)
    if (firstColumn === undefined || secondColumn === undefined || lastColumn === undefined) {
      throw new Error('BILLING_ELIGIBLE_CONTRACT_COLUMN_MISSING')
    }

    const movedOrder = reorderBillingEligibleColumns(
      BILLING_ELIGIBLE_COLUMN_KEYS,
      firstColumn,
      'down',
    )
    expect(movedOrder[0]).toBe(secondColumn)
    expect(movedOrder[1]).toBe(firstColumn)
    expect(reorderBillingEligibleColumns(BILLING_ELIGIBLE_COLUMN_KEYS, firstColumn, 'up')).toEqual(
      BILLING_ELIGIBLE_COLUMN_KEYS,
    )
    expect(reorderBillingEligibleColumns(BILLING_ELIGIBLE_COLUMN_KEYS, lastColumn, 'down')).toEqual(
      BILLING_ELIGIBLE_COLUMN_KEYS,
    )

    const storage = memoryStorage()
    writeBillingEligibleColumnPreferences({
      preferences: {
        order: movedOrder,
        visibility: { ...allVisible(BILLING_ELIGIBLE_COLUMN_KEYS), [secondColumn]: false },
      },
      storage: storage.accessor,
    })
    expect(storage.entries.has(BILLING_ELIGIBLE_COLUMNS_STORAGE_KEY)).toBe(true)
    const restored = readBillingEligibleColumnPreferences(storage.accessor)
    expect(restored.order[0]).toBe(secondColumn)
    expect(restored.visibility[secondColumn]).toBe(false)
    expect(restored.visibility[firstColumn]).toBe(true)

    storage.entries.set(
      BILLING_ELIGIBLE_COLUMNS_STORAGE_KEY,
      JSON.stringify({ order: ['ghost', secondColumn], visibility: { ghost: 'sim' } }),
    )
    const sanitized = readBillingEligibleColumnPreferences(storage.accessor)
    expect(sanitized.order).toEqual([
      secondColumn,
      ...BILLING_ELIGIBLE_COLUMN_KEYS.filter((column) => column !== secondColumn),
    ])
    expect(sanitized.visibility[secondColumn]).toBe(true)

    storage.entries.set(BILLING_ELIGIBLE_COLUMNS_STORAGE_KEY, 'não é json')
    expect(readBillingEligibleColumnPreferences(storage.accessor).order).toEqual(
      BILLING_ELIGIBLE_COLUMN_KEYS,
    )

    const brokenStorage = {
      getItem: (): string => {
        throw new Error('QuotaExceededError')
      },
      setItem: (): void => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(readBillingEligibleColumnPreferences(brokenStorage).order).toEqual(
      BILLING_ELIGIBLE_COLUMN_KEYS,
    )
    /** Sem `window` a tela ainda renderiza: `null` é o armazenamento do servidor. */
    expect(readBillingEligibleColumnPreferences(null).order).toEqual(BILLING_ELIGIBLE_COLUMN_KEYS)
    expect(() =>
      writeBillingEligibleColumnPreferences({
        preferences: {
          order: BILLING_ELIGIBLE_COLUMN_KEYS,
          visibility: allVisible(BILLING_ELIGIBLE_COLUMN_KEYS),
        },
        storage: brokenStorage,
      }),
    ).not.toThrow()
  })

  test('evaluates the advanced filter with nested AND/OR groups and stays neutral when empty', async () => {
    const {
      BILLING_ELIGIBLE_CONDITION_FIELDS,
      applyBillingEligibleConditionChanges,
      countActiveBillingEligibleConditions,
      createBillingEligibleAdvancedFilter,
      evaluateBillingEligibleAdvancedFilter,
      isBillingEligibleConditionActive,
    } = await loadFutureModule<EligibleAdvancedFilterModule>(ELIGIBLE_FILTER_MODULE)

    expect(BILLING_ELIGIBLE_CONDITION_FIELDS).toEqual([
      'cteNumber',
      'nfeNumber',
      'customerName',
      'customerDocument',
      'batchName',
      'issuedAt',
      'totalAmount',
    ])

    let sequence = 0
    const nextId = (): string => {
      sequence += 1
      return `condition-${sequence}`
    }
    const neutral = createBillingEligibleAdvancedFilter(nextId)
    expect(countActiveBillingEligibleConditions(neutral)).toBe(0)
    for (const row of [ROW_A, ROW_B, ROW_C]) {
      expect(evaluateBillingEligibleAdvancedFilter(row, neutral)).toBe(true)
    }

    const emptyCondition = neutral.groups[0]?.conditions[0]
    if (emptyCondition === undefined) throw new Error('BILLING_ELIGIBLE_CONTRACT_CONDITION_MISSING')
    expect(isBillingEligibleConditionActive(emptyCondition)).toBe(false)

    /** Trocar o campo zera valor e operador — senão sobra um operador que o novo tipo não aceita. */
    const changed = applyBillingEligibleConditionChanges(
      { ...emptyCondition, value: 'Alfa' },
      { field: 'totalAmount' },
    )
    expect(changed.value).toBe('')
    expect(changed.operator).toBe('between')

    const model = {
      connector: 'or',
      groups: [
        {
          conditions: [
            {
              field: 'customerName',
              id: 'a',
              operator: 'contains',
              value: 'alfa',
              valueTo: '',
            },
            {
              field: 'totalAmount',
              id: 'b',
              operator: 'gte',
              value: '100.00',
              valueTo: '',
            },
          ],
          connector: 'and',
          id: 'group-a',
        },
        {
          conditions: [
            { field: 'cteNumber', id: 'c', operator: 'between', value: '40', valueTo: '50' },
          ],
          connector: 'or',
          id: 'group-b',
        },
        {
          conditions: [
            { field: 'batchName', id: 'd', operator: 'contains', value: '', valueTo: '' },
          ],
          connector: 'and',
          id: 'group-c',
        },
      ],
    } as const

    expect(countActiveBillingEligibleConditions(model)).toBe(3)
    /** Alfa com 150,25: passa no primeiro grupo (E). */
    expect(evaluateBillingEligibleAdvancedFilter(ROW_A, model)).toBe(true)
    /** Beta com 9,00: reprovado no primeiro grupo, aprovado pelo intervalo de CT-e do segundo. */
    expect(evaluateBillingEligibleAdvancedFilter(ROW_B, model)).toBe(true)
    /** Alfa com 43,13: reprovado nos dois grupos — o grupo vazio não pode salvá-lo. */
    expect(evaluateBillingEligibleAdvancedFilter(ROW_C, model)).toBe(false)

    const andModel = { ...model, connector: 'and' } as const
    expect(evaluateBillingEligibleAdvancedFilter(ROW_A, andModel)).toBe(false)

    /** Dinheiro não passa por float: 0.1 + 0.2 não pode virar 0.30000000000000004. */
    const moneyModel = {
      connector: 'and',
      groups: [
        {
          conditions: [
            { field: 'totalAmount', id: 'e', operator: 'lte', value: '43.1300', valueTo: '' },
          ],
          connector: 'and',
          id: 'group-money',
        },
      ],
    } as const
    expect(evaluateBillingEligibleAdvancedFilter(ROW_C, moneyModel)).toBe(true)
    expect(evaluateBillingEligibleAdvancedFilter(ROW_A, moneyModel)).toBe(false)

    const dateModel = {
      connector: 'and',
      groups: [
        {
          conditions: [
            {
              field: 'issuedAt',
              id: 'f',
              operator: 'between',
              value: '2026-07-22',
              valueTo: '2026-07-22',
            },
          ],
          connector: 'and',
          id: 'group-date',
        },
      ],
    } as const
    /** O dia inteiro conta, como no filtro do servidor. */
    expect(evaluateBillingEligibleAdvancedFilter(ROW_A, dateModel)).toBe(true)
    expect(evaluateBillingEligibleAdvancedFilter(ROW_B, dateModel)).toBe(false)
  })
})

type EligibleRow = {
  readonly batchId: string
  readonly batchName: string
  readonly cteId: string
  readonly cteNumber: string
  readonly customerDocument: string
  readonly customerName: string
  readonly issuedAt: string
  readonly totalAmount: string
}

type EligibleAmounts = Readonly<{
  customerDocument: string
  customerName: string
  totalAmount: string
}>

type EligibleFiltersState = Readonly<{
  batchId: string
  cteNumberQuery: string
  customerDocument: string
  customerName: string
  issuedFrom: string
  issuedTo: string
  maxAmount: string
  minAmount: string
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

type EligibleTableModule = {
  readonly BILLING_ELIGIBLE_COLUMNS_STORAGE_KEY: string
  readonly BILLING_ELIGIBLE_COLUMN_KEYS: readonly string[]
  readonly BILLING_ELIGIBLE_FIRST_PAGE: PageState
  readonly EMPTY_BILLING_ELIGIBLE_FILTERS: EligibleFiltersState
  readonly accumulateBillingEligibleAmounts: (input: {
    readonly items: readonly EligibleRow[]
    readonly known: ReadonlyMap<string, EligibleAmounts>
  }) => ReadonlyMap<string, EligibleAmounts>
  readonly canGoToPreviousBillingEligiblePage: (state: PageState) => boolean
  readonly countActiveBillingEligibleFilters: (filters: EligibleFiltersState) => number
  readonly nextBillingEligiblePage: (state: PageState, nextCursor: null | string) => PageState
  readonly nextBillingEligibleSortState: (current: SortState, column: string) => SortState
  readonly previousBillingEligiblePage: (state: PageState) => PageState
  readonly readBillingEligibleColumnPreferences: (
    storage: StorageAccessor | null,
  ) => ColumnPreferences
  readonly reorderBillingEligibleColumns: (
    order: readonly string[],
    column: string,
    direction: 'down' | 'up',
  ) => readonly string[]
  readonly serializeBillingEligibleQuery: (input: {
    readonly cursor: null | string
    readonly filters: EligibleFiltersState
    readonly limit: number
  }) => string
  readonly sortBillingEligibleCtes: (
    items: readonly EligibleRow[],
    sort: SortState,
  ) => readonly EligibleRow[]
  readonly summarizeBillingEligibleSelection: (input: {
    readonly amounts: ReadonlyMap<string, EligibleAmounts>
    readonly selectedIds: readonly string[]
  }) => {
    readonly count: number
    readonly customerDocuments: readonly string[]
    readonly totalAmount: string
  }
  readonly writeBillingEligibleColumnPreferences: (input: {
    readonly preferences: ColumnPreferences
    readonly storage: StorageAccessor | null
  }) => void
}

type AdvancedCondition = Readonly<{
  field: string
  id: string
  operator: string
  value: string
  valueTo: string
}>

type AdvancedGroup = Readonly<{
  conditions: readonly AdvancedCondition[]
  connector: 'and' | 'or'
  id: string
}>

type AdvancedModel = Readonly<{
  connector: 'and' | 'or'
  groups: readonly AdvancedGroup[]
}>

type EligibleAdvancedFilterModule = {
  readonly BILLING_ELIGIBLE_CONDITION_FIELDS: readonly string[]
  readonly applyBillingEligibleConditionChanges: (
    condition: AdvancedCondition,
    changes: Readonly<Partial<AdvancedCondition>>,
  ) => AdvancedCondition
  readonly countActiveBillingEligibleConditions: (model: AdvancedModel) => number
  readonly createBillingEligibleAdvancedFilter: (nextId: () => string) => AdvancedModel
  readonly evaluateBillingEligibleAdvancedFilter: (
    row: EligibleRow,
    model: AdvancedModel,
  ) => boolean
  readonly isBillingEligibleConditionActive: (condition: AdvancedCondition) => boolean
}
