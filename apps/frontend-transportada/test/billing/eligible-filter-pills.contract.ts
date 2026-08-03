/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './billing.fixture'

const FILTER_PILLS_SERVICE_PATH =
  '../../src/modules/billing/shared/billingEligibleFilterPills.service'

type EligibleFilters = Readonly<{
  batchId: string
  cteNumberQuery: string
  customerDocument: string
  customerName: string
  issuedFrom: string
  issuedTo: string
  maxAmount: string
  minAmount: string
  nfeNumberQuery: string
}>

type PillDescriptor = Readonly<{ field: string; labelKey: string; value: string }>

type FilterPillsModule = {
  readonly BILLING_ELIGIBLE_PILL_FIELDS: readonly string[]
  readonly clearBillingEligibleFilterField: (
    input: Readonly<{ field: string; filters: EligibleFilters }>,
  ) => EligibleFilters
  readonly describeBillingEligibleFilterPills: (
    input: Readonly<{
      advancedConditionCount: number
      filters: EligibleFilters
      formatDay: (value: string) => string
    }>,
  ) => readonly PillDescriptor[]
}

const EMPTY_FILTERS: EligibleFilters = {
  batchId: '',
  cteNumberQuery: '',
  customerDocument: '',
  customerName: '',
  issuedFrom: '',
  issuedTo: '',
  maxAmount: '',
  minAmount: '',
  nfeNumberQuery: '',
}

/** O dia sai formatado por quem chama: o descritor continua puro e independente de locale. */
function formatDay(value: string): string {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function describePills(
  module: FilterPillsModule,
  filters: Partial<EligibleFilters>,
  advancedConditionCount = 0,
): readonly PillDescriptor[] {
  return module.describeBillingEligibleFilterPills({
    advancedConditionCount,
    filters: { ...EMPTY_FILTERS, ...filters },
    formatDay,
  })
}

describe('billing eligible filter pills contract', () => {
  test('emits nothing while no filter is applied', async () => {
    const module = await loadFutureModule<FilterPillsModule>(FILTER_PILLS_SERVICE_PATH)

    expect(describePills(module, {})).toEqual([])
  })

  test('emits one pill per applied filter, in the declared order', async () => {
    const module = await loadFutureModule<FilterPillsModule>(FILTER_PILLS_SERVICE_PATH)

    const pills = describePills(module, {
      cteNumberQuery: '3, 7, 10-40',
      customerName: 'Transportes',
      minAmount: '100.00',
      nfeNumberQuery: '4521',
    })

    expect(pills).toEqual([
      {
        field: 'cteNumberQuery',
        labelKey: 'eligible.filters.cteNumberQuery',
        value: '3, 7, 10-40',
      },
      { field: 'nfeNumberQuery', labelKey: 'eligible.filters.nfeNumberQuery', value: '4521' },
      { field: 'customerName', labelKey: 'eligible.filters.customerName', value: 'Transportes' },
      { field: 'minAmount', labelKey: 'eligible.filters.minAmount', value: '100.00' },
    ])
    expect(module.BILLING_ELIGIBLE_PILL_FIELDS.indexOf('cteNumberQuery')).toBeLessThan(
      module.BILLING_ELIGIBLE_PILL_FIELDS.indexOf('nfeNumberQuery'),
    )
  })

  test('collapses the authorization period into a single pill', async () => {
    const module = await loadFutureModule<FilterPillsModule>(FILTER_PILLS_SERVICE_PATH)

    expect(describePills(module, { issuedFrom: '2026-07-01', issuedTo: '2026-07-31' })).toEqual([
      {
        field: 'issuedRange',
        labelKey: 'eligible.filters.issuedRange',
        value: '01/07/2026 – 31/07/2026',
      },
    ])
    /** Meia faixa é filtro aplicado: esconder a pílula deixaria o operador sem como removê-la. */
    expect(describePills(module, { issuedFrom: '2026-07-01' })).toEqual([
      { field: 'issuedRange', labelKey: 'eligible.filters.issuedRange', value: '01/07/2026 – …' },
    ])
    expect(describePills(module, { issuedTo: '2026-07-31' })).toEqual([
      { field: 'issuedRange', labelKey: 'eligible.filters.issuedRange', value: '… – 31/07/2026' },
    ])
  })

  test('gives the advanced filter a pill of its own, carrying the condition count', async () => {
    const module = await loadFutureModule<FilterPillsModule>(FILTER_PILLS_SERVICE_PATH)

    expect(describePills(module, {}, 3)).toEqual([
      { field: 'advanced', labelKey: 'eligible.filters.advanced', value: '3' },
    ])
    expect(describePills(module, {}, 0)).toEqual([])
    /** A pílula do avançado fecha a lista, depois de todos os filtros simples. */
    expect(describePills(module, { batchId: 'lote-1' }, 2).map((pill) => pill.field)).toEqual([
      'batchId',
      'advanced',
    ])
  })

  test('trims the value so whitespace alone never becomes a pill', async () => {
    const module = await loadFutureModule<FilterPillsModule>(FILTER_PILLS_SERVICE_PATH)

    expect(describePills(module, { customerName: '   ' })).toEqual([])
  })

  test('clears only the field the pill owns', async () => {
    const module = await loadFutureModule<FilterPillsModule>(FILTER_PILLS_SERVICE_PATH)
    const filters: EligibleFilters = {
      ...EMPTY_FILTERS,
      cteNumberQuery: '123456',
      customerName: 'Transportes',
      issuedFrom: '2026-07-01',
      issuedTo: '2026-07-31',
    }

    expect(module.clearBillingEligibleFilterField({ field: 'customerName', filters })).toEqual({
      ...filters,
      customerName: '',
    })
    /** A pílula é uma só, então remover precisa apagar as duas pontas da faixa. */
    expect(module.clearBillingEligibleFilterField({ field: 'issuedRange', filters })).toEqual({
      ...filters,
      issuedFrom: '',
      issuedTo: '',
    })
    /** O filtro avançado não mora no mapa de filtros simples: a remoção dele é de quem chama. */
    expect(module.clearBillingEligibleFilterField({ field: 'advanced', filters })).toEqual(filters)
    expect(filters.customerName).toBe('Transportes')
  })
})
