/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  SETTINGS_PANEL_PLACEMENT,
  resolveSettingsDataScope,
  settingsPanelsOf,
  settingsTabsOf,
} from '../../src/modules/company-settings/shared/companySettingsTabs.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const PAGE_PATH = 'src/modules/fleet/pages/FleetWorkspace.page.tsx'
const PANEL_PATH = 'src/modules/fleet/components/FreightRegionPanel.component.tsx'
const HOOK_PATH = 'src/modules/fleet/hooks/useFreightRegions.hook.ts'
const LOCALE_PATH = 'src/modules/fleet/locales/fleet.locale.json'
const ENGLISH_LOCALE_PATH = 'src/modules/fleet/locales/fleet.en.locale.json'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json()
}

describe('fleet freight region tab contract', () => {
  /** A tabela de frete é cadastro da frota: o valor que ela guarda é o que o motorista recebe. */
  test('a tabela de regiões mora na frota, na aba de regiões', () => {
    expect(SETTINGS_PANEL_PLACEMENT.freightRegions).toEqual({
      module: 'fleet',
      source: 'freightRegions',
      tab: 'regions',
    })
    expect(settingsTabsOf('fleet')).toEqual(['fuel', 'regions'])
    expect(settingsPanelsOf('fleet', 'regions')).toEqual(['freightRegions'])
  })

  test('a consulta de regiões sobe na aba de regiões e em nenhuma outra da frota', () => {
    expect(resolveSettingsDataScope('fleet', 'regions').freightRegions).toBe(true)
    expect(resolveSettingsDataScope('fleet', 'vehicles').freightRegions).toBe(false)
    expect(resolveSettingsDataScope('fleet', 'drivers').freightRegions).toBe(false)
    expect(resolveSettingsDataScope('fleet', 'fuel').freightRegions).toBe(false)
    expect(resolveSettingsDataScope('fleet', 'regions').fuelPrices).toBe(false)
  })

  test('o painel e o hook moram na frota', async () => {
    const panel = await readApplicationFile(PANEL_PATH)
    const hook = await readApplicationFile(HOOK_PATH)

    expect(panel).toContain('export function FreightRegionPanel')
    expect(hook).toContain('export function useFreightRegions')
  })

  /** Aba ausente, não desabilitada: quem não pode configurar não vê que a configuração existe. */
  test('a aba de regiões só entra na lista com settings.manage', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('SETTINGS_MANAGE_PERMISSION')
    expect(page).toContain('...(canManageSettings ? [regionsTab] : [])')
  })

  test('o hook recebe permissão e aba aberta no mesmo enabled', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain("resolveSettingsDataScope('fleet', activeTab)")
    expect(page).toContain('enabled: canManageSettings && settingsScope.freightRegions')
  })

  test('as regiões chegam ao painel vindas da consulta', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('regions={freightRegions.query.data}')
    expect(page).toContain('loading={freightRegions.query.isLoading}')
  })

  test('a aba tem rótulo acentuado nos dois pacotes de tradução', async () => {
    for (const localePath of [LOCALE_PATH, ENGLISH_LOCALE_PATH]) {
      const locale = await readLocale(localePath)
      const tabs = locale['tabs'] as Record<string, string> | undefined
      const regions = locale['regions'] as Record<string, string> | undefined

      expect(typeof tabs?.['regions']).toBe('string')
      expect(typeof regions?.['title']).toBe('string')
    }

    const portuguese = await readLocale(LOCALE_PATH)
    expect((portuguese['tabs'] as Record<string, string>)['regions']).toBe('Regiões')

    const panel = await readApplicationFile(PANEL_PATH)
    expect(panel).toContain("useTranslation('fleet')")
  })
})
