/**
 * Contrato da tabela de NFS-e. As capacidades obrigatórias de `docs/frontend/data-tables.md` moram
 * na camada pura — ordenação, filtro simples e avançado, colunas persistidas, pílulas e estado na
 * barra de endereço —, então cada uma se prova sem montar React.
 */
import { describe, expect, test } from 'bun:test'

import {
  AUTHORIZED_INVOICE_LIST_ITEM,
  INVOICE_LIST_ITEM,
  loadFutureModule,
  SYNTHETIC_CURSOR,
} from './nfse-invoice.fixture'

const TABLE_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceTable.service'
const ADVANCED_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceAdvancedFilter.service'
const PILLS_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceFilterPills.service'
const ROUTE_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceRoute.service'
const CREDENTIAL_MODULE = '../../src/modules/nfse-invoice/shared/nfseCredentialForm.service'

type SortState = null | Readonly<{ column: string; direction: 'asc' | 'desc' }>

type TableFilters = Readonly<{
  createdFrom: string
  createdUntil: string
  statuses: readonly string[]
  takerTaxId: string
}>

type ColumnPreferences = Readonly<{
  order: readonly string[]
  visibility: Readonly<Record<string, boolean>>
}>

type ColumnStorage = Readonly<{
  getItem: (key: string) => null | string
  setItem: (key: string, value: string) => void
}>

type InvoiceRow = Readonly<{
  authorizedAt: null | string
  createdAt: string
  documentCount: number
  id: string
  issAmount: string
  providerNumber: null | string
  serviceAmount: string
  status: string
  takerLegalName: string
  takerTaxId: string
}>

type TableModule = Readonly<{
  countActiveNfseInvoiceFilters: (filters: TableFilters) => number
  EMPTY_NFSE_INVOICE_FILTERS: TableFilters
  NFSE_INVOICE_COLUMN_KEYS: readonly string[]
  nextNfseInvoiceSortState: (current: SortState, column: string) => SortState
  readNfseInvoiceColumnPreferences: (storage: ColumnStorage | null) => ColumnPreferences
  reorderNfseInvoiceColumns: (
    order: readonly string[],
    column: string,
    direction: 'down' | 'up',
  ) => readonly string[]
  serializeNfseInvoiceQuery: (
    input: Readonly<{ cursor: null | string; filters: TableFilters; limit: number }>,
  ) => Readonly<{
    cursor: null | string
    filters: Readonly<Record<string, unknown>>
    limit: number
  }>
  sortNfseInvoices: (invoices: readonly InvoiceRow[], sort: SortState) => readonly InvoiceRow[]
  sumNfseInvoiceServiceAmount: (invoices: readonly InvoiceRow[]) => string
  toggleNfseInvoiceStatus: (statuses: readonly string[], status: string) => readonly string[]
  writeNfseInvoiceColumnPreferences: (
    input: Readonly<{ preferences: ColumnPreferences; storage: ColumnStorage | null }>,
  ) => void
}>

type Condition = Readonly<{
  field: string
  id: string
  operator: string
  value: string
  valueTo: string
}>

type ConditionGroup = Readonly<{
  conditions: readonly Condition[]
  connector: 'and' | 'or'
  id: string
}>

type AdvancedFilterModel = Readonly<{
  connector: 'and' | 'or'
  groups: readonly ConditionGroup[]
}>

type AdvancedModule = Readonly<{
  applyNfseConditionChanges: (condition: Condition, changes: Partial<Condition>) => Condition
  countActiveNfseConditions: (model: AdvancedFilterModel) => number
  createNfseAdvancedFilterModel: (nextId: () => string) => AdvancedFilterModel
  createNfseCondition: (id: string) => Condition
  createNfseConditionGroup: (nextId: () => string) => ConditionGroup
  evaluateNfseAdvancedFilter: (invoice: InvoiceRow, model: AdvancedFilterModel) => boolean
  NFSE_INVOICE_CONDITION_FIELD_TYPE: Readonly<Record<string, string>>
  NFSE_INVOICE_OPERATORS_BY_TYPE: Readonly<Record<string, readonly string[]>>
}>

type FilterPill = Readonly<{
  field: string
  labelKey: string
  value: string
  valueKeys?: readonly string[]
}>

type PillsModule = Readonly<{
  clearNfseInvoiceFilterField: (
    input: Readonly<{ field: string; filters: TableFilters }>,
  ) => TableFilters
  describeNfseInvoiceFilterPills: (
    input: Readonly<{ filters: TableFilters; formatDay: (value: string) => string }>,
  ) => readonly FilterPill[]
  NFSE_INVOICE_PILL_FIELDS: readonly string[]
}>

type TableSearchState = Readonly<{
  cursor: null | string
  filters: TableFilters
  sort: SortState
}>

type RouteModule = Readonly<{
  parseNfseInvoiceTableSearch: (search: string) => TableSearchState
  serializeNfseInvoiceTableSearch: (state: TableSearchState) => string
}>

type CredentialDraft = Readonly<{
  apiToken: string
  fiscalEnvironment: string
  municipalRegistration: string
  status: string
  taxId: string
}>

type CredentialSubmission =
  | Readonly<{ body: Readonly<Record<string, unknown>>; status: 'ready' }>
  | Readonly<{ reason: string; status: 'blocked' }>

type CredentialModule = Readonly<{
  buildNfseCredentialSubmission: (draft: CredentialDraft) => CredentialSubmission
  EMPTY_NFSE_CREDENTIAL_DRAFT: CredentialDraft
  toNfseCredentialDraft: (summary: unknown) => CredentialDraft
}>

const PENDING_INVOICE: InvoiceRow = INVOICE_LIST_ITEM
const AUTHORIZED_INVOICE: InvoiceRow = AUTHORIZED_INVOICE_LIST_ITEM
const CHEAPER_INVOICE: InvoiceRow = { ...PENDING_INVOICE, id: 'cheaper', serviceAmount: '90.1000' }
const PRICIER_INVOICE: InvoiceRow = { ...PENDING_INVOICE, id: 'pricier', serviceAmount: '672.22' }

function createStorage(seed?: string): ColumnStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key: string): null | string => values.get(key) ?? seed ?? null,
    setItem: (key: string, value: string): void => {
      values.set(key, value)
    },
  }
}

async function loadTable(): Promise<TableModule> {
  return loadFutureModule<TableModule>(TABLE_MODULE)
}

function filtersWith(base: TableFilters, overrides: Partial<TableFilters>): TableFilters {
  return { ...base, ...overrides }
}

describe('nfse invoice table sorting', () => {
  test('cycles header sorting asc, desc and neutral', async () => {
    const table = await loadTable()
    const first = table.nextNfseInvoiceSortState(null, 'serviceAmount')
    const second = table.nextNfseInvoiceSortState(first, 'serviceAmount')
    const third = table.nextNfseInvoiceSortState(second, 'serviceAmount')

    expect(first).toEqual({ column: 'serviceAmount', direction: 'asc' })
    expect(second).toEqual({ column: 'serviceAmount', direction: 'desc' })
    expect(third).toBeNull()
  })

  test('restarts ascending when the column changes', async () => {
    const table = await loadTable()
    const sort = table.nextNfseInvoiceSortState(
      { column: 'status', direction: 'desc' },
      'createdAt',
    )

    expect(sort).toEqual({ column: 'createdAt', direction: 'asc' })
  })

  test('keeps the server order while sorting is neutral', async () => {
    const table = await loadTable()
    const invoices = [PRICIER_INVOICE, CHEAPER_INVOICE]

    expect(table.sortNfseInvoices(invoices, null)).toEqual(invoices)
  })

  /** Dinheiro é string decimal: comparar como texto poria `'672.22'` antes de `'90.1000'`. */
  test('sorts money by decimal scale instead of text or float', async () => {
    const table = await loadTable()
    const ordered = table.sortNfseInvoices([PRICIER_INVOICE, CHEAPER_INVOICE], {
      column: 'serviceAmount',
      direction: 'asc',
    })

    expect(ordered.map((invoice) => invoice.id)).toEqual(['cheaper', 'pricier'])
  })

  test('sums the selection with decimal scale', async () => {
    const table = await loadTable()

    expect(table.sumNfseInvoiceServiceAmount([CHEAPER_INVOICE, PRICIER_INVOICE])).toBe('762.3200')
  })
})

describe('nfse invoice simple filters', () => {
  test('accepts many statuses at once', async () => {
    const table = await loadTable()
    const withOne = table.toggleNfseInvoiceStatus(
      table.EMPTY_NFSE_INVOICE_FILTERS.statuses,
      'authorized',
    )
    const withTwo = table.toggleNfseInvoiceStatus(withOne, 'rejected')

    expect(withTwo).toEqual(['authorized', 'rejected'])
    expect(table.toggleNfseInvoiceStatus(withTwo, 'authorized')).toEqual(['rejected'])
  })

  test('counts one active filter per filled field', async () => {
    const table = await loadTable()
    const filters = filtersWith(table.EMPTY_NFSE_INVOICE_FILTERS, {
      createdFrom: '2026-08-01',
      statuses: ['authorized', 'rejected'],
      takerTaxId: '11222333000181',
    })

    expect(table.countActiveNfseInvoiceFilters(filters)).toBe(3)
    expect(table.countActiveNfseInvoiceFilters(table.EMPTY_NFSE_INVOICE_FILTERS)).toBe(0)
  })

  /** A listagem recusa chave desconhecida: só o filtro preenchido pode viajar. */
  test('sends nothing to the server while no filter is applied', async () => {
    const table = await loadTable()
    const query = table.serializeNfseInvoiceQuery({
      cursor: null,
      filters: table.EMPTY_NFSE_INVOICE_FILTERS,
      limit: 25,
    })

    expect(query).toEqual({ cursor: null, filters: {}, limit: 25 })
  })

  test('widens the picked days into instants closing the range at the end of the day', async () => {
    const table = await loadTable()
    const query = table.serializeNfseInvoiceQuery({
      cursor: SYNTHETIC_CURSOR,
      filters: filtersWith(table.EMPTY_NFSE_INVOICE_FILTERS, {
        createdFrom: '2026-08-01',
        createdUntil: '2026-08-11',
        statuses: ['authorized'],
        takerTaxId: '11222333000181',
      }),
      limit: 50,
    })

    expect(query).toEqual({
      cursor: SYNTHETIC_CURSOR,
      filters: {
        createdFrom: '2026-08-01T00:00:00.000Z',
        createdUntil: '2026-08-11T23:59:59.999Z',
        statusIn: ['authorized'],
        takerTaxIdEq: '11222333000181',
      },
      limit: 50,
    })
  })
})

describe('nfse invoice advanced filter', () => {
  let sequence = 0
  const nextId = (): string => `nfse-condition-${(sequence += 1)}`

  test('normalizes the operator and clears the value when the field changes', async () => {
    const advanced = await loadFutureModule<AdvancedModule>(ADVANCED_MODULE)
    const condition = { ...advanced.createNfseCondition('c1'), value: 'Sintético' }
    const changed = advanced.applyNfseConditionChanges(condition, { field: 'serviceAmount' })

    expect(advanced.NFSE_INVOICE_CONDITION_FIELD_TYPE.serviceAmount).toBe('number')
    expect(advanced.NFSE_INVOICE_OPERATORS_BY_TYPE.number).toContain(changed.operator)
    expect(changed.value).toBe('')
    expect(changed.valueTo).toBe('')
  })

  test('a condition without a value neither counts nor filters', async () => {
    const advanced = await loadFutureModule<AdvancedModule>(ADVANCED_MODULE)
    const model = advanced.createNfseAdvancedFilterModel(nextId)

    expect(advanced.countActiveNfseConditions(model)).toBe(0)
    expect(advanced.evaluateNfseAdvancedFilter(PENDING_INVOICE, model)).toBe(true)
  })

  test('resolves nested groups as (A and B) or (C)', async () => {
    const advanced = await loadFutureModule<AdvancedModule>(ADVANCED_MODULE)
    const first = advanced.createNfseConditionGroup(nextId)
    const second = advanced.createNfseConditionGroup(nextId)
    const model: AdvancedFilterModel = {
      connector: 'or',
      groups: [
        {
          ...first,
          conditions: [
            {
              ...(first.conditions[0] as Condition),
              field: 'status',
              operator: 'eq',
              value: 'authorized',
            },
            {
              ...advanced.createNfseCondition(nextId()),
              field: 'serviceAmount',
              operator: 'gte',
              value: '600',
            },
          ],
          connector: 'and',
        },
        {
          ...second,
          conditions: [
            {
              ...(second.conditions[0] as Condition),
              field: 'takerLegalName',
              operator: 'contains',
              value: 'inexistente',
            },
          ],
        },
      ],
    }

    expect(advanced.countActiveNfseConditions(model)).toBe(3)
    expect(advanced.evaluateNfseAdvancedFilter(AUTHORIZED_INVOICE, model)).toBe(true)
    expect(advanced.evaluateNfseAdvancedFilter(PENDING_INVOICE, model)).toBe(false)
  })
})

describe('nfse invoice columns', () => {
  test('reordering is pure and does nothing at the edges', async () => {
    const table = await loadTable()
    const order = table.NFSE_INVOICE_COLUMN_KEYS
    const first = order[0] as string
    const last = order[order.length - 1] as string

    expect(table.reorderNfseInvoiceColumns(order, first, 'up')).toEqual(order)
    expect(table.reorderNfseInvoiceColumns(order, last, 'down')).toEqual(order)

    const moved = table.reorderNfseInvoiceColumns(order, first, 'down')

    expect(moved[0]).toBe(order[1] as string)
    expect(moved[1]).toBe(first)
    expect(order[0]).toBe(first)
  })

  test('the preference survives a round trip through storage', async () => {
    const table = await loadTable()
    const storage = createStorage()
    const fallback = table.readNfseInvoiceColumnPreferences(null)
    const preferences: ColumnPreferences = {
      order: table.reorderNfseInvoiceColumns(fallback.order, fallback.order[0] as string, 'down'),
      visibility: { ...fallback.visibility, status: false },
    }

    table.writeNfseInvoiceColumnPreferences({ preferences, storage })

    expect(table.readNfseInvoiceColumnPreferences(storage)).toEqual(preferences)
  })

  /** Sem `window`, ou com lixo gravado, a tabela abre no padrão em vez de quebrar. */
  test('falls back to the default when storage is absent or corrupted', async () => {
    const table = await loadTable()
    const fallback = table.readNfseInvoiceColumnPreferences(null)

    expect(fallback.order).toEqual(table.NFSE_INVOICE_COLUMN_KEYS)
    expect(table.readNfseInvoiceColumnPreferences(createStorage('{'))).toEqual(fallback)
    expect(
      table.readNfseInvoiceColumnPreferences(createStorage('{"order":["inventada"]}')),
    ).toEqual(fallback)
  })
})

describe('nfse invoice filter pills', () => {
  const formatDay = (value: string): string => value.split('-').reverse().join('/')

  test('describes only what is applied, in the declared order', async () => {
    const table = await loadTable()
    const pills = await loadFutureModule<PillsModule>(PILLS_MODULE)
    const filters = filtersWith(table.EMPTY_NFSE_INVOICE_FILTERS, {
      createdFrom: '2026-08-01',
      createdUntil: '2026-08-11',
      statuses: ['authorized'],
      takerTaxId: '11222333000181',
    })

    expect(
      pills.describeNfseInvoiceFilterPills({ filters, formatDay }).map((pill) => pill.field),
    ).toEqual([...pills.NFSE_INVOICE_PILL_FIELDS])
    expect(
      pills.describeNfseInvoiceFilterPills({
        filters: table.EMPTY_NFSE_INVOICE_FILTERS,
        formatDay,
      }),
    ).toEqual([])
  })

  /** O status vira chave de tradução: a pílula não pode mostrar o valor cru do banco. */
  test('exposes translation keys for the selected statuses', async () => {
    const table = await loadTable()
    const pills = await loadFutureModule<PillsModule>(PILLS_MODULE)
    const described = pills.describeNfseInvoiceFilterPills({
      filters: filtersWith(table.EMPTY_NFSE_INVOICE_FILTERS, {
        statuses: ['authorized', 'rejected'],
      }),
      formatDay,
    })

    expect(described[0]?.valueKeys).toEqual(['status.authorized', 'status.rejected'])
  })

  test('removing the period pill clears both ends', async () => {
    const table = await loadTable()
    const pills = await loadFutureModule<PillsModule>(PILLS_MODULE)
    const cleared = pills.clearNfseInvoiceFilterField({
      field: 'createdRange',
      filters: filtersWith(table.EMPTY_NFSE_INVOICE_FILTERS, {
        createdFrom: '2026-08-01',
        createdUntil: '2026-08-11',
      }),
    })

    expect(cleared.createdFrom).toBe('')
    expect(cleared.createdUntil).toBe('')
  })

  test('removing the status pill restores the filter default', async () => {
    const table = await loadTable()
    const pills = await loadFutureModule<PillsModule>(PILLS_MODULE)
    const cleared = pills.clearNfseInvoiceFilterField({
      field: 'statuses',
      filters: filtersWith(table.EMPTY_NFSE_INVOICE_FILTERS, { statuses: ['authorized'] }),
    })

    expect(cleared.statuses).toEqual(table.EMPTY_NFSE_INVOICE_FILTERS.statuses)
  })
})

describe('nfse invoice table state in the address bar', () => {
  test('filters, sorting and pagination survive the query string round trip', async () => {
    const table = await loadTable()
    const route = await loadFutureModule<RouteModule>(ROUTE_MODULE)
    const state: TableSearchState = {
      cursor: SYNTHETIC_CURSOR,
      filters: filtersWith(table.EMPTY_NFSE_INVOICE_FILTERS, {
        createdFrom: '2026-08-01',
        createdUntil: '2026-08-11',
        statuses: ['authorized', 'rejected'],
        takerTaxId: '11222333000181',
      }),
      sort: { column: 'serviceAmount', direction: 'desc' },
    }

    expect(route.parseNfseInvoiceTableSearch(route.serializeNfseInvoiceTableSearch(state))).toEqual(
      state,
    )
  })

  test('a clean table leaves no leftovers in the URL', async () => {
    const table = await loadTable()
    const route = await loadFutureModule<RouteModule>(ROUTE_MODULE)

    expect(
      route.serializeNfseInvoiceTableSearch({
        cursor: null,
        filters: table.EMPTY_NFSE_INVOICE_FILTERS,
        sort: null,
      }),
    ).toBe('')
  })

  test('a made up query string does not break the screen', async () => {
    const table = await loadTable()
    const route = await loadFutureModule<RouteModule>(ROUTE_MODULE)
    const parsed = route.parseNfseInvoiceTableSearch('status=inventado&sort=coluna:torta&taker=abc')

    expect(parsed.filters.statuses).toEqual(table.EMPTY_NFSE_INVOICE_FILTERS.statuses)
    expect(parsed.sort).toBeNull()
    expect(parsed.cursor).toBeNull()
  })
})

describe('nfse credential form', () => {
  /** Campo em branco significa "não mexer": não mandar corpo nenhum é o que impede apagar o segredo. */
  test('blocks the submission while the token is blank instead of erasing it', async () => {
    const credential = await loadFutureModule<CredentialModule>(CREDENTIAL_MODULE)
    const submission = credential.buildNfseCredentialSubmission({
      ...credential.EMPTY_NFSE_CREDENTIAL_DRAFT,
      apiToken: '   ',
      taxId: '11222333000181',
    })

    expect(submission).toEqual({ reason: 'apiTokenRequired', status: 'blocked' })
  })

  test('never sends a callback token chosen by the client', async () => {
    const credential = await loadFutureModule<CredentialModule>(CREDENTIAL_MODULE)
    const submission = credential.buildNfseCredentialSubmission({
      ...credential.EMPTY_NFSE_CREDENTIAL_DRAFT,
      apiToken: 'synthetic-provider-token',
      fiscalEnvironment: 'production',
      municipalRegistration: '1234567',
      taxId: '11222333000181',
    })

    expect(submission.status).toBe('ready')
    if (submission.status !== 'ready') return
    expect(submission.body.apiToken).toBe('synthetic-provider-token')
    expect(Object.keys(submission.body)).not.toContain('callbackToken')
  })

  /** O resumo do servidor não traz segredo; se um dia trouxer, ele não pode entrar no estado da tela. */
  test('drops any token that comes back from the server', async () => {
    const credential = await loadFutureModule<CredentialModule>(CREDENTIAL_MODULE)
    const draft = credential.toNfseCredentialDraft({
      apiToken: 'segredo-que-nao-devia-voltar',
      apiTokenConfigured: true,
      callbackToken: 'segredo-que-nao-devia-voltar',
      callbackTokenConfigured: true,
      fiscalEnvironment: 'production',
      municipalRegistration: '12345',
      status: 'active',
      taxId: '11222333000181',
    })

    expect(draft.apiToken).toBe('')
    expect(JSON.stringify(draft)).not.toContain('segredo-que-nao-devia-voltar')
  })
})
