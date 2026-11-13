/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

import { expenseCategoryErrorKey } from '@/modules/company-settings/components/ExpenseCategoriesPanel.component'
import {
  COMPANY_SETTINGS_TAB_IDS,
  SETTINGS_PANEL_PLACEMENT,
  resolveSettingsDataScope,
} from '@/modules/company-settings/shared/companySettingsTabs.service'

const LOCALES = ['companySettings.locale.json', 'companySettings.en.locale.json'].map(
  (name) =>
    JSON.parse(
      readFileSync(
        new URL(`../../src/modules/company-settings/locales/${name}`, import.meta.url),
        'utf8',
      ),
    ) as {
      expenseCategories: Record<string, unknown> & { error: Record<string, string> }
      tabs: Record<string, string>
    },
)

describe('painel Categorias de contas (spec 325 T2.3)', () => {
  it('é uma aba de Configurações, e só a consulta dela sobe', () => {
    expect(SETTINGS_PANEL_PLACEMENT.expenseCategories).toEqual({
      module: 'company-settings',
      source: 'expenseCategories',
      tab: 'expenseCategories',
    })
    expect(COMPANY_SETTINGS_TAB_IDS).toContain('expenseCategories')
    expect(
      resolveSettingsDataScope('company-settings', 'expenseCategories').expenseCategories,
    ).toBe(true)
    expect(resolveSettingsDataScope('company-settings', 'company').expenseCategories).toBe(false)
  })

  it('o nome repetido tem frase própria e o resto cai na frase genérica', () => {
    expect(expenseCategoryErrorKey(new Error('EXPENSE_CATEGORY_NAME_TAKEN'))).toBe(
      'EXPENSE_CATEGORY_NAME_TAKEN',
    )
    expect(expenseCategoryErrorKey(new Error('EXPENSE_QUALQUER_COISA'))).toBe('REQUEST_FAILED')
    expect(expenseCategoryErrorKey('texto')).toBe('REQUEST_FAILED')
  })

  it('pt e en têm o rótulo da aba e as mesmas chaves, com as duas frases de erro', () => {
    const [pt, en] = LOCALES
    expect(pt?.tabs.expenseCategories).toBeTruthy()
    expect(en?.tabs.expenseCategories).toBeTruthy()
    expect(Object.keys(pt?.expenseCategories ?? {}).sort()).toEqual(
      Object.keys(en?.expenseCategories ?? {}).sort(),
    )
    for (const locale of LOCALES) {
      expect(Object.keys(locale.expenseCategories.error).sort()).toEqual([
        'EXPENSE_CATEGORY_NAME_TAKEN',
        'REQUEST_FAILED',
      ])
    }
  })
})
