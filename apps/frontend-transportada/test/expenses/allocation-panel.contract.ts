/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T5.3 (RF16): o painel "Rateio das contas". Cobre o endereço (aba própria, só a consulta dela sobe), a conta do
 * Salvar (só vai o que mudou), o limite do fora do padrão, as rotas novas do cliente e a paridade dos locales.
 */
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

import { criterionLabelKey } from '@/modules/company-settings/components/ExpenseAllocationPanel.component'
import {
  EMPTY_EXPENSE_ALLOCATION_DRAFT,
  diffAllocationDraft,
  formatThresholdPercent,
  groupChoicesOf,
  hasAllocationChanges,
  parseThresholdPercent,
} from '@/modules/company-settings/shared/expenseAllocationForm.service'
import {
  COMPANY_SETTINGS_TAB_IDS,
  SETTINGS_PANEL_PLACEMENT,
  resolveSettingsDataScope,
} from '@/modules/company-settings/shared/companySettingsTabs.service'
import type { ExpenseCategory } from '@/modules/expenses/shared/expenses.types'
import { createExpensesClient } from '@/modules/expenses/shared/expensesClient.service'
import { toCategories } from '@/modules/expenses/shared/expensesResponse.validation'
import { toOutOfPatternThreshold } from '@/modules/expenses/shared/expensesResult.validation'

const rent: ExpenseCategory = {
  active: true,
  costGroup: 'administrative',
  id: 'cat-rent',
  name: 'Aluguel',
  requiresDriver: false,
}
const driver: ExpenseCategory = {
  active: true,
  costGroup: 'in_trip',
  id: 'cat-driver',
  name: 'Pagamento de motorista/agregado',
  requiresDriver: true,
}
const stored = { administrative: 'per_revenue', per_km: 'per_km', vehicle_fixed: 'per_km' } as const

function diff(draft: Parameters<typeof diffAllocationDraft>[0]['draft']) {
  return diffAllocationDraft({
    categories: [rent, driver],
    draft,
    storedCriteria: stored,
    storedThreshold: 10,
  })
}

describe('painel Rateio das contas (spec 325 T5.3)', () => {
  it('é uma aba de Configurações, e só a consulta dela sobe', () => {
    expect(SETTINGS_PANEL_PLACEMENT.expenseAllocation).toEqual({
      module: 'company-settings',
      source: 'expenseAllocation',
      tab: 'expenseAllocation',
    })
    expect(COMPANY_SETTINGS_TAB_IDS).toContain('expenseAllocation')
    expect(
      resolveSettingsDataScope('company-settings', 'expenseAllocation').expenseAllocation,
    ).toBe(true)
    expect(resolveSettingsDataScope('company-settings', 'company').expenseAllocation).toBe(false)
  })

  it('sem mexer em nada não há o que salvar', () => {
    expect(hasAllocationChanges(diff(EMPTY_EXPENSE_ALLOCATION_DRAFT))).toBe(false)
  })

  it('só vai o que difere do gravado: critério, grupo da categoria e limite', () => {
    const changes = diff({
      categoryGroups: { 'cat-rent': 'vehicle_fixed', 'cat-driver': 'in_trip' },
      criteria: { administrative: 'equal', per_km: 'per_km' },
      threshold: '12,5',
    })
    expect(changes.criteria).toEqual({ administrative: 'equal' })
    expect(changes.categoryGroups).toEqual([{ costGroup: 'vehicle_fixed', id: 'cat-rent' }])
    expect(changes.threshold).toBe(12.5)
    expect(diff({ ...EMPTY_EXPENSE_ALLOCATION_DRAFT, threshold: '10' }).threshold).toBeNull()
  })

  it('o pagamento de motorista só tem o grupo da viagem; as outras categorias, os três rateáveis', () => {
    expect(groupChoicesOf(driver)).toEqual(['in_trip'])
    expect(groupChoicesOf(rent)).toEqual(['vehicle_fixed', 'per_km', 'administrative'])
  })

  it('o limite aceita de 0 a 1000 com até duas casas, vírgula ou ponto', () => {
    expect(parseThresholdPercent('0')).toBe(0)
    expect(parseThresholdPercent('1000')).toBe(1000)
    expect(parseThresholdPercent('7,25')).toBe(7.25)
    expect(parseThresholdPercent('7.5')).toBe(7.5)
    for (const bad of ['', '-1', '1000,01', '1,234', 'abc', '1e2']) {
      expect(parseThresholdPercent(bad)).toBeNull()
    }
    expect(formatThresholdPercent(7.5)).toBe('7,5')
  })

  it('"por km" no grupo variável é o custo por km do veículo; nos outros, o km rodado no mês', () => {
    expect(criterionLabelKey({ criterion: 'per_km', group: 'per_km' })).toBe(
      'expenseAllocation.criterion.per_km_variable',
    )
    expect(criterionLabelKey({ criterion: 'per_km', group: 'vehicle_fixed' })).toBe(
      'expenseAllocation.criterion.per_km',
    )
  })

  it('a categoria sem grupo na resposta (API anterior) é administrativa', () => {
    const [category] = toCategories({
      data: [{ active: true, id: 'c', name: 'Aluguel', requiresDriver: false }],
    })
    expect(category?.costGroup).toBe('administrative')
    const [known] = toCategories({
      data: [
        { active: true, costGroup: 'per_km', id: 'c', name: 'Combustível', requiresDriver: false },
      ],
    })
    expect(known?.costGroup).toBe('per_km')
  })

  it('o cliente troca o grupo por PUT próprio e lê/grava o limite sem o id no corpo', async () => {
    const calls: { body: string; method: string; url: string }[] = []
    const answers = [
      { data: { active: true, costGroup: 'per_km', id: 'c1', name: 'X', requiresDriver: false } },
      { data: { thresholdPercent: 12.5 } },
      { data: { thresholdPercent: 8 } },
    ]
    const client = createExpensesClient({
      apiUrl: 'https://api.test',
      fetch: async (input) => {
        const request = input as Request
        calls.push({ body: await request.clone().text(), method: request.method, url: request.url })
        return new Response(JSON.stringify(answers[calls.length - 1]), { status: 200 })
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    expect((await client.setCategoryCostGroup({ costGroup: 'per_km', id: 'c1' })).costGroup).toBe(
      'per_km',
    )
    expect(await client.getOutOfPatternThreshold()).toBe(12.5)
    expect(await client.updateOutOfPatternThreshold(8)).toBe(8)
    expect(calls).toEqual([
      {
        body: JSON.stringify({ costGroup: 'per_km' }),
        method: 'PUT',
        url: 'https://api.test/expense-categories/c1/cost-group',
      },
      { body: '', method: 'GET', url: 'https://api.test/expense-out-of-pattern-settings' },
      {
        body: JSON.stringify({ thresholdPercent: 8 }),
        method: 'PUT',
        url: 'https://api.test/expense-out-of-pattern-settings',
      },
    ])
    expect(() => toOutOfPatternThreshold({ data: { thresholdPercent: '8' } })).toThrow()
  })

  it('pt e en têm o rótulo da aba e as mesmas chaves', () => {
    const load = (name: string) =>
      JSON.parse(
        readFileSync(
          new URL(`../../src/modules/company-settings/locales/${name}`, import.meta.url),
          'utf8',
        ),
      ) as { expenseAllocation: Record<string, unknown>; tabs: Record<string, string> }
    const [pt, en] = [load('companySettings.locale.json'), load('companySettings.en.locale.json')]
    expect(pt.tabs.expenseAllocation).toBe('Rateio das contas')
    expect(en.tabs.expenseAllocation).toBeTruthy()
    const keys = (value: unknown, prefix = ''): string[] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value).flatMap(([key, inner]) => keys(inner, `${prefix}${key}.`))
        : [prefix]
    expect(keys(pt.expenseAllocation).sort()).toEqual(keys(en.expenseAllocation).sort())
  })
})
