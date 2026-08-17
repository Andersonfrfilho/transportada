/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import {
  COMPANY_SETTINGS_TAB_IDS,
  SETTINGS_PANELS,
  SETTINGS_PANEL_MODULES,
  SETTINGS_PANEL_PLACEMENT,
  resolveCompanySettingsDataScope,
  resolveCompanySettingsTab,
  resolveSettingsDataScope,
  settingsPanelsOf,
  settingsTabsOf,
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

describe('settings panel placement contract', () => {
  /** Painel sem endereço some da tela; em dois endereços, duplica o controle. */
  test('cada painel tem exatamente um módulo e uma aba', () => {
    const addressed = SETTINGS_PANEL_MODULES.flatMap((module) =>
      settingsTabsOf(module).flatMap((tab) => settingsPanelsOf(module, tab)),
    )

    expect([...addressed].sort()).toEqual([...SETTINGS_PANELS].sort())
  })

  /** Aba declarada por um painel tem de aparecer na lista de abas do módulo dele. */
  test('módulo e aba são consistentes', () => {
    for (const panel of SETTINGS_PANELS) {
      const { module, tab } = SETTINGS_PANEL_PLACEMENT[panel]
      expect(settingsTabsOf(module)).toContain(tab)
      expect(settingsPanelsOf(module, tab)).toContain(panel)
    }
  })

  /**
   * A aba aberta tem de ligar a consulta que alimenta os painéis dela, em **qualquer** módulo: é isso
   * que faz o campo vir preenchido quando já existe cadastro, em vez de abrir em branco.
   */
  test('a aba aberta liga a consulta de todos os painéis dela, em qualquer módulo', () => {
    for (const module of SETTINGS_PANEL_MODULES) {
      for (const tab of settingsTabsOf(module)) {
        const scope = resolveSettingsDataScope(module, tab)
        for (const panel of settingsPanelsOf(module, tab)) {
          expect(scope[SETTINGS_PANEL_PLACEMENT[panel].source]).toBe(true)
        }
      }
    }
  })

  /** Consulta ligada fora da aba dela é a montagem simultânea de volta, calada. */
  test('nenhuma aba liga consulta de painel que não hospeda', () => {
    for (const module of SETTINGS_PANEL_MODULES) {
      for (const tab of settingsTabsOf(module)) {
        const hosted = new Set(
          settingsPanelsOf(module, tab).map((panel) => SETTINGS_PANEL_PLACEMENT[panel].source),
        )
        const scope = resolveSettingsDataScope(module, tab)
        for (const [source, enabled] of Object.entries(scope)) {
          if (enabled && !hosted.has(source as keyof typeof scope)) {
            // A única exceção declarada: os sinais de certificado e o estado de gravação ficam
            // visíveis em toda aba do módulo de configurações.
            expect([module, source]).toEqual(['company-settings', 'companySettings'])
          }
        }
      }
    }
  })

  test('aba desconhecida cai na primeira', () => {
    expect(resolveCompanySettingsTab(undefined)).toBe('company')
    expect(resolveCompanySettingsTab('perfil-antigo')).toBe('company')
    expect(resolveCompanySettingsTab('certificates')).toBe('certificates')
  })

  test('a consulta da empresa fica ligada em qualquer aba de configurações', () => {
    for (const tab of COMPANY_SETTINGS_TAB_IDS) {
      expect(resolveCompanySettingsDataScope(tab).companySettings).toBe(true)
    }
  })

  test('as abas de configurações declaradas são as que o registro conhece', () => {
    expect(settingsTabsOf('company-settings')).toEqual([...COMPANY_SETTINGS_TAB_IDS])
  })

  test('toda aba de configurações tem rótulo nos dois pacotes de tradução', async () => {
    for (const path of LOCALE_PATHS) {
      const tabs = await readLocaleTabs(path)
      for (const id of COMPANY_SETTINGS_TAB_IDS) {
        expect(typeof tabs[id satisfies CompanySettingsTabId]).toBe('string')
      }
    }
  })

  /** A página é consumidora — se ela parar de derivar daqui, o contrato vira decoração. */
  test('a página monta as abas a partir do serviço', async () => {
    const page = await readFile(PAGE_PATH, 'utf8')

    expect(page).toContain('resolveCompanySettingsDataScope')
    expect(page).toContain('COMPANY_SETTINGS_TAB_IDS')
  })
})
