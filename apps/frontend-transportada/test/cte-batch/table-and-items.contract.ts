/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  CTE_BATCH,
  CTE_BATCH_AUTHORIZED_ITEM,
  CTE_BATCH_CANCELLED_ITEM,
  CTE_BATCH_ID,
  CTE_BATCH_ITEMS,
  CTE_BATCH_REJECTED_ITEM,
  CTE_BATCH_UNPROTOCOLED_ITEM,
  CTE_CANCEL,
  CTE_CANCEL_JUSTIFICATION,
  CTE_DOCUMENT_ID,
  CTE_DONE_BATCH,
  CTE_FISCAL_DOCUMENT_ID,
  CTE_MANAGE,
  CTE_REFERENCE_ACCESS_KEY,
  CTE_SECOND_ACCESS_KEY,
  CTE_SECOND_DOCUMENT_ID,
  CTE_SUBMIT,
  CTE_SUBMITTED_BATCH,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_IDEMPOTENCY_KEY,
  SYNTHETIC_SUBMIT_KEY,
  loadFutureModule,
} from './cte-batch.fixture'

const ITEMS_MODULE = '../../src/modules/cte-batch/shared/cteBatchItem.validation'
const TABLE_MODULE = '../../src/modules/cte-batch/shared/cteBatchTable.service'
const ADVANCED_MODULE = '../../src/modules/cte-batch/shared/cteBatchAdvancedFilter.service'
const ACTIONS_MODULE = '../../src/modules/cte-batch/shared/cteBatchItemActions.service'
const CLIENT_MODULE = '../../src/modules/cte-batch/shared/cteBatchClient.service'

const BATCHES = [CTE_BATCH, CTE_DONE_BATCH] as const

const REFERENCE_DOCUMENT = {
  accessKey: CTE_REFERENCE_ACCESS_KEY,
  id: CTE_DOCUMENT_ID,
  number: '000000022',
  position: '1',
  series: '001',
  totalAmount: '958.4800',
} as const

const STATUS_CONDITION = {
  field: 'status',
  id: 'condition-status',
  operator: 'eq',
  value: 'done',
  valueTo: '',
} as const
const ITEM_COUNT_CONDITION = {
  field: 'itemCount',
  id: 'condition-item-count',
  operator: 'gte',
  value: '4',
  valueTo: '',
} as const
const NAME_CONDITION = {
  field: 'name',
  id: 'condition-name',
  operator: 'contains',
  value: 'julho',
  valueTo: '',
} as const
const PRIMARY_GROUP = {
  conditions: [STATUS_CONDITION, ITEM_COUNT_CONDITION],
  connector: 'and',
  id: 'group-primary',
} as const
const SECONDARY_GROUP = {
  conditions: [NAME_CONDITION],
  connector: 'and',
  id: 'group-secondary',
} as const
const ADVANCED_MODEL = { connector: 'or', groups: [PRIMARY_GROUP, SECONDARY_GROUP] } as const

describe('CT-e batch table and items contract', () => {
  test('reads batch items from the authenticated no-store items endpoint without idempotency key', async () => {
    const requests: Request[] = []
    const { createCteBatchClient } = await loadFutureModule<CteBatchClientModule>(CLIENT_MODULE)
    const client = createCteBatchClient({
      apiUrl: 'https://api.example.test',
      fetch: (input, init) => {
        requests.push(new Request(input, init))
        return Promise.resolve(Response.json({ data: CTE_BATCH_ITEMS }))
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
      newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
      newSubmitIdempotencyKey: () => SYNTHETIC_SUBMIT_KEY,
    })

    expect(await client.listItems(CTE_BATCH_ID)).toEqual(CTE_BATCH_ITEMS)

    const itemsRequest = requests[0]
    if (itemsRequest === undefined) throw new Error('CTE_BATCH_CONTRACT_REQUEST_MISSING')
    expect(itemsRequest.url).toBe(`https://api.example.test/cte-batches/${CTE_BATCH_ID}/items`)
    expect(itemsRequest.method).toBe('GET')
    expect(itemsRequest.cache).toBe('no-store')
    expect(itemsRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(itemsRequest.headers.get('idempotency-key')).toBeNull()
  })

  test('keeps the item envelope strict against tenant and fiscal payload leakage', async () => {
    const { createCteBatchItemsAdapter } = await loadFutureModule<CteBatchItemsModule>(ITEMS_MODULE)
    const itemsFromApi = createCteBatchItemsAdapter()

    expect(itemsFromApi({ data: CTE_BATCH_ITEMS })).toEqual(CTE_BATCH_ITEMS)
    expect(itemsFromApi({ data: [] })).toEqual([])
    expect(
      (
        itemsFromApi({ data: [CTE_BATCH_AUTHORIZED_ITEM] }) as readonly Record<string, unknown>[]
      )[0]?.['fiscalDocumentId'],
    ).toBe(CTE_FISCAL_DOCUMENT_ID)
    expect(() =>
      itemsFromApi({ data: [{ ...CTE_BATCH_AUTHORIZED_ITEM, companyId: 'forbidden-company' }] }),
    ).toThrow('CTE_BATCH_INVALID_ITEMS_RESPONSE')
    expect(() =>
      itemsFromApi({ data: [{ ...CTE_BATCH_AUTHORIZED_ITEM, xml: '<cteProc />' }] }),
    ).toThrow('CTE_BATCH_INVALID_ITEMS_RESPONSE')
    expect(() =>
      itemsFromApi({
        data: [
          {
            ...CTE_BATCH_REJECTED_ITEM,
            documents: [{ ...REFERENCE_DOCUMENT, xml: '<nfeProc />' }],
          },
        ],
      }),
    ).toThrow('CTE_BATCH_INVALID_ITEMS_RESPONSE')
    expect(() =>
      itemsFromApi({ data: [{ ...CTE_BATCH_REJECTED_ITEM, totalAmount: 43.13 }] }),
    ).toThrow('CTE_BATCH_INVALID_ITEMS_RESPONSE')
    expect(() => itemsFromApi({ data: {} })).toThrow('CTE_BATCH_INVALID_ITEMS_RESPONSE')
    expect(() =>
      itemsFromApi({ data: [{ ...CTE_BATCH_AUTHORIZED_ITEM, fiscalDocumentId: 42 }] }),
    ).toThrow('CTE_BATCH_INVALID_ITEMS_RESPONSE')
    expect(() => itemsFromApi({ items: CTE_BATCH_ITEMS })).toThrow(
      'CTE_BATCH_INVALID_ITEMS_RESPONSE',
    )
  })

  test('sorts by header and filters batches by multiple statuses, name and item range', async () => {
    const {
      EMPTY_CTE_BATCH_FILTERS,
      batchMatchesFilters,
      countActiveFilters,
      nextSortState,
      sortBatches,
    } = await loadFutureModule<CteBatchTableModule>(TABLE_MODULE)

    expect(nextSortState(null, 'name')).toEqual({ column: 'name', direction: 'asc' })
    expect(nextSortState({ column: 'name', direction: 'asc' }, 'name')).toEqual({
      column: 'name',
      direction: 'desc',
    })
    expect(nextSortState({ column: 'name', direction: 'desc' }, 'name')).toBeNull()
    expect(nextSortState({ column: 'name', direction: 'desc' }, 'itemCount')).toEqual({
      column: 'itemCount',
      direction: 'asc',
    })

    expect(sortBatches(BATCHES, null)).toEqual(BATCHES)
    expect(sortBatches(BATCHES, { column: 'itemCount', direction: 'desc' })[0]?.id).toBe(
      CTE_DONE_BATCH.id,
    )
    expect(sortBatches(BATCHES, { column: 'createdAt', direction: 'asc' })[0]?.id).toBe(
      CTE_BATCH.id,
    )
    expect(sortBatches(BATCHES, { column: 'name', direction: 'asc' })[0]?.id).toBe(
      CTE_DONE_BATCH.id,
    )

    expect(countActiveFilters(EMPTY_CTE_BATCH_FILTERS)).toBe(0)
    expect(batchMatchesFilters(CTE_BATCH, EMPTY_CTE_BATCH_FILTERS)).toBe(true)

    const statusFilters = { ...EMPTY_CTE_BATCH_FILTERS, statuses: ['done', 'error'] }
    expect(countActiveFilters(statusFilters)).toBe(1)
    expect(batchMatchesFilters(CTE_BATCH, statusFilters)).toBe(false)
    expect(batchMatchesFilters(CTE_DONE_BATCH, statusFilters)).toBe(true)

    const nameFilters = { ...EMPTY_CTE_BATCH_FILTERS, nameContains: 'JULHO' }
    expect(batchMatchesFilters(CTE_BATCH, nameFilters)).toBe(true)
    expect(batchMatchesFilters(CTE_DONE_BATCH, nameFilters)).toBe(false)

    const rangeFilters = { ...EMPTY_CTE_BATCH_FILTERS, itemCountFrom: '2', itemCountTo: '4' }
    expect(countActiveFilters(rangeFilters)).toBe(2)
    expect(batchMatchesFilters(CTE_BATCH, rangeFilters)).toBe(false)
    expect(batchMatchesFilters(CTE_DONE_BATCH, rangeFilters)).toBe(true)

    const createdFilters = { ...EMPTY_CTE_BATCH_FILTERS, createdFrom: '2026-08-01' }
    expect(batchMatchesFilters(CTE_BATCH, createdFilters)).toBe(false)
    expect(batchMatchesFilters(CTE_DONE_BATCH, createdFilters)).toBe(true)
  })

  test('evaluates nested and/or advanced groups and stays neutral without values', async () => {
    const {
      CTE_BATCH_CONDITION_FIELD_TYPE,
      CTE_BATCH_OPERATORS_BY_TYPE,
      applyConditionChanges,
      countActiveConditions,
      createAdvancedFilterModel,
      evaluateAdvancedFilter,
    } = await loadFutureModule<CteBatchAdvancedModule>(ADVANCED_MODULE)

    let sequence = 0
    const emptyModel = createAdvancedFilterModel(() => `id-${(sequence += 1)}`)
    expect(countActiveConditions(emptyModel)).toBe(0)
    expect(evaluateAdvancedFilter(CTE_BATCH, emptyModel)).toBe(true)

    expect(countActiveConditions(ADVANCED_MODEL)).toBe(3)
    expect(evaluateAdvancedFilter(CTE_DONE_BATCH, ADVANCED_MODEL)).toBe(true)
    expect(evaluateAdvancedFilter(CTE_BATCH, ADVANCED_MODEL)).toBe(true)
    expect(evaluateAdvancedFilter(CTE_SUBMITTED_BATCH, ADVANCED_MODEL)).toBe(true)
    expect(evaluateAdvancedFilter(CTE_DONE_BATCH, { ...ADVANCED_MODEL, connector: 'and' })).toBe(
      false,
    )
    expect(
      evaluateAdvancedFilter(CTE_SUBMITTED_BATCH, { ...ADVANCED_MODEL, connector: 'and' }),
    ).toBe(false)

    const neutralModel = {
      connector: 'or',
      groups: [{ ...PRIMARY_GROUP, conditions: [{ ...STATUS_CONDITION, value: '' }] }],
    }
    expect(countActiveConditions(neutralModel)).toBe(0)
    expect(evaluateAdvancedFilter(CTE_SUBMITTED_BATCH, neutralModel)).toBe(true)

    expect(CTE_BATCH_CONDITION_FIELD_TYPE.createdAt).toBe('date')
    expect(CTE_BATCH_CONDITION_FIELD_TYPE.status).toBe('option')
    expect(CTE_BATCH_OPERATORS_BY_TYPE.date).toContain('between')
    expect(CTE_BATCH_OPERATORS_BY_TYPE.option).not.toContain('contains')

    expect(applyConditionChanges(NAME_CONDITION, { field: 'createdAt' })).toEqual({
      field: 'createdAt',
      id: NAME_CONDITION.id,
      operator: 'between',
      value: '',
      valueTo: '',
    })
    expect(applyConditionChanges(NAME_CONDITION, { value: 'agosto' })).toEqual({
      ...NAME_CONDITION,
      value: 'agosto',
    })
  })

  test('persists column order and visibility while degrading on unavailable storage', async () => {
    const {
      CTE_BATCH_COLUMNS_STORAGE_KEY,
      CTE_BATCH_COLUMN_KEYS,
      readColumnPreferences,
      reorderColumns,
      writeColumnPreferences,
    } = await loadFutureModule<CteBatchTableModule>(TABLE_MODULE)

    const firstColumn = CTE_BATCH_COLUMN_KEYS[0]
    const secondColumn = CTE_BATCH_COLUMN_KEYS[1]
    if (firstColumn === undefined || secondColumn === undefined) {
      throw new Error('CTE_BATCH_CONTRACT_COLUMN_MISSING')
    }
    const movedOrder = reorderColumns(CTE_BATCH_COLUMN_KEYS, firstColumn, 'down')
    expect(reorderColumns(CTE_BATCH_COLUMN_KEYS, firstColumn, 'up')).toEqual(CTE_BATCH_COLUMN_KEYS)
    expect(movedOrder[0]).toBe(secondColumn)
    expect(movedOrder[1]).toBe(firstColumn)
    expect(CTE_BATCH_COLUMN_KEYS[0]).toBe(firstColumn)

    const storage = new Map<string, string>()
    const memoryStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    }
    writeColumnPreferences({
      preferences: {
        order: movedOrder,
        visibility: { ...allVisible(CTE_BATCH_COLUMN_KEYS), [secondColumn]: false },
      },
      storage: memoryStorage,
    })
    expect(storage.has(CTE_BATCH_COLUMNS_STORAGE_KEY)).toBe(true)
    const restored = readColumnPreferences(memoryStorage)
    expect(restored.order[0]).toBe(secondColumn)
    expect(restored.visibility[secondColumn]).toBe(false)
    expect(restored.visibility[firstColumn]).toBe(true)

    storage.set(CTE_BATCH_COLUMNS_STORAGE_KEY, JSON.stringify({ order: ['ghost', firstColumn] }))
    const sanitized = readColumnPreferences(memoryStorage)
    expect(sanitized.order).toEqual([
      firstColumn,
      ...CTE_BATCH_COLUMN_KEYS.filter((column) => column !== firstColumn),
    ])
    expect(sanitized.visibility[firstColumn]).toBe(true)

    const brokenStorage = {
      getItem: (): string => {
        throw new Error('QuotaExceededError')
      },
      setItem: (): void => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(readColumnPreferences(brokenStorage).order).toEqual(CTE_BATCH_COLUMN_KEYS)
    expect(readColumnPreferences(null).order).toEqual(CTE_BATCH_COLUMN_KEYS)
    expect(() =>
      writeColumnPreferences({
        preferences: {
          order: CTE_BATCH_COLUMN_KEYS,
          visibility: allVisible(CTE_BATCH_COLUMN_KEYS),
        },
        storage: brokenStorage,
      }),
    ).not.toThrow()
  })

  test('mirrors the SEFAZ xJust boundaries before letting the cancellation leave the browser', async () => {
    const { validateCancellationJustification } =
      await loadFutureModule<CteBatchActionsModule>(ACTIONS_MODULE)

    expect(validateCancellationJustification(CTE_CANCEL_JUSTIFICATION)).toBeNull()
    expect(validateCancellationJustification('   ')).toBe('required')
    expect(validateCancellationJustification('Erro na emissao')).toBeNull()
    expect(validateCancellationJustification('Erro emissao')).toBe('tooShort')
    expect(validateCancellationJustification(`  ${'a'.repeat(14)}  `)).toBe('tooShort')
    expect(validateCancellationJustification('a'.repeat(256))).toBe('tooLong')
  })

  test('gates batch and item actions by permission, status and linked notes', async () => {
    const {
      canCancelBatch,
      canCancelItem,
      canDownloadItem,
      canRemoveItem,
      canReprocessItem,
      canSubmitBatch,
      canTransmitBatch,
      describeItemDocuments,
      summarizeBatchItems,
    } = await loadFutureModule<CteBatchActionsModule>(ACTIONS_MODULE)

    expect(canSubmitBatch({ batch: CTE_BATCH, permissions: [CTE_SUBMIT] })).toBe(true)
    expect(canSubmitBatch({ batch: CTE_BATCH, permissions: [] })).toBe(false)
    expect(canSubmitBatch({ batch: CTE_DONE_BATCH, permissions: [CTE_SUBMIT] })).toBe(false)

    expect(canTransmitBatch({ batch: CTE_SUBMITTED_BATCH, permissions: [CTE_SUBMIT] })).toBe(true)
    expect(canTransmitBatch({ batch: CTE_DONE_BATCH, permissions: [CTE_SUBMIT] })).toBe(false)
    expect(canTransmitBatch({ batch: CTE_SUBMITTED_BATCH, permissions: [CTE_MANAGE] })).toBe(false)

    expect(canCancelBatch({ batch: CTE_BATCH, permissions: [CTE_MANAGE] })).toBe(true)
    expect(canCancelBatch({ batch: CTE_SUBMITTED_BATCH, permissions: [CTE_MANAGE] })).toBe(true)
    expect(canCancelBatch({ batch: CTE_DONE_BATCH, permissions: [CTE_MANAGE] })).toBe(false)
    expect(canCancelBatch({ batch: CTE_BATCH, permissions: [CTE_SUBMIT] })).toBe(false)

    expect(canReprocessItem({ item: CTE_BATCH_REJECTED_ITEM, permissions: [CTE_SUBMIT] })).toBe(
      true,
    )
    expect(canReprocessItem({ item: CTE_BATCH_AUTHORIZED_ITEM, permissions: [CTE_SUBMIT] })).toBe(
      false,
    )
    expect(canReprocessItem({ item: CTE_BATCH_REJECTED_ITEM, permissions: [] })).toBe(false)

    expect(canDownloadItem({ item: CTE_BATCH_AUTHORIZED_ITEM, permissions: [CTE_SUBMIT] })).toBe(
      true,
    )
    expect(canDownloadItem({ item: CTE_BATCH_REJECTED_ITEM, permissions: [CTE_SUBMIT] })).toBe(
      false,
    )

    expect(canRemoveItem({ batch: CTE_BATCH, permissions: [CTE_MANAGE] })).toBe(true)
    expect(canRemoveItem({ batch: CTE_SUBMITTED_BATCH, permissions: [CTE_MANAGE] })).toBe(false)
    expect(canRemoveItem({ batch: CTE_DONE_BATCH, permissions: [CTE_MANAGE] })).toBe(false)
    expect(canRemoveItem({ batch: CTE_BATCH, permissions: [CTE_SUBMIT] })).toBe(false)

    expect(canCancelItem({ item: CTE_BATCH_AUTHORIZED_ITEM, permissions: [CTE_CANCEL] })).toBe(true)
    expect(canCancelItem({ item: CTE_BATCH_AUTHORIZED_ITEM, permissions: [CTE_SUBMIT] })).toBe(
      false,
    )
    expect(canCancelItem({ item: CTE_BATCH_REJECTED_ITEM, permissions: [CTE_CANCEL] })).toBe(false)
    expect(canCancelItem({ item: CTE_BATCH_CANCELLED_ITEM, permissions: [CTE_CANCEL] })).toBe(false)
    expect(canCancelItem({ item: CTE_BATCH_UNPROTOCOLED_ITEM, permissions: [CTE_CANCEL] })).toBe(
      false,
    )

    expect(describeItemDocuments(CTE_BATCH_AUTHORIZED_ITEM)).toEqual([
      { accessKey: CTE_REFERENCE_ACCESS_KEY, id: CTE_DOCUMENT_ID, label: '001/000000022' },
      { accessKey: CTE_SECOND_ACCESS_KEY, id: CTE_SECOND_DOCUMENT_ID, label: '001/000000023' },
    ])

    expect(summarizeBatchItems(CTE_BATCH_ITEMS)).toEqual({
      authorizedCount: 1,
      documentCount: 3,
      pendingCount: 0,
      rejectedCount: 1,
      totalAmount: '90.76',
    })
    expect(summarizeBatchItems([])).toEqual({
      authorizedCount: 0,
      documentCount: 0,
      pendingCount: 0,
      rejectedCount: 0,
      totalAmount: '0.00',
    })
  })
})

function allVisible(columns: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(columns.map((column) => [column, true]))
}

type CteBatchClientModule = {
  readonly createCteBatchClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
    readonly newIdempotencyKey: () => string
    readonly newSubmitIdempotencyKey: () => string
  }) => { readonly listItems: (batchId: string) => Promise<unknown> }
}

type CteBatchItemsModule = {
  readonly createCteBatchItemsAdapter: () => (input: unknown) => unknown
}

type SortState = { readonly column: string; readonly direction: 'asc' | 'desc' } | null

type ColumnPreferences = {
  readonly order: readonly string[]
  readonly visibility: Readonly<Record<string, boolean>>
}

type StorageAccessor = {
  readonly getItem: (key: string) => null | string
  readonly setItem: (key: string, value: string) => void
}

type CteBatchTableModule = {
  readonly CTE_BATCH_COLUMNS_STORAGE_KEY: string
  readonly CTE_BATCH_COLUMN_KEYS: readonly string[]
  readonly EMPTY_CTE_BATCH_FILTERS: Record<string, unknown>
  readonly batchMatchesFilters: (batch: unknown, filters: unknown) => boolean
  readonly countActiveFilters: (filters: unknown) => number
  readonly nextSortState: (current: SortState, column: string) => SortState
  readonly readColumnPreferences: (storage: StorageAccessor | null) => ColumnPreferences
  readonly reorderColumns: (
    order: readonly string[],
    column: string,
    direction: 'down' | 'up',
  ) => readonly string[]
  readonly sortBatches: (
    batches: readonly unknown[],
    sort: SortState,
  ) => readonly { readonly id: string }[]
  readonly writeColumnPreferences: (input: {
    readonly preferences: ColumnPreferences
    readonly storage: StorageAccessor | null
  }) => void
}

type AdvancedCondition = {
  readonly field: string
  readonly id: string
  readonly operator: string
  readonly value: string
  readonly valueTo: string
}

type CteBatchAdvancedModule = {
  readonly CTE_BATCH_CONDITION_FIELD_TYPE: Readonly<Record<string, string>>
  readonly CTE_BATCH_OPERATORS_BY_TYPE: Readonly<Record<string, readonly string[]>>
  readonly applyConditionChanges: (
    condition: AdvancedCondition,
    changes: Readonly<Partial<AdvancedCondition>>,
  ) => AdvancedCondition
  readonly countActiveConditions: (model: unknown) => number
  readonly createAdvancedFilterModel: (nextId: () => string) => unknown
  readonly evaluateAdvancedFilter: (batch: unknown, model: unknown) => boolean
}

type CteBatchActionsModule = {
  readonly canCancelBatch: (input: {
    readonly batch: unknown
    readonly permissions: readonly string[]
  }) => boolean
  readonly canCancelItem: (input: {
    readonly item: unknown
    readonly permissions: readonly string[]
  }) => boolean
  readonly canRemoveItem: (input: {
    readonly batch: unknown
    readonly permissions: readonly string[]
  }) => boolean
  readonly validateCancellationJustification: (value: string) => null | string
  readonly canDownloadItem: (input: {
    readonly item: unknown
    readonly permissions: readonly string[]
  }) => boolean
  readonly canReprocessItem: (input: {
    readonly item: unknown
    readonly permissions: readonly string[]
  }) => boolean
  readonly canSubmitBatch: (input: {
    readonly batch: unknown
    readonly permissions: readonly string[]
  }) => boolean
  readonly canTransmitBatch: (input: {
    readonly batch: unknown
    readonly permissions: readonly string[]
  }) => boolean
  readonly describeItemDocuments: (item: unknown) => readonly unknown[]
  readonly summarizeBatchItems: (items: readonly unknown[]) => unknown
}
