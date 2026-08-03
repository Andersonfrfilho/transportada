/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const TABLE_COMPONENT_PATH = 'src/modules/billing/components/BillingEligibleTable.component.tsx'
const FILTERS_COMPONENT_PATH = 'src/modules/billing/components/BillingEligibleFilters.component.tsx'
const TABLE_STYLES_PATH = 'src/modules/billing/styles/billingEligibleTable.module.css'
const WORKSPACE_PAGE_PATH = 'src/modules/billing/pages/BillingWorkspace.page.tsx'
const PT_LOCALE_PATH = 'src/modules/billing/locales/billingWorkspace.locale.json'
const EN_LOCALE_PATH = 'src/modules/billing/locales/billingWorkspace.en.locale.json'

/** A ordem é a mesma de `BILLING_ELIGIBLE_COLUMN_KEYS`: a tela não pode inventar coluna própria. */
const COLUMN_KEYS: readonly string[] = [
  'cteNumber',
  'nfeNumber',
  'customerName',
  'customerDocument',
  'batchName',
  'issuedAt',
  'totalAmount',
]

const FILTER_KEYS: readonly string[] = [
  'batchId',
  'cteNumberQuery',
  'customerDocument',
  'customerName',
  'issuedRange',
  'maxAmount',
  'minAmount',
  'nfeNumberQuery',
]

const REQUIRED_ELIGIBLE_KEYS: readonly string[] = [
  'clearFilters',
  'clearSelection',
  'columnsToggle',
  'empty',
  'error',
  'filtersToggle',
  'loading',
  'moveColumnDown',
  'moveColumnUp',
  'multipleCustomers',
  'nextPage',
  'previousPage',
  'resultsCount',
  'selectAll',
  'selectRow',
  'selectedCount',
  'selectedTotal',
  'title',
]

const REQUIRED_ADVANCED_KEYS: readonly string[] = [
  'addCondition',
  'addGroup',
  'connectorAnd',
  'connectorOr',
  'field',
  'operator',
  'removeCondition',
  'removeGroup',
  'title',
  'value',
  'valueTo',
]

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readRuleBody(stylesheet: string, selector: string): string {
  const start = stylesheet.indexOf(`\n${selector} {`)
  if (start < 0) return ''
  return stylesheet.slice(start, stylesheet.indexOf('}', start))
}

function keyPathsOf(value: unknown, prefix: string): readonly string[] {
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`
    return typeof entry === 'string' ? [path] : keyPathsOf(entry, path)
  })
}

async function readLocaleSection(filePath: string): Promise<Record<string, unknown>> {
  const dictionary = JSON.parse(await readApplicationFile(filePath)) as Record<string, unknown>
  const eligible = dictionary.eligible
  if (typeof eligible !== 'object' || eligible === null) {
    throw new Error('BILLING_ELIGIBLE_CONTRACT_LOCALE_MISSING')
  }
  return eligible as Record<string, unknown>
}

describe('billing eligible screen contract', () => {
  test('renders the seven columns of the eligible list with mass selection and sorting by header', async () => {
    const table = await readApplicationFile(TABLE_COMPONENT_PATH)

    expect(table).toContain('export function BillingEligibleTable(')
    expect(table).toContain('useTranslation')
    expect(table).toContain('table.visibleColumns.map')
    expect(table).toContain('eligible.columns.${column}')
    for (const column of COLUMN_KEYS) {
      expect(table).toContain(column)
    }
    expect(table).toContain('aria-sort')
    expect(table).toContain('table.toggleSort(column)')
    expect(table).toContain('table.toggleAllSelection')
    expect(table).toContain('table.toggleSelection(')
    expect(table).toContain('eligible.selectAll')
    expect(table).toContain('eligible.selectRow')
    expect(table).toContain('eligible.resultsCount')
    /** Dinheiro na tela sai do formatador decimal, nunca de `toLocaleString` sobre número. */
    expect(table).toContain('formatAmount')
    expect(table).not.toContain('parseFloat')
    expect(table).not.toContain('Number(')
  })

  test('walks the cursor pages from the table footer', async () => {
    const table = await readApplicationFile(TABLE_COMPONENT_PATH)

    expect(table).toContain('table.goToPreviousPage')
    expect(table).toContain('table.goToNextPage')
    expect(table).toContain('table.canGoToPreviousPage')
    expect(table).toContain('table.hasNextPage')
    expect(table).toContain('eligible.previousPage')
    expect(table).toContain('eligible.nextPage')
  })

  test('collapses filters and columns behind toggles that announce their state and count', async () => {
    const table = await readApplicationFile(TABLE_COMPONENT_PATH)

    expect(table).toContain('aria-expanded')
    expect(table).toContain('eligible.filtersToggle')
    expect(table).toContain('eligible.columnsToggle')
    /** O badge conta pílulas, não campos: intervalo de datas aberto é um filtro só. */
    expect(table).toContain('const activeCount = pills.length')
    expect(table).toContain('table.activeConditionCount')
    expect(table).toContain('table.columnPreferences.order.map')
    expect(table).toContain('table.hideColumn(')
    expect(table).toContain('table.moveColumn(')
    expect(table).toContain('eligible.moveColumnUp')
    expect(table).toContain('eligible.moveColumnDown')
    expect(table).toContain('eligible.clearFilters')
  })

  test('denounces a selection that crosses more than one customer before the invoice is created', async () => {
    const table = await readApplicationFile(TABLE_COMPONENT_PATH)

    expect(table).toContain('table.selection')
    expect(table).toContain('eligible.selectedCount')
    expect(table).toContain('eligible.selectedTotal')
    expect(table).toContain('eligible.multipleCustomers')
    expect(table).toContain('customerDocuments.length')
    expect(table).toContain('eligible.clearSelection')
  })

  test('filters the period with the design system picker and never with a native control', async () => {
    const filters = await readApplicationFile(FILTERS_COMPONENT_PATH)

    expect(filters).toContain('export function BillingEligibleFilters(')
    expect(filters).toContain("from '@/components/ui/date-range-picker'")
    expect(filters).toContain('<DateRangePicker')
    expect(filters).toContain("table.setTextFilter('issuedFrom', from)")
    expect(filters).toContain("table.setTextFilter('issuedTo', to)")
    expect(filters).toContain("from '@/components/ui/select'")
    expect(filters).not.toContain('type="date"')
    expect(filters).not.toMatch(/<select[\s>]/)
  })

  test('offers the simple fields plus the nested and/or builder in the same panel', async () => {
    const filters = await readApplicationFile(FILTERS_COMPONENT_PATH)

    for (const field of FILTER_KEYS) {
      expect(filters).toContain(field)
    }
    expect(filters).toContain('table.setAdvancedFilter')
    expect(filters).toContain('table.advancedFilter')
    expect(filters).toContain('table.nextConditionId')
    expect(filters).toContain('BILLING_ELIGIBLE_CONDITION_FIELDS')
    expect(filters).toContain('BILLING_ELIGIBLE_OPERATORS_BY_TYPE')
    expect(filters).toContain('applyBillingEligibleConditionChanges')
    expect(filters).toContain('eligible.advanced.addGroup')
    expect(filters).toContain('eligible.advanced.addCondition')
    expect(filters).toContain('eligible.advanced.connectorAnd')
    expect(filters).toContain('eligible.advanced.connectorOr')
  })

  test('keeps both components on locale strings and design tokens, never on inline style', async () => {
    const [table, filters] = await Promise.all([
      readApplicationFile(TABLE_COMPONENT_PATH),
      readApplicationFile(FILTERS_COMPONENT_PATH),
    ])

    for (const source of [table, filters]) {
      expect(source).toContain('useTranslation')
      expect(source).toContain("from '../styles/billingEligibleTable.module.css'")
      expect(source).not.toMatch(/<select[\s>]/)
      expect(source).not.toMatch(/style=\{\{/)
    }
  })

  test('zebra-stripes the rows and sizes every field by the shared tokens', async () => {
    const stylesheet = await readApplicationFile(TABLE_STYLES_PATH)

    expect(readRuleBody(stylesheet, '.dataTable tbody tr:nth-child(even)')).toContain(
      'var(--color-',
    )
    expect(stylesheet).toContain('min-height: var(--field-height')
    expect(stylesheet).toContain('padding: var(--field-padding')
    expect(stylesheet).toContain('font-size: var(--field-font-size')
    expect(stylesheet).toContain('var(--space-')
    /** Nenhum módulo dimensiona o próprio container: a largura vem de `--layout-width` na shell. */
    expect(stylesheet).not.toContain('min(100% -')
    expect(stylesheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  test('replaces the loose filter grid of the create tab with the eligible table', async () => {
    const page = await readApplicationFile(WORKSPACE_PAGE_PATH)

    expect(page).toContain('workspace-shell')
    expect(page).toContain('BillingEligibleTable')
    expect(page).toContain('useBillingEligibleTable')
    expect(page).toContain('<DueDateField')
    expect(page).toContain('create.submit')
    expect(page).not.toContain('workspace-filter-grid')
    expect(page).not.toContain('updateFilter')
    expect(page).not.toContain('eligible.select')
    expect(page).not.toContain('sumSelectedAmount')
  })

  test('publishes the eligible table strings with the same shape in pt and en', async () => {
    const [ptEligible, enEligible] = await Promise.all([
      readLocaleSection(PT_LOCALE_PATH),
      readLocaleSection(EN_LOCALE_PATH),
    ])

    const ptKeyPaths = keyPathsOf(ptEligible, '').slice().sort()
    const enKeyPaths = keyPathsOf(enEligible, '').slice().sort()
    expect(ptKeyPaths).toEqual(enKeyPaths)

    for (const key of REQUIRED_ELIGIBLE_KEYS) {
      expect(ptKeyPaths).toContain(key)
    }
    for (const column of COLUMN_KEYS) {
      expect(ptKeyPaths).toContain(`columns.${column}`)
    }
    for (const filter of FILTER_KEYS) {
      expect(ptKeyPaths).toContain(`filters.${filter}`)
    }
    for (const key of REQUIRED_ADVANCED_KEYS) {
      expect(ptKeyPaths).toContain(`advanced.${key}`)
    }
  })

  test('provides the period picker labels the design system component demands', async () => {
    const [ptLocale, enLocale] = await Promise.all([
      readApplicationFile(PT_LOCALE_PATH),
      readApplicationFile(EN_LOCALE_PATH),
    ])

    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      const dateRange = dictionary.dateRange
      if (typeof dateRange !== 'object' || dateRange === null) {
        throw new Error('BILLING_ELIGIBLE_CONTRACT_DATE_RANGE_MISSING')
      }
      expect(Object.keys(dateRange).slice().sort()).toEqual([
        'clear',
        'nextMonth',
        'placeholder',
        'previousMonth',
      ])
    }
  })
})
