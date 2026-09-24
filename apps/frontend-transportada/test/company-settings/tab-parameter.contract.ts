/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_SETTINGS_TAB_PARAMETER,
  parseCompanySettingsTabParameter,
} from '@/modules/company-settings/shared/companySettingsTabs.service'

/**
 * A lacuna "regime federal não declarado" do razão de valoração leva a
 * `/company-settings?tab=taxes` — sem ler a query no início, a aba sempre abriria em **Empresa** e
 * o link cairia no lugar errado.
 */
describe('o parâmetro `?tab=` de Configurações', () => {
  test('aba válida na query abre naquela aba', () => {
    expect(parseCompanySettingsTabParameter(`?${COMPANY_SETTINGS_TAB_PARAMETER}=taxes`)).toBe(
      'taxes',
    )
    expect(parseCompanySettingsTabParameter('?tab=driverAllowance')).toBe('driverAllowance')
  })

  test('sem o parâmetro cai em company', () => {
    expect(parseCompanySettingsTabParameter('')).toBe('company')
    expect(parseCompanySettingsTabParameter('?other=1')).toBe('company')
  })

  test('aba desconhecida cai em company, não em tela vazia', () => {
    expect(parseCompanySettingsTabParameter('?tab=nao-existe')).toBe('company')
  })
})
