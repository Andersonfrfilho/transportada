/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './nfse-invoice.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const CURSOR_MODULE = '../../src/modules/shared/cursorPagination.service'
const CTE_SELECTION_MODULE = '../../src/modules/cte-batch/shared/cteBatchItemSelection.service'
const TABLE_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceTable.service'
const ADVANCED_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceAdvancedFilter.service'

const CURSOR_SERVICE_PATH = 'src/modules/shared/cursorPagination.service.ts'
const CTE_SELECTION_PATH = 'src/modules/cte-batch/shared/cteBatchItemSelection.service.ts'
const HOOK_PATH = 'src/modules/nfse-invoice/hooks/useNfseInvoiceTable.hook.ts'
const TABLE_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceTable.component.tsx'
const FILTERS_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceFilters.component.tsx'
const COLUMNS_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceColumnsMenu.component.tsx'
const PAGINATION_PATH = 'src/modules/nfse-invoice/components/NfseInvoicePagination.component.tsx'
const SELECTION_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceSelectionBar.component.tsx'
const BUILDER_PATH =
  'src/modules/nfse-invoice/components/NfseInvoiceAdvancedFilterBuilder.component.tsx'
const PAGE_PATH = 'src/modules/nfse-invoice/pages/NfseInvoiceWorkspace.page.tsx'
const STYLE_PATH = 'src/modules/nfse-invoice/styles/nfseInvoice.module.css'
const PT_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.locale.json'
const EN_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.en.locale.json'

const FIRST_CURSOR = 'cursor-page-two'
const SECOND_CURSOR = 'cursor-page-three'

type CursorPage = Readonly<{ cursor: null | string; history: readonly (null | string)[] }>

type CursorModule = {
  readonly FIRST_CURSOR_PAGE: CursorPage
  readonly canGoToPreviousCursorPage: (state: CursorPage) => boolean
  readonly nextCursorPage: (state: CursorPage, nextCursor: null | string) => CursorPage
  readonly previousCursorPage: (state: CursorPage) => CursorPage
}

type CteSelectionModule = {
  readonly CTE_ITEM_FIRST_PAGE: CursorPage
  readonly canGoToPreviousCteItemPage: (state: CursorPage) => boolean
  readonly nextCteItemPage: (state: CursorPage, nextCursor: null | string) => CursorPage
  readonly previousCteItemPage: (state: CursorPage) => CursorPage
}

type TableModule = {
  readonly NFSE_INVOICE_COLUMN_KEYS: readonly string[]
}

type AdvancedModule = {
  readonly NFSE_INVOICE_CONDITION_FIELDS: readonly string[]
  readonly NFSE_INVOICE_OPERATORS_BY_TYPE: Readonly<Record<string, readonly string[]>>
}

/**
 * A paginação por cursor guarda o caminho de volta: sem a pilha, "anterior" só sabe voltar para a
 * primeira página, e quem estava na terceira perde duas.
 */
describe('cursor pagination contract', () => {
  test('walks forward keeping the way back and lands on the first page again', async () => {
    const cursor = await loadFutureModule<CursorModule>(CURSOR_MODULE)

    const second = cursor.nextCursorPage(cursor.FIRST_CURSOR_PAGE, FIRST_CURSOR)
    const third = cursor.nextCursorPage(second, SECOND_CURSOR)

    expect(third.cursor).toBe(SECOND_CURSOR)
    expect(cursor.canGoToPreviousCursorPage(third)).toBe(true)
    expect(cursor.previousCursorPage(third).cursor).toBe(FIRST_CURSOR)
    expect(cursor.previousCursorPage(cursor.previousCursorPage(third))).toEqual(
      cursor.FIRST_CURSOR_PAGE,
    )
    expect(cursor.canGoToPreviousCursorPage(cursor.FIRST_CURSOR_PAGE)).toBe(false)
  })

  test('refuses to advance past the last page', async () => {
    const cursor = await loadFutureModule<CursorModule>(CURSOR_MODULE)
    const second = cursor.nextCursorPage(cursor.FIRST_CURSOR_PAGE, FIRST_CURSOR)

    expect(cursor.nextCursorPage(second, null)).toEqual(second)
  })

  /** Duas tabelas com a mesma pilha de cursor não podem ser duas cópias do mesmo bloco. */
  test('the CT-e item table delegates its paging to the shared service', async () => {
    const [cursor, cteSelection, source] = await Promise.all([
      loadFutureModule<CursorModule>(CURSOR_MODULE),
      loadFutureModule<CteSelectionModule>(CTE_SELECTION_MODULE),
      readApplicationFile(CTE_SELECTION_PATH),
    ])

    expect(cteSelection.CTE_ITEM_FIRST_PAGE).toEqual(cursor.FIRST_CURSOR_PAGE)
    expect(cteSelection.nextCteItemPage(cteSelection.CTE_ITEM_FIRST_PAGE, FIRST_CURSOR)).toEqual(
      cursor.nextCursorPage(cursor.FIRST_CURSOR_PAGE, FIRST_CURSOR),
    )
    expect(cteSelection.previousCteItemPage(cteSelection.CTE_ITEM_FIRST_PAGE)).toEqual(
      cursor.FIRST_CURSOR_PAGE,
    )
    expect(cteSelection.canGoToPreviousCteItemPage(cteSelection.CTE_ITEM_FIRST_PAGE)).toBe(false)

    expect(source).toContain("from '@/modules/shared/cursorPagination.service'")
    expect(source).not.toContain('history: [...state.history')
  })

  test('keeps the shared page state opaque to whoever renders it', async () => {
    const source = await readApplicationFile(CURSOR_SERVICE_PATH)

    expect(source).toContain('export type CursorPageState')
    expect(source).not.toContain('CteItem')
    expect(source).not.toContain('Nfse')
  })
})

describe('nfse invoice table hook contract', () => {
  test('owns the cursor, the filters and the selection instead of the read-only list hook', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain('FIRST_CURSOR_PAGE')
    expect(hook).toContain('nextCursorPage')
    expect(hook).toContain('previousCursorPage')
    expect(hook).toContain('canGoToPreviousCursorPage')
    expect(hook).toContain('serializeNfseInvoiceQuery')
    expect(hook).toContain('NFSE_INVOICES_QUERY_KEY')
    expect(hook).toContain('getNfseInvoiceClient')
    expect(hook).toContain('sumNfseInvoiceServiceAmount')
  })

  /** Trocar filtro ou ordenação com cursor antigo na mão pagina um resultado que não existe mais. */
  test('restarts the pagination whenever the query behind it changes', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain('restartPagination')
    expect(hook.match(/restartPagination\(\)/g) ?? []).not.toHaveLength(0)
    expect(hook).toContain('clearFilterField')
    expect(hook).toContain('clearFilters')
    expect(hook).toContain('toggleStatus')
    expect(hook).toContain('toggleSort')
  })

  test('carries the selection across pages and lets the toolbar count what is filtering', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain('knownInvoices')
    expect(hook).toContain('toggleAllSelection')
    expect(hook).toContain('clearSelection')
    expect(hook).toContain('countActiveNfseInvoiceFilters')
    expect(hook).toContain('countActiveNfseConditions')
    expect(hook).toContain('evaluateNfseAdvancedFilter')
    expect(hook).toContain('filterMode')
  })

  test('persists the column layout through the shared storage seam', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain('readNfseInvoiceColumnPreferences')
    expect(hook).toContain('writeNfseInvoiceColumnPreferences')
    expect(hook).toContain('reorderNfseInvoiceColumns')
    /** Servidor não tem `window`: ler o armazenamento no módulo quebraria o build de SSR. */
    expect(hook).toContain("typeof window === 'undefined'")
  })
})

describe('nfse invoice table presentation contract', () => {
  test('renders the table through the design system and never through raw markup', async () => {
    const sources = await Promise.all(
      [TABLE_PATH, FILTERS_PATH, COLUMNS_PATH, PAGINATION_PATH, SELECTION_PATH, BUILDER_PATH].map(
        (path) => readApplicationFile(path),
      ),
    )

    for (const source of sources) {
      expect(source).toContain('useTranslation')
      expect(source).not.toContain('<svg')
      expect(source).not.toContain('<select')
      expect(source).not.toContain('type="checkbox"')
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    }
  })

  test('announces sorting, collapsed filters and the column menu to the reader', async () => {
    const [table, filters, columns] = await Promise.all([
      readApplicationFile(TABLE_PATH),
      readApplicationFile(FILTERS_PATH),
      readApplicationFile(COLUMNS_PATH),
    ])

    expect(table).toContain('aria-sort')
    expect(table).toContain('aria-expanded')
    expect(table).toContain("from '@/components/ui/count-badge'")
    expect(table).toContain("from '@/components/ui/filter-pills'")
    expect(table).toContain('countFilterPills')
    expect(table).toContain('describeNfseInvoiceFilterPills')
    expect(table).toContain("from '@/components/ui/checkbox'")
    expect(table).toContain("from '@/components/ui/skeleton'")
    expect(table).toContain('table.counter')
    expect(filters).toContain("from '@/components/ui/select'")
    expect(filters).toContain('filters.')
    expect(columns).toContain('columnsMenu.')
  })

  test('pages by cursor and totals the selection as decimal money', async () => {
    const [pagination, selection] = await Promise.all([
      readApplicationFile(PAGINATION_PATH),
      readApplicationFile(SELECTION_PATH),
    ])

    expect(pagination).toContain('table.previousPage')
    expect(pagination).toContain('table.nextPage')
    expect(selection).toContain('formatAmount')
    expect(selection).not.toContain('Number(')
    expect(selection).not.toContain('parseFloat')
  })

  test('builds nested groups with a connector on both levels', async () => {
    const builder = await readApplicationFile(BUILDER_PATH)

    expect(builder).toContain('setGroupConnector')
    expect(builder).toContain('setModelConnector')
    expect(builder).toContain('addGroupCondition')
    expect(builder).toContain('addConditionGroup')
    expect(builder).toContain('operatorsForNfseField')
  })

  test('lands the table on the workspace instead of the placeholder paragraph', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('NfseInvoiceTable')
    expect(page).toContain('useNfseInvoiceTable')
    expect(page).not.toContain('list.total')
  })
})

describe('nfse invoice table style contract', () => {
  test('scrolls the table inside its own box and zebras the rows from the tokens', async () => {
    const styles = await readApplicationFile(STYLE_PATH)

    expect(styles).toContain('.tableScroll')
    expect(styles).toContain('overflow-x: auto')
    expect(styles).toContain('.dataTable tbody tr:nth-child(even)')
    expect(styles).toContain('.sortButton')
    expect(styles).toContain('.srOnly')
    expect(styles).toContain('.columnsPopover')
    expect(styles).toContain('.bulkBar')
    expect(styles).toContain('.pagination')
    expect(styles).toContain('.conditionGroup')
  })

  /** O celular é o pior caso: campo estreito demais e alvo de toque pequeno demais só aparecem lá. */
  test('collapses the filter grid on the narrow screen', async () => {
    const styles = await readApplicationFile(STYLE_PATH)

    expect(styles).toContain('.fieldGrid')
    expect(styles).toMatch(/@media \(width >= 40rem\)/)
    expect(styles).not.toMatch(/max-width:\s*\d/)
  })
})

describe('nfse invoice table locales contract', () => {
  test('names every column, every condition field and every operator in both languages', async () => {
    const [tableService, advanced, portuguese, english] = await Promise.all([
      loadFutureModule<TableModule>(TABLE_MODULE),
      loadFutureModule<AdvancedModule>(ADVANCED_MODULE),
      readLocaleKeys(PT_LOCALE_PATH),
      readLocaleKeys(EN_LOCALE_PATH),
    ])
    const operators = new Set(Object.values(advanced.NFSE_INVOICE_OPERATORS_BY_TYPE).flat())

    for (const column of tableService.NFSE_INVOICE_COLUMN_KEYS) {
      expect(portuguese).toContain(`columns.${column}`)
      expect(english).toContain(`columns.${column}`)
    }
    for (const field of advanced.NFSE_INVOICE_CONDITION_FIELDS) {
      expect(portuguese).toContain(`field.${field}`)
      expect(english).toContain(`field.${field}`)
    }
    for (const operator of operators) {
      expect(portuguese).toContain(`operator.${operator}`)
      expect(english).toContain(`operator.${operator}`)
    }
    for (const connector of ['and', 'or']) {
      expect(portuguese).toContain(`connector.${connector}`)
      expect(english).toContain(`connector.${connector}`)
    }
  })

  test('publishes the phrases the toolbar, the pills and the pagination read', async () => {
    const portuguese = await readLocaleKeys(PT_LOCALE_PATH)

    for (const key of [
      'filters.createdRange',
      'filters.statuses',
      'filters.takerTaxId',
      'table.clearFilters',
      'table.clearSelection',
      'table.columnsMenu',
      'table.counter',
      'table.empty',
      'table.nextPage',
      'table.pageSize',
      'table.previousPage',
      'table.selectAll',
      'table.selectionTotal',
      'table.toggleFilters',
    ]) {
      expect(portuguese).toContain(key)
    }
  })
})

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readLocaleKeys(filePath: string): Promise<readonly string[]> {
  const locale = JSON.parse(await readApplicationFile(filePath)) as Record<string, unknown>
  return flattenKeys(locale)
}

function flattenKeys(dictionary: Record<string, unknown>, prefix = ''): readonly string[] {
  return Object.entries(dictionary).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`
    return isDictionary(value) ? flattenKeys(value, path) : [path]
  })
}

function isDictionary(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
