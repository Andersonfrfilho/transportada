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
const PANEL_PATH = 'src/modules/fleet/components/FuelPricePanel.component.tsx'
const HOOK_PATH = 'src/modules/fleet/hooks/useFuelPrices.hook.ts'
const LOCALE_PATH = 'src/modules/fleet/locales/fleet.locale.json'
const ENGLISH_LOCALE_PATH = 'src/modules/fleet/locales/fleet.en.locale.json'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json()
}

describe('fleet fuel price tab contract', () => {
  test('o preço do combustível mora na frota, na aba de combustível', () => {
    expect(SETTINGS_PANEL_PLACEMENT.fuelPrices).toEqual({
      module: 'fleet',
      source: 'fuelPrices',
      tab: 'fuel',
    })
    expect(settingsTabsOf('fleet')).toEqual(['fuel', 'regions'])
    expect(settingsPanelsOf('fleet', 'fuel')).toEqual(['fuelPrices'])
  })

  /** Consulta ligada fora da aba dela é a montagem simultânea de volta — e é o que a 041 desfaz. */
  test('a consulta de preços sobe na aba de combustível e em nenhuma outra da frota', () => {
    expect(resolveSettingsDataScope('fleet', 'fuel').fuelPrices).toBe(true)
    expect(resolveSettingsDataScope('fleet', 'vehicles').fuelPrices).toBe(false)
    expect(resolveSettingsDataScope('fleet', 'drivers').fuelPrices).toBe(false)
    expect(resolveSettingsDataScope('fleet', 'fuel').companySettings).toBe(false)
  })

  test('o painel e o hook moram na frota', async () => {
    const panel = await readApplicationFile(PANEL_PATH)
    const hook = await readApplicationFile(HOOK_PATH)

    expect(panel).toContain('export function FuelPricePanel')
    expect(hook).toContain('export function useFuelPrices')
  })

  /** Aba ausente, não desabilitada: quem não pode configurar não vê que a configuração existe. */
  test('a aba de combustível só entra na lista com settings.manage', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('SETTINGS_MANAGE_PERMISSION')
    expect(page).toContain('canManageSettings')
    expect(page).toContain('...(canManageSettings ? [fuelTab] : [])')
  })

  /**
   * O `enabled` composto — permissão **e** aba aberta — é o que faz o campo vir preenchido em vez de
   * abrir em branco sobre um ajuste já gravado.
   */
  test('o hook recebe permissão e aba aberta no mesmo enabled', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain("resolveSettingsDataScope('fleet', activeTab)")
    expect(page).toContain('enabled: canManageSettings && settingsScope.fuelPrices')
  })

  /** A lista chega ao painel direto da consulta: nada de cópia local que congele o estado vazio. */
  test('os preços chegam ao painel vindos da consulta', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('prices={fuelPrices.query.data}')
    expect(page).toContain('loading={fuelPrices.query.isLoading}')
  })

  test('a aba tem rótulo acentuado nos dois pacotes de tradução', async () => {
    for (const localePath of [LOCALE_PATH, ENGLISH_LOCALE_PATH]) {
      const locale = await readLocale(localePath)
      const tabs = locale['tabs'] as Record<string, string> | undefined

      const fuelPrices = locale['fuelPrices'] as Record<string, string> | undefined

      expect(typeof tabs?.['fuel']).toBe('string')
      expect(typeof fuelPrices?.['title']).toBe('string')
    }

    const portuguese = await readLocale(LOCALE_PATH)
    expect((portuguese['tabs'] as Record<string, string>)['fuel']).toBe('Combustível')

    const panel = await readApplicationFile(PANEL_PATH)
    expect(panel).toContain("useTranslation('fleet')")
  })
})
