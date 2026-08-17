/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import {
  COMPANY_SETTINGS_PANELS,
  COMPANY_SETTINGS_PANEL_SOURCE,
  COMPANY_SETTINGS_TAB_IDS,
  COMPANY_SETTINGS_TAB_PANELS,
  resolveCompanySettingsDataScope,
  resolveCompanySettingsTab,
  type CompanySettingsTabId,
} from '../../src/modules/company-settings/shared/companySettingsTabs.service'

const PAGE_PATH = new URL(
  '../../src/modules/company-settings/pages/CompanySettings.page.tsx',
  import.meta.url,
)
const LOCALE_PATHS = [
  new URL(
    '../../src/modules/company-settings/locales/companySettings.locale.json',
    import.meta.url,
  ),
  new URL(
    '../../src/modules/company-settings/locales/companySettings.en.locale.json',
    import.meta.url,
  ),
]

async function readLocaleTabs(path: URL): Promise<Readonly<Record<string, string>>> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
  const tabs = (parsed as { tabs?: unknown }).tabs
  return typeof tabs === 'object' && tabs !== null ? (tabs as Record<string, string>) : {}
}

describe('company settings tabs contract', () => {
  /** Painel fora de aba nenhuma some da tela; em duas abas, duplica o controle. */
  test('cada painel pertence a exatamente uma aba', () => {
    const placements = COMPANY_SETTINGS_TAB_IDS.flatMap((tab) => COMPANY_SETTINGS_TAB_PANELS[tab])

    expect([...placements].sort()).toEqual([...COMPANY_SETTINGS_PANELS].sort())
  })

  /**
   * A aba aberta tem de ligar a consulta que alimenta os painéis dela: é isso que faz o campo vir
   * preenchido quando já existe cadastro, em vez de abrir em branco e o operador regravar por cima.
   */
  test('a aba aberta liga a consulta de todos os painéis dela', () => {
    for (const tab of COMPANY_SETTINGS_TAB_IDS) {
      const scope = resolveCompanySettingsDataScope(tab)
      for (const panel of COMPANY_SETTINGS_TAB_PANELS[tab]) {
        expect(scope[COMPANY_SETTINGS_PANEL_SOURCE[panel]]).toBe(true)
      }
    }
  })

  /** Consulta ligada fora da aba dela é a montagem simultânea de volta, calada. */
  test('nenhuma aba liga consulta de painel que não hospeda', () => {
    expect(resolveCompanySettingsDataScope('company')).toEqual({
      companySettings: true,
      distributionCursor: false,
      fuelPrices: false,
      nfse: false,
      scheduledDistribution: false,
    })
    expect(resolveCompanySettingsDataScope('nfse').fuelPrices).toBe(false)
    expect(resolveCompanySettingsDataScope('fuel').nfse).toBe(false)
  })

  /** Os sinais de certificado e o estado de gravação ficam visíveis em toda aba. */
  test('a consulta da empresa fica ligada em qualquer aba', () => {
    for (const tab of COMPANY_SETTINGS_TAB_IDS) {
      expect(resolveCompanySettingsDataScope(tab).companySettings).toBe(true)
    }
  })

  test('aba desconhecida cai na primeira', () => {
    expect(resolveCompanySettingsTab(undefined)).toBe('company')
    expect(resolveCompanySettingsTab('perfil-antigo')).toBe('company')
    expect(resolveCompanySettingsTab('nfse')).toBe('nfse')
  })

  test('toda aba tem rótulo nos dois pacotes de tradução', async () => {
    for (const path of LOCALE_PATHS) {
      const tabs = await readLocaleTabs(path)
      for (const id of COMPANY_SETTINGS_TAB_IDS) {
        expect(typeof tabs[id satisfies CompanySettingsTabId]).toBe('string')
      }
    }
  })

  /** A página é a única consumidora — se ela parar de derivar daqui, o contrato vira decoração. */
  test('a página monta as abas a partir do serviço', async () => {
    const page = await readFile(PAGE_PATH, 'utf8')

    expect(page).toContain('resolveCompanySettingsDataScope')
    expect(page).toContain('COMPANY_SETTINGS_TAB_IDS')
  })
})
